import pytest
from hypothesis import given, settings, strategies as st
from datetime import datetime, timezone
import json

from shared.auth import (
    generate_access_token, 
    decode_access_token, 
    generate_refresh_token, 
    hash_password, 
    verify_password
)
from shared.logging import mask_pii_phi, PII_PHI_FIELDS
from shared.errors import (
    AppException, 
    ValidationError, 
    UnauthorizedError, 
    ForbiddenError, 
    NotFoundError,
    ConflictError,
    BusinessRuleError
)
from shared.kafka import KafkaProducer, KafkaConsumer


# Feature: pharmora, Property 1: JWT Issuance Correctness
@settings(max_examples=100)
@given(
    sub=st.uuids().map(str),
    role=st.sampled_from(["regional_admin", "pharmacist", "inventory_controller", "finance_manager"]),
    region=st.text(min_size=1, max_size=50),
    outlet_id=st.uuids().map(str)
)
def test_jwt_issuance_correctness(sub, role, region, outlet_id):
    """Verify that generated RS256 JWT access tokens can be decoded correctly and contain all claims."""
    claims = {
        "sub": sub,
        "role": role,
        "region": region,
        "outlet_scope": [outlet_id]
    }
    token = generate_access_token(claims)
    
    # Check JWT structure (three base64url segments)
    assert len(token.split('.')) == 3
    
    # Decode and verify contents
    decoded = decode_access_token(token)
    assert decoded["sub"] == sub
    assert decoded["role"] == role
    assert decoded["region"] == region
    assert decoded["outlet_scope"] == [outlet_id]
    assert "iat" in decoded
    assert "exp" in decoded


def test_jwt_expiry_and_invalid_tokens():
    """Verify decode errors for expired or malformed tokens."""
    # Test short-lived token validation
    claims = {"sub": "test_user", "role": "pharmacist"}
    token = generate_access_token(claims, expires_in_seconds=-10) # Expired 10 seconds ago
    
    with pytest.raises(UnauthorizedError) as exc_info:
        decode_access_token(token)
    assert "expired" in str(exc_info.value).lower()

    # Test malformed token
    with pytest.raises(UnauthorizedError) as exc_info:
        decode_access_token("not.a.validtoken")
    assert "invalid" in str(exc_info.value).lower()


def test_password_hashing():
    """Test bcrypt password hashing and verification."""
    password = "SuperSecretPassword123"
    hashed = hash_password(password)
    
    assert hashed != password
    assert verify_password(password, hashed) is True
    assert verify_password("WrongPassword", hashed) is False


def test_pii_log_masking():
    """Test recursive PII and PHI field masking utility for logs."""
    sensitive_data = {
        "patient_id": "P-987654",
        "doctor_name": "Dr. Alice Cooper",
        "email": "alice@gmail.com",
        "phone": "+919999999999",
        "nested": {
            "prescription_ref": "RX-8827-SEC",
            "password_hash": "$2b$12$K1Jsdw..."
        },
        "non_sensitive_field": "some-public-info",
        "items": [
            {"product_id": "P-12", "quantity": 10},
            {"patient_id": "P-99"} # nested list sensitive field
        ]
    }
    
    masked = mask_pii_phi(sensitive_data)
    
    # Verify sensitive fields are masked
    assert masked["patient_id"].startswith("MASKED_")
    assert masked["doctor_name"].startswith("MASKED_")
    assert masked["email"].startswith("MASKED_")
    assert masked["phone"].startswith("MASKED_")
    assert masked["nested"]["prescription_ref"].startswith("MASKED_")
    assert masked["nested"]["password_hash"].startswith("MASKED_")
    assert masked["items"][1]["patient_id"].startswith("MASKED_")
    
    # Verify non-sensitive fields are left alone
    assert masked["non_sensitive_field"] == "some-public-info"
    assert masked["items"][0]["product_id"] == "P-12"
    assert masked["items"][0]["quantity"] == 10


def test_app_exceptions():
    """Test custom AppException structure and hierarchy."""
    not_found = NotFoundError("Product SKU code not found")
    assert not_found.status_code == 404
    assert not_found.code == "NOT_FOUND"
    assert not_found.message == "Product SKU code not found"

    rule_err = BusinessRuleError("EXPIRED_BATCH", "Batch batch_123 has expired")
    assert rule_err.status_code == 422
    assert rule_err.code == "EXPIRED_BATCH"


def test_kafka_mock_producer_consumer():
    """Verify Kafka wrapper behaves correctly in mock mode."""
    # Force mock mode
    import os
    os.environ["KAFKA_MOCK"] = "true"
    
    producer = KafkaProducer()
    assert producer.use_mock is True
    
    topic = "test-topic"
    key = "test-key"
    value = {"event": "TEST_EVENT", "status": "OK"}
    
    # Send event using mock producer
    producer.send_event(topic, key, value)
    
    # Verify event stored in mock events list
    events = producer.producer.events
    assert len(events) == 1
    assert events[0]["topic"] == topic
    assert events[0]["key"] == key
    assert events[0]["value"] == value

    # Test Consumer Initialization
    consumer = KafkaConsumer(group_id="test-group", topics=[topic])
    assert consumer.use_mock is True
    
    # Consumer start-stop check
    def dummy_handler(topic, key, value):
        pass
        
    consumer.start(dummy_handler)
    assert consumer._running is True
    consumer.stop()
    assert consumer._running is False
