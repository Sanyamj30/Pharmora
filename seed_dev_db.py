import asyncio
import uuid
from datetime import datetime, date, timedelta
from shared.database import Base, engine, async_session_factory
from shared.auth import hash_password
from services.auth_service.app import models as auth_models
from services.inventory_service.app import models as inv_models

async def main():
    print("Initializing database tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    print("Tables created successfully.")

    async with async_session_factory() as db:
        print("Seeding default region and users...")
        region_id = uuid.UUID("11111111-1111-1111-1111-11111111111a")
        region = auth_models.Region(id=region_id, name="Delhi NCR", state="Delhi")
        db.add(region)
        await db.flush()

        admin = auth_models.User(
            id=uuid.uuid4(),
            username="admin",
            email="admin@pharmora.com",
            password_hash=hash_password("adminpassword"),
            role="regional_admin",
            region_id=region_id,
            is_active=True
        )
        pharmacist = auth_models.User(
            id=uuid.uuid4(),
            username="pharmacist",
            email="pharmacist@pharmora.com",
            password_hash=hash_password("pharmacistpassword"),
            role="pharmacist",
            region_id=region_id,
            is_active=True
        )
        inventory = auth_models.User(
            id=uuid.uuid4(),
            username="inventory",
            email="inventory@pharmora.com",
            password_hash=hash_password("inventorypassword"),
            role="inventory_controller",
            region_id=region_id,
            is_active=True
        )
        finance = auth_models.User(
            id=uuid.uuid4(),
            username="finance",
            email="finance@pharmora.com",
            password_hash=hash_password("financepassword"),
            role="finance_manager",
            region_id=region_id,
            is_active=True
        )
        db.add_all([admin, pharmacist, inventory, finance])
        await db.flush()

        scope1 = auth_models.UserOutletScope(user_id=pharmacist.id, outlet_id=region_id)
        scope2 = auth_models.UserOutletScope(user_id=inventory.id, outlet_id=region_id)
        scope3 = auth_models.UserOutletScope(user_id=finance.id, outlet_id=region_id)
        db.add_all([scope1, scope2, scope3])

        print("Seeding catalog products...")
        products_data = [
            ("SKU-PARA-500", "Paracetamol 500mg", "Analgesics", None, "BOX", 5, 3),
            ("SKU-AMOX-250", "Amoxicillin 250mg", "Antibiotics", "H", "BOX", 10, 5),
            ("SKU-IBU-400", "Ibuprofen 400mg", "Analgesics", None, "BOX", 8, 4),
            ("SKU-COD-15", "Codeine 15mg", "Narcotics", "X", "BOX", 3, 10),
        ]
        
        products = []
        for sku, name, cat, cls, uom, reorder, lead in products_data:
            p = inv_models.Product(
                id=uuid.uuid4(),
                sku_code=sku,
                name=name,
                category=cat,
                schedule_class=cls,
                unit_of_measure=uom,
                reorder_point=reorder,
                lead_time_days=lead
            )
            db.add(p)
            products.append(p)
        await db.flush()

        print("Seeding stock levels and active batches...")
        for p in products:
            # Determine initial seed quantity based on product SKU code
            # We want some products to be in low-stock status (below reorder point)
            if p.sku_code == "SKU-PARA-500":
                qty = 3  # below reorder point (5)
            elif p.sku_code == "SKU-AMOX-250":
                qty = 4  # below reorder point (10)
            elif p.sku_code == "SKU-COD-15":
                qty = 1  # below reorder point (3)
            else:
                qty = 100 # healthy stock

            # StockLevel
            sl = inv_models.StockLevel(
                id=uuid.uuid4(),
                outlet_id=region_id,
                product_id=p.id,
                total_quantity=qty,
                reserved_quantity=0
            )
            db.add(sl)

            # Batch
            batch = inv_models.Batch(
                id=uuid.uuid4(),
                product_id=p.id,
                outlet_id=region_id,
                batch_number=f"BAT-{p.sku_code}-001",
                manufacture_date=date.today() - timedelta(days=20),
                expiry_date=date.today() + timedelta(days=180),
                quantity=qty,
                status="ACTIVE"
            )
            db.add(batch)

        print("Seeding prescriptions...")
        from services.sales_service.app import models as sales_models
        from services.sales_service.app.crypto import cipher
        
        # Prescription 1: Codeine 15mg (Schedule X)
        rx1 = sales_models.Prescription(
            id=uuid.uuid4(),
            prescription_ref="RX-COD-123",
            patient_id_encrypted=cipher.encrypt("PAT-001"),
            doctor_name="Dr. Sameer Sen",
            doctor_registration="REG-88271",
            prescription_date=date.today() - timedelta(days=5),
            status="OPEN"
        )
        db.add(rx1)
        await db.flush()
        
        cod_product = next(p for p in products if p.sku_code == "SKU-COD-15")
        rx_item1 = sales_models.PrescriptionItem(
            id=uuid.uuid4(),
            prescription_id=rx1.id,
            product_id=cod_product.id,
            prescribed_quantity=10,
            dispensed_quantity=0,
            remaining_quantity=10
        )
        db.add(rx_item1)

        # Prescription 2: Amoxicillin 250mg (Schedule H)
        rx2 = sales_models.Prescription(
            id=uuid.uuid4(),
            prescription_ref="RX-AMOX-456",
            patient_id_encrypted=cipher.encrypt("PAT-002"),
            doctor_name="Dr. Ananya Roy",
            doctor_registration="REG-91024",
            prescription_date=date.today() - timedelta(days=2),
            status="OPEN"
        )
        db.add(rx2)
        await db.flush()
        
        amox_product = next(p for p in products if p.sku_code == "SKU-AMOX-250")
        rx_item2 = sales_models.PrescriptionItem(
            id=uuid.uuid4(),
            prescription_id=rx2.id,
            product_id=amox_product.id,
            prescribed_quantity=20,
            dispensed_quantity=0,
            remaining_quantity=20
        )
        db.add(rx_item2)

        await db.commit()
        print("Seeding completed successfully!")

if __name__ == "__main__":
    asyncio.run(main())
