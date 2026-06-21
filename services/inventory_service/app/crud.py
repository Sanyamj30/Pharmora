import uuid
from datetime import datetime, date, timezone
from typing import List, Optional, Tuple
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from loguru import logger

from services.inventory_service.app.models import Product, StockLevel, Batch, StockAdjustment
from services.inventory_service.app.config import settings
from shared.kafka import KafkaProducer
from shared.errors import ValidationError, NotFoundError

# Global Kafka Producer instance
_PRODUCER = None


def get_producer() -> KafkaProducer:
    global _PRODUCER
    if _PRODUCER is None:
        _PRODUCER = KafkaProducer()
    return _PRODUCER


# ----------------------------------------------------
# Catalog CRUD
# ----------------------------------------------------

async def get_product(db: AsyncSession, product_id: uuid.UUID) -> Optional[Product]:
    return await db.get(Product, product_id)


async def get_product_by_sku(db: AsyncSession, sku_code: str) -> Optional[Product]:
    stmt = select(Product).where(Product.sku_code == sku_code)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def create_product(
    db: AsyncSession,
    sku_code: str,
    name: str,
    category: str,
    schedule_class: Optional[str] = None,
    unit_of_measure: str = "UNIT",
    reorder_point: int = 0,
    lead_time_days: int = 7
) -> Product:
    existing = await get_product_by_sku(db, sku_code)
    if existing:
        raise ValidationError(f"Product with SKU code {sku_code} already exists.")
        
    product = Product(
        sku_code=sku_code,
        name=name,
        category=category,
        schedule_class=schedule_class,
        unit_of_measure=unit_of_measure,
        reorder_point=reorder_point,
        lead_time_days=lead_time_days
    )
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return product


# ----------------------------------------------------
# Stock queries
# ----------------------------------------------------

