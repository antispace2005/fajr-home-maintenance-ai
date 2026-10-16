import os
import re
import time
import json
from typing import TypedDict, Optional, List, Dict, Any

from dotenv import load_dotenv
load_dotenv()

from google import genai
from google.genai import types
from google.genai.errors import ClientError

from backend.app.services.ai_agent import (
    get_live_business_context,
    check_slot_and_pricing_policy,
    save_booking_record,
    query_existing_booking,
)
from backend.app.services.location_verifier import verify_abu_dhabi_location

DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def standardize_appointment_time(
    text: str,
    current_preferred: Optional[str] = None,
    history: Optional[List[Dict[str, str]]] = None
) -> Optional[str]:
    """Standardizes casual appointment requests (e.g. 'make it 3 pm', 'wednesday 2pm') into '{Day} at {HH:MM AM/PM}'."""
    text_clean = text.strip()
    lower = text_clean.lower()

    # 1. Check for day in input
    detected_day = None
    for d in DAYS_OF_WEEK:
        if d.lower() in lower:
            detected_day = d
            break

    # 2. If no day in input, try finding day from current_preferred or history
    if not detected_day:
        if current_preferred:
            for d in DAYS_OF_WEEK:
                if d.lower() in current_preferred.lower():
                    detected_day = d
                    break
        if not detected_day and history:
            for msg in reversed(history):
                content = msg.get("content", "") if isinstance(msg, dict) else str(msg)
                for d in DAYS_OF_WEEK:
                    if d.lower() in content.lower():
                        detected_day = d
                        break
                if detected_day:
                    break

    # Check for explicit time indicators
    has_explicit_time = (
        bool(re.search(r"\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{1,2}\s*(?:o'?clock))\b", lower))
        or any(w in lower for w in ["make it", "change to", "how about", "reschedule to", "prefer", "at "])
        or (detected_day is not None and any(char.isdigit() for char in lower))
    )

    if not has_explicit_time:
        return None

    time_pat = re.search(r"(?:at|@|\b)(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b", lower)
    if time_pat:
        hour = int(time_pat.group(1))
        minute = int(time_pat.group(2)) if time_pat.group(2) else 0
        meridiem = time_pat.group(3)

        if not meridiem:
            if 1 <= hour <= 6:
                meridiem = "pm"
            elif 7 <= hour <= 11:
                meridiem = "am"
            elif hour == 12:
                meridiem = "pm"
            elif 13 <= hour <= 23:
                hour = hour - 12
                meridiem = "pm"

        if meridiem:
            meridiem = meridiem.upper()
            formatted_time = f"{hour:02d}:{minute:02d} {meridiem}"
            if detected_day:
                return f"{detected_day} at {formatted_time}"
            else:
                return f"Wednesday at {formatted_time}"

    return None


class BookingState(TypedDict):
    customer_name: Optional[str]
    customer_phone: Optional[str]
    customer_address: Optional[str]
    service_name: Optional[str]
    preferred_time: Optional[str]
    discount_requested: bool
    discount_notes: Optional[str]
    is_confirmed_by_user: bool
    status: str  # COLLECTING, AWAITING_CONFIRMATION, CONFIRMED, PENDING_APPROVAL, SAVING
    reference_no: Optional[str]
    summary_card: Optional[Dict[str, Any]]
    action_buttons: List[str]
    reply: str
    user_message: str
    conversation_history: List[Dict[str, str]]


def clean_extracted_address(raw: str) -> str:
    """Strips extraneous prefix and trailing phone or time phrases from address."""
    if not raw:
        return ""
    addr = raw.strip()
    # Strip leading prefixes
    addr = re.sub(r"^(?:my\s+address\s+is|address\s+is|address\s*:|i\s+live\s+in|i\s+am\s+in|i\s+am\s+located\s+in)\s*", "", addr, flags=re.IGNORECASE)
    # Strip trailing phone phrases or numbers
    addr = re.split(r"(?:,\s*|\s+)(?:my\s+phone\s*(?:is|:)?|phone\s*(?:is|:)?|mobile\s*(?:is|:)?|contact\s*(?:is|:)?|\+?[0-9]{8,15})", addr, flags=re.IGNORECASE)[0]
    # Strip trailing appointment day/time phrases
    addr = re.split(r"(?:,\s*|\s+)(?:on\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*(?:at\s*)?(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))?", addr, flags=re.IGNORECASE)[0]
    return addr.strip()


