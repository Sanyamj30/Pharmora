import uuid
from datetime import datetime, date
from typing import Optional, List
from sqlalchemy import String, Integer, DateTime, Date, ForeignKey, UUID, CheckConstraint, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from shared.database import Base


class Product(Base):
    __tablename__ = "products"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sku_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    schedule_class: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # e.g., None, 'H', 'X'
    unit_of_measure: Mapped[str] = mapped_column(String(20), nullable=False)
    reorder_point: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    lead_time_days: Mapped[int] = mapped_column(Integer, nullable=False, default=7)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    stock_levels: Mapped[List["StockLevel"]] = relationship("StockLevel", back_populates="product", cascade="all, delete-orphan")
    batches: Mapped[List["Batch"]] = relationship("Batch", back_populates="product", cascade="all, delete-orphan")
    adjustments: Mapped[List["StockAdjustment"]] = relationship("StockAdjustment", back_populates="product", cascade="all, delete-orphan")


class StockLevel(Base):
    __tablename__ = "stock_levels"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    outlet_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    total_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reserved_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    product: Mapped["Product"] = relationship("Product", back_populates="stock_levels")

    __table_args__ = (
        UniqueConstraint("outlet_id", "product_id", name="uq_stock_levels_outlet_product"),
        CheckConstraint("total_quantity >= 0", name="chk_stock_levels_total_quantity"),
        CheckConstraint("reserved_quantity >= 0", name="chk_stock_levels_reserved_quantity"),
    )


class Batch(Base):
    __tablename__ = "batches"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    outlet_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    batch_number: Mapped[str] = mapped_column(String(100), nullable=False)
    manufacture_date: Mapped[date] = mapped_column(Date, nullable=False)
    expiry_date: Mapped[date] = mapped_column(Date, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")  # ACTIVE, EXHAUSTED, RECALLED
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    product: Mapped["Product"] = relationship("Product", back_populates="batches")
    adjustments: Mapped[List["StockAdjustment"]] = relationship("StockAdjustment", back_populates="batch", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("product_id", "outlet_id", "batch_number", name="uq_batches_product_outlet_number"),
        CheckConstraint("quantity >= 0", name="chk_batches_quantity"),
        CheckConstraint("status IN ('ACTIVE', 'EXHAUSTED', 'RECALLED')", name="chk_batches_status"),
    )


class StockAdjustment(Base):
    __tablename__ = "stock_adjustments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    outlet_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    batch_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("batches.id", ondelete="SET NULL"), nullable=True)
    quantity_delta: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String(100), nullable=False)
    reference_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    performed_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    product: Mapped["Product"] = relationship("Product", back_populates="adjustments")
    batch: Mapped[Optional["Batch"]] = relationship("Batch", back_populates="adjustments")


class TransferOrder(Base):
    __tablename__ = "transfer_orders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_outlet_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    destination_outlet_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="DRAFT")  # DRAFT, APPROVED, DISPATCHED, RECEIVED, CANCELLED
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    line_items: Mapped[List["TransferLineItem"]] = relationship("TransferLineItem", back_populates="transfer_order", cascade="all, delete-orphan", lazy="selectin")


class TransferLineItem(Base):
    __tablename__ = "transfer_line_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    transfer_order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("transfer_orders.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)

    transfer_order: Mapped["TransferOrder"] = relationship("TransferOrder", back_populates="line_items")
    product: Mapped["Product"] = relationship("Product", lazy="joined")

