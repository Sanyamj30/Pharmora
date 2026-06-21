import os
os.environ["KAFKA_MOCK"] = "true"

import pytest
import uuid
import json
from datetime import date, datetime, timedelta
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select

# Import all models to ensure metadata includes them
from shared.database import Base, get_db
from services.inventory_service.app import models as inv_models
from services.sales_service.app import models as sales_models
from services.sales_service.app.main import app
from services.sales_service.app import crud
from shared.auth import generate_access_token

# Test SQLite Engine
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"
test_engine = create_async_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
test_session_factory = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)


@pytest.fixture(autouse=True)
async def setup_db():
    # Create all tables (Inventory + Sales models)
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def override_get_db():
    async with test_session_factory() as session:
        yield session

app.dependency_overrides[get_db] = override_get_db


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def get_test_jwt(role: str) -> str:
    claims = {
        "sub": str(uuid.uuid4()),
        "role": role,
        "outlet_scope": ["1b29be27-80e9-4399-94fd-f1958f8175a8"],
        "region": "south"
    }
    return generate_access_token(claims, expires_in_seconds=3600)


# Helper to seed products and batches
async def seed_inventory(
    db: AsyncSession,
    sku_code: str,
    name: str,
    schedule_class: str = None,
    expiry_days: int = 100,
    qty: int = 100
) -> tuple:
    # 1. Product
    product = inv_models.Product(
        sku_code=sku_code,
        name=name,
        category="Medicine",
        schedule_class=schedule_class,
        unit_of_measure="BOX"
    )
    db.add(product)
    await db.flush()

    # 2. Outlet Stock
    outlet_id = uuid.UUID("1b29be27-80e9-4399-94fd-f1958f8175a8")
    stock = inv_models.StockLevel(
        outlet_id=outlet_id,
        product_id=product.id,
        total_quantity=qty,
        reserved_quantity=0
    )
    db.add(stock)

    # 3. Batch
    batch = inv_models.Batch(
        product_id=product.id,
        outlet_id=outlet_id,
        batch_number=f"BATCH-{sku_code}",
        manufacture_date=date.today() - timedelta(days=10),
        expiry_date=date.today() + timedelta(days=expiry_days),
        quantity=qty,
        status="ACTIVE"
    )
    db.add(batch)
    await db.commit()

    return product.id, batch.id, outlet_id


# ----------------------------------------------------
# Property 14: Expired Batch Sale Rejection
# ----------------------------------------------------
@pytest.mark.asyncio
async def test_expired_batch_sale_rejection(client):
    token = get_test_jwt("pharmacist")
    headers = {"Authorization": f"Bearer {token}"}
    
    async with test_session_factory() as db:
        # Expiry is in past: -5 days
        product_id, batch_id, outlet_id = await seed_inventory(
            db, "SKU-EXPIRED", "Expired Medicine", expiry_days=-5, qty=50
        )

    # Attempt sale of expired batch
    checkout_payload = {
        "outlet_id": str(outlet_id),
        "payment_method": "CASH",
        "subtotal": 100.0,
        "tax_amount": 0.0,
        "discount_amount": 0.0,
        "total_amount": 100.0,
        "line_items": [
            {
                "product_id": str(product_id),
                "batch_id": str(batch_id),
                "quantity": 10,
                "unit_price": 10.0
            }
        ]
    }
    resp = await client.post("/sales/transactions", json=checkout_payload, headers=headers)
    assert resp.status_code == 400
    assert "expired" in resp.json()["error"]["message"].lower()

    # Verify stock is NOT decremented
    async with test_session_factory() as db:
        batch = await db.get(inv_models.Batch, batch_id)
        assert batch.quantity == 50


# ----------------------------------------------------
# Property 17: Regulated Drug Requires Prescription
# ----------------------------------------------------
@pytest.mark.asyncio
async def test_regulated_drug_requires_prescription(client):
    token = get_test_jwt("pharmacist")
    headers = {"Authorization": f"Bearer {token}"}

    async with test_session_factory() as db:
        product_id, batch_id, outlet_id = await seed_inventory(
            db, "SKU-REGULATED", "Schedule H Drug", schedule_class="H"
        )

    # 1. Checkout without prescription reference must fail
    checkout_payload = {
        "outlet_id": str(outlet_id),
        "payment_method": "UPI",
        "subtotal": 50.0,
        "tax_amount": 0.0,
        "discount_amount": 0.0,
        "total_amount": 50.0,
        "line_items": [
            {
                "product_id": str(product_id),
                "batch_id": str(batch_id),
                "quantity": 5,
                "unit_price": 10.0
            }
        ]
    }
    resp1 = await client.post("/sales/transactions", json=checkout_payload, headers=headers)
    assert resp1.status_code == 400
    assert "regulated" in resp1.json()["error"]["message"].lower()