def deterministic_pre_extract(text: str, current_state: BookingState) -> Dict[str, Any]:
    """Smart extraction for service, slot, discount, phone, address, and name."""
    extracted = {}
    lower = text.lower().strip()

    # 1. Service matching
    if not current_state.get("service_name"):
        if "ac" in lower or "air condition" in lower or "cooling" in lower:
            extracted["service_name"] = "AC Servicing"
        elif "plumb" in lower or "pipe" in lower or "leak" in lower or "drain" in lower:
            extracted["service_name"] = "Plumbing Inspection"

    # 2. Discount request detection
    if not current_state.get("discount_requested"):
        discount_words = ["discount", "cheaper", "best price", "special price", "special offer", "reduction", "% off", "coupon", "promo code"]
        if any(w in lower for w in discount_words):
            extracted["discount_requested"] = True
            extracted["discount_notes"] = text

    # 3. Preferred slot detection & standardization
    std_time = standardize_appointment_time(
        text,
        current_preferred=current_state.get("preferred_time"),
        history=current_state.get("conversation_history")
    )
    if std_time:
        extracted["preferred_time"] = std_time
    elif not current_state.get("preferred_time"):
        if "tuesday" in lower and ("10" in lower or "morning" in lower):
            extracted["preferred_time"] = "Tuesday at 10:00 AM"
        elif "wednesday" in lower and ("2" in lower or "14" in lower or "afternoon" in lower):
            extracted["preferred_time"] = "Wednesday at 02:00 PM"

    # 4. Multi-part / comma-separated input handling
    parts = [p.strip() for p in re.split(r"[,;\n]", text) if p.strip()]
    if len(parts) >= 2:
        for p in parts:
            p_lower = p.lower()
            # Phone in part
            if re.search(r"(\+?[0-9]{8,15})", p) and not extracted.get("customer_phone") and not current_state.get("customer_phone"):
                extracted["customer_phone"] = re.search(r"(\+?[0-9]{8,15})", p).group(0)
            # Address in part (also catch other emirates so verifier can reject)
            elif any(k in p_lower for k in ["abu dhabi", "abudhabi", "corniche", "reem", "khalidiyah", "street", "streat", "road", "villa", "bldg", "flat", "apt", "zone", "dubai", "sharjah", "ajman"]) and not extracted.get("customer_address") and not current_state.get("customer_address"):
                cleaned = clean_extracted_address(p)
                if cleaned:
                    extracted["customer_address"] = cleaned
            # Name in part (must be letters, not containing keywords)
            elif re.match(r"^[A-Za-z\s]{3,35}$", p) and not extracted.get("customer_name") and not current_state.get("customer_name"):
                if not any(w in p_lower for w in ["ac", "plumbing", "tuesday", "wednesday", "book", "yes", "confirm", "phone", "fakephone", "fakeadress", "service", "inspect"]):
                    clean_name = re.sub(r"^(?:my\s+name\s+is|name\s+is|i\s+am|i'm|this\s+is)\s*", "", p, flags=re.IGNORECASE).strip()
                    extracted["customer_name"] = clean_name

    # 5. Standalone or regex Phone number
    if not extracted.get("customer_phone") and not current_state.get("customer_phone"):
        phone_match = re.search(r"(\+?[0-9]{8,15})", text)
        if phone_match:
            extracted["customer_phone"] = phone_match.group(0).strip()

    # 6. Customer name detection
    if not extracted.get("customer_name") and not current_state.get("customer_name"):
        name_match = re.search(r"(?:name\s+is|i\s+am|i'm|this\s+is)\s+([A-Za-z]{2,25}(?:\s+[A-Za-z]{2,25}){0,2})", text, re.IGNORECASE)
        if name_match:
            extracted["customer_name"] = name_match.group(1).strip()
        elif re.match(r"^[A-Za-z\s]{3,30}$", text.strip()):
            words = text.strip().split()
            if 1 <= len(words) <= 4 and not any(w in lower for w in [
                "ac", "plumbing", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
                "book", "service", "inspect", "confirm", "yes", "no", "hello", "hi", "hey",
                "cancel", "status", "check", "fakephone", "help", "view", "available", "times", "prices",
                "request", "change", "another", "visit", "slot", "make", "dubai", "sharjah"
            ]):
                extracted["customer_name"] = text.strip()

    # 7. Customer address detection
    if not extracted.get("customer_address") and not current_state.get("customer_address"):
        addr_match = re.search(r"(?:address\s*(?:is|:)?|location\s*(?:is|:)?|i live in|i am in|i am located in)\s+([^,\.\n]+(?:,\s*[^,\.\n]+)?)", text, re.IGNORECASE)
        if addr_match:
            cleaned = clean_extracted_address(addr_match.group(1))
            if cleaned:
                extracted["customer_address"] = cleaned
        elif any(k in lower for k in ["abu dhabi", "abudhabi", "corniche", "reem", "khalidiyah", "street", "streat", "road", "villa", "bldg", "flat", "apt", "zone", "mussafah", "dubai", "sharjah", "ajman"]):
            if not any(w in lower for w in ["what", "how", "when", "who", "why", "can i", "do you", "offer"]):
                clean_addr = clean_extracted_address(text)
                if clean_addr:
                    extracted["customer_address"] = clean_addr

    return extracted


