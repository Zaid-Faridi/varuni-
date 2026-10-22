import pytest
from fastapi import HTTPException
from services.auth import (
    get_password_hash,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    check_login_rate_limit,
    reset_login_rate_limit,
    MAX_LOGIN_ATTEMPTS,
    get_jwt_secret_key,
    validate_jwt_secret,
    seed_admin_user,
)
import os
from models import User, AuditEvent
import uuid


def test_password_hashing():
    pwd = "SecureGovPassword2026!"
    hashed = get_password_hash(pwd)
    assert verify_password(pwd, hashed) is True
    assert verify_password("WrongPassword", hashed) is False


def test_jwt_token_generation_and_decoding():
    user_id = str(uuid.uuid4())
    token = create_access_token({"sub": user_id, "username": "test_analyst", "role": "gis_analyst"})
    decoded = decode_token(token)
    assert decoded["sub"] == user_id
    assert decoded["username"] == "test_analyst"
    assert decoded["role"] == "gis_analyst"
    assert decoded["type"] == "access"


def test_refresh_token_generation():
    user_id = str(uuid.uuid4())
    token = create_refresh_token({"sub": user_id, "username": "test_officer"})
    decoded = decode_token(token)
    assert decoded["sub"] == user_id
    assert decoded["type"] == "refresh"


def test_login_rate_limiting():
    ip = f"192.168.1.{uuid.uuid4().hex[:4]}"
    key = f"{ip}:user@test.gov"
    
    reset_login_rate_limit(key)
    
    # Should allow up to MAX_LOGIN_ATTEMPTS
    for _ in range(MAX_LOGIN_ATTEMPTS):
        check_login_rate_limit(key)
        
    # Next attempt should raise 429
    with pytest.raises(HTTPException) as exc_info:
        check_login_rate_limit(key)
    assert exc_info.value.status_code == 429
    
    # Reset
    reset_login_rate_limit(key)


def test_auth_login_endpoints_and_roles(client, db_session):
    # Seed a test user directly in DB
    test_user_id = uuid.uuid4()
    unique_suffix = test_user_id.hex[:6]
    test_email = f"analyst_{unique_suffix}@watershed.test"
    test_username = f"analyst_{unique_suffix}"
    test_user = User(
        id=test_user_id,
        email=test_email,
        username=test_username,
        hashed_password=get_password_hash("SecretPassword123!"),
        full_name="Test GIS Analyst",
        role="gis_analyst",
        is_active=True
    )
    db_session.add(test_user)
    db_session.commit()

    # 1. Successful Login
    login_res = client.post("/api/v1/auth/login", json={
        "username_or_email": test_email,
        "password": "SecretPassword123!"
    })
    assert login_res.status_code == 200
    token_data = login_res.json()
    assert "access_token" in token_data
    assert token_data["user"]["username"] == test_username

    token = token_data["access_token"]

    # 2. Get /me with valid token
    me_res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    assert me_res.json()["email"] == test_email

    # 3. Get /me with NO token -> 401
    me_unauth = client.get("/api/v1/auth/me")
    assert me_unauth.status_code == 401

    # 4. Admin audit logs endpoint with gis_analyst role -> 403 Forbidden
    audit_res = client.get("/api/v1/auth/audit-logs", headers={"Authorization": f"Bearer {token}"})
    assert audit_res.status_code == 403


def test_jwt_secret_key_validation(monkeypatch):
    """Verifies that missing or < 32 char JWT secret keys raise clear errors."""
    # Missing / empty
    monkeypatch.setenv("JWT_SECRET_KEY", "")
    with pytest.raises(RuntimeError) as exc_missing:
        validate_jwt_secret()
    assert "JWT_SECRET_KEY" in str(exc_missing.value)
    assert "32 characters" in str(exc_missing.value)

    # Shorter than 32 characters
    monkeypatch.setenv("JWT_SECRET_KEY", "short_secret_key_123")
    with pytest.raises(RuntimeError) as exc_short:
        validate_jwt_secret()
    assert "32 characters" in str(exc_short.value)

    # Valid secret key (>= 32 chars)
    valid_key = "a_very_secure_and_sufficiently_long_jwt_secret_key_2026"
    monkeypatch.setenv("JWT_SECRET_KEY", valid_key)
    assert validate_jwt_secret() == valid_key


