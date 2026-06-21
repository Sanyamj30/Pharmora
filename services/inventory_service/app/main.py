import uuid
import asyncio
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, Depends, Request, Response, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from shared.database import get_db, async_session_factory, Base, engine
from shared.errors import register_error_handlers, ValidationError, NotFoundError
from shared.auth import decode_access_token
from shared.kafka import KafkaConsumer

from services.inventory_service.app.config import settings
from services.inventory_service.app import crud, schemas

app = FastAPI(title="Pharmora Inventory Service", version="0.1.0")
register_error_handlers(app)

# Global Kafka Consumer for sales events
sales_consumer = None


def get_current_user_id(request: Request) -> Optional[uuid.UUID]:
    """Extract user_id (sub claim) from JWT in the Authorization header."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ")[1]
    try:
        payload = decode_access_token(token)
        return uuid.UUID(payload["sub"])
    except Exception:
        return None


async def process_sale_event(event: Dict[str, Any]):
    """Background worker to handle sale events and decrement inventory."""
    logger.info(f"Inventory Service processing sales event: {event}")
    outlet_id_str = event.get("outlet_id")
    items = event.get("items", [])
    performed_by_str = event.get("performed_by")
    invoice_number = event.get("invoice_number")
    
    if not outlet_id_str or not items:
        logger.warning("Sales completed event missing required fields.")
        return
        
    try:
        outlet_id = uuid.UUID(outlet_id_str)
        performed_by = uuid.UUID(performed_by_str) if performed_by_str else None
    except ValueError as e:
        logger.error(f"Invalid UUID in sales completed event: {e}")
        return
        
    async with async_session_factory() as db:
        try:
            for item in items:
                p_id_str = item.get("product_id")
                b_id_str = item.get("batch_id")
                qty = item.get("quantity", 0)
                if not p_id_str or not b_id_str or qty <= 0:
                    continue
                product_id = uuid.UUID(p_id_str)
                batch_id = uuid.UUID(b_id_str)
                
                # Perform negative adjustment to decrement stock (SALE_DISPENSE reason)
                await crud.record_stock_adjustment(
                    db=db,
                    outlet_id=outlet_id,
                    product_id=product_id,
                    quantity_delta=-qty,
                    reason="SALE_DISPENSE",
                    batch_id=batch_id,
                    performed_by=performed_by
                )
            logger.info(f"Successfully decremented inventory for invoice {invoice_number}")
        except Exception as e:
            logger.error(f"Error decrementing inventory from sales event: {e}")


def sales_event_handler(topic: str, key: str, value: Dict[str, Any]):
    """Sync handler wrapper for thread safe execution on event loop."""
    loop = asyncio.get_event_loop()
    if loop.is_running():
        asyncio.run_coroutine_threadsafe(process_sale_event(value), loop)
    else:
        loop.run_until_complete(process_sale_event(value))


@app.on_event("startup")
async def startup():
    global sales_consumer
    
    # 1. Initialize tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables initialized for Inventory Service.")
        
    # 2. Start Kafka Consumer for sales completed events
    sales_consumer = KafkaConsumer(
        group_id="inventory-sales-consumer",
        topics=["sales.completed"]
    )
    sales_consumer.start(sales_event_handler)
    logger.info("Inventory Service startup complete.")


@app.on_event("shutdown")
async def shutdown():
    global sales_consumer
    if sales_consumer:
        sales_consumer.stop()
    logger.info("Inventory Service shutdown complete.")


# ----------------------------------------------------
# Catalog Endpoints
# ----------------------------------------------------

@app.post("/inventory/products", response_model=schemas.ProductResponse, status_code=status.HTTP_201_CREATED)
async def add_product(payload: schemas.ProductCreate, db: AsyncSession = Depends(get_db)):
    """Add a new product/SKU to the general product catalog."""
    return await crud.create_product(
        db=db,
        sku_code=payload.sku_code,
        name=payload.name,
        category=payload.category,
        schedule_class=payload.schedule_class,
        unit_of_measure=payload.unit_of_measure,
        reorder_point=payload.reorder_point,
        lead_time_days=payload.lead_time_days
    )


# ----------------------------------------------------
# Inventory Query Endpoints
# ----------------------------------------------------

@app.get("/inventory/{outlet_id}/stock", response_model=List[schemas.StockLevelResponse])
async def list_stock_levels(outlet_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Retrieve current stock levels for all products at a specific outlet."""
    return await crud.get_all_stock_levels(db, outlet_id)


