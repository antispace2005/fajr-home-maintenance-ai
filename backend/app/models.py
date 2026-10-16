from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Boolean,
    Numeric,
    DateTime,
    ForeignKey,
    func
)
from sqlalchemy.orm import relationship
try:
    from backend.app.database import Base
except ImportError:
    from .database import Base


class Service(Base):
    __tablename__ = "services"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    price_aed = Column(Numeric(10, 2), nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    bookings = relationship("Booking", back_populates="service")


class WeeklySlot(Base):
    __tablename__ = "weekly_slots"

    id = Column(Integer, primary_key=True, index=True)
    day_of_week = Column(String(20), nullable=False)
    start_time = Column(String(20), nullable=False)
    end_time = Column(String(20), nullable=False)
    capacity = Column(Integer, default=1, nullable=False)
    booked_count = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    bookings = relationship("Booking", back_populates="slot")


class Booking(Base):
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, index=True)
    reference_no = Column(String(50), unique=True, index=True, nullable=False)
    customer_name = Column(String(100), nullable=False)
    customer_phone = Column(String(50), nullable=False)
    customer_address = Column(Text, nullable=False)
    service_id = Column(Integer, ForeignKey("services.id"), nullable=True)
    slot_id = Column(Integer, ForeignKey("weekly_slots.id"), nullable=True)
    preferred_time_text = Column(String(255), nullable=True)
    discount_requested = Column(Boolean, default=False, nullable=False)
    discount_notes = Column(Text, nullable=True)
    quoted_price_aed = Column(Numeric(10, 2), nullable=True)
    final_price_aed = Column(Numeric(10, 2), nullable=True)
    status = Column(String(50), default="pending", nullable=False)
    owner_notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    service = relationship("Service", back_populates="bookings")
    slot = relationship("WeeklySlot", back_populates="bookings")


class BusinessSetting(Base):
    __tablename__ = "business_settings"

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=False)


class AdminUser(Base):
    __tablename__ = "admin_users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