# ----------------------------------------------------
# Property 18 & 19: Closed Prescription Rejection and Invariant
# ----------------------------------------------------
@pytest.mark.asyncio
async def test_prescription_lifecycle_and_invariants(client):
    token = get_test_jwt("pharmacist")
    headers = {"Authorization": f"Bearer {token}"}

    async with test_session_factory() as db:
        product_id, batch_id, outlet_id = await seed_inventory(db, "SKU-H", "Antibiotics", schedule_class="H")

    # 1. Register Prescription
    rx_payload = {
        "prescription_ref": "RX-LIFE-99",
        "patient_id": "PATIENT-XYZ",
        "doctor_name": "Dr. House",
        "doctor_registration": "REG-12345",
        "prescription_date": str(date.today()),
        "items": [
            {
                "product_id": str(product_id),
                "prescribed_quantity": 10
            }
        ]
    }
    rx_resp = await client.post("/sales/prescriptions", json=rx_payload, headers=headers)
    assert rx_resp.status_code == 201
    assert rx_resp.json()["status"] == "OPEN"
    assert rx_resp.json()["patient_id"] == "PATIENT-XYZ" # decrypted successfully

    # 2. Dispense partial quantity (4 units)
    checkout_payload = {
        "outlet_id": str(outlet_id),
        "payment_method": "CARD",
        "subtotal": 40.0,
        "tax_amount": 0.0,
        "discount_amount": 0.0,
        "total_amount": 40.0,
        "line_items": [
            {
                "product_id": str(product_id),
                "batch_id": str(batch_id),
                "quantity": 4,
                "unit_price": 10.0,
                "prescription_ref": "RX-LIFE-99"
            }
        ]
    }
    resp1 = await client.post("/sales/transactions", json=checkout_payload, headers=headers)
    assert resp1.status_code == 201

    # Check Prescription Invariant: status=PARTIAL, remaining_qty=6, dispensed_qty=4
    rx_get = await client.get("/sales/prescriptions/RX-LIFE-99", headers=headers)
    assert rx_get.json()["status"] == "PARTIAL"
    item = rx_get.json()["items"][0]
    assert item["dispensed_quantity"] == 4
    assert item["remaining_quantity"] == 6
    assert item["dispensed_quantity"] + item["remaining_quantity"] == item["prescribed_quantity"]

    # 3. Dispense remaining quantity (6 units)
    checkout_payload["line_items"][0]["quantity"] = 6
    checkout_payload["subtotal"] = 60.0
    checkout_payload["total_amount"] = 60.0
    resp2 = await client.post("/sales/transactions", json=checkout_payload, headers=headers)
    assert resp2.status_code == 201

    # Check Prescription Invariant: status=CLOSED, remaining_qty=0, dispensed_qty=10
    rx_get_closed = await client.get("/sales/prescriptions/RX-LIFE-99", headers=headers)
    assert rx_get_closed.json()["status"] == "CLOSED"
    item_closed = rx_get_closed.json()["items"][0]
    assert item_closed["remaining_quantity"] == 0
    assert item_closed["dispensed_quantity"] == 10

    # 4. Property 18: closed prescription dispensing rejection
    checkout_payload["line_items"][0]["quantity"] = 2
    checkout_payload["subtotal"] = 20.0
    checkout_payload["total_amount"] = 20.0
    resp3 = await client.post("/sales/transactions", json=checkout_payload, headers=headers)
    assert resp3.status_code == 400
    assert "closed" in resp3.json()["error"]["message"].lower()


