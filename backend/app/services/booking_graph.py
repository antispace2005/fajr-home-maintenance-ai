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

    # 3. Preferred slot detection
    if not current_state.get("preferred_time"):
        if "tuesday" in lower and ("10" in lower or "morning" in lower):
            extracted["preferred_time"] = "Tuesday at 10:00 AM"
        elif "wednesday" in lower and ("2" in lower or "14" in lower or "afternoon" in lower):
            extracted["preferred_time"] = "Wednesday at 2:00 PM"
        else:
            time_match = re.search(
                r"(monday|tuesday|wednesday|thursday|friday|saturday|sunday)?\s*(at|@)?\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))",
                lower
            )
            if time_match and any(d in lower for d in ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "am", "pm", "at"]):
                extracted["preferred_time"] = text.strip()

    # 4. Multi-part / comma-separated input handling
    parts = [p.strip() for p in re.split(r"[,;\n]", text) if p.strip()]
    if len(parts) >= 2:
        for p in parts:
            p_lower = p.lower()
            # Phone in part
            if re.search(r"(\+?[0-9]{8,15})", p) and not extracted.get("customer_phone") and not current_state.get("customer_phone"):
                extracted["customer_phone"] = re.search(r"(\+?[0-9]{8,15})", p).group(0)
            # Address in part
            elif any(k in p_lower for k in ["abu dhabi", "corniche", "reem", "khalidiyah", "street", "streat", "road", "villa", "bldg", "flat", "apt", "zone"]) and not extracted.get("customer_address") and not current_state.get("customer_address"):
                extracted["customer_address"] = p
            # Name in part (must be letters, not containing keywords)
            elif re.match(r"^[A-Za-z\s]{3,35}$", p) and not extracted.get("customer_name") and not current_state.get("customer_name"):
                if not any(w in p_lower for w in ["ac", "plumbing", "tuesday", "wednesday", "book", "yes", "confirm", "phone", "fakephone", "fakeadress", "service", "inspect"]):
                    extracted["customer_name"] = p

    # 5. Standalone or regex Phone number
    if not extracted.get("customer_phone") and not current_state.get("customer_phone"):
        phone_match = re.search(r"(\+?[0-9]{8,15})", text)
        if phone_match:
            extracted["customer_phone"] = phone_match.group(0).strip()

    # 6. Customer name detection
    if not extracted.get("customer_name") and not current_state.get("customer_name"):
        name_match = re.search(r"(?:name\s+is|i\s+am|i'm|this\s+is)\s+([A-Za-z\s]{2,30})", text, re.IGNORECASE)
        if name_match:
            extracted["customer_name"] = name_match.group(1).strip()
        elif re.match(r"^[A-Za-z\s]{3,30}$", text.strip()):
            # Standalone 1 to 4 words of letters when not a command/service
            words = text.strip().split()
            if 1 <= len(words) <= 4 and not any(w in lower for w in [
                "ac", "plumbing", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
                "book", "service", "inspect", "confirm", "yes", "no", "hello", "hi", "hey",
                "cancel", "status", "check", "fakephone", "help", "view", "available", "times", "prices"
            ]):
                extracted["customer_name"] = text.strip()

    # 7. Customer address detection
    if not extracted.get("customer_address") and not current_state.get("customer_address"):
        addr_match = re.search(r"(?:address\s*(?:is|:)?|location\s*(?:is|:)?)\s+([^,\.\n]+(?:,\s*[^,\.\n]+)?)", text, re.IGNORECASE)
        if addr_match:
            extracted["customer_address"] = addr_match.group(1).strip()
        elif any(k in lower for k in ["abu dhabi", "corniche", "reem", "khalidiyah", "street", "streat", "road", "villa", "bldg", "flat", "apt", "zone", "mussafah"]):
            if not any(w in lower for w in ["what", "how", "when", "who", "why", "can i", "do you", "offer"]):
                # Clean prefix if user typed "address: Corniche Abu Dhabi"
                clean_addr = re.sub(r"^(?:my\s+address\s+is|address\s+is|address\s*:)\s*", "", text.strip(), flags=re.IGNORECASE)
                extracted["customer_address"] = clean_addr

    return extracted


