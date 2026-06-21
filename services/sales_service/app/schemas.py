import uuid
from datetime import datetime, date
from typing import List, Optional
from pydantic import BaseModel, Field, model_validator

from services.sales_service.app.crypto import cipher


# ----------------------------------------------------
# Prescription Schemas
# ----------------------------------------------------

class PrescriptionItemCreate(BaseModel):
    product_id: uuid.UUID
    prescribed_quantity: int = Field(..., gt=0)


class PrescriptionItemResponse(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    prescribed_quantity: int
    dispensed_quantity: int
    remaining_quantity: int

    class Config:
        from_attributes = True


class PrescriptionCreate(BaseModel):
    prescription_ref: str = Field(..., max_length=100)
    patient_id: str = Field(..., min_length=1)
    doctor_name: str = Field(..., max_length=255)
    doctor_registration: str = Field(..., max_length=100)
    prescription_date: date
    items: List[PrescriptionItemCreate] = Field(..., min_length=1)


class PrescriptionResponse(BaseModel):
    id: uuid.UUID
    prescription_ref: str
    patient_id: str # Will return decrypted patient ID
    doctor_name: str
    doctor_registration: str
    prescription_date: date
    status: str
    created_at: datetime
    items: List[PrescriptionItemResponse]

    class Config:
        from_attributes = True


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
    prescription_ref: Optional[str] = None


class TransactionLineItemResponse(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    batch_id: uuid.UUID
    quantity: int
    unit_price: float
    tax_rate: float
    discount_rate: float
    line_total: float
    prescription_id: Optional[uuid.UUID]

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
        # Enforce Property 21: subtotal must equal sum of quantities * unit_prices
        computed_subtotal = sum(item.quantity * item.unit_price for item in self.line_items)
        if abs(self.subtotal - computed_subtotal) > 0.01:
            raise ValueError(f"Subtotal {self.subtotal} does not match sum of line items {computed_subtotal}")
        
        # Enforce Property 21: total_amount must equal subtotal + tax_amount - discount_amount
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


class DispenseRequest(BaseModel):
    line_items: List[TransactionLineItemCreate] = Field(..., min_length=1)


class DispenseResponse(BaseModel):
    prescription_ref: str
    status: str
    dispensed_items: List[PrescriptionItemResponse]


class ClinicalOverrideCreate(BaseModel):
    prescription_ref: str = Field(..., max_length=100)
    reason: str = Field(..., min_length=1, max_length=255)


class ClinicalOverrideResponse(BaseModel):
    id: uuid.UUID
    prescription_ref: str
    pharmacist_id: uuid.UUID
    reason: str
    approved_at: datetime

    class Config:
        from_attributes = True
