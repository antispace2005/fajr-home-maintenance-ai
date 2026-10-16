import os
import random
import json
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

from google import genai
from google.genai import types

from backend.app.database import SessionLocal
from backend.app.models import Service, WeeklySlot, Booking, BusinessSetting


def get_live_business_context() -> Dict[str, Any]:
    """Fetch current dynamic business rules, services, and open slots from PostgreSQL."""
    db = SessionLocal()
    try:
        # 1. Settings
        settings_rows = db.query(BusinessSetting).all()
        settings = {s.key: s.value for s in settings_rows}
        coverage = settings.get("coverage_areas", "Abu Dhabi city only")
        hours = settings.get("operating_hours", "Monday to Saturday, 9:00 AM – 6:00 PM")
        policy = settings.get("policy_notes", "Discounts and out-of-schedule appointments require owner approval.")

        # 2. Services
        services = db.query(Service).filter(Service.is_active == True).all()
        service_list = [
            {"id": s.id, "name": s.name, "price_aed": float(s.price_aed), "description": s.description}
            for s in services
        ]

        # 3. Available Slots (where capacity > booked_count)
        slots = db.query(WeeklySlot).filter(WeeklySlot.is_active == True).all()
        available_slots = []
        for slot in slots:
            remaining = slot.capacity - slot.booked_count
            if remaining > 0:
                available_slots.append({
                    "id": slot.id,
                    "day": slot.day_of_week,
                    "day_of_week": slot.day_of_week,
                    "time": f"{slot.start_time} - {slot.end_time}",
                    "start_time": slot.start_time,
                    "end_time": slot.end_time,
                    "capacity": slot.capacity,
                    "booked_count": slot.booked_count,
                    "remaining_capacity": remaining
                })

        return {
            "coverage": coverage,
            "operating_hours": hours,
            "policy": policy,
            "services": service_list,
            "available_slots": available_slots,
        }
    finally:
        db.close()


def check_slot_and_pricing_policy(
    service_name: str,
    preferred_time: str,
    discount_requested: bool = False,
    discount_notes: Optional[str] = None
) -> Dict[str, Any]:
    """Deterministic check against PostgreSQL to determine if request is Standard or Pending Approval."""
    db = SessionLocal()
    try:
        # Match service
        matched_service = None
        for s in db.query(Service).filter(Service.is_active == True).all():
            if s.name.lower() in service_name.lower() or service_name.lower() in s.name.lower():
                matched_service = s
                break

        if not matched_service:
            # Fallback to first active
            matched_service = db.query(Service).first()

        price = float(matched_service.price_aed) if matched_service else 200.0

        # Check slot against available weekly slots
        matched_slot = None
        slots = db.query(WeeklySlot).filter(WeeklySlot.is_active == True).all()
        time_lower = preferred_time.lower()

        for slot in slots:
            day_match = slot.day_of_week.lower() in time_lower
            # Check for 10 am or 2 pm
            time_match = ("10" in time_lower and "10" in slot.start_time) or ("2" in time_lower and "02" in slot.start_time) or ("14" in time_lower)
            if day_match and time_match:
                if (slot.capacity - slot.booked_count) > 0:
                    matched_slot = slot
                    break

        is_standard_slot = matched_slot is not None
        requires_approval = (not is_standard_slot) or bool(discount_requested)

        status = "PENDING_APPROVAL" if requires_approval else "CONFIRMED"
        explanation = ""
        if not is_standard_slot and discount_requested:
            explanation = "Your requested appointment time is outside our open slots, and a discount was requested. Both require owner approval and will be submitted as pending."
        elif not is_standard_slot:
            # Check if user requested a slot that exists but is at capacity
            full_slot = None
            for slot in slots:
                day_match = slot.day_of_week.lower() in time_lower
                time_match = ("10" in time_lower and "10" in slot.start_time) or ("2" in time_lower and "02" in slot.start_time) or ("14" in time_lower)
                if day_match and time_match and (slot.capacity - slot.booked_count) <= 0:
                    full_slot = slot
                    break
            if full_slot:
                explanation = f"The standard slot for {full_slot.day_of_week} at {full_slot.start_time} has reached full technician capacity. Booking this time requires owner approval and will be submitted as pending."
            else:
                explanation = "Your requested appointment time is outside our currently open standard slots. This requires owner approval and will be submitted as pending."
        elif discount_requested:
            explanation = "Any discount requires owner approval. Your booking will be submitted with status pending approval."
        else:
            explanation = "This slot is available and will be immediately confirmed upon your approval."

        return {
            "service_id": matched_service.id if matched_service else None,
            "service_name": matched_service.name if matched_service else service_name,
            "quoted_price_aed": price,
            "is_standard_slot": is_standard_slot,
            "slot_id": matched_slot.id if matched_slot else None,
            "status": status,
            "requires_approval": requires_approval,
            "explanation": explanation
        }
    finally:
        db.close()