async def get_stock_level(db: AsyncSession, outlet_id: uuid.UUID, product_id: uuid.UUID) -> Optional[StockLevel]:
    stmt = select(StockLevel).options(selectinload(StockLevel.product)).where(
        and_(StockLevel.outlet_id == outlet_id, StockLevel.product_id == product_id)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_all_stock_levels(db: AsyncSession, outlet_id: uuid.UUID) -> List[StockLevel]:
    stmt = select(StockLevel).options(selectinload(StockLevel.product)).where(StockLevel.outlet_id == outlet_id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_fefo_batches(db: AsyncSession, outlet_id: uuid.UUID, product_id: uuid.UUID) -> List[Batch]:
    """Return active batches sorted by expiry_date ascending (FEFO)."""
    stmt = select(Batch).where(
        and_(
            Batch.outlet_id == outlet_id,
            Batch.product_id == product_id,
            Batch.status == "ACTIVE",
            Batch.quantity > 0
        )
    ).order_by(Batch.expiry_date.asc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


# ----------------------------------------------------
# Receipts and Adjustments
# ----------------------------------------------------

async def record_stock_receipt(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    batch_number: str,
    manufacture_date: date,
    expiry_date: date,
    quantity: int,
    sku_code: Optional[str] = None,
    product_id: Optional[uuid.UUID] = None,
    performed_by: Optional[uuid.UUID] = None
) -> Tuple[Batch, int]:
    """Record stock receipt, updating batch levels and total quantity."""
    # 1. Resolve product
    product = None
    if product_id:
        product = await get_product(db, product_id)
    elif sku_code:
        product = await get_product_by_sku(db, sku_code)
        
    if not product:
        raise NotFoundError("Product to receive stock for not found.")
        
    product_uuid = product.id
    performed_by_uuid = performed_by or uuid.UUID(int=0) # Default system UUID if missing

    # 2. Get or create StockLevel
    stmt = select(StockLevel).where(
        and_(StockLevel.outlet_id == outlet_id, StockLevel.product_id == product_uuid)
    ).with_for_update()
    result = await db.execute(stmt)
    stock_level = result.scalar_one_or_none()

    if not stock_level:
        stock_level = StockLevel(
            outlet_id=outlet_id,
            product_id=product_uuid,
            total_quantity=0,
            reserved_quantity=0
        )
        db.add(stock_level)
        await db.flush()

    # 3. Get or create Batch
    stmt_batch = select(Batch).where(
        and_(
            Batch.product_id == product_uuid,
            Batch.outlet_id == outlet_id,
            Batch.batch_number == batch_number
        )
    ).with_for_update()
    result_batch = await db.execute(stmt_batch)
    batch = result_batch.scalar_one_or_none()

    if batch:
        # Update existing batch
        batch.quantity += quantity
        batch.status = "ACTIVE"
    else:
        # Create new batch
        batch = Batch(
            product_id=product_uuid,
            outlet_id=outlet_id,
            batch_number=batch_number,
            manufacture_date=manufacture_date,
            expiry_date=expiry_date,
            quantity=quantity,
            status="ACTIVE"
        )
        db.add(batch)
        await db.flush()

    # 4. Increment StockLevel
    stock_level.total_quantity += quantity

    # 5. Save StockAdjustment (Audit trail)
    adjustment = StockAdjustment(
        outlet_id=outlet_id,
        product_id=product_uuid,
        batch_id=batch.id,
        quantity_delta=quantity,
        reason="STOCK_RECEIPT",
        performed_by=performed_by_uuid
    )
    db.add(adjustment)
    await db.commit()
    await db.refresh(batch)
    await db.refresh(stock_level)

    # 6. Publish event
    try:
        get_producer().send_event(
            topic="inventory.stock.updated",
            key=str(outlet_id),
            value={
                "event_type": "STOCK_INCREMENTED",
                "outlet_id": str(outlet_id),
                "sku_id": str(product_uuid),
                "batch_id": str(batch.id),
                "quantity_delta": quantity,
                "new_quantity": stock_level.total_quantity,
                "reason": "RECEIPT",
                "reference_id": None,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        )
    except Exception as e:
        logger.error(f"Failed to publish stock receipt event: {e}")

    return batch, stock_level.total_quantity


async def record_stock_adjustment(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    product_id: uuid.UUID,
    quantity_delta: int,
    reason: str,
    batch_id: Optional[uuid.UUID] = None,
    reference_id: Optional[uuid.UUID] = None,
    performed_by: Optional[uuid.UUID] = None,
    commit: bool = True
) -> Tuple[StockAdjustment, int, Optional[int]]:
    """Record manual stock adjustment with auditing and validation checks."""
    # 1. Resolve product
    product = await get_product(db, product_id)
    if not product:
        raise NotFoundError("Product not found.")
        
    performed_by_uuid = performed_by or uuid.UUID(int=0)

    # 2. Lock StockLevel
    stmt = select(StockLevel).where(
        and_(StockLevel.outlet_id == outlet_id, StockLevel.product_id == product_id)
    ).with_for_update()
    result = await db.execute(stmt)
    stock_level = result.scalar_one_or_none()

    if not stock_level:
        if quantity_delta < 0:
            raise ValidationError("Cannot decrement stock since no stock level exists for this product.")
        stock_level = StockLevel(
            outlet_id=outlet_id,
            product_id=product_id,
            total_quantity=0,
            reserved_quantity=0
        )
        db.add(stock_level)
        await db.flush()

    new_total = stock_level.total_quantity + quantity_delta
    if new_total < 0:
        raise ValidationError(f"Insufficient stock: cannot deduct {abs(quantity_delta)} units from total quantity of {stock_level.total_quantity}.")

    # 3. Update Batch if provided
    new_batch_qty = None
    if batch_id:
        stmt_batch = select(Batch).where(Batch.id == batch_id).with_for_update()
        result_batch = await db.execute(stmt_batch)
        batch = result_batch.scalar_one_or_none()

        if not batch:
            raise NotFoundError("Batch not found.")
        if batch.product_id != product_id or batch.outlet_id != outlet_id:
            raise ValidationError("Specified batch does not match the product or outlet.")

        new_batch_qty = batch.quantity + quantity_delta
        if new_batch_qty < 0:
            raise ValidationError(f"Insufficient stock in batch: cannot deduct {abs(quantity_delta)} units from batch quantity of {batch.quantity}.")

        batch.quantity = new_batch_qty
        if batch.quantity == 0:
            batch.status = "EXHAUSTED"
        elif batch.quantity > 0 and batch.status == "EXHAUSTED":
            batch.status = "ACTIVE"
    else:
        # If no batch is provided for a negative adjustment, raise an error because
        # we must track which batch the units are removed from to enforce FEFO & traceability.
        if quantity_delta < 0:
            raise ValidationError("A batch identifier is required to adjust inventory downwards.")

    # 4. Save stock level total
    stock_level.total_quantity = new_total

    # 5. Create Adjustment
    adjustment = StockAdjustment(
        outlet_id=outlet_id,
        product_id=product_id,
        batch_id=batch_id,
        quantity_delta=quantity_delta,
        reason=reason,
        reference_id=reference_id,
        performed_by=performed_by_uuid
    )
    db.add(adjustment)
    if commit:
        await db.commit()
        await db.refresh(adjustment)
        await db.refresh(stock_level)
    else:
        await db.flush()

    # 6. Publish update event
    try:
        event_type = "STOCK_INCREMENTED" if quantity_delta > 0 else "STOCK_DECREMENTED"
        get_producer().send_event(
            topic="inventory.stock.updated",
            key=str(outlet_id),
            value={
                "event_type": event_type,
                "outlet_id": str(outlet_id),
                "sku_id": str(product_id),
                "batch_id": str(batch_id) if batch_id else None,
                "quantity_delta": quantity_delta,
                "new_quantity": stock_level.total_quantity,
                "reason": "ADJUSTMENT",
                "reference_id": str(reference_id) if reference_id else None,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        )
    except Exception as e:
        logger.error(f"Failed to publish stock adjustment event: {e}")

    # 7. Check low stock levels
    if stock_level.total_quantity < product.reorder_point:
        try:
            get_producer().send_event(
                topic="inventory.low_stock",
                key=str(outlet_id),
                value={
                    "event_type": "LOW_STOCK",
                    "outlet_id": str(outlet_id),
                    "product_id": str(product_id),
                    "current_quantity": stock_level.total_quantity,
                    "reorder_point": product.reorder_point,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }
            )
        except Exception as e:
            logger.error(f"Failed to publish low stock alert: {e}")

        # Auto-reorder trigger: Automatically create a stock receipt to replenish inventory
        try:
            from datetime import timedelta
            reorder_qty = max(100, product.reorder_point * 2)
            auto_batch_number = f"REORDER-AUTO-{product.sku_code}-{datetime.now().strftime('%H%M%S')}"
            
            new_batch = Batch(
                product_id=product_id,
                outlet_id=outlet_id,
                batch_number=auto_batch_number,
                manufacture_date=date.today(),
                expiry_date=date.today() + timedelta(days=180),
                quantity=reorder_qty,
                status="ACTIVE"
            )
            db.add(new_batch)
            await db.flush() # Populate new_batch.id
            
            # Add to total quantity
            stock_level.total_quantity += reorder_qty
            
            # Audit trail
            auto_adjustment = StockAdjustment(
                outlet_id=outlet_id,
                product_id=product_id,
                batch_id=new_batch.id,
                quantity_delta=reorder_qty,
                reason="AUTO_REORDER_REPLENISH",
                performed_by=uuid.UUID(int=0)
            )
            db.add(auto_adjustment)
            
            # Publish update event
            get_producer().send_event(
                topic="inventory.stock.updated",
                key=str(outlet_id),
                value={
                    "event_type": "STOCK_INCREMENTED",
                    "outlet_id": str(outlet_id),
                    "sku_id": str(product_id),
                    "batch_id": str(new_batch.id),
                    "quantity_delta": reorder_qty,
                    "new_quantity": stock_level.total_quantity,
                    "reason": "AUTO_REORDER",
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }
            )
            logger.info(f"Auto-reordered {reorder_qty} units of SKU {product.sku_code} in batch {auto_batch_number} (current stock: {stock_level.total_quantity})")
        except Exception as e:
            logger.error(f"Failed to trigger auto-reorder replenishment: {e}")

    return adjustment, stock_level.total_quantity, new_batch_qty


# ----------------------------------------------------
# Periodic Scanner Helpers
# ----------------------------------------------------

async def get_expiring_batches(db: AsyncSession, outlet_id: uuid.UUID, days: int = 90) -> List[Tuple[Batch, Product]]:
    """Scan and fetch active batches expiring within N days."""
    today = date.today()
    # Find batches expiring between today and today + N days
    limit_date = date.fromordinal(today.toordinal() + days)
    
    stmt = select(Batch, Product).join(Product).where(
        and_(
            Batch.outlet_id == outlet_id,
            Batch.status == "ACTIVE",
            Batch.quantity > 0,
            Batch.expiry_date >= today,
            Batch.expiry_date <= limit_date
        )
    )
    result = await db.execute(stmt)
    return list(result.all())


async def scan_and_emit_expiry_alerts(db: AsyncSession) -> int:
    """Scan all active batches across the system and emit warnings for those expiring <= 90 days."""
    today = date.today()
    limit_date = date.fromordinal(today.toordinal() + 90)
    
    stmt = select(Batch, Product).join(Product).where(
        and_(
            Batch.status == "ACTIVE",
            Batch.quantity > 0,
            Batch.expiry_date >= today,
            Batch.expiry_date <= limit_date
        )
    )
    result = await db.execute(stmt)
    expiring = list(result.all())
    
    count = 0
    for batch, product in expiring:
        days_left = (batch.expiry_date - today).days
        alert_type = "urgent" if days_left <= 30 else "warning"
        
        try:
            get_producer().send_event(
                topic="inventory.expiry_warning" if alert_type == "warning" else "inventory.expiry_urgent",
                key=str(batch.outlet_id),
                value={
                    "event_type": f"EXPIRY_{alert_type.upper()}",
                    "outlet_id": str(batch.outlet_id),
                    "product_id": str(product.id),
                    "sku_code": product.sku_code,
                    "product_name": product.name,
                    "batch_number": batch.batch_number,
                    "expiry_date": batch.expiry_date.isoformat(),
                    "days_to_expiry": days_left,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }
            )
            count += 1
        except Exception as e:
            logger.error(f"Failed to publish expiry event for batch {batch.id}: {e}")
            
    return count


# ----------------------------------------------------
# Stock Transfer Operations (Task 8)
# ----------------------------------------------------
from datetime import timedelta
from services.inventory_service.app.models import TransferOrder, TransferLineItem

async def create_transfer(db: AsyncSession, source_outlet_id: uuid.UUID, destination_outlet_id: uuid.UUID, line_items_data: list) -> TransferOrder:
    if source_outlet_id == destination_outlet_id:
        raise ValidationError("Source and destination outlets must be different.")

    # Create transfer order
    transfer = TransferOrder(
        source_outlet_id=source_outlet_id,
        destination_outlet_id=destination_outlet_id,
        status="DRAFT",
        line_items=[]
    )
    db.add(transfer)

    for item in line_items_data:
        # Check stock level at source
        stmt = select(StockLevel).where(
            and_(
                StockLevel.outlet_id == source_outlet_id,
                StockLevel.product_id == item.product_id
            )
        )
        res = await db.execute(stmt)
        stock_level = res.scalar_one_or_none()

        if not stock_level or (stock_level.total_quantity - stock_level.reserved_quantity < item.quantity):
            raise ValidationError(f"Insufficient stock for product {item.product_id} at source outlet.")

        # Reserve stock
        stock_level.reserved_quantity += item.quantity

        # Load product
        product_obj = await db.get(Product, item.product_id)
        if not product_obj:
            raise ValidationError(f"Product {item.product_id} not found.")

        # Create line item and append to parent
        line_item = TransferLineItem(
            product_id=item.product_id,
            product=product_obj,
            quantity=item.quantity
        )
        transfer.line_items.append(line_item)

    await db.flush()
    await db.refresh(transfer)
    
    # Emit event
    try:
        get_producer().send_event(
            topic="inventory.transfer.state_changed",
            key=str(transfer.id),
            value={
                "event_type": "TRANSFER_CREATED",
                "transfer_id": str(transfer.id),
                "status": "DRAFT",
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        )
    except Exception as e:
        logger.error(f"Failed to emit transfer event: {e}")

    # Return fully preloaded transfer order
    loaded_transfer = await get_transfer_by_id(db, transfer.id)
    return loaded_transfer

async def get_transfer_by_id(db: AsyncSession, transfer_id: uuid.UUID) -> Optional[TransferOrder]:
    stmt = select(TransferOrder).options(
        selectinload(TransferOrder.line_items).selectinload(TransferLineItem.product)
    ).where(TransferOrder.id == transfer_id)
    res = await db.execute(stmt)
    return res.scalar_one_or_none()

async def get_transfers(db: AsyncSession, outlet_id: Optional[uuid.UUID] = None, status: Optional[str] = None) -> List[TransferOrder]:
    stmt = select(TransferOrder).options(
        selectinload(TransferOrder.line_items).selectinload(TransferLineItem.product)
    )
    conditions = []
    if outlet_id:
        conditions.append((TransferOrder.source_outlet_id == outlet_id) | (TransferOrder.destination_outlet_id == outlet_id))
    if status:
        conditions.append(TransferOrder.status == status)
    if conditions:
        stmt = stmt.where(and_(*conditions))
    stmt = stmt.order_by(TransferOrder.created_at.desc())
    res = await db.execute(stmt)
    return list(res.scalars().all())

async def approve_transfer(db: AsyncSession, transfer: TransferOrder) -> TransferOrder:
    if transfer.status != "DRAFT":
        raise ValidationError(f"Cannot approve transfer in status {transfer.status}.")
    transfer.status = "APPROVED"
    await db.flush()
    await db.refresh(transfer)
    try:
        get_producer().send_event(
            topic="inventory.transfer.state_changed",
            key=str(transfer.id),
            value={
                "event_type": "TRANSFER_APPROVED",
                "transfer_id": str(transfer.id),
                "status": "APPROVED",
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        )
    except Exception as e:
        logger.error(f"Failed to emit transfer event: {e}")
    return await get_transfer_by_id(db, transfer.id)

async def dispatch_transfer(db: AsyncSession, transfer: TransferOrder) -> TransferOrder:
    if transfer.status != "APPROVED":
        raise ValidationError(f"Cannot dispatch transfer in status {transfer.status}.")
    transfer.status = "DISPATCHED"
    await db.flush()
    await db.refresh(transfer)
    try:
        get_producer().send_event(
            topic="inventory.transfer.state_changed",
            key=str(transfer.id),
            value={
                "event_type": "TRANSFER_DISPATCHED",
                "transfer_id": str(transfer.id),
                "status": "DISPATCHED",
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        )
    except Exception as e:
        logger.error(f"Failed to emit transfer event: {e}")
    return await get_transfer_by_id(db, transfer.id)

async def receive_transfer(db: AsyncSession, transfer: TransferOrder) -> TransferOrder:
    if transfer.status != "DISPATCHED":
        raise ValidationError(f"Cannot receive transfer in status {transfer.status}.")

    # Deduct source stock and add to destination stock
    for item in transfer.line_items:
        # Source stock level update
        stmt_src = select(StockLevel).where(
            and_(
                StockLevel.outlet_id == transfer.source_outlet_id,
                StockLevel.product_id == item.product_id
            )
        )
        res_src = await db.execute(stmt_src)
        stock_src = res_src.scalar_one_or_none()
        if not stock_src:
            raise ValidationError(f"Source stock level record not found for product {item.product_id}.")
        
        # Deduct
        stock_src.total_quantity -= item.quantity
        stock_src.reserved_quantity -= item.quantity

        # Destination stock level update/create
        stmt_dest = select(StockLevel).where(
            and_(
                StockLevel.outlet_id == transfer.destination_outlet_id,
                StockLevel.product_id == item.product_id
            )
        )
        res_dest = await db.execute(stmt_dest)
        stock_dest = res_dest.scalar_one_or_none()
        if not stock_dest:
            stock_dest = StockLevel(
                outlet_id=transfer.destination_outlet_id,
                product_id=item.product_id,
                total_quantity=0,
                reserved_quantity=0
            )
            db.add(stock_dest)
            await db.flush()
        
        stock_dest.total_quantity += item.quantity

        # Adjust batches using FEFO: find active batches at source, deduct quantity, and create/increment active batches at destination
        qty_to_deduct = item.quantity
        stmt_batches = select(Batch).where(
            and_(
                Batch.outlet_id == transfer.source_outlet_id,
                Batch.product_id == item.product_id,
                Batch.status == "ACTIVE"
            )
        ).order_by(Batch.expiry_date.asc())
        res_batches = await db.execute(stmt_batches)
        batches_src = res_batches.scalars().all()

        for batch in batches_src:
            if qty_to_deduct <= 0:
                break
            deduct_qty = min(batch.quantity, qty_to_deduct)
            batch.quantity -= deduct_qty
            qty_to_deduct -= deduct_qty

            if batch.quantity == 0:
                batch.status = "EXHAUSTED"

            # Create or update corresponding batch at destination
            stmt_batch_dest = select(Batch).where(
                and_(
                    Batch.outlet_id == transfer.destination_outlet_id,
                    Batch.product_id == item.product_id,
                    Batch.batch_number == batch.batch_number
                )
            )
            res_b_dest = await db.execute(stmt_batch_dest)
            batch_dest = res_b_dest.scalar_one_or_none()
            if not batch_dest:
                batch_dest = Batch(
                    product_id=item.product_id,
                    outlet_id=transfer.destination_outlet_id,
                    batch_number=batch.batch_number,
                    manufacture_date=batch.manufacture_date,
                    expiry_date=batch.expiry_date,
                    quantity=0,
                    status="ACTIVE"
                )
                db.add(batch_dest)
                await db.flush()
            
            batch_dest.quantity += deduct_qty
            if batch_dest.quantity > 0 and batch_dest.status == "EXHAUSTED":
                batch_dest.status = "ACTIVE"

        if qty_to_deduct > 0:
            # Fallback
            auto_batch = f"TRF-{transfer.id.hex[:6].upper()}"
            batch_dest = Batch(
                product_id=item.product_id,
                outlet_id=transfer.destination_outlet_id,
                batch_number=auto_batch,
                manufacture_date=date.today(),
                expiry_date=date.today() + timedelta(days=180),
                quantity=qty_to_deduct,
                status="ACTIVE"
            )
            db.add(batch_dest)

    transfer.status = "RECEIVED"
    await db.flush()
    await db.refresh(transfer)
    try:
        get_producer().send_event(
            topic="inventory.transfer.state_changed",
            key=str(transfer.id),
            value={
                "event_type": "TRANSFER_RECEIVED",
                "transfer_id": str(transfer.id),
                "status": "RECEIVED",
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        )
    except Exception as e:
        logger.error(f"Failed to emit transfer event: {e}")
    return await get_transfer_by_id(db, transfer.id)

async def cancel_transfer(db: AsyncSession, transfer: TransferOrder) -> TransferOrder:
    if transfer.status not in ["DRAFT", "APPROVED"]:
        raise ValidationError(f"Cannot cancel transfer in status {transfer.status}.")
    
    # Release reserved stock
    for item in transfer.line_items:
        stmt = select(StockLevel).where(
            and_(
                StockLevel.outlet_id == transfer.source_outlet_id,
                StockLevel.product_id == item.product_id
            )
        )
        res = await db.execute(stmt)
        stock_level = res.scalar_one_or_none()
        if stock_level:
            stock_level.reserved_quantity = max(0, stock_level.reserved_quantity - item.quantity)
            
    transfer.status = "CANCELLED"
    await db.flush()
    await db.refresh(transfer)
    try:
        get_producer().send_event(
            topic="inventory.transfer.state_changed",
            key=str(transfer.id),
            value={
                "event_type": "TRANSFER_CANCELLED",
                "transfer_id": str(transfer.id),
                "status": "CANCELLED",
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        )
    except Exception as e:
        logger.error(f"Failed to emit transfer event: {e}")
    return await get_transfer_by_id(db, transfer.id)

