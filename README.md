# Al Fajr Home Maintenance – AI Booking Assistant & Owner Portal

An enterprise-ready, containerized AI assistant and field service management portal built for home maintenance operations in **Abu Dhabi city**.

---

## 🌐 Live Hosted Deployment (Microsoft Azure Serverless)

The application is deployed live in production on **Microsoft Azure Container Apps (UAE North / `uaenorth`)**:

* **Customer Web Assistant (Live URL)**: [https://fajr-maintenance-app.jollycliff-f57bde9d.uaenorth.azurecontainerapps.io/](https://fajr-maintenance-app.jollycliff-f57bde9d.uaenorth.azurecontainerapps.io/)
* **Owner / Admin Portal (Direct URL)**: [https://fajr-maintenance-app.jollycliff-f57bde9d.uaenorth.azurecontainerapps.io/login](https://fajr-maintenance-app.jollycliff-f57bde9d.uaenorth.azurecontainerapps.io/login)
  * **Email**: `admin@fajrmaintenance.ae`
  * **Password**: `Admin123!`
* **API Health Check**: [https://fajr-maintenance-app.jollycliff-f57bde9d.uaenorth.azurecontainerapps.io/api/health](https://fajr-maintenance-app.jollycliff-f57bde9d.uaenorth.azurecontainerapps.io/api/health)
* **GitHub Repository**: [https://github.com/antispace2005/fajr-home-maintenance-ai](https://github.com/antispace2005/fajr-home-maintenance-ai)

---

## 🌟 Key Capabilities & Highlights

1. **Frictionless Customer Experience (`/`)**:
   - Zero-login barrier for customers. The AI assistant conversationally collects their Name, Phone number, and Address in Abu Dhabi city without repetitive questioning.
   - **Dynamic Context**: Welcoming messages, active services, live AED prices, and available technician slots are queried directly from PostgreSQL.
   - **Pre-Booking Summary Card**: Displays an explicit review card with action buttons (`[Yes, Confirm Booking]`, `[Change Time]`, `[Cancel]`) before anything is committed to the database.
   - **Reference Number & Returning Customer Memory**: Confirmed and pending requests generate a unique reference number (e.g. `AD-2026-8941`) stored in the browser. When a returning customer opens the site, the assistant automatically greets them with their booking status!

2. **Deterministic Business Policy (LangChain & LangGraph)**:
   - **Standard Slots (Tuesday 10 AM or Wednesday 2 PM)**: If capacity is available and no discount is requested $\rightarrow$ instant booking with status `CONFIRMED`.
   - **Out-of-Schedule Slots & Discounts**: If the requested time is outside standard slots OR the customer asks for a discount $\rightarrow$ strictly routed to `PENDING_APPROVAL` with clear explanations. The assistant never invents technician availability or promises unauthorized discounts.
   - **Coverage Enforcement**: Strictly limited to Abu Dhabi city; requests in Dubai or other emirates are politely flagged.

3. **Owner Portal & Operations Dashboard (`/login` $\rightarrow$ `/admin`)**:
   - Accessed directly via `/login` with owner credentials (`admin@fajrmaintenance.ae` / `Admin123!`). No visible admin buttons on the customer view.
   - **Tab 1: Approvals & Bookings Queue**: Live list of incoming visits. The owner can one-click **[Approve Visit]** (with final price & owner note) or **[Decline]** with a reason.
   - **Tab 2: Weekly Technician Roster & Capacity Grid**: Visual grid (Monday to Saturday, 9 AM – 6 PM) where the owner can adjust technician capacity (`+` / `-`), toggle slots on/off, or add new slot windows.
   - **Tab 3: Services & Pricing Catalog**: Live price editing for AC Servicing, Plumbing Inspection, and company policies.

---

## 🏗️ Architecture & Tech Stack

```
┌─────────────────────────────────────────────────────────────┐
│                      Client Layer (React)                   │
│                                                             │
│  • Customer AI Chat (/)   • Admin Login (/login)            │
│  • Action Chips & Cards   • Admin Dashboard (/admin)        │
└──────────────────────────────┬──────────────────────────────┘
                               │ REST / JSON (JWT Auth)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 FastAPI Application Server                  │
│                                                             │
│  ┌───────────────────────────┐  ┌────────────────────────┐  │
│  │   REST API Controllers    │  │  LangGraph AI Engine   │  │
│  │ • /api/admin/* (Auth/CRUD)│  │ • Gemini 3.5 Flash     │  │
│  │ • /api/public/* (Info/Ref)│  │ • Dynamic DB Context   │  │
│  │ • /api/chat/message       │  │ • Deterministic Policy │  │
│  └─────────────┬─────────────┘  └───────────┬────────────┘  │
└────────────────┼────────────────────────────┼───────────────┘
                 │                            │
                 ▼                            ▼
┌─────────────────────────────────────────────────────────────┐
│                 PostgreSQL 16 Database                      │
│                                                             │
│  • services (AC 200, Plumbing 150, dynamic catalog)         │
│  • weekly_slots (technician capacity & booked tracking)     │
│  • bookings (customer details, quoted/final price, status)  │
│  • business_settings (hours, coverage, policies)            │
│  • admin_users (salted bcrypt authentication)               │
└─────────────────────────────────────────────────────────────┘
```

* **Frontend**: React 18, Vite, Tailwind CSS, Lucide Icons.
* **Backend**: FastAPI (Python 3.12+), Pydantic v2, SQLAlchemy ORM.
* **AI & Orchestration**: LangChain, LangGraph, Google Gemini (`gemini-3.5-flash`).
* **Database**: PostgreSQL 16 (dockerized).
* **Containerization**: Docker & Docker Compose.

---

## 🚀 Quickstart & Setup Guide

### 1. Prerequisites
- Docker & Docker Compose (or Docker standalone)
- Python 3.11+
- Node.js 18+

### 2. Environment Variables
Create a `.env` file in the project root:
```bash
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.5-flash
DATABASE_URL=postgresql://postgres:postgrespassword@localhost:5432/home_maintenance_db
SECRET_KEY=super-secret-fajr-maintenance-key-2026
```

### 3. Running with Docker Compose (Recommended)
```bash
# 1. Start PostgreSQL container
docker compose up -d postgres

# 2. Start Backend & Unified Frontend
docker compose up -d backend
```
The application will be live at: **`http://localhost:8000`**

### 4. Running Locally for Development

**Terminal 1 — Database**:
```bash
./run_postgres.sh
```

**Terminal 2 — Backend**:
```bash
source .venv/bin/activate
uvicorn backend.app.main:app --reload --port 8000
```

**Terminal 3 — Frontend**:
```bash
cd frontend
npm install
npm run dev
```
Open **`http://localhost:5173`** for local hot-reload development.

---

## 🧪 Requirements Testing & Verification Guide

| Requirement | Test Steps | Expected Result |
| :--- | :--- | :--- |
| **1. Standard Booking** | Type: *"I need AC servicing on Wednesday at 2:00 PM. Name is Salem, phone 0501234567, address Corniche Abu Dhabi"* | Summary card appears with AED 200. Upon clicking `[Confirm]`, booking is saved with status **`CONFIRMED`** and a reference number (e.g. `AD-2026-XXXX`). Slot capacity decreases by 1. |
| **2. Custom Time Request** | Type: *"I need plumbing inspection on Thursday at 4 PM. Name is Fatima, phone 0529988776, Al Khalidiyah Abu Dhabi"* | Assistant warns that this time is outside standard slots. Upon confirmation, saved with status **`PENDING_APPROVAL`**. |
| **3. Discount Request** | Type: *"Can I get 15% discount for AC servicing on Wednesday at 2 PM?"* | Assistant states discounts require owner approval. Saved as **`PENDING_APPROVAL`**. |
| **4. Check Existing Booking** | Type: *"What is the status of my booking AD-2026-XXXX?"* | Assistant retrieves live database record and displays current status (`CONFIRMED`, `PENDING_APPROVAL`, or `REJECTED`) and any owner note. |
| **5. Non-Repetition** | Provide Name and Service first: *"I am Ahmed, I need AC servicing"*. Then answer the follow-up. | Assistant remembers Ahmed and AC servicing, and only prompts for Phone, Address, and Preferred Slot. |
| **6. Owner Portal & Actions** | Navigate to `http://localhost:8000/login`. Enter `admin@fajrmaintenance.ae` / `Admin123!`. | Redirects to `/admin`. Owner sees all pending requests, clicks `[Approve Visit]` (setting final price/note) or `[Decline]`. Status updates instantly. |
| **7. Dynamic Roster Adjustment** | In Admin Dashboard $\rightarrow$ Weekly Schedule tab, click `+` on a slot to increase technician capacity, or change AC price to AED 220 in Services tab. | Customer chat instantly reflects the new capacity and new AED 220 price without changing code or restarting servers. |

---

## 💡 Architectural Choices & Trade-offs

1. **Why LangGraph for the Booking Engine?**
   - Pure prompt engineering with standard LLMs often results in hallucinations (e.g. promising 20% discounts or claiming a booking succeeded when it did not).
   - LangGraph provides a deterministic state graph: entity accumulation is tracked in typed state, and policy decisions (Abu Dhabi check, slot availability, discount triggers) are evaluated by Python logic against PostgreSQL.
2. **Data-Driven vs Hardcoding**:
   - Hardcoding pricing and slots in prompts creates technical debt. Making services, weekly technician capacity, and business rules data-driven ensures the owner has full operational control through the UI.
3. **Frictionless Auth with Browser Persistence**:
   - Customers should not be forced through a registration/password form just to book home maintenance. The chat naturally collects contact details, and reference numbers are stored in `localStorage` for seamless returning visits.
4. **Unified Single-Port Deployment**:
   - The React frontend is compiled into `frontend/dist` and served directly by FastAPI static files. This eliminates CORS complexities and enables single-click deployment to hosting platforms like Render or Railway.

---

## 🔒 Limitations & Future Work
- **SMS / WhatsApp Webhooks**: Currently customer notifications rely on the web app and reference lookup. Integration with Twilio / WhatsApp Cloud API would allow automated SMS reminders.
- **Calendar Sync**: Currently stored in the weekly technician capacity roster. Direct integration with Google Calendar or Microsoft Outlook for technician dispatch could be added.
