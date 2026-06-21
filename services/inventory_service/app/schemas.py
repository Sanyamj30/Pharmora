import uuid
from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel, Field, model_validator


class ProductCreate(BaseModel):
    sku_code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=255)
    category: str = Field(..., max_length=100)
    schedule_class: Optional[str] = Field(None, max_length=10) # None, 'H', 'X'
    unit_of_measure: str = Field(..., max_length=20)
    reorder_point: int = Field(0, ge=0)
    lead_time_days: int = Field(7, ge=0)


class ProductResponse(BaseModel):
    id: uuid.UUID
    sku_code: str
    name: str
    category: str
    schedule_class: Optional[str]
    unit_of_measure: str
    reorder_point: int
    lead_time_days: int
    created_at: datetime

    class Config:
        from_attributes = True


class StockLevelResponse(BaseModel):
    product: ProductResponse
    total_quantity: int
    reserved_quantity: int
    updated_at: datetime

    class Config:
        from_attributes = True


class BatchResponse(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    outlet_id: uuid.UUID
    batch_number: str
    manufacture_date: date
    expiry_date: date
    quantity: int
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class StockReceiptRequest(BaseModel):
    sku_code: Optional[str] = None
    product_id: Optional[uuid.UUID] = None
    batch_number: str = Field(..., max_length=100)
    manufacture_date: date
    expiry_date: date
    quantity: int = Field(..., gt=0)

    @model_validator(mode="after")
    def validate_receipt(self) -> 'StockReceiptRequest':
        if self.expiry_date <= self.manufacture_date:
            raise ValueError("expiry_date must be strictly after manufacture_date")
        if not self.sku_code and not self.product_id:
            raise ValueError("Either sku_code or product_id must be provided")
        return self


class StockReceiptResponse(BaseModel):
    batch: BatchResponse
    new_total_quantity: int


class StockAdjustmentRequest(BaseModel):
    product_id: uuid.UUID
    batch_id: Optional[uuid.UUID] = None
    quantity_delta: int = Field(..., ne=0) # Non-zero delta
    reason: str = Field(..., max_length=100)
    reference_id: Optional[uuid.UUID] = None


class StockAdjustmentResponse(BaseModel):
    adjustment_id: uuid.UUID
    product_id: uuid.UUID
    batch_id: Optional[uuid.UUID]
    quantity_delta: int
    new_total_quantity: int
    new_batch_quantity: Optional[int]


class ExpiryAlertResponse(BaseModel):
    batch_id: uuid.UUID
    product_id: uuid.UUID
    sku_code: str
    product_name: str
    batch_number: str
    expiry_date: date
    days_to_expiry: int
    alert_type: str # warning (<= 90 days), urgent (<= 30 days)


class LowStockResponse(BaseModel):
    product_id: uuid.UUID
    sku_code: str
    product_name: str
    current_quantity: int
    reorder_point: int


class TransferLineItemCreate(BaseModel):
    product_id: uuid.UUID
    quantity: int = Field(..., gt=0)


class TransferLineItemResponse(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    quantity: int
    product: Optional[ProductResponse] = None

    class Config:
        from_attributes = True


class TransferOrderCreate(BaseModel):
    source_outlet_id: uuid.UUID
    destination_outlet_id: uuid.UUID
    line_items: List[TransferLineItemCreate]


class TransferOrderResponse(BaseModel):
    id: uuid.UUID
    source_outlet_id: uuid.UUID
    destination_outlet_id: uuid.UUID
    status: str
    created_at: datetime
    updated_at: datetime
    line_items: List[TransferLineItemResponse]

    class Config:
        from_attributes = True

