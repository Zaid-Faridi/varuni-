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
    MAX_LOGIN_ATTEMPTS
)
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
