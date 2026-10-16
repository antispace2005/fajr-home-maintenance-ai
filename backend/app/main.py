from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

try:
    from backend.app.database import engine, Base
    from backend.app.routes.auth import router as auth_router
    from backend.app.routes.admin import router as admin_router
    from backend.app.routes.public import router as public_router
    from backend.app.routes.chat import router as chat_router
except ImportError:
    from app.database import engine, Base
    from app.routes.auth import router as auth_router
    from app.routes.admin import router as admin_router
    from app.routes.public import router as public_router
    from app.routes.chat import router as chat_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure database tables exist on startup
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="Al Fajr Home Maintenance API",
    description="Backend REST API for Fajr Home Maintenance (Abu Dhabi)",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware allowing all origins for local dev / frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(public_router)
app.include_router(chat_router)


@app.get("/api/health", tags=["Health"])
def health_check():
    return {
        "status": "ok",
        "service": "Al Fajr Home Maintenance API",
        "version": "1.0.0",
    }


import os
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

frontend_dist = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
)

if os.path.exists(frontend_dist):
    assets_dir = os.path.join(frontend_dist, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            return {"error": "API route not found"}
        target_file = os.path.join(frontend_dist, full_path)
        if full_path and os.path.isfile(target_file):
            return FileResponse(target_file)
        return FileResponse(os.path.join(frontend_dist, "index.html"))