def run_gemini_with_retry(prompt: str, system_instruction: str) -> str:
    """Invokes Gemini with rate limit backoff handling."""
    api_key = os.getenv("GEMINI_API_KEY", "")
    client = genai.Client(api_key=api_key)

    models_to_try = ["gemini-3.5-flash-lite", "gemini-3.5-flash"]

    for model in models_to_try:
        try:
            res = client.models.generate_content(
                model=model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    temperature=0.2
                )
            )
            if res.text:
                return res.text
        except ClientError as e:
            if "429" in str(e):
                time.sleep(1.5)
                continue
            continue
        except Exception:
            continue

    return "We are here to assist you with booking your technician visit in Abu Dhabi city. How can we help?"


def booking_agent_step(state: BookingState) -> BookingState:
    """Single-turn unified node: updates state, validates policy, and generates response."""
    user_msg = state.get("user_message", "").strip()
    user_msg_lower = user_msg.lower()
    history = state.get("conversation_history", [])

    # Fetch live business context from database
    ctx = get_live_business_context()
    open_slots = ctx.get("available_slots", [])
    open_slots_summary = [f"{s.get('day_of_week') or s.get('day')} at {s.get('start_time')}" for s in open_slots]
    open_slots_text = ", ".join(open_slots_summary) if open_slots_summary else "None (all standard slots are fully booked; custom slots require owner approval)"

    # 1. Reference Number Lookup
    ref_match = re.search(r"AD-2026-\d{4}", user_msg.upper())
    if ref_match and any(w in user_msg_lower for w in ["check", "status", "booking", "my request"]):
        found = query_existing_booking(ref_match.group(0))
        if found:
            note = f"\n• **Owner Note**: {found['owner_notes']}" if found.get("owner_notes") else ""
            reply = (
                f"📋 **Booking Status for {found['reference_no']}**:\n\n"
                f"• **Customer**: {found['customer_name']}\n"
                f"• **Service**: {found['service']}\n"
                f"• **Scheduled / Requested Time**: {found['preferred_time']}\n"
                f"• **Status**: **{found['status']}**"
                f"{note}\n\n"
                f"How else can we assist you today?"
            )
            state["reply"] = reply
            state["action_buttons"] = ["Book Another Visit", "View Services & Prices"]
            return state

    # 2. Handle Cancel / Abort
    if any(w in user_msg_lower for w in ["cancel", "cancel booking", "stop", "abort", "discard", "nevermind"]):
        state["service_name"] = None
        state["preferred_time"] = None
        state["discount_requested"] = False
        state["discount_notes"] = None
        state["summary_card"] = None
        state["status"] = "COLLECTING"
        state["reply"] = "Your booking request has been cancelled. How else can we assist your home in Abu Dhabi today?"
        state["action_buttons"] = ["Book AC Servicing (AED 200)", "Book Plumbing Inspection (AED 150)", "Check Available Slots"]
        return state

    # 3. Handle "Book Another Visit" / "Start Over"
    if any(w in user_msg_lower for w in ["book another", "book another visit", "new booking", "start over", "another service"]):
        state["service_name"] = None
        state["preferred_time"] = None
        state["discount_requested"] = False
        state["discount_notes"] = None
        state["summary_card"] = None
        state["status"] = "COLLECTING"
        c_name = state.get("customer_name")
        greeting = f"Welcome back{' ' + c_name if c_name else ''}! Which service would you like to book next?"
        state["reply"] = greeting
        state["action_buttons"] = ["Book AC Servicing (AED 200)", "Book Plumbing Inspection (AED 150)", "Check Available Slots"]
        return state

    # 4. Handle "Change Date or Time" / "Reschedule"
    if any(w in user_msg_lower for w in ["change date", "change time", "different time", "other slot", "reschedule", "change date or time"]):
        state["preferred_time"] = None
        state["summary_card"] = None
        state["status"] = "COLLECTING"
        if open_slots_summary:
            state["reply"] = f"Certainly! Our currently open standard slots are: **{' or '.join(open_slots_summary)}**.\n\nWhich slot works best for you?"
            state["action_buttons"] = open_slots_summary + ["Request Other Time"]
        else:
            state["reply"] = "All standard weekly slots are currently filled. You may request any other day/time (Mon–Sat, 9 AM–6 PM) for owner approval. When would you prefer?"
            state["action_buttons"] = ["Request Other Time", "View Services & Prices"]
        return state

    # 5. Handle "Check Available Slots" / "Check Available Times"
    if any(w in user_msg_lower for w in ["check available slots", "check available times", "available slots", "available times", "open slots"]):
        if open_slots:
            slot_bullets = "\n".join([f"• **{s.get('day_of_week') or s.get('day')} at {s.get('start_time')}** ({s.get('remaining_capacity', s.get('capacity', 1) - s.get('booked_count', 0))} tech slot remaining)" for s in open_slots])
            state["reply"] = (
                f"Here are our currently open standard slots in Abu Dhabi city:\n\n{slot_bullets}\n\n"
                f"Any appointment time outside these open slots requires owner approval. Which slot would you prefer?"
            )
            state["action_buttons"] = open_slots_summary + ["Request Other Time"]
        else:
            state["reply"] = (
                "All of our standard weekly slots are currently fully booked! You can still request an appointment for any other time between Monday and Saturday (9 AM – 6 PM), and our business owner will review it for approval."
            )
            state["action_buttons"] = ["Request Other Time", "View Services & Prices"]
        return state

    # 6. Check for explicit confirmation
    confirm_words = ["yes, confirm", "confirm booking", "yes confirm", "please confirm", "confirm", "yes", "proceed", "sure", "ok", "yep", "approved"]
    is_confirm = any(w in user_msg_lower for w in confirm_words) and state.get("status") == "AWAITING_CONFIRMATION"

    # 7. Smart deterministic pre-extraction
    fast_extracted = deterministic_pre_extract(user_msg, state)
    for k, v in fast_extracted.items():
        if v:
            if k == "preferred_time":
                # Allow updating appointment time if user specifies a new time (e.g. 'make it 3 pm')
                state[k] = v
            elif not state.get(k):
                state[k] = v

    # 7b. Address verification via OpenStreetMap Nominatim / District Registry
    if state.get("customer_address"):
        loc_res = verify_abu_dhabi_location(state["customer_address"])
        if not loc_res.get("is_valid"):
            state["customer_address"] = None
            state["status"] = "COLLECTING"
            state["summary_card"] = None
            reason_text = loc_res.get("reason", "The address is outside our Abu Dhabi city coverage.")
            state["reply"] = (
                f"⚠️ **Service Area Notice**: Al Fajr Home Maintenance exclusively provides services within **Abu Dhabi city**.\n\n"
                f"{reason_text}\n\n"
                f"Could you please provide an address located within Abu Dhabi city so we can schedule your technician visit?"
            )
            state["action_buttons"] = ["Provide Abu Dhabi Address", "View Services & Prices"]
            return state

    # 8. Check if all 5 entities are present
    name = state.get("customer_name")
    phone = state.get("customer_phone")
    address = state.get("customer_address")
    service = state.get("service_name")
    preferred_time = state.get("preferred_time")

    all_entities_ready = bool(name and phone and address and service and preferred_time)

    # 9. If confirmed and all ready -> Save to DB!
    if is_confirm and all_entities_ready:
        res = save_booking_record(
            customer_name=name,
            customer_phone=phone,
            customer_address=address,
            service_name=service,
            preferred_time=preferred_time,
            discount_requested=state.get("discount_requested", False),
            discount_notes=state.get("discount_notes")
        )

        if res.get("success"):
            ref = res["reference_no"]
            state["reference_no"] = ref
            state["status"] = res["status"]

            if res["status"] == "CONFIRMED":
                reply = (
                    f"🎉 **Your booking is CONFIRMED!**\n\n"
                    f"• **Reference Number**: `{ref}`\n"
                    f"• **Service**: {res['service_name']} (AED {res['price_aed']:.2f})\n"
                    f"• **Appointment**: {res['preferred_time']}\n"
                    f"• **Address**: {address}\n\n"
                    f"Our certified technician will arrive at your address in Abu Dhabi city at the scheduled time. We have saved your reference number for easy lookup."
                )
            else:
                reply = (
                    f"📋 **Your request has been recorded as PENDING OWNER APPROVAL.**\n\n"
                    f"• **Reference Number**: `{ref}`\n"
                    f"• **Service**: {res['service_name']}\n"
                    f"• **Requested Slot**: {res['preferred_time']}\n"
                    f"• **Note**: {res['explanation']}\n\n"
                    f"⚠️ *Please note this appointment is NOT yet confirmed.* The business owner will review your request shortly. You can check its status anytime with reference `{ref}`."
                )

            state["reply"] = reply
            state["action_buttons"] = ["Book Another Visit", f"Check Status of {ref}"]
            return state
        else:
            state["reply"] = f"⚠️ We encountered an issue while saving your booking: {res.get('error', 'Database error')}. Your booking was NOT confirmed. Would you like to retry?"
            state["action_buttons"] = ["Yes, Confirm Booking", "Cancel"]
            return state

    # 10. If all 5 entities are ready but NOT yet confirmed -> Evaluate policy and present pre-booking summary!
    if all_entities_ready:
        policy = check_slot_and_pricing_policy(
            service_name=service,
            preferred_time=preferred_time,
            discount_requested=state.get("discount_requested", False),
            discount_notes=state.get("discount_notes")
        )

        state["status"] = "AWAITING_CONFIRMATION"
        summary_card = {
            "customer_name": name,
            "customer_phone": phone,
            "customer_address": address,
            "service": policy["service_name"],
            "time": preferred_time,
            "price_aed": policy["quoted_price_aed"],
            "status": policy["status"],
            "requires_approval": policy["requires_approval"],
            "explanation": policy["explanation"]
        }
        state["summary_card"] = summary_card

        policy_note = (
            "✅ This is a standard available slot and will be **immediately confirmed** upon your approval."
            if not policy["requires_approval"]
            else f"⚠️ **Notice**: {policy['explanation']}"
        )

        reply = (
            f"Here is your **Visit Booking Summary**:\n\n"
            f"• **Customer**: {name}\n"
            f"• **Phone**: {phone}\n"
            f"• **Service**: {policy['service_name']} (AED {policy['quoted_price_aed']:.2f})\n"
            f"• **Preferred Appointment**: {preferred_time}\n"
            f"• **Service Address**: {address}\n\n"
            f"{policy_note}\n\n"
            f"Would you like me to proceed with this booking?"
        )
        state["reply"] = reply
        state["action_buttons"] = ["Yes, Confirm Booking", "Change Date or Time", "Cancel"]
        return state

    # 11. Still missing details -> Generate polite AI reply prompting ONLY for missing details
    state["status"] = "COLLECTING"

    known_details = []
    if state.get("service_name"):
        known_details.append(f"Service: {state['service_name']}")
    if state.get("preferred_time"):
        known_details.append(f"Preferred Time: {state['preferred_time']}")
    if state.get("customer_name"):
        known_details.append(f"Customer Name: {state['customer_name']}")
    if state.get("customer_phone"):
        known_details.append(f"Phone Number: {state['customer_phone']}")
    if state.get("customer_address"):
        known_details.append(f"Address in Abu Dhabi: {state['customer_address']}")

    missing_details = []
    if not state.get("service_name"):
        missing_details.append("Service (AC Servicing AED 200 or Plumbing Inspection AED 150)")
    if not state.get("preferred_time"):
        if open_slots_summary:
            missing_details.append(f"Preferred appointment slot (Currently open slots: {open_slots_text})")
        else:
            missing_details.append("Preferred appointment slot (all standard slots full; any day Mon-Sat 9am-6pm for approval)")
    if not state.get("customer_name"):
        missing_details.append("Customer full name")
    if not state.get("customer_phone"):
        missing_details.append("Contact phone number")
    if not state.get("customer_address"):
        missing_details.append("Address in Abu Dhabi city")

    system_instruction = f"""
You are the AI Booking Assistant for Al Fajr Home Maintenance in Abu Dhabi city.
Coverage: {ctx['coverage']}
Operating Hours: {ctx['operating_hours']}
Available services: {', '.join([f"{s['name']} (AED {s['price_aed']})" for s in ctx['services']])}
CURRENTLY OPEN STANDARD SLOTS WITH AVAILABLE CAPACITY: {open_slots_text}
Note: If a slot is not listed above, it is either full or outside standard hours and requires owner approval.

CURRENT KNOWN CUSTOMER DETAILS (DO NOT ASK FOR THESE AGAIN):
{chr(10).join(['- ' + k for k in known_details]) if known_details else '- None yet'}

MISSING DETAILS NEEDED:
{chr(10).join(['- ' + m for m in missing_details])}

CRITICAL RULES:
1. NEVER ask for details that are already known above! For example, if Customer Name is known, DO NOT ask for their name!
2. ONLY ask for the missing details listed above.
3. NEVER say 'your booking is confirmed', 'you are all set', or 'our technician will be there' yourself! You CANNOT confirm bookings. Confirmation only happens after presenting the formal summary card.
4. NEVER generate your own text-based 'Booking Summary' or ask the customer to confirm in your text! The system automatically displays a structured Visit Booking Summary card with confirmation buttons as soon as all details are gathered.
5. If asked about available times, only state the CURRENTLY OPEN slots: {open_slots_text}.
6. Keep replies friendly, concise, and helpful.
"""

    prompt = f"Customer message: '{user_msg}'\nConversation context: {json.dumps(history[-3:]) if history else 'None'}"
    reply = run_gemini_with_retry(prompt, system_instruction)

    if not reply or "how can we help" in reply.lower():
        c_name = state.get("customer_name")
        greeting = f"Hello {c_name}! " if c_name else "Hello! "
        if not state.get("service_name"):
            reply = f"{greeting}We would be delighted to assist you. Which service would you like to schedule: **AC Servicing (AED 200)** or **Plumbing Inspection (AED 150)**?"
        elif not state.get("preferred_time"):
            reply = f"{greeting}Our currently open standard slots are: **{open_slots_text}**. Which time works best for you?"
        elif not state.get("customer_address"):
            reply = f"{greeting}Could you please provide your street address located within Abu Dhabi city?"
        elif not state.get("customer_phone"):
            reply = f"{greeting}Could you please provide your contact phone number to finalize your booking?"
        else:
            reply = f"{greeting}Could you please provide: {', '.join(missing_details)}?"

    state["reply"] = reply

    buttons = []
    if not state.get("service_name"):
        buttons = ["Book AC Servicing (AED 200)", "Book Plumbing Inspection (AED 150)"]
    elif not state.get("preferred_time"):
        if open_slots_summary:
            buttons = open_slots_summary + ["Request Other Time"]
        else:
            buttons = ["Request Other Time", "Check Available Slots"]
    elif not state.get("customer_phone"):
        buttons = ["Provide Phone Number"]
    elif not state.get("customer_address"):
        buttons = ["Provide Abu Dhabi Address"]
    else:
        buttons = ["Check Available Slots", "View Services & Prices"]

    state["action_buttons"] = buttons
    return state


from langgraph.graph import StateGraph, END

workflow = StateGraph(BookingState)
workflow.add_node("agent_step", booking_agent_step)
workflow.set_entry_point("agent_step")
workflow.add_edge("agent_step", END)
booking_agent_graph = workflow.compile()
