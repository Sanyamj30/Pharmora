# Pharmora: Execution Guide & Dashboard Credentials

This file explains how to run the entire backend and frontend suite, how to seed the database, and provides the default user credentials to access the role-specific dashboards.

---

## 1. Running the Platform via Docker Compose (Recommended)

Docker Compose starts PostgreSQL, Redis, Kafka, all backend microservices, and the API Gateway automatically.

### Prerequisites:
- Docker and Docker Compose installed and running.

### Steps:
1. From the root directory, start all services:
   ```bash
   docker compose up -d
   ```
2. Check the container health:
   ```bash
   docker compose ps
   ```
3. The API Gateway will be listening on `http://localhost:8000`.

---

## 2. Running Microservices Locally (Development Mode / SQLite)

If you prefer to run services manually for fast hot-reloads and development:

### Prerequisites:
- Python 3.12 installed.
- Redis server running on localhost (`port 6379`).

### Steps:
1. **Install dependencies**:
   ```bash
   pip install -e .[dev] -e ./shared
   ```
2. **Seed the database**:
   Configure the engine to write to a local SQLite file:
   - **Windows Powershell**:
     ```powershell
     $env:DATABASE_URL="sqlite+aiosqlite:///pharmora_dev.db"
     python seed_dev_db.py
     ```
   - **Bash (Linux/macOS)**:
     ```bash
     export DATABASE_URL="sqlite+aiosqlite:///pharmora_dev.db"
     python seed_dev_db.py
     ```

3. **Start the microservices**:
   Run each command in a separate terminal window, setting the appropriate env variables:

   * **Auth Service (`port 8001`)**:
     ```bash
     # Windows Powershell
     $env:DATABASE_URL="sqlite+aiosqlite:///pharmora_dev.db"
     $env:REDIS_URL="redis://localhost:6379/0"
     uvicorn services.auth_service.app.main:app --host 127.0.0.1 --port 8001
     ```

   * **Inventory Service (`port 8002`)**:
     ```bash
     # Windows Powershell
     $env:DATABASE_URL="sqlite+aiosqlite:///pharmora_dev.db"
     $env:KAFKA_BOOTSTRAP_SERVERS="localhost:9092"
     $env:KAFKA_MOCK="true"
     uvicorn services.inventory_service.app.main:app --host 127.0.0.1 --port 8002
     ```

   * **Sales Service (`port 8003`)**:
     ```bash
     # Windows Powershell
     $env:DATABASE_URL="sqlite+aiosqlite:///pharmora_dev.db"
     $env:KAFKA_BOOTSTRAP_SERVERS="localhost:9092"
     $env:KAFKA_MOCK="true"
     $env:PRESCRIPTION_AES_KEY="yP3hV1sA7iO9xW8qD2fG0kL4mN6bV8cX"
     uvicorn services.sales_service.app.main:app --host 127.0.0.1 --port 8003
     ```

   * **API Gateway (`port 8000`)**:
     ```bash
     # Windows Powershell
     $env:REDIS_URL="redis://localhost:6379/0"
     $env:AUTH_SERVICE_URL="http://localhost:8001"
     $env:INVENTORY_SERVICE_URL="http://localhost:8002"
     $env:SALES_SERVICE_URL="http://localhost:8003"
     uvicorn services.api_gateway.app.main:app --host 127.0.0.1 --port 8000
     ```

---

## 3. Running the React Frontend

### Prerequisites:
- Node.js and npm installed.

### Steps:
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install npm packages:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Access the web interface in your browser: `http://localhost:5173`

---

## 4. Default Credentials & Dashboards

Login at `http://localhost:5173` with the following credentials to access role-specific portals:

| User Role | Username | Password | Dashboard Views & Actions |
| :--- | :--- | :--- | :--- |
| **Regional Admin** | `admin` | `adminpassword` | Create/deactivate users, change regional scopes, view system logs. |
| **Pharmacist** | `pharmacist` | `pharmacistpassword` | Sales & Invoicing, prescription verification, checkout processing. |
| **Inventory Controller** | `inventory` | `inventorypassword` | Track stock levels, log receipts/adjustments, trigger inter-branch stock transfers. |
| **Finance Manager** | `finance` | `financepassword` | View sales metrics, profit margins, and operational KPI reports. |
