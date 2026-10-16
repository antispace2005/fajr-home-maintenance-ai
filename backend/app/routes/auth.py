from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

try:
    from backend.app.database import get_db
    from backend.app.models import AdminUser
    from backend.app.schemas import LoginRequest, TokenResponse, AdminProfile
    from backend.app.security import verify_password, create_access_token, get_current_admin
except ImportError:
    from app.database import get_db
    from app.models import AdminUser
    from app.schemas import LoginRequest, TokenResponse, AdminProfile
    from app.security import verify_password, create_access_token, get_current_admin

router = APIRouter(prefix="/api/admin", tags=["Admin Auth"])


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    admin = db.query(AdminUser).filter(AdminUser.username == request.username).first()
    if not admin or not verify_password(request.password, admin.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(data={"sub": admin.username})
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=AdminProfile)
def get_current_admin_profile(current_admin: AdminUser = Depends(get_current_admin)):
    return current_admin
