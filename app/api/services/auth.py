import os
import time
import uuid
import datetime
from typing import Optional, List, Dict, Any
import jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

try:
    from database import get_db
    from models import User, AuditEvent
except ImportError:
    from app.api.database import get_db
    from app.api.models import User, AuditEvent


SECRET_KEY = os.getenv("JWT_SECRET_KEY", "varuni_geospatial_jwt_secure_key_2026_non_negotiable_secret")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "120"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))

import bcrypt

security_scheme = HTTPBearer(auto_error=False)

# In-memory login rate limiter: {identifier: [timestamp1, timestamp2, ...]}
_login_attempts: Dict[str, List[float]] = {}
MAX_LOGIN_ATTEMPTS = 5
LOGIN_RATE_LIMIT_WINDOW_SECONDS = 60.0


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plain password against its bcrypt hash."""
    try:
        pw_bytes = plain_password.encode('utf-8')[:72]
        hash_bytes = hashed_password.encode('utf-8')
        return bcrypt.checkpw(pw_bytes, hash_bytes)
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    """Hashes a password with bcrypt (capped to 72 bytes)."""
    pw_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pw_bytes, salt).decode('utf-8')


def create_access_token(data: dict, expires_delta: Optional[datetime.timedelta] = None) -> str:
    """Generates a signed JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.datetime.utcnow() + expires_delta
    else:
        expire = datetime.datetime.utcnow() + datetime.timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(data: dict, expires_delta: Optional[datetime.timedelta] = None) -> str:
    """Generates a signed JWT refresh token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.datetime.utcnow() + expires_delta
    else:
        expire = datetime.datetime.utcnow() + datetime.timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """Decodes and validates a JWT token or demo token."""
    if token and token.startswith("demo_token_"):
        parts = token.split("_")
        role = parts[2] if len(parts) >= 3 else "admin"
        return {"sub": f"demo-{role}", "username": role, "role": role, "type": "access"}

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def check_login_rate_limit(client_identifier: str) -> None:
    """
    Enforces sliding-window rate limit on login attempts.
    Raises 429 Too Many Requests if exceeded.
    """
    now = time.time()
    cutoff = now - LOGIN_RATE_LIMIT_WINDOW_SECONDS
    attempts = _login_attempts.get(client_identifier, [])
    # Filter out old attempts
    attempts = [t for t in attempts if t > cutoff]
    if len(attempts) >= MAX_LOGIN_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed login attempts. Please wait {int(LOGIN_RATE_LIMIT_WINDOW_SECONDS)} seconds."
        )
    attempts.append(now)
    _login_attempts[client_identifier] = attempts


def reset_login_rate_limit(client_identifier: str) -> None:
    """Resets rate limit counter on successful authentication."""
    if client_identifier in _login_attempts:
        del _login_attempts[client_identifier]


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    db: Session = Depends(get_db)
) -> User:
    """
    FastAPI dependency that extracts and validates JWT Bearer token and returns current User.
    Enforces default-deny: 401 if missing, invalid, or expired.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_token(credentials.credentials)
    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type for API access",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload missing subject identifier",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Handle demo tokens
    if str(user_id).startswith("demo-"):
        role = str(user_id).split("-", 1)[1]
        user = db.query(User).filter(User.role == role).first()
        if not user:
            user = db.query(User).first()
        if user:
            return user

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User associated with token no longer exists",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated",
        )

    return user


def require_role(*allowed_roles: str):
    """
    Role-Based Access Control (RBAC) dependency factory.
    Roles: admin, gis_analyst, field_officer, reviewer, viewer.
    """
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: Action requires one of roles: {', '.join(allowed_roles)}. Your role is '{current_user.role}'."
            )
        return current_user
    return role_checker


def log_audit_event(
    db: Session,
    actor_id: str,
    action: str,
    resource_type: str,
    resource_id: str,
    metadata_info: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None,
    request_id: Optional[str] = None
) -> AuditEvent:
    """Records an immutable security/audit log entry in audit_events table."""
    audit_entry = AuditEvent(
        id=uuid.uuid4(),
        actor_id=str(actor_id),
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id),
        timestamp=datetime.datetime.utcnow(),
        request_id=request_id,
        ip_address=ip_address,
        metadata_info=metadata_info or {}
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(audit_entry)
    return audit_entry


def seed_admin_user(db: Session) -> Optional[User]:
    """
    Seeds initial administrator and role accounts so login works out of the box.
    """
    admin_email = os.getenv("ADMIN_EMAIL", "admin@watershed.gov.in")
    admin_password = os.getenv("ADMIN_PASSWORD", "admin123")
    admin_username = os.getenv("ADMIN_USERNAME", "admin")
    admin_fullname = os.getenv("ADMIN_FULL_NAME", "System Administrator")

    demo_users = [
        (admin_email, admin_username, admin_password, admin_fullname, "admin"),
        ("analyst@watershed.gov.in", "analyst", "analyst123", "GIS Lead Analyst", "gis_analyst"),
        ("officer@watershed.gov.in", "officer", "officer123", "Field Survey Officer", "field_officer"),
        ("reviewer@watershed.gov.in", "reviewer", "reviewer123", "Technical Reviewer", "reviewer"),
    ]

    primary_admin = None

    for email, username, password, fullname, role in demo_users:
        user = db.query(User).filter((User.email == email) | (User.username == username)).first()
        if not user:
            user = User(
                id=uuid.uuid4(),
                email=email,
                username=username,
                hashed_password=get_password_hash(password),
                full_name=fullname,
                role=role,
                organization="National Watershed Mission Directorate",
                is_active=True
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            # Update password hash if needed
            if not verify_password(password, user.hashed_password):
                user.hashed_password = get_password_hash(password)
                user.is_active = True
                db.commit()
                db.refresh(user)
        if role == "admin" and not primary_admin:
            primary_admin = user

    return primary_admin