def save_booking_record(
    customer_name: str,
    customer_phone: str,
    customer_address: str,
    service_name: str,
    preferred_time: str,
    discount_requested: bool = False,
    discount_notes: Optional[str] = None
) -> Dict[str, Any]:
    """Atomically commit booking to PostgreSQL and generate reference number."""
    # Strict validation: Abu Dhabi coverage
    addr_lower = customer_address.lower()
    if "dubai" in addr_lower and "abu dhabi" not in addr_lower:
        return {
            "success": False,
            "error": "We currently only provide services within Abu Dhabi city."
        }

    db = SessionLocal()
    try:
        policy_eval = check_slot_and_pricing_policy(
            service_name=service_name,
            preferred_time=preferred_time,
            discount_requested=discount_requested,
            discount_notes=discount_notes
        )

        ref_no = f"AD-2026-{random.randint(1000, 9999)}"
        new_booking = Booking(
            reference_no=ref_no,
            customer_name=customer_name,
            customer_phone=customer_phone,
            customer_address=customer_address,
            service_id=policy_eval["service_id"],
            slot_id=policy_eval["slot_id"],
            preferred_time_text=preferred_time,
            discount_requested=discount_requested,
            discount_notes=discount_notes,
            quoted_price_aed=policy_eval["quoted_price_aed"],
            final_price_aed=policy_eval["quoted_price_aed"] if policy_eval["status"] == "CONFIRMED" else None,
            status=policy_eval["status"],
            owner_notes=None
        )
        db.add(new_booking)

        # Increment booked count if standard confirmed slot
        if policy_eval["status"] == "CONFIRMED" and policy_eval["slot_id"]:
            slot = db.query(WeeklySlot).filter(WeeklySlot.id == policy_eval["slot_id"]).first()
            if slot:
                slot.booked_count += 1

        db.commit()
        db.refresh(new_booking)

        return {
            "success": True,
            "reference_no": ref_no,
            "status": new_booking.status,
            "service_name": policy_eval["service_name"],
            "price_aed": policy_eval["quoted_price_aed"],
            "preferred_time": preferred_time,
            "requires_approval": policy_eval["requires_approval"],
            "explanation": policy_eval["explanation"]
        }
    except Exception as e:
        db.rollback()
        return {
            "success": False,
            "error": f"Database transaction failed: {str(e)}"
        }
    finally:
        db.close()


def query_existing_booking(reference_no: str) -> Optional[Dict[str, Any]]:
    """Look up existing booking status by reference number."""
    db = SessionLocal()
    try:
        clean_ref = reference_no.strip().upper()
        b = db.query(Booking).filter(Booking.reference_no == clean_ref).first()
        if not b:
            return None
        service_name = b.service.name if b.service else "Maintenance Service"
        return {
            "reference_no": b.reference_no,
            "customer_name": b.customer_name,
            "service": service_name,
            "preferred_time": b.preferred_time_text,
            "status": b.status,
            "quoted_price_aed": float(b.quoted_price_aed) if b.quoted_price_aed else None,
            "final_price_aed": float(b.final_price_aed) if b.final_price_aed else None,
            "owner_notes": b.owner_notes,
            "created_at": b.created_at.strftime("%Y-%m-%d %H:%M") if b.created_at else None
        }
    finally:
        db.close()


class AIAssistantService:
    """Manages multi-turn conversation with Gemini with live context and strict guardrails."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY", "")
        self.client = genai.Client(api_key=self.api_key)
        self.model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")

    def run_turn(self, conversation_history: List[Dict[str, str]], current_message: str) -> Dict[str, Any]:
        """Run a single conversation turn with Gemini, returning response, UI card, buttons, and state."""
        ctx = get_live_business_context()

        # Build dynamic system instruction
        system_instruction = f"""
You are the polite, professional AI booking assistant for a fictional Home Maintenance company in Abu Dhabi.

