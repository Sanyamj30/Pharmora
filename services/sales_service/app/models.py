import uuid
from datetime import datetime, date
from typing import List, Optional
from sqlalchemy import Column, String, Integer, DateTime, Date, ForeignKey, Numeric, CheckConstraint, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from shared.database import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    invoice_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    outlet_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    pharmacist_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="COMPLETED") # PENDING, COMPLETED, VOIDED
    payment_method: Mapped[str] = mapped_column(String(20), nullable=False) # CASH, CARD, UPI
    subtotal: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    tax_amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    discount_amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    total_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    voided_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    voided_by: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    # Relationships
    line_items: Mapped[List["TransactionLineItem"]] = relationship(
        "TransactionLineItem",
        back_populates="transaction",
        cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("status IN ('PENDING', 'COMPLETED', 'VOIDED')", name="chk_transaction_status"),
        CheckConstraint("payment_method IN ('CASH', 'CARD', 'UPI')", name="chk_payment_method"),
    )


class TransactionLineItem(Base):
    __tablename__ = "transaction_line_items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    transaction_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("transactions.id"), nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    batch_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    tax_rate: Mapped[float] = mapped_column(Numeric(5, 4), default=0.0)
    discount_rate: Mapped[float] = mapped_column(Numeric(5, 4), default=0.0)
    line_total: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    prescription_id: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True)

    # Relationships
    transaction: Mapped["Transaction"] = relationship("Transaction", back_populates="line_items")

    __table_args__ = (
        CheckConstraint("quantity > 0", name="chk_line_item_quantity"),
    )