# ----------------------------------------------------
# Property 21: Invoice Total Arithmetic Invariant
# ----------------------------------------------------
@pytest.mark.asyncio
async def test_invoice_total_arithmetic_invariant(client):
    token = get_test_jwt("pharmacist")
    headers = {"Authorization": f"Bearer {token}"}

    async with test_session_factory() as db:
        product_id, batch_id, outlet_id = await seed_inventory(db, "SKU-MATH", "Math Test")

    # 1. Invalid subtotal (should be 5 * 10 = 50, but we send 45)
    bad_payload = {
        "outlet_id": str(outlet_id),
        "payment_method": "CASH",
        "subtotal": 45.0, # Bad
        "tax_amount": 0.0,
        "discount_amount": 0.0,
        "total_amount": 45.0,
        "line_items": [
            {
                "product_id": str(product_id),
                "batch_id": str(batch_id),
                "quantity": 5,
                "unit_price": 10.0
            }
        ]
    }
    # This fails at schema validation layer -> status_code = 400
    resp1 = await client.post("/sales/transactions", json=bad_payload, headers=headers)
    assert resp1.status_code == 400
    assert "subtotal" in resp1.json()["error"]["message"].lower()

    # 2. Invalid total amount (50 subtotal + 5 tax - 2 discount = 53, but we send 50)
    bad_total = {
        "outlet_id": str(outlet_id),
        "payment_method": "CASH",
        "subtotal": 50.0,
        "tax_amount": 5.0,
        "discount_amount": 2.0,
        "total_amount": 50.0, # Bad (should be 53)
        "line_items": [
            {
                "product_id": str(product_id),
                "batch_id": str(batch_id),
                "quantity": 5,
                "unit_price": 10.0
            }
        ]
    }
    resp2 = await client.post("/sales/transactions", json=bad_total, headers=headers)
    assert resp2.status_code == 400
    assert "total amount" in resp2.json()["error"]["message"].lower()


# ----------------------------------------------------
# Property 22: Failed Transaction Stock Release
# ----------------------------------------------------
@pytest.mark.asyncio
async def test_failed_transaction_stock_release(client):
    token = get_test_jwt("pharmacist")
    headers = {"Authorization": f"Bearer {token}"}

    async with test_session_factory() as db:
        # Seed two items
        pid1, bid1, outlet_id = await seed_inventory(db, "SKU-R1", "Item 1", qty=20)
        pid2, bid2, _ = await seed_inventory(db, "SKU-R2", "Item 2", qty=30)

    # Construct checkout payload where first item is OK but second item tries to over-dispense (fails)
    fail_payload = {
        "outlet_id": str(outlet_id),
        "payment_method": "CASH",
        "subtotal": 550.0, # (5 * 10) + (50 * 10) = 550
        "tax_amount": 0.0,
        "discount_amount": 0.0,
        "total_amount": 550.0,
        "line_items": [
            {
                "product_id": str(pid1),
                "batch_id": str(bid1),
                "quantity": 5,
                "unit_price": 10.0
            },
            {
                "product_id": str(pid2),
                "batch_id": str(bid2),
                "quantity": 50, # Exceeds batch qty (only 30 in stock)
                "unit_price": 10.0
            }
        ]
    }
    resp = await client.post("/sales/transactions", json=fail_payload, headers=headers)
    assert resp.status_code == 400

    # Verify that the entire transaction rolled back and SKU-R1 stock is NOT decremented (is still 20)
    async with test_session_factory() as db:
        b1 = await db.get(inv_models.Batch, bid1)
        assert b1.quantity == 20
        b2 = await db.get(inv_models.Batch, bid2)
        assert b2.quantity == 30


# ----------------------------------------------------
# Property 20: Event/Audit verification
# ----------------------------------------------------
@pytest.mark.asyncio
async def test_sales_completed_kafka_event(client):
    token = get_test_jwt("pharmacist")
    headers = {"Authorization": f"Bearer {token}"}

    async with test_session_factory() as db:
        product_id, batch_id, outlet_id = await seed_inventory(db, "SKU-AUDIT", "Audit Test", qty=10)

    # Enable Mock producer track
    crud.get_producer().producer.events.clear()

    payload = {
        "outlet_id": str(outlet_id),
        "payment_method": "CASH",
        "subtotal": 20.0,
        "tax_amount": 0.0,
        "discount_amount": 0.0,
        "total_amount": 20.0,
        "line_items": [
            {
                "product_id": str(product_id),
                "batch_id": str(batch_id),
                "quantity": 2,
                "unit_price": 10.0
            }
        ]
    }
    resp = await client.post("/sales/transactions", json=payload, headers=headers)
    assert resp.status_code == 201

    # Check mock events
    events = crud.get_producer().producer.events
    assert len(events) == 1
    
    sales_event = events[0]
    assert sales_event["topic"] == "sales.completed"
    assert sales_event["key"] == resp.json()["id"]
    
    val_dict = sales_event["value"]
    assert val_dict["event_type"] == "SALE_COMPLETED"
    assert val_dict["outlet_id"] == str(outlet_id)
    assert val_dict["items"][0]["quantity"] == 2
