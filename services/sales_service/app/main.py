import uuid
from typing import List, Optional
from fastapi import FastAPI, Depends, Request, Response, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from shared.database import get_db, Base, engine
from shared.errors import register_error_handlers, ValidationError, NotFoundError
from shared.auth import decode_access_token

from services.sales_service.app.config import settings
from services.sales_service.app import crud, schemas

app = FastAPI(title="Pharmora Sales Service", version="0.1.0")
register_error_handlers(app)


def get_current_user_id(request: Request) -> Optional[uuid.UUID]:
    """Extract user_id (sub claim) from JWT in the Authorization header."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ")[1]
    try:
        payload = decode_access_token(token)
        return uuid.UUID(payload["sub"])
    except Exception:
        return None


@app.on_event("startup")
async def startup():
    # Initialize database tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables initialized for Sales Service.")


# ----------------------------------------------------
# Sales Transactions (Checkout) Endpoints
# ----------------------------------------------------

@app.post("/sales/transactions", response_model=schemas.TransactionResponse, status_code=status.HTTP_201_CREATED)
async def checkout(
    payload: schemas.TransactionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Create a new sales transaction invoice, verifying stock and prescriptions."""
    pharmacist_id = get_current_user_id(request)
    if not pharmacist_id:
        # Fallback dummy for testing if headers are bypassed locally
        pharmacist_id = uuid.UUID(int=0)
        
    return await crud.create_transaction(
        db=db,
        outlet_id=payload.outlet_id,
        pharmacist_id=pharmacist_id,
        payload=payload
    )


@app.get("/sales/transactions/{id}", response_model=schemas.TransactionResponse)
async def get_transaction(id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Fetch details of a specific transaction invoice by UUID."""
    tx = await crud.get_transaction(db, id)
    if not tx:
        raise NotFoundError("Transaction not found.")
    return tx


@app.post("/sales/transactions/{id}/void", response_model=schemas.TransactionResponse)
async def void_transaction(
    id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Void a transaction invoice and return the associated items to stock."""
    pharmacist_id = get_current_user_id(request)
    if not pharmacist_id:
        pharmacist_id = uuid.UUID(int=0)
        
    return await crud.void_transaction(db, id, pharmacist_id)


@app.get("/sales/invoices/{invoice_number}", response_model=schemas.TransactionResponse)
async def get_invoice(invoice_number: str, db: AsyncSession = Depends(get_db)):
    """Fetch details of a specific transaction invoice by human readable invoice number."""
    tx = await crud.get_transaction_by_invoice(db, invoice_number)
    if not tx:
        raise NotFoundError(f"Invoice {invoice_number} not found.")
    return tx


# ----------------------------------------------------
# Prescription Registry Endpoints
# ----------------------------------------------------

@app.post("/sales/prescriptions", response_model=schemas.PrescriptionResponse, status_code=status.HTTP_201_CREATED)
async def register_prescription(payload: schemas.PrescriptionCreate, db: AsyncSession = Depends(get_db)):
    """Register a doctor prescription in the system (prior to dispensing)."""
    return await crud.create_prescription(db, payload)


@app.get("/sales/prescriptions/{ref}", response_model=schemas.PrescriptionResponse)
async def get_prescription(ref: str, db: AsyncSession = Depends(get_db)):
    """Fetch a prescription record (and remaining counts) by its reference code."""
    rx = await crud.get_prescription_by_ref(db, ref)
    if not rx:
        raise NotFoundError(f"Prescription with reference {ref} not found.")
    return rx


@app.post("/sales/prescriptions/{ref}/dispense", response_model=schemas.DispenseResponse)
async def dispense_prescription(
    ref: str,
    payload: schemas.DispenseRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Dispense items against a prescription without creating a full invoice."""
    pharmacist_id = get_current_user_id(request) or uuid.UUID(int=0)
    
    # We can handle standalone dispensing by leveraging the transaction checkout logic
    # using a dummy transaction (with CARD payment and 0.0 amounts) that gets created and committed.
    # Alternatively, perform manual prescription item decrement directly.
    # Let's perform direct manual decrement to align with standard endpoint behavior:
    rx = await crud.get_prescription_by_ref(db, ref)
    if not rx:
        raise NotFoundError(f"Prescription with reference {ref} not found.")
        
    if rx.status == "CLOSED":
        raise ValidationError("Prescription is CLOSED and cannot be dispensed against.")

    from datetime import date, timedelta
    if rx.prescription_date < date.today() - timedelta(days=180):
        raise ValidationError(f"Prescription {ref} has expired (prescription date {rx.prescription_date} is older than 6 months).")

    items_to_dispense = []
    for item in payload.line_items:
        # Find matching item in prescription
        rx_item = next((i for i in rx.items if i.product_id == item.product_id), None)
        if not rx_item:
            raise ValidationError(f"Product {item.product_id} is not part of prescription {ref}.")
            
        if rx_item.remaining_quantity < item.quantity:
            raise ValidationError(
                f"Insufficient quantity on prescription. Requested: {item.quantity}, Remaining: {rx_item.remaining_quantity}"
            )
            
        # Update quantities
        rx_item.dispensed_quantity += item.quantity
        rx_item.remaining_quantity = rx_item.prescribed_quantity - rx_item.dispensed_quantity
        
    # Recalculate status
    total_remaining = sum(i.remaining_quantity for i in rx.items)
    total_dispensed = sum(i.dispensed_quantity for i in rx.items)
    
    if total_remaining == 0:
        rx.status = "CLOSED"
    elif total_dispensed > 0:
        rx.status = "PARTIAL"
        
    await db.commit()
    await db.refresh(rx)
    
    return schemas.DispenseResponse(
        prescription_ref=rx.prescription_ref,
        status=rx.status,
        dispensed_items=rx.items
    )


@app.get("/sales/prescriptions", response_model=List[schemas.PrescriptionResponse])
async def list_prescriptions(db: AsyncSession = Depends(get_db)):
    """Fetch a list of all doctor prescriptions registered in the system."""
    return await crud.get_all_prescriptions(db)


@app.get("/sales/overrides", response_model=List[schemas.ClinicalOverrideResponse])
async def list_clinical_overrides(db: AsyncSession = Depends(get_db)):
    """Fetch a list of all clinical overrides logged for restricted substances."""
    return await crud.get_all_clinical_overrides(db)


@app.post("/sales/overrides", response_model=schemas.ClinicalOverrideResponse, status_code=status.HTTP_201_CREATED)
async def submit_clinical_override(
    payload: schemas.ClinicalOverrideCreate,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Log a pharmacist's clinical override clearance for double-verification."""
    pharmacist_id = get_current_user_id(request) or uuid.UUID(int=0)
    return await crud.create_clinical_override(db, payload, pharmacist_id)


@app.get("/reporting/query")
async def execute_reporting_query(
    query: str,
    db: AsyncSession = Depends(get_db)
):
    """Interface to parse NLP requests and run analytics directly on the SQLite database."""
    return await crud.execute_reporting_nlp_query(db, query)
