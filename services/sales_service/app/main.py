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





@app.get("/reporting/query")
async def execute_reporting_query(
    query: str,
    db: AsyncSession = Depends(get_db)
):
    """Interface to parse NLP requests and run analytics directly on the SQLite database."""
    return await crud.execute_reporting_nlp_query(db, query)
