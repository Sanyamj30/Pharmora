import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "Bearer"
    expires_in: int


class RefreshRequest(BaseModel):
    refresh_token: str = Field(..., description="The refresh token issued during login")


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=6, description="Minimum 6 characters")
    role: str = Field(..., description="Role must be one of: regional_admin, pharmacist, inventory_controller, finance_manager")
    region_id: Optional[uuid.UUID] = None
    outlet_scope: Optional[List[uuid.UUID]] = Field(default_factory=list)


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(None, min_length=6)
    role: Optional[str] = None
    region_id: Optional[uuid.UUID] = None
    outlet_scope: Optional[List[uuid.UUID]] = None
    is_active: Optional[bool] = None


class UserOut(BaseModel):
    id: uuid.UUID
    username: str
    email: str
    role: str
    region_id: Optional[uuid.UUID]
    is_active: bool
    outlet_scope: List[uuid.UUID] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