def run_gemini_with_retry(prompt: str, system_instruction: str) -> str:
    """Invokes Gemini with rate limit backoff handling."""
    api_key = os.getenv("GEMINI_API_KEY", "")
    client = genai.Client(api_key=api_key)

    # Prioritize flash-lite for high throughput and speed, followed by flash
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
            # Try next model
            continue
        except Exception:
            continue

    return "We are here to assist you with booking your technician visit in Abu Dhabi city. How can we help?"


def booking_agent_step(state: BookingState) -> BookingState:
    """Single-turn unified node: updates state, validates policy, and generates response."""
    user_msg = state.get("user_message", "").strip()
    history = state.get("conversation_history", [])

    # 1. Check for Reference Number Lookup directly
    ref_match = re.search(r"AD-2026-\d{4}", user_msg.upper())
    if ref_match and any(w in user_msg.lower() for w in ["check", "status", "booking", "my request"]):
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

    # 2. Check for explicit confirmation
    confirm_words = ["yes, confirm", "confirm booking", "yes confirm", "please confirm", "confirm", "yes", "proceed", "sure", "ok", "yep", "approved"]
    is_confirm = any(w in user_msg.lower() for w in confirm_words) and state.get("status") == "AWAITING_CONFIRMATION"

    # 3. Smart deterministic pre-extraction
    fast_extracted = deterministic_pre_extract(user_msg, state)
    for k, v in fast_extracted.items():
        if v and not state.get(k):
            state[k] = v

    # 4. Context lookup from PostgreSQL
    ctx = get_live_business_context()

    # 5. Check if all 5 entities are present
    name = state.get("customer_name")
    phone = state.get("customer_phone")
    address = state.get("customer_address")
    service = state.get("service_name")
    preferred_time = state.get("preferred_time")

    all_entities_ready = bool(name and phone and address and service and preferred_time)

    # 6. If confirmed and all ready -> Save to DB!
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

    # 7. If all 5 entities are ready but NOT yet confirmed -> Evaluate policy and present pre-booking summary!
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

    # 8. Still missing details -> Generate polite AI reply prompting ONLY for missing details
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
        missing_details.append("Preferred appointment slot (Standard: Tuesday at 10 AM or Wednesday at 2 PM)")
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
Available standard slots: Tuesday at 10:00 AM, Wednesday at 02:00 PM.
Policy: Out of schedule slots and discounts require owner approval.

CURRENT KNOWN CUSTOMER DETAILS (DO NOT ASK FOR THESE AGAIN):
{chr(10).join(['- ' + k for k in known_details]) if known_details else '- None yet'}

MISSING DETAILS NEEDED:
{chr(10).join(['- ' + m for m in missing_details])}

CRITICAL RULES:
1. NEVER ask for details that are already known above! For example, if Customer Name is known, DO NOT ask for their name!
2. ONLY ask for the missing details listed above.
3. NEVER say 'your booking is confirmed', 'you are all set', or 'our technician will be there' yourself! You CANNOT confirm bookings. Confirmation only happens after presenting the formal summary card.
4. Keep replies friendly, concise, and helpful.
"""

    prompt = f"Customer message: '{user_msg}'\nConversation context: {json.dumps(history[-3:]) if history else 'None'}"
    reply = run_gemini_with_retry(prompt, system_instruction)

    state["reply"] = reply

    buttons = []
    if not state.get("service_name"):
        buttons = ["Book AC Servicing (AED 200)", "Book Plumbing Inspection (AED 150)"]
    elif not state.get("preferred_time"):
        buttons = ["Tuesday at 10:00 AM", "Wednesday at 2:00 PM", "Request Other Time"]
    elif not state.get("customer_phone"):
        buttons = ["Provide Phone Number"]
    elif not state.get("customer_address"):
        buttons = ["Provide Abu Dhabi Address"]
    else:
        buttons = ["Check Available Times", "View Services & Prices"]

    state["action_buttons"] = buttons
    return state


from langgraph.graph import StateGraph, END

workflow = StateGraph(BookingState)
workflow.add_node("agent_step", booking_agent_step)
workflow.set_entry_point("agent_step")
workflow.add_edge("agent_step", END)
booking_agent_graph = workflow.compile()