Current Live Business Information:
- Coverage Area: {ctx['coverage']} (Reject or clarify if customer asks for services in other emirates like Dubai).
- Operating Hours: {ctx['operating_hours']}
- Available Standard Services:
{json.dumps(ctx['services'], indent=2)}
- Active Open Slots (Standard visits):
{json.dumps(ctx['available_slots'], indent=2)}
- Business Policy: {ctx['policy']}

Strict Rules:
1. Always be transparent about what you can and cannot do.
2. If asked general questions, answer accurately using the supplied business information.
3. For booking a visit, you MUST collect ALL 5 of these details:
   (1) Customer full name
   (2) Phone number (e.g. +971 50 ...)
   (3) Address (must be in Abu Dhabi city)
   (4) Requested service (AC Servicing or Plumbing Inspection)
   (5) Preferred appointment slot
4. Non-Repetition: Check conversation history. NEVER ask the customer for information they have already provided!
5. When all 5 details are known, do NOT confirm immediately. You must present a clear Pre-Booking Summary and ask the customer for explicit confirmation:
   - State the details collected.
   - If slot is Tuesday 10 AM or Wednesday 2 PM with no discount requested: explain that it is standard and will be confirmed.
   - If slot is outside these slots OR a discount is asked: explicitly explain that it CANNOT be confirmed right now and requires owner approval (status will be Pending Approval).
6. Never invent technician availability or confirm unauthorized discounts.
7. If the customer confirms the booking, indicate that the booking has been registered.
8. If the customer asks to check an existing booking by reference number (e.g. AD-2026-XXXX), respond with their status.

Provide helpful next step button suggestions where relevant.
"""

        # Prepare messages
        contents = []
        for msg in conversation_history:
            role = "user" if msg.get("role") in ["user", "customer"] else "model"
            contents.append(types.Content(role=role, parts=[types.Part.from_text(text=msg.get("content", ""))]))

        # Add user's current message
        contents.append(types.Content(role="user", parts=[types.Part.from_text(text=current_message)]))

        # Check for reference number lookup directly
        import re
        ref_match = re.search(r"AD-2026-\d{4}", current_message.upper())
        if ref_match and ("status" in current_message.lower() or "check" in current_message.lower()):
            booking_info = query_existing_booking(ref_match.group(0))
            if booking_info:
                status_text = booking_info["status"]
                note = f" Owner note: {booking_info['owner_notes']}" if booking_info.get("owner_notes") else ""
                reply = (
                    f"Here is the status of your booking **{booking_info['reference_no']}**:\n\n"
                    f"• **Customer**: {booking_info['customer_name']}\n"
                    f"• **Service**: {booking_info['service']}\n"
                    f"• **Time**: {booking_info['preferred_time']}\n"
                    f"• **Status**: **{status_text}**\n"
                    f"{note}\n\n"
                    f"Is there anything else I can help you with today?"
                )
                return {
                    "reply": reply,
                    "action_buttons": ["Book Another Visit", "View Services & Prices"],
                    "summary_card": None,
                    "booking_created": None
                }

        try:
            response = self.client.models.generate_content(
                model=self.model,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    temperature=0.2,
                )
            )
            reply_text = response.text or "I am here to help you. Could you please specify your preferred service?"

            # Extract suggested quick action buttons based on reply context
            buttons = []
            if "confirm" in reply_text.lower() and ("summary" in reply_text.lower() or "details" in reply_text.lower() or "booking" in reply_text.lower()):
                buttons = ["Yes, Confirm Booking", "Change Date or Time", "Cancel"]
            elif "service" in reply_text.lower() and not ("phone" in reply_text.lower() or "address" in reply_text.lower()):
                buttons = ["Book AC Servicing (AED 200)", "Book Plumbing Inspection (AED 150)", "Check Available Slots"]
            elif "slot" in reply_text.lower() or "appointment" in reply_text.lower():
                buttons = ["Tuesday at 10:00 AM", "Wednesday at 2:00 PM", "Request Custom Time"]
            else:
                buttons = ["Book a Visit", "Check Available Times", "Check Booking Status"]

            return {
                "reply": reply_text,
                "action_buttons": buttons,
                "summary_card": None,
                "booking_created": None
            }

        except Exception as e:
            return {
                "reply": f"I apologize, I encountered a temporary connection issue: {str(e)[:150]}. Please try sending your message again.",
                "action_buttons": ["Retry", "Start Over"],
                "summary_card": None,
                "booking_created": None
            }
