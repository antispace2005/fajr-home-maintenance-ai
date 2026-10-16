from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict


# Auth Schemas
class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class AdminProfile(BaseModel):
    id: int
    username: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# Service Schemas
class ServiceBase(BaseModel):
    name: str
    price_aed: float
    description: Optional[str] = None
    is_active: bool = True


class ServiceCreate(ServiceBase):
    pass


class ServiceUpdate(BaseModel):
    name: Optional[str] = None
    price_aed: Optional[float] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class ServiceResponse(ServiceBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


# Slot Schemas
class SlotBase(BaseModel):
    day_of_week: str
    start_time: str
    end_time: str
    capacity: int = 1
    is_active: bool = True


class SlotCreate(SlotBase):
    pass


class SlotUpdate(BaseModel):
    capacity: Optional[int] = None
    booked_count: Optional[int] = None
    is_active: Optional[bool] = None


class SlotResponse(SlotBase):
    id: int
    booked_count: int

    model_config = ConfigDict(from_attributes=True)


# Booking Schemas
class BookingApproveRequest(BaseModel):
    final_price_aed: Optional[float] = None
    owner_notes: Optional[str] = None


class BookingRejectRequest(BaseModel):
    owner_notes: Optional[str] = None


class BookingResponse(BaseModel):
    id: int
    reference_no: str
    customer_name: str
    customer_phone: str
    customer_address: str
    service_id: Optional[int] = None
    slot_id: Optional[int] = None
    preferred_time_text: Optional[str] = None
    discount_requested: bool = False
    discount_notes: Optional[str] = None
    quoted_price_aed: Optional[float] = None
    final_price_aed: Optional[float] = None
    status: str
    owner_notes: Optional[str] = None
    created_at: datetime
    service: Optional[ServiceResponse] = None
    slot: Optional[SlotResponse] = None

    model_config = ConfigDict(from_attributes=True)


# Public Schemas
class PublicBookingStatusResponse(BaseModel):
    reference_no: str
    status: str
    service_name: Optional[str] = None
    preferred_time: Optional[str] = None
    quoted_price_aed: Optional[float] = None
    final_price_aed: Optional[float] = None
    owner_notes: Optional[str] = None


class PublicInfoResponse(BaseModel):
    company_name: str
    operating_hours: Optional[str] = None
    coverage_areas: Optional[str] = None
    policy_notes: Optional[str] = None
    services: List[ServiceResponse]
    available_slots: List[SlotResponse]


# Business Settings Schemas
class BusinessSettingItem(BaseModel):
    key: str
    value: str

    model_config = ConfigDict(from_attributes=True)
