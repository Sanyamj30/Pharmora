import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, model_validator

# ----------------------------------------------------
# Transaction / Invoice Schemas
# ----------------------------------------------------

class TransactionLineItemCreate(BaseModel):
    product_id: uuid.UUID
    batch_id: uuid.UUID
    quantity: int = Field(..., gt=0)
    unit_price: float = Field(..., ge=0.0)
    tax_rate: float = Field(0.0, ge=0.0, le=1.0)
    discount_rate: float = Field(0.0, ge=0.0, le=1.0)


class TransactionLineItemResponse(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    batch_id: uuid.UUID
    quantity: int
    unit_price: float
    tax_rate: float
    discount_rate: float
    line_total: float

    class Config:
        from_attributes = True


class TransactionCreate(BaseModel):
    outlet_id: uuid.UUID
    payment_method: str = Field(..., max_length=20) # CASH, CARD, UPI
    line_items: List[TransactionLineItemCreate] = Field(..., min_length=1)
    subtotal: float = Field(..., ge=0.0)
    tax_amount: float = Field(0.0, ge=0.0)
    discount_amount: float = Field(0.0, ge=0.0)
    total_amount: float = Field(..., ge=0.0)

    @model_validator(mode="after")
    def validate_invoice_totals(self) -> 'TransactionCreate':
        computed_subtotal = sum(item.quantity * item.unit_price for item in self.line_items)
        if abs(self.subtotal - computed_subtotal) > 0.01:
            raise ValueError(f"Subtotal {self.subtotal} does not match sum of line items {computed_subtotal}")
        
        computed_total = self.subtotal + self.tax_amount - self.discount_amount
        if abs(self.total_amount - computed_total) > 0.01:
            raise ValueError(f"Total amount {self.total_amount} does not match subtotal + tax - discount ({computed_total})")
        
        return self


class TransactionResponse(BaseModel):
    id: uuid.UUID
    invoice_number: str
    outlet_id: uuid.UUID
    pharmacist_id: uuid.UUID
    status: str
    payment_method: str
    subtotal: float
    tax_amount: float
    discount_amount: float
    total_amount: float
    created_at: datetime
    line_items: List[TransactionLineItemResponse]

    class Config:
        from_attributes = True
