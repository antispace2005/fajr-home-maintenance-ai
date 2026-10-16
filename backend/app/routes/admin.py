from typing import List, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

try:
    from backend.app.database import get_db
    from backend.app.models import Booking, WeeklySlot, Service, BusinessSetting, AdminUser
    from backend.app.schemas import (
        BookingResponse,
        BookingApproveRequest,
        BookingRejectRequest,
        SlotResponse,
        SlotCreate,
        SlotUpdate,
        ServiceResponse,
        ServiceUpdate,
    )
    from backend.app.security import get_current_admin
except ImportError:
    from app.database import get_db
    from app.models import Booking, WeeklySlot, Service, BusinessSetting, AdminUser
    from app.schemas import (
        BookingResponse,
        BookingApproveRequest,
        BookingRejectRequest,
        SlotResponse,
        SlotCreate,
        SlotUpdate,
        ServiceResponse,
        ServiceUpdate,
    )
    from app.security import get_current_admin

router = APIRouter(
    prefix="/api/admin",
    tags=["Admin Management"],
    dependencies=[Depends(get_current_admin)]
)


# --- Bookings Management ---

@router.get("/bookings", response_model=List[BookingResponse])
def list_bookings(
    status: Optional[str] = Query(None, description="Filter by booking status, e.g. pending, approved, rejected"),
    db: Session = Depends(get_db)
):
    query = db.query(Booking)
    if status:
        query = query.filter(Booking.status == status)
    return query.order_by(Booking.created_at.desc()).all()


@router.post("/bookings/{id}/approve", response_model=BookingResponse)
def approve_booking(
    id: int,
    payload: Optional[BookingApproveRequest] = None,
    db: Session = Depends(get_db)
):
    booking = db.query(Booking).filter(Booking.id == id).first()
    if not booking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")

    previous_status = booking.status
    booking.status = "approved"

    if payload:
        if payload.final_price_aed is not None:
            booking.final_price_aed = payload.final_price_aed
        elif booking.final_price_aed is None:
            booking.final_price_aed = booking.quoted_price_aed

        if payload.owner_notes is not None:
            booking.owner_notes = payload.owner_notes
    elif booking.final_price_aed is None:
        booking.final_price_aed = booking.quoted_price_aed

    if previous_status != "approved":
        if booking.slot:
            booking.slot.booked_count += 1
        elif booking.preferred_time_text:
            import re
            day_match = re.search(r"(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)", booking.preferred_time_text, re.IGNORECASE)
            time_match = re.search(r"(\d{1,2}:\d{2}\s*(?:AM|PM))", booking.preferred_time_text, re.IGNORECASE)
            if day_match and time_match:
                req_day = day_match.group(1).capitalize()
                req_time = time_match.group(1).upper()
                existing_slot = db.query(WeeklySlot).filter(WeeklySlot.day_of_week == req_day, WeeklySlot.start_time == req_time).first()
                if not existing_slot:
                    try:
                        hour_int = int(req_time.split(":")[0])
                        end_h = 12 if (hour_int % 12) + 2 == 12 else (hour_int % 12) + 2
                        existing_slot = WeeklySlot(
                            day_of_week=req_day,
                            start_time=req_time,
                            end_time=f"{end_h:02d}:00 {req_time[-2:]}",
                            capacity=1,
                            booked_count=1,
                            is_active=True
                        )
                        db.add(existing_slot)
                        db.flush()
                    except Exception:
                        pass
                else:
                    existing_slot.booked_count += 1
                if existing_slot and existing_slot.id:
                    booking.slot_id = existing_slot.id

    db.commit()
    db.refresh(booking)
    return booking


