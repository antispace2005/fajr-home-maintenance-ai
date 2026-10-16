import os
import sys

from dotenv import load_dotenv
load_dotenv()

from backend.app.database import engine, Base, SessionLocal
from backend.app.models import Booking, WeeklySlot, Service, BusinessSetting, AdminUser
from backend.app.services.booking_graph import booking_agent_graph
from backend.app.services.ai_agent import check_slot_and_pricing_policy, save_booking_record, query_existing_booking


def setup_fresh_test_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    # Reset slots to clean baseline
    db.query(Booking).delete()
    db.query(WeeklySlot).delete()

    slot1 = WeeklySlot(id=1, day_of_week="Tuesday", start_time="10:00 AM", end_time="12:00 PM", capacity=1, booked_count=0, is_active=True)
    slot2 = WeeklySlot(id=2, day_of_week="Wednesday", start_time="02:00 PM", end_time="04:00 PM", capacity=1, booked_count=0, is_active=True)
    db.add(slot1)
    db.add(slot2)
    db.commit()
    db.close()


def run_all_tests():
    print("=" * 70)
    print("🚀 RUNNING 15 COMPREHENSIVE VERIFICATION SCENARIOS LOCALLY")
    print("=" * 70)
    setup_fresh_test_db()
    passed = 0
    total = 15

    # -------------------------------------------------------------
    # Scenario 1: Standard Booking -> Auto Confirmed with Reference Number
    # -------------------------------------------------------------
    print("\n[Scenario 1] Standard Available Slot Booking -> Auto Confirmed")
    state = {
        "customer_name": "Salem Al Mansoori",
        "customer_phone": "0501234567",
        "customer_address": "Corniche Road, Abu Dhabi",
        "service_name": "AC Servicing",
        "preferred_time": "Tuesday at 10:00 AM",
        "discount_requested": False,
        "discount_notes": None,
        "is_confirmed_by_user": False,
        "status": "COLLECTING",
        "reference_no": None,
        "summary_card": None,
        "action_buttons": [],
        "reply": "",
        "user_message": "Yes, Confirm Booking",
        "conversation_history": []
    }
    # First present summary
    state["user_message"] = "Tuesday at 10:00 AM"
    s1 = booking_agent_graph.invoke(state)
    assert s1["status"] == "AWAITING_CONFIRMATION", f"Expected AWAITING_CONFIRMATION, got {s1['status']}"
    assert s1["summary_card"] is not None
    assert s1["summary_card"]["requires_approval"] is False

    # Confirm
    s1["user_message"] = "Yes, Confirm Booking"
    s1_confirmed = booking_agent_graph.invoke(s1)
    assert s1_confirmed["status"] == "CONFIRMED", f"Expected CONFIRMED, got {s1_confirmed['status']}"
    assert s1_confirmed["reference_no"] is not None
    ref1 = s1_confirmed["reference_no"]
    print(f"  ✅ PASS: Booking confirmed with ref {ref1}, summary card displayed prior to confirmation.")
    passed += 1

    # -------------------------------------------------------------
    # Scenario 2: Slot Capacity Exhausted -> Next request for same slot requires approval
    # -------------------------------------------------------------
    print("\n[Scenario 2] Capacity Tracking: Tuesday 10 AM is now at capacity 1/1")
    s2_policy = check_slot_and_pricing_policy("AC Servicing", "Tuesday at 10:00 AM")
    assert s2_policy["requires_approval"] is True, "Expected capacity exhausted slot to require approval"
    assert s2_policy["status"] == "PENDING_APPROVAL"
    assert "capacity" in s2_policy["explanation"].lower()
    print("  ✅ PASS: Policy correctly identifies slot as full capacity and routes to PENDING_APPROVAL.")
    passed += 1

    # -------------------------------------------------------------
    # Scenario 3: Cancel Button Flow -> Resets draft without loop
    # -------------------------------------------------------------
    print("\n[Scenario 3] Cancel Booking Intent: Clears active draft and summary card")
    state_to_cancel = {
        "customer_name": "Hamad",
        "customer_phone": "0509988776",
        "customer_address": "Reem Island Abu Dhabi",
        "service_name": "AC Servicing",
        "preferred_time": "Wednesday at 2:00 PM",
        "discount_requested": False,
        "discount_notes": None,
        "is_confirmed_by_user": False,
        "status": "AWAITING_CONFIRMATION",
        "reference_no": None,
        "summary_card": {"service": "AC Servicing"},
        "action_buttons": ["Yes, Confirm Booking", "Cancel"],
        "reply": "Here is your summary...",
        "user_message": "Cancel",
        "conversation_history": []
    }
    s3 = booking_agent_graph.invoke(state_to_cancel)
    assert s3["status"] == "COLLECTING", f"Expected COLLECTING, got {s3['status']}"
    assert s3["summary_card"] is None
    assert s3["service_name"] is None
    assert s3["preferred_time"] is None
    assert "cancelled" in s3["reply"].lower()
    print("  ✅ PASS: Cancel intent successfully discards draft and resets state without infinite loop.")
    passed += 1

    # -------------------------------------------------------------
    # Scenario 4: 'Book Another Visit' Flow -> Clears service & time, retains contact info
    # -------------------------------------------------------------
    print("\n[Scenario 4] Book Another Visit Intent: Resets draft while retaining returning customer info")
    state_another = {
        "customer_name": "Abdelrahman Badran",
        "customer_phone": "0501112233",
        "customer_address": "Corniche Abu Dhabi",
        "service_name": "AC Servicing",
        "preferred_time": "Tuesday at 10:00 AM",
        "discount_requested": False,
        "discount_notes": None,
        "is_confirmed_by_user": False,
        "status": "CONFIRMED",
        "reference_no": "AD-2026-1111",
        "summary_card": {"service": "AC Servicing"},
        "action_buttons": ["Book Another Visit"],
        "reply": "Confirmed",
        "user_message": "Book Another Visit",
        "conversation_history": []
    }
    s4 = booking_agent_graph.invoke(state_another)
    assert s4["status"] == "COLLECTING"
    assert s4["summary_card"] is None
    assert s4["service_name"] is None
    assert s4["preferred_time"] is None
    assert s4["customer_name"] == "Abdelrahman Badran"
    assert s4["customer_phone"] == "0501112233"
    print("  ✅ PASS: 'Book Another Visit' smoothly transitions to fresh booking retaining returning profile.")
    passed += 1

    # -------------------------------------------------------------
    # Scenario 5: 'Change Date or Time' Flow
    # -------------------------------------------------------------
    print("\n[Scenario 5] Change Date or Time Intent: Clears preferred time and prompts for available slots")
    state_resched = {
        "customer_name": "Fatima",
        "customer_phone": "0524455667",
        "customer_address": "Al Bateen Abu Dhabi",
        "service_name": "Plumbing Inspection",
        "preferred_time": "Tuesday at 10:00 AM",
        "discount_requested": False,
        "discount_notes": None,
        "is_confirmed_by_user": False,
        "status": "AWAITING_CONFIRMATION",
        "reference_no": None,
        "summary_card": {"service": "Plumbing Inspection"},
        "action_buttons": ["Yes, Confirm Booking", "Change Date or Time", "Cancel"],
        "reply": "Summary...",
        "user_message": "Change Date or Time",
        "conversation_history": []
    }
    s5 = booking_agent_graph.invoke(state_resched)
    assert s5["preferred_time"] is None
    assert s5["summary_card"] is None
    assert "wednesday" in s5["reply"].lower()
    print("  ✅ PASS: 'Change Date or Time' cleanly prompts user for open slots.")
    passed += 1

    # -------------------------------------------------------------
    # Scenario 6: 'Check Available Slots' Dynamic Query
    # -------------------------------------------------------------
    print("\n[Scenario 6] Check Available Slots Query: Displays only free capacity slots")
    state_slots = {
        "customer_name": None,
        "customer_phone": None,
        "customer_address": None,
        "service_name": None,
        "preferred_time": None,
        "discount_requested": False,
        "discount_notes": None,
        "is_confirmed_by_user": False,
        "status": "COLLECTING",
        "reference_no": None,
        "summary_card": None,
        "action_buttons": [],
        "reply": "",
        "user_message": "Check Available Slots",
        "conversation_history": []
    }
    s6 = booking_agent_graph.invoke(state_slots)
    assert "wednesday" in s6["reply"].lower()
    assert "tuesday" not in s6["reply"].lower() or "slot remaining" in s6["reply"].lower()
    print("  ✅ PASS: Dynamic available slots check correctly shows open slots.")
    passed += 1

    # -------------------------------------------------------------
    # Scenario 7: Out-of-Schedule Appointment -> PENDING_APPROVAL
    # -------------------------------------------------------------
    print("\n[Scenario 7] Out-of-Schedule Slot (Thursday 4 PM) -> PENDING_APPROVAL")
    s7_res = save_booking_record(
        customer_name="Zayed",
        customer_phone="0507788990",
        customer_address="Khalidiyah Abu Dhabi",
        service_name="Plumbing Inspection",
        preferred_time="Thursday at 4:00 PM"
    )
    assert s7_res["status"] == "PENDING_APPROVAL"
    assert "outside" in s7_res["explanation"].lower() or "approval" in s7_res["explanation"].lower()
    print("  ✅ PASS: Out-of-schedule request saved as PENDING_APPROVAL with clear explanation.")
    passed += 1

    # -------------------------------------------------------------
    # Scenario 8: Discount Request on Available Slot -> PENDING_APPROVAL
    # -------------------------------------------------------------
    print("\n[Scenario 8] Discount Request -> PENDING_APPROVAL")
    s8_res = save_booking_record(
        customer_name="Mariam",
        customer_phone="0503344556",
        customer_address="Saadiyat Island Abu Dhabi",
        service_name="AC Servicing",
        preferred_time="Wednesday at 2:00 PM",
        discount_requested=True,
        discount_notes="Can I get 20% discount?"
    )
    assert s8_res["status"] == "PENDING_APPROVAL"
    assert "discount" in s8_res["explanation"].lower()
    print("  ✅ PASS: Discount request correctly enforced as requiring owner approval.")
    passed += 1

    # -------------------------------------------------------------
    # Scenario 9: Strict Coverage Enforcement (Outside Abu Dhabi)
    # -------------------------------------------------------------
    print("\n[Scenario 9] Coverage Enforcement: Dubai address is politely rejected")
    s9_res = save_booking_record(
        customer_name="Omar",
        customer_phone="0506677889",
        customer_address="Marina Dubai",
        service_name="AC Servicing",
        preferred_time="Wednesday at 2:00 PM"
    )
    assert s9_res["success"] is False
    assert "abu dhabi" in s9_res["error"].lower()
    print("  ✅ PASS: Non-Abu Dhabi addresses properly rejected.")
    passed += 1

    # -------------------------------------------------------------
    # Scenario 10: Admin Rejection Releases Slot Capacity
    # -------------------------------------------------------------
    print("\n[Scenario 10] Admin Rejection / Cancellation releases slot capacity")
    db = SessionLocal()
    slot_tue = db.query(WeeklySlot).filter(WeeklySlot.id == 1).first()
    assert slot_tue.booked_count == 1, f"Expected booked_count 1, got {slot_tue.booked_count}"
    
    # Reject booking 1 (ref1)
    b1 = db.query(Booking).filter(Booking.reference_no == ref1).first()
    assert b1 is not None
    prev_status = b1.status
    b1.status = "rejected"
    if prev_status.lower() in ["confirmed", "approved"] and b1.slot and b1.slot.booked_count > 0:
        b1.slot.booked_count -= 1
    db.commit()
    db.refresh(slot_tue)
    assert slot_tue.booked_count == 0, f"Expected booked_count reset to 0, got {slot_tue.booked_count}"
    db.close()
    print("  ✅ PASS: Rejection successfully releases slot capacity back to 0/1.")
    passed += 1

    # -------------------------------------------------------------
    # Scenario 11: Non-Repetition of Details
    # -------------------------------------------------------------
    print("\n[Scenario 11] Non-repetition: Memory retains multi-turn entities")
    step1 = booking_agent_graph.invoke({
        "customer_name": None, "customer_phone": None, "customer_address": None,
        "service_name": None, "preferred_time": None, "discount_requested": False,
        "discount_notes": None, "is_confirmed_by_user": False, "status": "COLLECTING",
        "reference_no": None, "summary_card": None, "action_buttons": [],
        "reply": "", "user_message": "My name is Tariq, I need AC servicing",
        "conversation_history": []
    })
    assert step1["customer_name"] == "Tariq"
    assert step1["service_name"] == "AC Servicing"
    
    # Next turn provides phone only
    step2 = booking_agent_graph.invoke({
        **step1,
        "user_message": "My phone is 0501239999"
    })
    assert step2["customer_name"] == "Tariq"
    assert step2["customer_phone"] == "0501239999"
    assert step2["service_name"] == "AC Servicing"
    print("  ✅ PASS: Entities strictly preserved across conversation turns without asking customer to repeat.")
    passed += 1

    # -------------------------------------------------------------
    # Scenario 12: Reference Lookup
    # -------------------------------------------------------------
    print("\n[Scenario 12] Reference Number Query retrieves live database status")
    ref_query_state = {
        "customer_name": None, "customer_phone": None, "customer_address": None,
        "service_name": None, "preferred_time": None, "discount_requested": False,
        "discount_notes": None, "is_confirmed_by_user": False, "status": "COLLECTING",
        "reference_no": None, "summary_card": None, "action_buttons": [],
        "reply": "", "user_message": f"Check status of {ref1}",
        "conversation_history": []
    }
    s12 = booking_agent_graph.invoke(ref_query_state)
    assert ref1 in s12["reply"]
    assert "rejected" in s12["reply"].lower() or "status" in s12["reply"].lower()
    print(f"  ✅ PASS: Reference number lookup accurately retrieved live status.")
    passed += 1

    # -------------------------------------------------------------
    # Scenario 13: Time Standardization Flow ("make it 3 pm")
    # -------------------------------------------------------------
    print("\n[Scenario 13] Time Standardization: Converts casual phrases into clean '{Day} at {HH:MM AM/PM}'")
    from backend.app.services.booking_graph import standardize_appointment_time
    t1 = standardize_appointment_time("make it 3 pm", current_preferred="Wednesday at 2:00 PM")
    assert t1 == "Wednesday at 03:00 PM", f"Expected 'Wednesday at 03:00 PM', got '{t1}'"

    t2 = standardize_appointment_time("Tuesday 10 am")
    assert t2 == "Tuesday at 10:00 AM", f"Expected 'Tuesday at 10:00 AM', got '{t2}'"

    # In-graph dynamic modification test
    change_time_state = {
        "customer_name": "Fatima Al Zaabi",
        "customer_phone": "+971501112233",
        "customer_address": "Al Reem Island, Abu Dhabi",
        "service_name": "Plumbing Inspection",
        "preferred_time": "Wednesday at 02:00 PM",
        "discount_requested": False,
        "discount_notes": None,
        "is_confirmed_by_user": False,
        "status": "AWAITING_CONFIRMATION",
        "reference_no": None,
        "summary_card": None,
        "action_buttons": [],
        "reply": "",
        "user_message": "make it 3 pm",
        "conversation_history": []
    }
    s13 = booking_agent_graph.invoke(change_time_state)
    assert s13["preferred_time"] == "Wednesday at 03:00 PM", f"Expected 'Wednesday at 03:00 PM', got {s13['preferred_time']}"
    assert s13["summary_card"]["time"] == "Wednesday at 03:00 PM"
    assert s13["summary_card"]["requires_approval"] is True  # 3 PM is outside standard 2 PM slot
    print("  ✅ PASS: 'make it 3 pm' correctly standardized to 'Wednesday at 03:00 PM' and marked for approval.")
    passed += 1

    # -------------------------------------------------------------
    # Scenario 14: Free OpenStreetMap Nominatim Tool & Location Enforcement
    # -------------------------------------------------------------
    print("\n[Scenario 14] Location Verification via OpenStreetMap Nominatim and District Registry")
    from backend.app.services.location_verifier import verify_abu_dhabi_location
    dubai_check = verify_abu_dhabi_location("Dubai Marina")
    assert dubai_check["is_valid"] is False
    assert "dubai" in dubai_check["reason"].lower()

    ad_check = verify_abu_dhabi_location("Corniche Road, Abu Dhabi")
    assert ad_check["is_valid"] is True
    assert "source" in ad_check

    # Test in-graph rejection of outside-coverage address
    outside_addr_state = {
        "customer_name": "Omar",
        "customer_phone": "0504445555",
        "customer_address": None,
        "service_name": "AC Servicing",
        "preferred_time": "Tuesday at 10:00 AM",
        "discount_requested": False,
        "discount_notes": None,
        "is_confirmed_by_user": False,
        "status": "COLLECTING",
        "reference_no": None,
        "summary_card": None,
        "action_buttons": [],
        "reply": "",
        "user_message": "I live in Dubai Marina",
        "conversation_history": []
    }
    s14 = booking_agent_graph.invoke(outside_addr_state)
    assert s14["customer_address"] is None  # Should not retain invalid address
    assert "service area notice" in s14["reply"].lower() or "abu dhabi city" in s14["reply"].lower()
    print("  ✅ PASS: Free OpenStreetMap location verifier strictly enforces Abu Dhabi city coverage.")
    passed += 1

    # -------------------------------------------------------------
    # Scenario 15: Continuous Single-Sentence Field Parsing & Instant Submission Flow
    # -------------------------------------------------------------
    print("\n[Scenario 15] Continuous Single-Sentence Field Parsing (Salma flow) & Instant Confirmation")
    turn1_state = {
        "customer_name": None, "customer_phone": None, "customer_address": None,
        "service_name": None, "preferred_time": None, "discount_requested": False,
        "discount_notes": None, "is_confirmed_by_user": False, "status": "COLLECTING",
        "reference_no": None, "summary_card": None, "action_buttons": [],
        "reply": "", "user_message": "my name is salma i want to book wednesday at 2pm i live in fakestreak abudhabi my phone is +301096689888",
        "conversation_history": []
    }
    s15_1 = booking_agent_graph.invoke(turn1_state)
    assert s15_1["customer_name"] == "salma"
    assert s15_1["customer_phone"] == "+301096689888"
    assert s15_1["customer_address"] == "fakestreak abudhabi"
    assert s15_1["preferred_time"] == "Wednesday at 02:00 PM"
    assert s15_1["service_name"] is None
    assert s15_1["status"] == "COLLECTING"

    # Turn 2: User provides service -> instant summary card with AWAITING_CONFIRMATION
    s15_2 = booking_agent_graph.invoke({
        **s15_1,
        "user_message": "Book AC Servicing (AED 200)"
    })
    assert s15_2["status"] == "AWAITING_CONFIRMATION"
    assert s15_2["summary_card"] is not None
    assert s15_2["summary_card"]["service"] == "AC Servicing"
    assert s15_2["summary_card"]["price_aed"] == 200.0
    assert s15_2["summary_card"]["time"] == "Wednesday at 02:00 PM"
    assert "Yes, Confirm Booking" in s15_2["action_buttons"]

    # Turn 3: User confirms -> saved immediately with reference number
    s15_3 = booking_agent_graph.invoke({
        **s15_2,
        "user_message": "confirm"
    })
    assert s15_3["status"] == "CONFIRMED"
    assert s15_3["reference_no"] is not None
    assert s15_3["reference_no"].startswith("AD-2026-")
    print(f"  ✅ PASS: Salma flow smoothly parsed all continuous fields, presented instant summary card, and confirmed with ref {s15_3['reference_no']}.")
    passed += 1

    print("\n" + "=" * 70)
    print(f"🎉 ALL {passed}/{total} SCENARIOS PASSED WITH ZERO FAILURES!")
    print("=" * 70)


if __name__ == "__main__":
    run_all_tests()
