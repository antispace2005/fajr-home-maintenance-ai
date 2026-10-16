import bcrypt
from backend.app.database import engine, Base, SessionLocal
from backend.app.models import Service, WeeklySlot, BusinessSetting, AdminUser


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def seed():
    # 1. Create all tables if they do not exist
    print("Creating tables if not exists...")
    Base.metadata.create_all(bind=engine)
    print("Tables created successfully.")

    db = SessionLocal()
    try:
        # 2. Seed Services
        initial_services = [
            {"name": "AC Servicing", "price_aed": 200.00, "description": "Standard AC maintenance and filter cleaning", "is_active": True},
            {"name": "Plumbing Inspection", "price_aed": 150.00, "description": "Comprehensive inspection of pipes, leaks, and drainage", "is_active": True},
        ]
        for s in initial_services:
            existing = db.query(Service).filter(Service.name == s["name"]).first()
            if not existing:
                service = Service(**s)
                db.add(service)
                print(f"Added service: {s['name']}")
            else:
                print(f"Service already exists: {s['name']}")

        # 3. Seed Weekly Slots
        initial_slots = [
            {
                "day_of_week": "Tuesday",
                "start_time": "10:00 AM",
                "end_time": "12:00 PM",
                "capacity": 1,
                "booked_count": 0,
                "is_active": True,
            },
            {
                "day_of_week": "Wednesday",
                "start_time": "02:00 PM",
                "end_time": "04:00 PM",
                "capacity": 1,
                "booked_count": 0,
                "is_active": True,
            },
        ]
        for slot_data in initial_slots:
            existing = db.query(WeeklySlot).filter(
                WeeklySlot.day_of_week == slot_data["day_of_week"],
                WeeklySlot.start_time == slot_data["start_time"]
            ).first()
            if not existing:
                slot = WeeklySlot(**slot_data)
                db.add(slot)
                print(f"Added weekly slot: {slot_data['day_of_week']} {slot_data['start_time']} - {slot_data['end_time']}")
            else:
                print(f"Weekly slot already exists: {slot_data['day_of_week']} {slot_data['start_time']}")

        # 4. Seed Business Settings
        settings_data = {
            "coverage_areas": "Abu Dhabi city only",
            "operating_hours": "Monday to Saturday, 9:00 AM – 6:00 PM",
            "policy_notes": "Discounts and appointments outside standard slots require owner approval",
        }
        for key, value in settings_data.items():
            setting = db.query(BusinessSetting).filter(BusinessSetting.key == key).first()
            if not setting:
                setting = BusinessSetting(key=key, value=value)
                db.add(setting)
                print(f"Added business setting: {key} = {value}")
            else:
                setting.value = value
                print(f"Updated business setting: {key}")

        # 5. Seed Admin User
        admin_username = "admin@fajrmaintenance.ae"
        admin_user = db.query(AdminUser).filter(AdminUser.username == admin_username).first()
        if not admin_user:
            admin_user = AdminUser(
                username=admin_username,
                password_hash=hash_password("Admin123!"),
            )
            db.add(admin_user)
            print(f"Added admin user: {admin_username}")
        else:
            print(f"Admin user already exists: {admin_username}")

        db.commit()
        print("Database seeding completed successfully.")

    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
