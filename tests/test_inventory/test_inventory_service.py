import os
# Force Mock modes for testing
os.environ["KAFKA_MOCK"] = "true"

import pytest
import pytest_asyncio
import asyncio
import uuid
from datetime import datetime, timezone, date, timedelta
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select

from services.inventory_service.app.main import app
from services.inventory_service.app import models, schemas, crud, config
from shared.database import Base, get_db
from shared.auth import generate_access_token, decode_access_token

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


# Override FastAPI get_db dependency
async def override_get_db():
    async with test_session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        else:
            await session.commit()
        finally:
            await session.close()


app.dependency_overrides[get_db] = override_get_db


@pytest_asyncio.fixture(scope="function", autouse=True)
async def setup_test_db():
    """Create all tables in the SQLite test database and seed mock data before each test."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    # Clear produced Kafka events before each test
    producer = crud.get_producer()
    if hasattr(producer, "producer") and hasattr(producer.producer, "events"):
        producer.producer.events.clear()
        
    yield
    
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


def get_test_jwt(role: str, user_id: str = None) -> str:
    user_id = user_id or str(uuid.uuid4())
    claims = {
        "sub": user_id,
        "role": role,
        "region": "South Region",
        "outlet_scope": ["*"]
    }
    return generate_access_token(claims, expires_in_seconds=3600)


# ----------------------------------------------------
# Inventory Service Tests
# ----------------------------------------------------

@pytest.mark.asyncio
async def test_product_catalog_creation(client):
    """Verify products can be registered in the catalog."""
    token = get_test_jwt("regional_admin")
    headers = {"Authorization": f"Bearer {token}"}
    
    payload = {
        "sku_code": "SKU-PARACETAMOL-500",
        "name": "Paracetamol 500mg",
        "category": "Analgesics",
        "schedule_class": "H",
        "unit_of_measure": "TABLET",
        "reorder_point": 100,
        "lead_time_days": 5
    }
    
    response = await client.post("/inventory/products", json=payload, headers=headers)
    assert response.status_code == 201
    val = response.json()
    assert val["sku_code"] == "SKU-PARACETAMOL-500"
    assert val["name"] == "Paracetamol 500mg"


@pytest.mark.asyncio
async def test_stock_conservation_invariant_and_auditing(client):
    """Property 8 & 10: Final quantity must equal sum of adjustments, and audits are recorded."""
    token = get_test_jwt("inventory_controller")
    headers = {"Authorization": f"Bearer {token}"}
    outlet_id = str(uuid.uuid4())
    
    # 1. Create product
    prod_resp = await client.post("/inventory/products", json={
        "sku_code": "SKU-CONSERVE",
        "name": "Conserve Test",
        "category": "Test",
        "unit_of_measure": "BOX",
        "reorder_point": 10
    }, headers=headers)
    product_id = prod_resp.json()["id"]
    
    # 2. Add first receipt
    receipt1 = {
        "sku_code": "SKU-CONSERVE",
        "batch_number": "BATCH-01",
        "manufacture_date": str(date.today() - timedelta(days=10)),
        "expiry_date": str(date.today() + timedelta(days=200)),
        "quantity": 50
    }
    resp1 = await client.post(f"/inventory/{outlet_id}/receipts", json=receipt1, headers=headers)
    assert resp1.status_code == 201
    batch_id = resp1.json()["batch"]["id"]
    
    # 3. Add second receipt to same batch
    receipt2 = {
        "sku_code": "SKU-CONSERVE",
        "batch_number": "BATCH-01",
        "manufacture_date": str(date.today() - timedelta(days=10)),
        "expiry_date": str(date.today() + timedelta(days=200)),
        "quantity": 30
    }
    resp2 = await client.post(f"/inventory/{outlet_id}/receipts", json=receipt2, headers=headers)
    assert resp2.status_code == 201
    assert resp2.json()["new_total_quantity"] == 80
    
    # 4. Perform negative adjustment (Property 10 audit details check)
    adj_payload = {
        "product_id": product_id,
        "batch_id": batch_id,
        "quantity_delta": -25,
        "reason": "DAMAGED"
    }
    resp3 = await client.post(f"/inventory/{outlet_id}/adjustments", json=adj_payload, headers=headers)
    assert resp3.status_code == 201
    assert resp3.json()["new_total_quantity"] == 55
    assert resp3.json()["new_batch_quantity"] == 55
    
    # 5. Check audit records exist in DB (Property 10)
    async with test_session_factory() as db:
        stmt = select(models.StockAdjustment).where(models.StockAdjustment.product_id == uuid.UUID(product_id))
        result = await db.execute(stmt)
        audits = result.scalars().all()
        assert len(audits) == 3 # 2 receipts + 1 damage adjustment
        
        # Verify the damage audit details
        damage_audit = next(a for a in audits if a.quantity_delta == -25)
        assert damage_audit.reason == "DAMAGED"
        assert damage_audit.performed_by == uuid.UUID(decode_access_token(token)["sub"])
        
    # 6. Attempt negative adjustment below 0 total (Property 8)
    invalid_adj = {
        "product_id": product_id,
        "batch_id": batch_id,
        "quantity_delta": -60,
        "reason": "THEFT"
    }
    resp4 = await client.post(f"/inventory/{outlet_id}/adjustments", json=invalid_adj, headers=headers)
    assert resp4.status_code == 400
    assert "insufficient stock" in resp4.json()["error"]["message"].lower()


@pytest.mark.asyncio
async def test_low_stock_event_emission(client):
    """Property 9: Emit low-stock alerts when stock drops below reorder point."""
    token = get_test_jwt("inventory_controller")
    headers = {"Authorization": f"Bearer {token}"}
    outlet_id = str(uuid.uuid4())
    
    # 1. Create product with reorder point = 20
    prod_resp = await client.post("/inventory/products", json={
        "sku_code": "SKU-ALERT",
        "name": "Alert Test",
        "category": "Test",
        "unit_of_measure": "BOX",
        "reorder_point": 20
    }, headers=headers)
    product_id = prod_resp.json()["id"]
    
    # 2. Receipt 25 units (above reorder point)
    await client.post(f"/inventory/{outlet_id}/receipts", json={
        "sku_code": "SKU-ALERT",
        "batch_number": "BATCH-A",
        "manufacture_date": str(date.today() - timedelta(days=5)),
        "expiry_date": str(date.today() + timedelta(days=100)),
        "quantity": 25
    }, headers=headers)
    
    # Check that no low-stock alerts have been emitted yet
    producer = crud.get_producer()
    low_stock_events = [e for e in producer.producer.events if e["topic"] == "inventory.low_stock"]
    assert len(low_stock_events) == 0
    
    # 3. Query stock levels and get batch ID
    stock_resp = await client.get(f"/inventory/{outlet_id}/stock", headers=headers)
    stock_level = stock_resp.json()[0]
    
    batch_resp = await client.get(f"/inventory/{outlet_id}/batches/{product_id}", headers=headers)
    batch_id = batch_resp.json()[0]["id"]
    
    # 4. Adjust by -10 units (bringing total to 15, below reorder point 20)
    await client.post(f"/inventory/{outlet_id}/adjustments", json={
        "product_id": product_id,
        "batch_id": batch_id,
        "quantity_delta": -10,
        "reason": "AUDIT_CORRECTION"
    }, headers=headers)
    
    # 5. Check Kafka event emission
    low_stock_events = [e for e in producer.producer.events if e["topic"] == "inventory.low_stock"]
    assert len(low_stock_events) == 1
    event_val = low_stock_events[0]["value"]
    assert event_val["event_type"] == "LOW_STOCK"
    assert event_val["outlet_id"] == outlet_id
    assert event_val["product_id"] == product_id
    assert event_val["current_quantity"] == 15
    assert event_val["reorder_point"] == 20


@pytest.mark.asyncio
async def test_batch_fields_completeness_and_date_rules(client):
    """Property 11: Batch fields completeness and expiry > manufacture validation."""
    token = get_test_jwt("inventory_controller")
    headers = {"Authorization": f"Bearer {token}"}
    outlet_id = str(uuid.uuid4())
    
    # 1. Expiry same as manufacture
    receipt_same_date = {
        "sku_code": "SKU-ALERT",
        "batch_number": "BATCH-1",
        "manufacture_date": str(date.today()),
        "expiry_date": str(date.today()),
        "quantity": 10
    }
    resp1 = await client.post(f"/inventory/{outlet_id}/receipts", json=receipt_same_date, headers=headers)
    assert resp1.status_code == 400 # Pydantic Validation error
    
    # 2. Expiry before manufacture
    receipt_past_expiry = {
        "sku_code": "SKU-ALERT",
        "batch_number": "BATCH-1",
        "manufacture_date": str(date.today()),
        "expiry_date": str(date.today() - timedelta(days=10)),
        "quantity": 10
    }
    resp2 = await client.post(f"/inventory/{outlet_id}/receipts", json=receipt_past_expiry, headers=headers)
    assert resp2.status_code == 400


@pytest.mark.asyncio
async def test_fefo_batch_selection_and_sort_order(client):
    """Property 12 & 15: Select and sort active batches by minimum expiry date (FEFO)."""
    token = get_test_jwt("inventory_controller")
    headers = {"Authorization": f"Bearer {token}"}
    outlet_id = str(uuid.uuid4())
    
    # 1. Create product
    prod_resp = await client.post("/inventory/products", json={
        "sku_code": "SKU-FEFO",
        "name": "FEFO Test",
        "category": "Test",
        "unit_of_measure": "BOX"
    }, headers=headers)
    product_id = prod_resp.json()["id"]
    
    # 2. Receipt batch A expiring in 30 days
    await client.post(f"/inventory/{outlet_id}/receipts", json={
        "sku_code": "SKU-FEFO",
        "batch_number": "BATCH-A-30",
        "manufacture_date": str(date.today() - timedelta(days=5)),
        "expiry_date": str(date.today() + timedelta(days=30)),
        "quantity": 15
    }, headers=headers)
    
    # 3. Receipt batch B expiring in 10 days (should be sorted first)
    await client.post(f"/inventory/{outlet_id}/receipts", json={
        "sku_code": "SKU-FEFO",
        "batch_number": "BATCH-B-10",
        "manufacture_date": str(date.today() - timedelta(days=5)),
        "expiry_date": str(date.today() + timedelta(days=10)),
        "quantity": 25
    }, headers=headers)
    
    # 4. Receipt batch C expiring in 60 days
    await client.post(f"/inventory/{outlet_id}/receipts", json={
        "sku_code": "SKU-FEFO",
        "batch_number": "BATCH-C-60",
        "manufacture_date": str(date.today() - timedelta(days=5)),
        "expiry_date": str(date.today() + timedelta(days=60)),
        "quantity": 35
    }, headers=headers)
    
    # 5. Fetch batches (Property 15)
    resp = await client.get(f"/inventory/{outlet_id}/batches/{product_id}", headers=headers)
    assert resp.status_code == 200
    batches = resp.json()
    assert len(batches) == 3
    
    # Ensure they are sorted by expiry_date asc
    assert batches[0]["batch_number"] == "BATCH-B-10"
    assert batches[1]["batch_number"] == "BATCH-A-30"
    assert batches[2]["batch_number"] == "BATCH-C-60"


@pytest.mark.asyncio
async def test_exhausted_batch_status(client):
    """Property 16: Sets batch status to EXHAUSTED when its quantity reaches 0."""
    token = get_test_jwt("inventory_controller")
    headers = {"Authorization": f"Bearer {token}"}
    outlet_id = str(uuid.uuid4())
    
    # 1. Create product
    prod_resp = await client.post("/inventory/products", json={
        "sku_code": "SKU-EXHAUST",
        "name": "Exhaust Test",
        "category": "Test",
        "unit_of_measure": "BOX"
    }, headers=headers)
    product_id = prod_resp.json()["id"]
    
    # 2. Receipt batch of 10 units
    receipt_resp = await client.post(f"/inventory/{outlet_id}/receipts", json={
        "sku_code": "SKU-EXHAUST",
        "batch_number": "BATCH-TEMP",
        "manufacture_date": str(date.today() - timedelta(days=5)),
        "expiry_date": str(date.today() + timedelta(days=100)),
        "quantity": 10
    }, headers=headers)
    batch_id = receipt_resp.json()["batch"]["id"]
    
    # Check status is ACTIVE
    assert receipt_resp.json()["batch"]["status"] == "ACTIVE"
    
    # 3. Deduct exactly 10 units
    adjust_resp = await client.post(f"/inventory/{outlet_id}/adjustments", json={
        "product_id": product_id,
        "batch_id": batch_id,
        "quantity_delta": -10,
        "reason": "SALE_DISPENSE"
    }, headers=headers)
    assert adjust_resp.status_code == 201
    assert adjust_resp.json()["new_batch_quantity"] == 0
    
    # 4. Check DB status is EXHAUSTED
    async with test_session_factory() as db:
        batch_obj = await db.get(models.Batch, uuid.UUID(batch_id))
        assert batch_obj.status == "EXHAUSTED"
        
    # 5. Verify it's no longer returned in active batches
    batches_resp = await client.get(f"/inventory/{outlet_id}/batches/{product_id}", headers=headers)
    assert len(batches_resp.json()) == 0


@pytest.mark.asyncio
async def test_expiry_alert_emission(client):
    """Property 13: System-wide scan correctly categorizes and emits warnings/urgent alerts."""
    token = get_test_jwt("inventory_controller")
    headers = {"Authorization": f"Bearer {token}"}
    outlet_id = str(uuid.uuid4())
    
    # 1. Create products
    prod_resp = await client.post("/inventory/products", json={
        "sku_code": "SKU-EXP-1",
        "name": "Expiring Test 1",
        "category": "Test",
        "unit_of_measure": "BOX"
    }, headers=headers)
    p1 = prod_resp.json()["id"]
    
    # 2. Receipt batch expiring in 15 days (Urgent)
    await client.post(f"/inventory/{outlet_id}/receipts", json={
        "sku_code": "SKU-EXP-1",
        "batch_number": "BATCH-URGENT",
        "manufacture_date": str(date.today() - timedelta(days=10)),
        "expiry_date": str(date.today() + timedelta(days=15)),
        "quantity": 10
    }, headers=headers)
    
    # 3. Receipt batch expiring in 45 days (Warning)
    await client.post(f"/inventory/{outlet_id}/receipts", json={
        "sku_code": "SKU-EXP-1",
        "batch_number": "BATCH-WARNING",
        "manufacture_date": str(date.today() - timedelta(days=10)),
        "expiry_date": str(date.today() + timedelta(days=45)),
        "quantity": 20
    }, headers=headers)
    
    # 4. Receipt batch expiring in 120 days (No alert)
    await client.post(f"/inventory/{outlet_id}/receipts", json={
        "sku_code": "SKU-EXP-1",
        "batch_number": "BATCH-SAFE",
        "manufacture_date": str(date.today() - timedelta(days=10)),
        "expiry_date": str(date.today() + timedelta(days=120)),
        "quantity": 30
    }, headers=headers)
    
    # 5. Trigger System-wide scan
    scan_resp = await client.post("/inventory/tasks/scan-expiries", headers=headers)
    assert scan_resp.status_code == 200
    assert scan_resp.json()["alerts_emitted"] == 2
    
    # 6. Check emitted events
    producer = crud.get_producer()
    urgent_events = [e for e in producer.producer.events if e["topic"] == "inventory.expiry_urgent"]
    warning_events = [e for e in producer.producer.events if e["topic"] == "inventory.expiry_warning"]
    
    assert len(urgent_events) == 1
    assert urgent_events[0]["value"]["batch_number"] == "BATCH-URGENT"
    assert urgent_events[0]["value"]["days_to_expiry"] == 15
    assert urgent_events[0]["value"]["event_type"] == "EXPIRY_URGENT"
    
    assert len(warning_events) == 1
    assert warning_events[0]["value"]["batch_number"] == "BATCH-WARNING"
    assert warning_events[0]["value"]["days_to_expiry"] == 45
    assert warning_events[0]["value"]["event_type"] == "EXPIRY_WARNING"


# ----------------------------------------------------
# Stock Transfer Tests (Properties 24, 25, 26)
# ----------------------------------------------------

@pytest.mark.asyncio
async def test_transfer_stock_conservation(client):
    """Property 24: Transfer stock conservation. Available quantity is reserved on DRAFT and moved on RECEIVED."""
    token = get_test_jwt("inventory_controller")
    headers = {"Authorization": f"Bearer {token}"}
    
    src_outlet = uuid.uuid4()
    dest_outlet = uuid.uuid4()
    
    # 1. Create a product
    prod_resp = await client.post("/inventory/products", json={
        "sku_code": "SKU-TRANSFER-1",
        "name": "Transfer Product 1",
        "category": "Test",
        "unit_of_measure": "BOX"
    }, headers=headers)
    assert prod_resp.status_code == 201
    prod_id = prod_resp.json()["id"]
    
    # 2. Seed stock at source outlet
    receipt_resp = await client.post(f"/inventory/{src_outlet}/receipts", json={
        "product_id": prod_id,
        "batch_number": "BATCH-TR-01",
        "manufacture_date": str(date.today() - timedelta(days=10)),
        "expiry_date": str(date.today() + timedelta(days=100)),
        "quantity": 50
    }, headers=headers)
    assert receipt_resp.status_code == 201
    
    # 3. Create Transfer Order (DRAFT)
    transfer_payload = {
        "source_outlet_id": str(src_outlet),
        "destination_outlet_id": str(dest_outlet),
        "line_items": [
            {
                "product_id": prod_id,
                "quantity": 15
            }
        ]
    }
    create_resp = await client.post("/transfers", json=transfer_payload, headers=headers)
    assert create_resp.status_code == 201
    transfer_id = create_resp.json()["id"]
    assert create_resp.json()["status"] == "DRAFT"
    
    # Verify stock reservation at source
    src_stock = await client.get(f"/inventory/{src_outlet}/stock/{prod_id}", headers=headers)
    assert src_stock.json()["total_quantity"] == 50
    assert src_stock.json()["reserved_quantity"] == 15
    
    # 4. Approve Transfer Order
    app_resp = await client.patch(f"/transfers/{transfer_id}/approve", headers=headers)
    assert app_resp.status_code == 200
    assert app_resp.json()["status"] == "APPROVED"
    
    # 5. Dispatch Transfer Order
    disp_resp = await client.patch(f"/transfers/{transfer_id}/dispatch", headers=headers)
    assert disp_resp.status_code == 200
    assert disp_resp.json()["status"] == "DISPATCHED"
    
    # 6. Receive Transfer Order (Property 24 verification)
    rec_resp = await client.patch(f"/transfers/{transfer_id}/receive", headers=headers)
    assert rec_resp.status_code == 200
    assert rec_resp.json()["status"] == "RECEIVED"
    
    # Verify stock at source (deducted & reservation cleared)
    src_stock_after = await client.get(f"/inventory/{src_outlet}/stock/{prod_id}", headers=headers)
    assert src_stock_after.json()["total_quantity"] == 35
    assert src_stock_after.json()["reserved_quantity"] == 0
    
    # Verify stock at destination (added)
    dest_stock_after = await client.get(f"/inventory/{dest_outlet}/stock/{prod_id}", headers=headers)
    assert dest_stock_after.json()["total_quantity"] == 15
    assert dest_stock_after.json()["reserved_quantity"] == 0


@pytest.mark.asyncio
async def test_transfer_cancellation_stock_restore(client):
    """Property 25: Transfer cancellation stock restore. Cancelled transfer releases reserved stock."""
    token = get_test_jwt("inventory_controller")
    headers = {"Authorization": f"Bearer {token}"}
    
    src_outlet = uuid.uuid4()
    dest_outlet = uuid.uuid4()
    
    # 1. Create product
    prod_resp = await client.post("/inventory/products", json={
        "sku_code": "SKU-TRANSFER-2",
        "name": "Transfer Product 2",
        "category": "Test",
        "unit_of_measure": "BOX"
    }, headers=headers)
    prod_id = prod_resp.json()["id"]
    
    # 2. Seed stock
    await client.post(f"/inventory/{src_outlet}/receipts", json={
        "product_id": prod_id,
        "batch_number": "BATCH-TR-02",
        "manufacture_date": str(date.today() - timedelta(days=10)),
        "expiry_date": str(date.today() + timedelta(days=100)),
        "quantity": 100
    }, headers=headers)
    
    # 3. Create Transfer Order
    transfer_payload = {
        "source_outlet_id": str(src_outlet),
        "destination_outlet_id": str(dest_outlet),
        "line_items": [
            {
                "product_id": prod_id,
                "quantity": 40
            }
        ]
    }
    create_resp = await client.post("/transfers", json=transfer_payload, headers=headers)
    transfer_id = create_resp.json()["id"]
    
    # Verify reserved stock
    src_stock = await client.get(f"/inventory/{src_outlet}/stock/{prod_id}", headers=headers)
    assert src_stock.json()["reserved_quantity"] == 40
    
    # 4. Cancel Transfer Order
    cancel_resp = await client.patch(f"/transfers/{transfer_id}/cancel", headers=headers)
    assert cancel_resp.status_code == 200
    assert cancel_resp.json()["status"] == "CANCELLED"
    
    # Verify stock is restored (reservation cleared, total unchanged)
    src_stock_after = await client.get(f"/inventory/{src_outlet}/stock/{prod_id}", headers=headers)
    assert src_stock_after.json()["total_quantity"] == 100
    assert src_stock_after.json()["reserved_quantity"] == 0


@pytest.mark.asyncio
async def test_transfer_state_machine_validity(client):
    """Property 26: Only valid transitions succeed, invalid transitions return 422."""
    token = get_test_jwt("inventory_controller")
    headers = {"Authorization": f"Bearer {token}"}
    
    src_outlet = uuid.uuid4()
    dest_outlet = uuid.uuid4()
    
    prod_resp = await client.post("/inventory/products", json={
        "sku_code": "SKU-TRANSFER-3",
        "name": "Transfer Product 3",
        "category": "Test",
        "unit_of_measure": "BOX"
    }, headers=headers)
    prod_id = prod_resp.json()["id"]
    
    await client.post(f"/inventory/{src_outlet}/receipts", json={
        "product_id": prod_id,
        "batch_number": "BATCH-TR-03",
        "manufacture_date": str(date.today() - timedelta(days=10)),
        "expiry_date": str(date.today() + timedelta(days=100)),
        "quantity": 50
    }, headers=headers)
    
    transfer_payload = {
        "source_outlet_id": str(src_outlet),
        "destination_outlet_id": str(dest_outlet),
        "line_items": [
            {
                "product_id": prod_id,
                "quantity": 10
            }
        ]
    }
    
    # Create DRAFT
    create_resp = await client.post("/transfers", json=transfer_payload, headers=headers)
    transfer_id = create_resp.json()["id"]
    
    # Try invalid transition: DRAFT -> DISPATCHED (fails)
    disp_resp = await client.patch(f"/transfers/{transfer_id}/dispatch", headers=headers)
    assert disp_resp.status_code == 422
    
    # Try invalid transition: DRAFT -> RECEIVED (fails)
    rec_resp = await client.patch(f"/transfers/{transfer_id}/receive", headers=headers)
    assert rec_resp.status_code == 422
    
    # Cancel DRAFT -> CANCELLED (succeeds)
    cancel_resp = await client.patch(f"/transfers/{transfer_id}/cancel", headers=headers)
    assert cancel_resp.status_code == 200
    
    # Try transitioning CANCELLED -> APPROVED (fails)
    app_resp = await client.patch(f"/transfers/{transfer_id}/approve", headers=headers)
    assert app_resp.status_code == 422

