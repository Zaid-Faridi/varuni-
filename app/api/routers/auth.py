import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

try:
    from database import get_db
    from models import User, AuditEvent
    from schemas import (
        UserLoginRequest,
        TokenResponse,
        RefreshTokenRequest,
        UserResponse,
        AuditLogResponse,
    )
    from services.auth import (
        verify_password,
        create_access_token,
        create_refresh_token,
        decode_token,
        get_current_user,
        require_role,
        log_audit_event,
        check_login_rate_limit,
        reset_login_rate_limit,
        ACCESS_TOKEN_EXPIRE_MINUTES,
    )
except ImportError:
    from app.api.database import get_db
    from app.api.models import User, AuditEvent
    from app.api.schemas import (
        UserLoginRequest,
        TokenResponse,
        RefreshTokenRequest,
        UserResponse,
        AuditLogResponse,
    )
    from app.api.services.auth import (
        verify_password,
        create_access_token,
        create_refresh_token,
        decode_token,
        get_current_user,
        require_role,
        log_audit_event,
        check_login_rate_limit,
        reset_login_rate_limit,
        ACCESS_TOKEN_EXPIRE_MINUTES,
    )

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication & Access Control"])


@router.post("/login", response_model=TokenResponse)
def login(
    payload: UserLoginRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Authenticates user credentials against the database with sliding-window rate limiting.
    Issues cryptographically signed JWT access & refresh tokens.
    """
    client_ip = request.client.host if request.client else "unknown"
    rate_limit_key = f"{client_ip}:{payload.username_or_email.lower().strip()}"

    # Check rate limit before executing query
    check_login_rate_limit(rate_limit_key)

    ident = payload.username_or_email.strip()
    user = db.query(User).filter(
        (User.email.ilike(ident)) | (User.username.ilike(ident))
    ).first()

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username/email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account has been deactivated. Contact the system administrator."
        )

    # Successful login: reset rate limit attempts
    reset_login_rate_limit(rate_limit_key)

    access_token = create_access_token(data={"sub": str(user.id), "username": user.username, "role": user.role})
    refresh_token = create_refresh_token(data={"sub": str(user.id), "username": user.username})

    # Log immutable audit event
    log_audit_event(
        db=db,
        actor_id=str(user.id),
        action="auth_login_success",
        resource_type="auth",
        resource_id=str(user.id),
        metadata_info={"username": user.username, "role": user.role},
        ip_address=client_ip
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserResponse.model_validate(user)
    )


@router.post("/refresh", response_model=dict)
def refresh_token_endpoint(
    payload: RefreshTokenRequest,
    db: Session = Depends(get_db)
):
    """Refreshes an expired access token using a valid refresh token."""
    decoded = decode_token(payload.refresh_token)
    if decoded.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type provided for refresh"
        )

    user_id = decoded.get("sub")
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer active or exists"
        )

    new_access_token = create_access_token(data={"sub": str(user.id), "username": user.username, "role": user.role})
    return {
        "access_token": new_access_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60
    }


@router.post("/logout")
def logout(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Terminates session and records audit event."""
    client_ip = request.client.host if request.client else "unknown"
    log_audit_event(
        db=db,
        actor_id=str(current_user.id),
        action="auth_logout",
        resource_type="auth",
        resource_id=str(current_user.id),
        metadata_info={"username": current_user.username},
        ip_address=client_ip
    )
    return {"status": "logged_out", "message": "Session terminated successfully."}


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Returns the authenticated user's profile and active role."""
    return UserResponse.model_validate(current_user)


@router.get("/audit-logs", response_model=List[AuditLogResponse])
def get_audit_logs(
    limit: int = 50,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_role("admin"))
):
    """Returns immutable security audit events (Admin only)."""
    logs = db.query(AuditEvent).order_by(AuditEvent.timestamp.desc()).limit(limit).all()
    return [AuditLogResponse.model_validate(log) for log in logs]