@app.get("/inventory/{outlet_id}/stock/{sku_id}", response_model=schemas.StockLevelResponse)
async def get_stock_level(outlet_id: uuid.UUID, sku_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Retrieve stock level detail for a specific product SKU at an outlet."""
    level = await crud.get_stock_level(db, outlet_id, sku_id)
    if not level:
        raise NotFoundError("Stock level not found for this product SKU at the specified outlet.")
    return level


@app.get("/inventory/{outlet_id}/batches/{sku_id}", response_model=List[schemas.BatchResponse])
async def list_fefo_batches(outlet_id: uuid.UUID, sku_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Retrieve active batches for a product SKU, ordered by expiry date (FEFO)."""
    return await crud.get_fefo_batches(db, outlet_id, sku_id)


# ----------------------------------------------------
# Inventory Mutation Endpoints
# ----------------------------------------------------

@app.post("/inventory/{outlet_id}/receipts", response_model=schemas.StockReceiptResponse, status_code=status.HTTP_201_CREATED)
async def record_receipt(
    outlet_id: uuid.UUID,
    payload: schemas.StockReceiptRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Record receipt of a batch of goods, updating batch details and total stock."""
    user_id = get_current_user_id(request)
    batch, new_total = await crud.record_stock_receipt(
        db=db,
        outlet_id=outlet_id,
        batch_number=payload.batch_number,
        manufacture_date=payload.manufacture_date,
        expiry_date=payload.expiry_date,
        quantity=payload.quantity,
        sku_code=payload.sku_code,
        product_id=payload.product_id,
        performed_by=user_id
    )
    return schemas.StockReceiptResponse(batch=batch, new_total_quantity=new_total)


@app.post("/inventory/{outlet_id}/adjustments", response_model=schemas.StockAdjustmentResponse, status_code=status.HTTP_201_CREATED)
async def record_adjustment(
    outlet_id: uuid.UUID,
    payload: schemas.StockAdjustmentRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Record a manual adjustment to inventory levels (e.g. for damage, loss, audit discrepancy)."""
    user_id = get_current_user_id(request)
    adj, total_qty, batch_qty = await crud.record_stock_adjustment(
        db=db,
        outlet_id=outlet_id,
        product_id=payload.product_id,
        quantity_delta=payload.quantity_delta,
        reason=payload.reason,
        batch_id=payload.batch_id,
        reference_id=payload.reference_id,
        performed_by=user_id
    )
    return schemas.StockAdjustmentResponse(
        adjustment_id=adj.id,
        product_id=adj.product_id,
        batch_id=adj.batch_id,
        quantity_delta=adj.quantity_delta,
        new_total_quantity=total_qty,
        new_batch_quantity=batch_qty
    )


# ----------------------------------------------------
# Alerts & Operations
# ----------------------------------------------------

@app.get("/inventory/{outlet_id}/low-stock", response_model=List[schemas.LowStockResponse])
async def list_low_stock(outlet_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """List products that are currently below their configured reorder point at the outlet."""
    stock_levels = await crud.get_all_stock_levels(db, outlet_id)
    low_stock_items = []
    for level in stock_levels:
        if level.total_quantity < level.product.reorder_point:
            low_stock_items.append(
                schemas.LowStockResponse(
                    product_id=level.product.id,
                    sku_code=level.product.sku_code,
                    product_name=level.product.name,
                    current_quantity=level.total_quantity,
                    reorder_point=level.product.reorder_point
                )
            )
    return low_stock_items


@app.get("/inventory/{outlet_id}/expiry-alerts", response_model=List[schemas.ExpiryAlertResponse])
async def get_expiry_alerts(outlet_id: uuid.UUID, days: int = 90, db: AsyncSession = Depends(get_db)):
    """Fetch all active batches at an outlet that are expiring within the specified days limit."""
    expiring = await crud.get_expiring_batches(db, outlet_id, days)
    today = datetime.now(timezone.utc).date()
    alerts = []
    for batch, product in expiring:
        days_left = (batch.expiry_date - today).days
        alert_type = "urgent" if days_left <= 30 else "warning"
        alerts.append(
            schemas.ExpiryAlertResponse(
                batch_id=batch.id,
                product_id=product.id,
                sku_code=product.sku_code,
                product_name=product.name,
                batch_number=batch.batch_number,
                expiry_date=batch.expiry_date,
                days_to_expiry=days_left,
                alert_type=alert_type
            )
        )
    return alerts


@app.post("/inventory/tasks/scan-expiries", status_code=status.HTTP_200_OK)
async def scan_expiries(db: AsyncSession = Depends(get_db)):
    """Trigger system-wide batch scan and emit warnings to Kafka for items expiring in 90 days."""
    count = await crud.scan_and_emit_expiry_alerts(db)
    return {"message": "Expiry alert scan completed successfully.", "alerts_emitted": count}


@app.get("/inventory/{outlet_id}/recommendations")
async def get_replenishment_recommendations(outlet_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Dynamically generate replenishment recommendations based on stock level reorder point breaches."""
    from services.inventory_service.app.models import Product
    from sqlalchemy import select

    stock_levels = await crud.get_all_stock_levels(db, outlet_id)
    recommendations = []
    
    for level in stock_levels:
        product = level.product
        if level.total_quantity < product.reorder_point:
            suggested_qty = max(100, product.reorder_point * 3)
            recommendations.append({
                "id": f"REC-{product.sku_code.split('-')[-1]}-{str(uuid.uuid4())[:4].upper()}",
                "sku": product.sku_code,
                "name": product.name,
                "source": "RULE_BASED",
                "confidence": 0.95,
                "suggested_qty": suggested_qty,
                "reason": f"Stock levels fell to {level.total_quantity} units (Breached Reorder point: {product.reorder_point})"
            })
            
    # Add a mock AI recommendation for healthy catalog items to demonstrate prediction forecasting
    for level in stock_levels:
        product = level.product
        if level.total_quantity >= product.reorder_point and len(recommendations) < 3:
            recommendations.append({
                "id": f"REC-AI-{product.sku_code.split('-')[-1]}",
                "sku": product.sku_code,
                "name": product.name,
                "source": "AI_GENERATED",
                "confidence": 0.89,
                "suggested_qty": 300,
                "reason": f"AI Forecast predicts 25% increase in {product.category} demand in Delhi NCR"
            })
            
    return recommendations


# ----------------------------------------------------
# Stock Transfers API Routes (Task 8)
# ----------------------------------------------------

@app.post("/transfers", response_model=schemas.TransferOrderResponse, status_code=status.HTTP_201_CREATED)
async def create_transfer_order(
    transfer_in: schemas.TransferOrderCreate,
    db: AsyncSession = Depends(get_db)
):
    try:
        res = await crud.create_transfer(
            db=db,
            source_outlet_id=transfer_in.source_outlet_id,
            destination_outlet_id=transfer_in.destination_outlet_id,
            line_items_data=transfer_in.line_items
        )
        # Convert ORM to Pydantic
        return res
    except ValidationError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

@app.get("/transfers", response_model=List[schemas.TransferOrderResponse])
async def list_transfer_orders(
    outlet_id: Optional[uuid.UUID] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    return await crud.get_transfers(db=db, outlet_id=outlet_id, status=status)

@app.patch("/transfers/{transfer_id}/approve", response_model=schemas.TransferOrderResponse)
async def approve_transfer_order(
    transfer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    transfer = await crud.get_transfer_by_id(db=db, transfer_id=transfer_id)
    if not transfer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transfer order not found")
    try:
        return await crud.approve_transfer(db=db, transfer=transfer)
    except ValidationError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

@app.patch("/transfers/{transfer_id}/dispatch", response_model=schemas.TransferOrderResponse)
async def dispatch_transfer_order(
    transfer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    transfer = await crud.get_transfer_by_id(db=db, transfer_id=transfer_id)
    if not transfer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transfer order not found")
    try:
        return await crud.dispatch_transfer(db=db, transfer=transfer)
    except ValidationError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

@app.patch("/transfers/{transfer_id}/receive", response_model=schemas.TransferOrderResponse)
async def receive_transfer_order(
    transfer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    transfer = await crud.get_transfer_by_id(db=db, transfer_id=transfer_id)
    if not transfer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transfer order not found")
    try:
        return await crud.receive_transfer(db=db, transfer=transfer)
    except ValidationError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

@app.patch("/transfers/{transfer_id}/cancel", response_model=schemas.TransferOrderResponse)
async def cancel_transfer_order(
    transfer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    transfer = await crud.get_transfer_by_id(db=db, transfer_id=transfer_id)
    if not transfer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transfer order not found")
    try:
        return await crud.cancel_transfer(db=db, transfer=transfer)
    except ValidationError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