def test_seed_admin_user_demo_mode_off(monkeypatch, db_session):
    """When DEMO_MODE=0, only admin is created and ADMIN_PASSWORD is required (min 12 chars)."""
    monkeypatch.setenv("DEMO_MODE", "0")
    
    # Missing ADMIN_PASSWORD -> raises RuntimeError
    monkeypatch.setenv("ADMIN_PASSWORD", "")
    with pytest.raises(RuntimeError) as exc_missing:
        seed_admin_user(db_session)
    assert "ADMIN_PASSWORD" in str(exc_missing.value)
    assert "12 characters" in str(exc_missing.value)

    # Short ADMIN_PASSWORD (< 12 chars) -> raises RuntimeError
    monkeypatch.setenv("ADMIN_PASSWORD", "shortpass")
    with pytest.raises(RuntimeError) as exc_short:
        seed_admin_user(db_session)
    assert "12 characters" in str(exc_short.value)

    # Valid ADMIN_PASSWORD -> creates ONLY admin
    valid_admin_pass = "ValidAdminSecurePass2026!"
    admin_email = f"admin_{uuid.uuid4().hex[:6]}@watershed.gov.in"
    admin_user = f"admin_{uuid.uuid4().hex[:6]}"
    monkeypatch.setenv("ADMIN_EMAIL", admin_email)
    monkeypatch.setenv("ADMIN_USERNAME", admin_user)
    monkeypatch.setenv("ADMIN_PASSWORD", valid_admin_pass)

    seeded_admin = seed_admin_user(db_session)
    assert seeded_admin is not None
    assert seeded_admin.email == admin_email
    assert verify_password(valid_admin_pass, seeded_admin.hashed_password) is True

    # Ensure analyst/officer/reviewer were NOT created
    assert db_session.query(User).filter(User.username == "analyst").first() is None
    assert db_session.query(User).filter(User.username == "officer").first() is None
    assert db_session.query(User).filter(User.username == "reviewer").first() is None


def test_seed_admin_user_demo_mode_on(monkeypatch, db_session):
    """When DEMO_MODE=1, extra role accounts are created with specified or generated passwords."""
    monkeypatch.setenv("DEMO_MODE", "1")
    monkeypatch.setenv("ADMIN_PASSWORD", "AdminSecureDemoPass2026!")
    monkeypatch.setenv("DEMO_ANALYST_PASSWORD", "CustomAnalystPass2026!")
    monkeypatch.delenv("DEMO_OFFICER_PASSWORD", raising=False)
    monkeypatch.delenv("DEMO_REVIEWER_PASSWORD", raising=False)

    admin_email = f"admin_{uuid.uuid4().hex[:6]}@watershed.gov.in"
    admin_user = f"admin_{uuid.uuid4().hex[:6]}"
    monkeypatch.setenv("ADMIN_EMAIL", admin_email)
    monkeypatch.setenv("ADMIN_USERNAME", admin_user)

    seeded_admin = seed_admin_user(db_session)
    assert seeded_admin is not None

    # Analyst account created with specified env password
    analyst = db_session.query(User).filter(User.username == "analyst").first()
    assert analyst is not None
    assert analyst.role == "gis_analyst"
    assert verify_password("CustomAnalystPass2026!", analyst.hashed_password) is True

    # Officer and Reviewer accounts created with generated random passwords
    officer = db_session.query(User).filter(User.username == "officer").first()
    assert officer is not None
    assert officer.role == "field_officer"
    assert officer.hashed_password is not None

    reviewer = db_session.query(User).filter(User.username == "reviewer").first()
    assert reviewer is not None
    assert reviewer.role == "reviewer"
    assert reviewer.hashed_password is not None
