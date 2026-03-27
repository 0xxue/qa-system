"""
Auth Service — Enterprise-grade JWT authentication

Features:
- Access token (short-lived, 15min default)
- Refresh token (long-lived, 7 days default)
- Role-based user loading from database
- Optional auth for demo mode
- Password hashing with bcrypt
"""

from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
import bcrypt as _bcrypt
from app.core.config import get_settings

security = HTTPBearer()


def hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode('utf-8'), _bcrypt.gensalt()).decode('utf-8')


def verify_password(password: str, hashed: str) -> bool:
    try:
        return _bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False


def create_tokens(user) -> dict:
    """Create access + refresh token pair."""
    settings = get_settings()
    now = datetime.utcnow()

    access = jwt.encode(
        {
            "sub": str(user.id),
            "role": getattr(user, 'role', 'user'),
            "type": "access",
            "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
            "iat": now,
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    refresh = jwt.encode(
        {
            "sub": str(user.id),
            "type": "refresh",
            "exp": now + timedelta(days=settings.refresh_token_expire_days),
            "iat": now,
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    return {"access_token": access, "refresh_token": refresh, "token_type": "bearer"}


def _decode_token(token: str, expected_type: str = "access") -> dict:
    """Decode and validate a JWT token."""
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        if payload.get("type") != expected_type:
            raise HTTPException(status_code=401, detail=f"Invalid token type, expected {expected_type}")
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def _load_user_from_db(user_id: str):
    """Load user from database. Returns SimpleNamespace with id, role, username."""
    from app.services.database import _session_factory
    from sqlalchemy import text
    from types import SimpleNamespace

    if not _session_factory:
        return SimpleNamespace(id=user_id, role="user", username="unknown")

    try:
        async with _session_factory() as session:
            result = await session.execute(
                text("SELECT id, username, role FROM users WHERE id = :id"),
                {"id": int(user_id) if user_id.isdigit() else 0},
            )
            row = result.mappings().first()
            if row:
                return SimpleNamespace(id=row["id"], role=row["role"], username=row["username"])
    except Exception:
        pass

    return SimpleNamespace(id=user_id, role="user", username="unknown")


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Strict auth — requires valid JWT access token."""
    payload = _decode_token(credentials.credentials, "access")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    return await _load_user_from_db(user_id)


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False)),
):
    """Optional auth — returns demo user if no token. For demo/dev mode."""
    from types import SimpleNamespace

    if not credentials:
        return SimpleNamespace(id="1", role="user", username="demo")

    try:
        payload = _decode_token(credentials.credentials, "access")
        user_id = payload.get("sub", "1")
        return await _load_user_from_db(user_id)
    except Exception:
        return SimpleNamespace(id="1", role="user", username="demo")


async def refresh_access_token(refresh_token: str) -> dict:
    """Validate refresh token and issue new access + refresh pair."""
    payload = _decode_token(refresh_token, "refresh")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user = await _load_user_from_db(user_id)
    return create_tokens(user)
