import sys
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.database import SessionLocal
from backend.app.models import Booking, Service, WeeklySlot

client = TestClient(app)


def run_tests():
    print("=== Testing FastAPI Endpoints ===")

    # 1. Health check
    res = client.get("/api/health")
    assert res.status_code == 200, f"Health check failed: {res.text}"
    print("✓ GET /api/health passed")

    # 2. Public Info
    res = client.get("/api/public/info")
    assert res.status_code == 200, f"Public info failed: {res.text}"
    data = res.json()
    assert "company_name" in data
    assert "operating_hours" in data
    assert "services" in data
    assert "available_slots" in data
    assert len(data["services"]) > 0
    print(f"✓ GET /api/public/info passed (Services: {len(data['services'])}, Slots: {len(data['available_slots'])})")

    # 3. Admin Login (Failed attempt)
    res = client.post("/api/admin/login", json={"username": "admin@fajrmaintenance.ae", "password": "WrongPassword"})
    assert res.status_code == 401, f"Expected 401 for bad login, got: {res.status_code}"
    print("✓ POST /api/admin/login rejection of invalid password passed")

    # 4. Admin Login (Successful)
    res = client.post("/api/admin/login", json={"username": "admin@fajrmaintenance.ae", "password": "Admin123!"})
    assert res.status_code == 200, f"Admin login failed: {res.text}"
    token_data = res.json()
    assert "access_token" in token_data
    token = token_data["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    print("✓ POST /api/admin/login successful, JWT token acquired")

    # 5. GET /api/admin/me
    res = client.get("/api/admin/me", headers=headers)
    assert res.status_code == 200, f"Admin me failed: {res.text}"
    me_data = res.json()
    assert me_data["username"] == "admin@fajrmaintenance.ae"
    print(f"✓ GET /api/admin/me passed (user: {me_data['username']})")

    # 6. GET /api/admin/services & PATCH /api/admin/services/{id}
    res = client.get("/api/admin/services", headers=headers)
    assert res.status_code == 200
    services = res.json()
    assert len(services) > 0
    first_service_id = services[0]["id"]
    old_price = services[0]["price_aed"]

    res = client.patch(f"/api/admin/services/{first_service_id}", json={"price_aed": 220.00}, headers=headers)
    assert res.status_code == 200
    assert float(res.json()["price_aed"]) == 220.00

    # restore price
    client.patch(f"/api/admin/services/{first_service_id}", json={"price_aed": old_price}, headers=headers)
    print("✓ GET & PATCH /api/admin/services passed")

    # 7. GET /api/admin/schedule & POST /api/admin/schedule & PATCH /api/admin/schedule/{id}
    res = client.get("/api/admin/schedule", headers=headers)
    assert res.status_code == 200
    schedule = res.json()

    # Create new slot
    new_slot_payload = {
        "day_of_week": "Thursday",
        "start_time": "09:00 AM",
        "end_time": "11:00 AM",
        "capacity": 2,
        "is_active": True
    }
    res = client.post("/api/admin/schedule", json=new_slot_payload, headers=headers)
    assert res.status_code == 201
    created_slot = res.json()
    slot_id = created_slot["id"]
    assert created_slot["day_of_week"] == "Thursday"
    assert created_slot["capacity"] == 2

    # Update slot
    res = client.patch(f"/api/admin/schedule/{slot_id}", json={"capacity": 3, "booked_count": 1}, headers=headers)
    assert res.status_code == 200
    assert res.json()["capacity"] == 3
    assert res.json()["booked_count"] == 1
    print("✓ GET, POST, & PATCH /api/admin/schedule passed")

    # 8. GET & PATCH /api/admin/settings
    res = client.get("/api/admin/settings", headers=headers)
    assert res.status_code == 200
    settings = res.json()
    assert "operating_hours" in settings

    res = client.patch("/api/admin/settings", json={"company_name": "Al Fajr Home Maintenance LLC"}, headers=headers)
    assert res.status_code == 200
    assert res.json()["company_name"] == "Al Fajr Home Maintenance LLC"
    print("✓ GET & PATCH /api/admin/settings passed")

    # 9. Bookings test
    # Insert a test booking directly in DB to test approve/reject and public status
    db = SessionLocal()
    try:
        test_ref = "TEST-REF-999"
        existing_booking = db.query(Booking).filter(Booking.reference_no == test_ref).first()
        if existing_booking:
            db.delete(existing_booking)
            db.commit()

        service = db.query(Service).first()
        test_booking = Booking(
            reference_no=test_ref,
            customer_name="Salem Al Nuaimi",
            customer_phone="+971501234567",
            customer_address="Al Khalidiya, Abu Dhabi, Villa 12",
            service_id=service.id,
            slot_id=slot_id,
            preferred_time_text="Thursday morning",
            discount_requested=True,
            discount_notes="Requesting neighbor discount",
            quoted_price_aed=service.price_aed,
            status="pending"
        )
        db.add(test_booking)
        db.commit()
        db.refresh(test_booking)
        test_booking_id = test_booking.id
    finally:
        db.close()

    # Public booking status check
    res = client.get(f"/api/public/bookings/status?ref={test_ref}")
    assert res.status_code == 200
    status_data = res.json()
    assert status_data["reference_no"] == test_ref
    assert status_data["status"] == "pending"
    print("✓ GET /api/public/bookings/status passed")

    # Admin list bookings
    res = client.get("/api/admin/bookings?status=pending", headers=headers)
    assert res.status_code == 200
    bookings = res.json()
    assert any(b["reference_no"] == test_ref for b in bookings)
    print("✓ GET /api/admin/bookings passed")

    # Admin approve booking
    res = client.post(
        f"/api/admin/bookings/{test_booking_id}/approve",
        json={"final_price_aed": 180.00, "owner_notes": "Applied 20 AED discount for local resident."},
        headers=headers
    )
    assert res.status_code == 200
    approved_data = res.json()
    assert approved_data["status"] == "approved"
    assert float(approved_data["final_price_aed"]) == 180.00
    assert "Applied 20 AED discount" in approved_data["owner_notes"]
    print("✓ POST /api/admin/bookings/{id}/approve passed")

    # Admin reject booking test
    res = client.post(
        f"/api/admin/bookings/{test_booking_id}/reject",
        json={"owner_notes": "Cancelled as requested."},
        headers=headers
    )
    assert res.status_code == 200
    rejected_data = res.json()
    assert rejected_data["status"] == "rejected"
    assert "Cancelled as requested." in rejected_data["owner_notes"]
    print("✓ POST /api/admin/bookings/{id}/reject passed")

    # Verify public status updated
    res = client.get(f"/api/public/bookings/status?ref={test_ref}")
    assert res.status_code == 200
    assert res.json()["status"] == "rejected"
    print("✓ Public status reflection verified")

    print("\n🎉 ALL TESTS PASSED SUCCESSFULLY!")


if __name__ == "__main__":
    run_tests()
