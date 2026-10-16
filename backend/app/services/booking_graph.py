import os
import re
import time
import json
from typing import TypedDict, Optional, List, Dict, Any
from pydantic import BaseModel, Field

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
    """Fast regex and keyword extraction to save API calls and ensure zero hallucinations."""
    extracted = {}
    lower = text.lower()

    # 1. Service matching
    if not current_state.get("service_name"):
        if "ac" in lower or "air condition" in lower or "cooling" in lower:
            extracted["service_name"] = "AC Servicing"
        elif "plumb" in lower or "pipe" in lower or "leak" in lower or "drain" in lower:
            extracted["service_name"] = "Plumbing Inspection"

    # 2. Phone number regex
    if not current_state.get("customer_phone"):
        phone_match = re.search(r"(\+?971[\s\-]?[0-9]{1,2}[\s\-]?[0-9]{7}|05[0-9]{8}|[0-9]{10,12})", text)
        if phone_match:
            extracted["customer_phone"] = phone_match.group(0).strip()

    # 3. Discount request detection
    if not current_state.get("discount_requested"):
        discount_words = ["discount", "cheaper", "best price", "special price", "special offer", "reduction", "% off", "coupon", "promo code"]
        if any(w in lower for w in discount_words):
            extracted["discount_requested"] = True
            extracted["discount_notes"] = text

    # 4. Preferred slot detection
    if not current_state.get("preferred_time"):
        # Match standard or common slots
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
                extracted["preferred_time"] = text

    # 5. Address detection (Abu Dhabi areas)
    if not current_state.get("customer_address"):
        ad_keywords = ["abu dhabi", "reem", "khalidiyah", "corniche", "yas", "saadiyat", "muroor", "bateen", "al falah", "shakhbout", "mohamed bin zayed", "mbz"]
        addr_match = re.search(r"(?:address\s*(?:is|:)?|location\s*(?:is|:)?)\s+([^,\.\n]+(?:,\s*[^,\.\n]+)?)", text, re.IGNORECASE)
        if addr_match:
            extracted["customer_address"] = addr_match.group(1).strip()
        elif any(k in lower for k in ad_keywords):
            for part in re.split(r"[,;\n]", text):
                if any(k in part.lower() for k in ad_keywords):
                    clean_part = re.sub(r"^(?:my|the|our|and)\s+", "", part.strip(), flags=re.IGNORECASE)
                    extracted["customer_address"] = clean_part
                    break
        elif "street" in lower or "road" in lower or "villa" in lower or "building" in lower:
            extracted["customer_address"] = text.strip()

    # 6. Customer name heuristic (e.g. "My name is Salem", "I'm Salem", "Name is Salem")
    if not current_state.get("customer_name"):
        name_match = re.search(r"(?:name\s+is|i\s+am|i'm|this\s+is)\s+([A-Za-z]{2,20}(?:\s+[A-Za-z]{2,20})?)", text, re.IGNORECASE)
        if name_match:
            extracted["customer_name"] = name_match.group(1).strip()

    return extracted


def run_gemini_with_retry(prompt: str, system_instruction: str, model_name: str = "gemini-3.5-flash") -> str:
    """Invokes Gemini with rate limit backoff handling."""
    api_key = os.getenv("GEMINI_API_KEY", "")
    client = genai.Client(api_key=api_key)

    models_to_try = [model_name, "gemini-3.5-flash-lite", "gemini-3.8-flash"]

    for model in models_to_try:
        try:
            res = client.models.generate_content(
                model=model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    temperature=0.3
                )
            )
            if res.text:
                return res.text
        except ClientError as e:
            if "429" in str(e):
                time.sleep(2)
                continue
            raise e
        except Exception:
            continue

    return "I am ready to help you with your booking. What service can we provide for you?"


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
    confirm_words = ["yes, confirm", "confirm booking", "yes confirm", "please confirm", "confirm"]
    is_confirm = any(w in user_msg.lower() for w in confirm_words) and state.get("status") == "AWAITING_CONFIRMATION"

    # 3. Fast deterministic pre-extraction
    fast_extracted = deterministic_pre_extract(user_msg, state)
    for k, v in fast_extracted.items():
        if v and not state.get(k):
            state[k] = v

    # 4. Context lookup from PostgreSQL
    ctx = get_live_business_context()

    # 5. Check if all 5 entities are now present
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
                    f"Our technician will visit your location at the scheduled time. We have saved your reference number for easy lookup."
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
    missing = []
    if not state.get("service_name"):
        missing.append("which service you need (AC Servicing or Plumbing Inspection)")
    if not state.get("preferred_time"):
        missing.append("your preferred appointment slot (standard slots: Tuesday at 10 AM or Wednesday at 2 PM)")
    if not state.get("customer_name"):
        missing.append("your full name")
    if not state.get("customer_phone"):
        missing.append("your contact phone number")
    if not state.get("customer_address"):
        missing.append("your address in Abu Dhabi city")

    system_instruction = f"""
You are the AI assistant for a home maintenance company in Abu Dhabi city.
Coverage: {ctx['coverage']}
Operating Hours: {ctx['operating_hours']}
Available services: {', '.join([f"{s['name']} (AED {s['price_aed']})" for s in ctx['services']])}
Available standard slots: Tuesday at 10 AM, Wednesday at 2 PM.
Policy: Out of schedule slots and discounts require owner approval.

Never ask for details already provided. Missing details needed: {', '.join(missing)}.
Respond conversationally, answering questions asked and prompting for the next missing information.
"""

    prompt = f"Customer message: '{user_msg}'\nConversation context: {json.dumps(history[-3:]) if history else 'None'}"
    reply = run_gemini_with_retry(prompt, system_instruction)

    state["reply"] = reply

    buttons = []
    if not state.get("service_name"):
        buttons = ["Book AC Servicing (AED 200)", "Book Plumbing Inspection (AED 150)"]
    elif not state.get("preferred_time"):
        buttons = ["Tuesday at 10:00 AM", "Wednesday at 2:00 PM", "Request Other Time"]
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