@router.post("/bookings/{id}/reject", response_model=BookingResponse)
def reject_booking(
    id: int,
    payload: Optional[BookingRejectRequest] = None,
    db: Session = Depends(get_db)
):
    booking = db.query(Booking).filter(Booking.id == id).first()
    if not booking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")

    previous_status = booking.status
    booking.status = "rejected"

    if payload and payload.owner_notes is not None:
        booking.owner_notes = payload.owner_notes

    # Release slot capacity if booking was previously confirmed or approved
    if previous_status.lower() in ["confirmed", "approved"] and booking.slot and booking.slot.booked_count > 0:
        booking.slot.booked_count = max(0, booking.slot.booked_count - 1)

    db.commit()
    db.refresh(booking)
    return booking


@router.post("/bookings/{id}/cancel", response_model=BookingResponse)
def cancel_booking(
    id: int,
    db: Session = Depends(get_db)
):
    booking = db.query(Booking).filter(Booking.id == id).first()
    if not booking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")

    previous_status = booking.status
    booking.status = "cancelled"

    # Release slot capacity if booking was previously confirmed or approved
    if previous_status.lower() in ["confirmed", "approved"] and booking.slot and booking.slot.booked_count > 0:
        booking.slot.booked_count = max(0, booking.slot.booked_count - 1)

    db.commit()
    db.refresh(booking)
    return booking


# --- Schedule / Slot Management ---

@router.get("/schedule", response_model=List[SlotResponse])
def get_schedule(db: Session = Depends(get_db)):
    return db.query(WeeklySlot).order_by(WeeklySlot.id.asc()).all()


@router.post("/schedule", response_model=SlotResponse, status_code=status.HTTP_201_CREATED)
def create_slot(slot_in: SlotCreate, db: Session = Depends(get_db)):
    slot = WeeklySlot(
        day_of_week=slot_in.day_of_week,
        start_time=slot_in.start_time,
        end_time=slot_in.end_time,
        capacity=slot_in.capacity,
        booked_count=0,
        is_active=slot_in.is_active,
    )
    db.add(slot)
    db.commit()
    db.refresh(slot)
    return slot


@router.patch("/schedule/{id}", response_model=SlotResponse)
def update_slot(id: int, slot_in: SlotUpdate, db: Session = Depends(get_db)):
    slot = db.query(WeeklySlot).filter(WeeklySlot.id == id).first()
    if not slot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Slot not found")

    if slot_in.capacity is not None:
        slot.capacity = slot_in.capacity
    if slot_in.booked_count is not None:
        slot.booked_count = slot_in.booked_count
    if slot_in.is_active is not None:
        slot.is_active = slot_in.is_active

    db.commit()
    db.refresh(slot)
    return slot


# --- Services Management ---

@router.get("/services", response_model=List[ServiceResponse])
def list_services(db: Session = Depends(get_db)):
    return db.query(Service).order_by(Service.id.asc()).all()


@router.patch("/services/{id}", response_model=ServiceResponse)
def update_service(id: int, service_in: ServiceUpdate, db: Session = Depends(get_db)):
    service = db.query(Service).filter(Service.id == id).first()
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")

    if service_in.name is not None:
        service.name = service_in.name
    if service_in.price_aed is not None:
        service.price_aed = service_in.price_aed
    if service_in.description is not None:
        service.description = service_in.description
    if service_in.is_active is not None:
        service.is_active = service_in.is_active

    db.commit()
    db.refresh(service)
    return service


# --- Business Settings Management ---

@router.get("/settings", response_model=Dict[str, str])
def get_settings(db: Session = Depends(get_db)):
    settings = db.query(BusinessSetting).all()
    return {s.key: s.value for s in settings}


@router.patch("/settings", response_model=Dict[str, str])
def update_settings(payload: Dict[str, str], db: Session = Depends(get_db)):
    for key, value in payload.items():
        setting = db.query(BusinessSetting).filter(BusinessSetting.key == key).first()
        if setting:
            setting.value = value
        else:
            db.add(BusinessSetting(key=key, value=value))
    db.commit()

    all_settings = db.query(BusinessSetting).all()
    return {s.key: s.value for s in all_settings}
