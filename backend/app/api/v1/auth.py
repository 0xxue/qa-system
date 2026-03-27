"""
Authentication Endpoints — Enterprise-grade

POST /auth/login      → Get access + refresh tokens
POST /auth/register   → Create account
POST /auth/refresh    → Refresh expired access token
GET  /auth/me         → Get current user info
PUT  /auth/me         → Update profile
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from app.services.auth import (
    create_tokens, verify_password, hash_password,
    get_current_user, refresh_access_token,
)
from app.services.database import _session_factory
from sqlalchemy import text

router = APIRouter()


# ── Schemas ──

class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    password: str
    email: Optional[str] = None


class RefreshRequest(BaseModel):
    refresh_token: str


class UpdateProfileRequest(BaseModel):
    email: Optional[str] = None
    department: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


# ── Endpoints ──

@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest):
    """Login with username and password. Returns JWT token pair."""
    if not _session_factory:
        raise HTTPException(status_code=503, detail="Database not available")

    async with _session_factory() as session:
        result = await session.execute(
            text("SELECT id, username, password_hash, role FROM users WHERE username = :u"),
            {"u": request.username},
        )
        user = result.mappings().first()

        if not user or not verify_password(request.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid credentials")

        from types import SimpleNamespace
        return create_tokens(SimpleNamespace(id=user["id"], role=user["role"]))


@router.post("/register")
async def register(request: RegisterRequest):
    """Register a new user account. Default role: user."""
    if not _session_factory:
        raise HTTPException(status_code=503, detail="Database not available")

    async with _session_factory() as session:
        result = await session.execute(
            text("SELECT id FROM users WHERE username = :u"),
            {"u": request.username},
        )
        if result.scalar():
            raise HTTPException(status_code=409, detail="Username already exists")

        pw_hash = hash_password(request.password)
        await session.execute(
            text("INSERT INTO users (username, email, password_hash, role) VALUES (:u, :e, :p, 'user')"),
            {"u": request.username, "e": request.email or f"{request.username}@nexus.local", "p": pw_hash},
        )
        await session.commit()

    return {"message": "Account created successfully"}


@router.post("/refresh", response_model=TokenResponse)
async def refresh(request: RefreshRequest):
    """Refresh an expired access token using a valid refresh token."""
    return await refresh_access_token(request.refresh_token)


@router.get("/me")
async def get_me(user=Depends(get_current_user)):
    """Get current user info."""
    return {
        "id": user.id,
        "username": user.username,
        "role": user.role,
    }


@router.put("/me")
async def update_me(request: UpdateProfileRequest, user=Depends(get_current_user)):
    """Update current user profile."""
    if not _session_factory:
        raise HTTPException(status_code=503, detail="Database not available")

    updates = {}
    if request.email is not None:
        updates["email"] = request.email
    if request.department is not None:
        updates["department"] = request.department

    if not updates:
        return {"message": "Nothing to update"}

    async with _session_factory() as session:
        set_clause = ", ".join(f"{k} = :{k}" for k in updates)
        updates["uid"] = int(user.id) if str(user.id).isdigit() else 0
        await session.execute(text(f"UPDATE users SET {set_clause} WHERE id = :uid"), updates)
        await session.commit()

    return {"message": "Profile updated"}


# ── User Settings (per-user config) ──

@router.get("/settings")
async def get_settings_api(user=Depends(get_current_user)):
    """Get current user's settings."""
    if not _session_factory:
        return {}
    async with _session_factory() as session:
        result = await session.execute(
            text("SELECT settings_json FROM user_settings WHERE user_id = :uid"),
            {"uid": int(user.id)},
        )
        row = result.scalar()
        return row if row else {}


@router.put("/settings")
async def save_settings_api(settings: dict, user=Depends(get_current_user)):
    """Save current user's settings (model, language, bot config, etc.)."""
    if not _session_factory:
        raise HTTPException(status_code=503, detail="Database not available")

    import json
    async with _session_factory() as session:
        # Upsert
        result = await session.execute(
            text("SELECT id FROM user_settings WHERE user_id = :uid"),
            {"uid": int(user.id)},
        )
        if result.scalar():
            await session.execute(
                text("UPDATE user_settings SET settings_json = :s, updated_at = NOW() WHERE user_id = :uid"),
                {"s": json.dumps(settings), "uid": int(user.id)},
            )
        else:
            await session.execute(
                text("INSERT INTO user_settings (user_id, settings_json) VALUES (:uid, :s)"),
                {"uid": int(user.id), "s": json.dumps(settings)},
            )
        await session.commit()

    return {"message": "Settings saved"}
