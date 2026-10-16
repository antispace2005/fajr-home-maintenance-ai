from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

try:
    from backend.app.database import get_db
    from backend.app.models import Booking, WeeklySlot, Service, BusinessSetting
    from backend.app.schemas import PublicInfoResponse, PublicBookingStatusResponse, ServiceResponse, SlotResponse
except ImportError:
    from app.database import get_db
    from app.models import Booking, WeeklySlot, Service, BusinessSetting
    from app.schemas import PublicInfoResponse, PublicBookingStatusResponse, ServiceResponse, SlotResponse

router = APIRouter(prefix="/api/public", tags=["Public"])


@router.get("/info", response_model=PublicInfoResponse)
def get_public_info(db: Session = Depends(get_db)):
    settings_records = db.query(BusinessSetting).all()
    settings_dict = {s.key: s.value for s in settings_records}

    company_name = settings_dict.get("company_name", "Al Fajr Home Maintenance")
    operating_hours = settings_dict.get("operating_hours")
    coverage_areas = settings_dict.get("coverage_areas")
    policy_notes = settings_dict.get("policy_notes")

    active_services = db.query(Service).filter(Service.is_active == True).order_by(Service.id.asc()).all()

    available_slots = (
        db.query(WeeklySlot)
        .filter(WeeklySlot.is_active == True, WeeklySlot.capacity > WeeklySlot.booked_count)
        .order_by(WeeklySlot.id.asc())
        .all()
    )

    return PublicInfoResponse(
        company_name=company_name,
        operating_hours=operating_hours,
        coverage_areas=coverage_areas,
        policy_notes=policy_notes,
        services=[ServiceResponse.model_validate(s) for s in active_services],
        available_slots=[SlotResponse.model_validate(slot) for slot in available_slots],
    )


@router.get("/bookings/status", response_model=PublicBookingStatusResponse)
def get_booking_status(
    ref: str = Query(..., description="Booking reference number"),
    db: Session = Depends(get_db)
):
    booking = db.query(Booking).filter(Booking.reference_no == ref).first()
    if not booking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking reference not found")

    preferred_time = booking.preferred_time_text
    if not preferred_time and booking.slot:
        preferred_time = f"{booking.slot.day_of_week} {booking.slot.start_time} - {booking.slot.end_time}"

    return PublicBookingStatusResponse(
        reference_no=booking.reference_no,
        status=booking.status,
        service_name=booking.service.name if booking.service else None,
        preferred_time=preferred_time,
        quoted_price_aed=float(booking.quoted_price_aed) if booking.quoted_price_aed is not None else None,
        final_price_aed=float(booking.final_price_aed) if booking.final_price_aed is not None else None,
        owner_notes=booking.owner_notes,
    )
