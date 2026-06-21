# Pharmora: Production-Ready Design and Implementation Plan

## 1. Executive Summary
This document outlines the architecture, service boundaries, AI capabilities, and deployment strategy for **Pharmora**, a scalable, microservices-based web platform designed for a regional healthcare retail chain operating 180 pharmacy outlets and 12 distribution hubs across three states. The comprehensive solution guarantees low-latency checkout, role-based access, observability, secure handling of healthcare data, and seamless integration of agentic AI operational insights.

## 2. Microservices Architecture & Service Boundaries
The platform relies on a domain-driven microservices architecture. Each microservice is independently deployable and manages its own PostgreSQL schema to maintain loose coupling and resilient scaling.

### 2.1 Core Services
1. **Identity and Access Management (IAM) Service**:
   - **Role**: Handles robust authentication, JWT issuance, and Role-Based Access Control (RBAC). 
   - **Roles Supported**: Regional Admin, Pharmacist, Inventory Controller, Finance Manager.
   - **Tech Stack**: FastAPI, OAuth2/OIDC.
2. **Inventory & Stock Management Service**:
   - **Role**: Tracks real-time stock levels, batch/expiry logistics, and inter-branch stock transfers.
3. **Sales & Checkout Service**:
   - **Role**: Manages prescription-linked sales, cart states, invoicing, and local offline-tolerant checkouts.
   - **Constraints**: Ultra-low latency checkout optimized using a Redis caching layer.
4. **Order & Replenishment Service**:
   - **Role**: Handles PO generation, distribution hub routing, and supply chain logistics.
5. **Business Intelligence (BI) & Reporting Service**:
   - **Role**: Computes operational metrics, sales margins, and demand trends asynchronously.
6. **Agentic AI & Analytics Service**:
   - **Role**: Provides anomaly detection, replenishment forecasting, and processes natural language querying. 

### 2.2 Inter-Service Communication
* **Synchronous (gRPC/REST)**: Used for critical, immediate requests, such as the Sales Service validating token permissions from IAM.
* **Asynchronous (Event-Driven via Kafka/RabbitMQ)**: Used for eventual consistency (e.g., `SaleCompleted` event streams to Inventory for stock deduction and BI for analytics).

## 3. Database Schema Design (PostgreSQL)

To satisfy data sovereignty per service, the application uses logically separate schemas running on managed PostgreSQL clusters.

### 3.1 Inventory Schema (Inventory Service)
* `products`: `id`, `name`, `sku`, `category`, `base_price`
* `store_inventory`: `store_id`, `product_id`, `quantity`, `reorder_threshold`
* `batches`: `id`, `product_id`, `batch_no`, `mfg_date`, `expiry_date`, `quantity_in_batch`
* `transfers`: `id`, `from_store`, `to_store`, `status`, `initiated_at`, `completed_at`

### 3.2 Sales Schema (Sales Service)
* `invoices`: `id`, `store_id`, `pharmacist_id`, `total_amount`, `timestamp`, `prescription_ref_hash`
* `invoice_lines`: `id`, `invoice_id`, `product_id`, `batch_id`, `quantity`, `unit_price`

### 3.3 IAM Schema (IAM Service)
* `users`: `id`, `username`, `password_hash`, `role_id`, `store_id` (null for regional admins)
* `roles`: `id`, `name`, `permissions_json`

## 4. API Contracts (Design Patterns)
APIs are designed with OpenAPI 3.0 specs and enforce stateless interactions.
* **Checkout Workflow `POST /api/v1/sales/checkout`**
  - **Payload**: `{ "store_id": "S-101", "items": [{"product_id": "P-44", "batch_id": "B-919", "qty": 1}], "prescription_ref": "RX-SEC-9981" }`
  - **Response**: `200 OK` + Transaction ID. (SLA: < 200ms)
* **Stock Transfer `POST /api/v1/inventory/transfers`**
  - **Payload**: `{ "source_store": "S-101", "target_store": "S-102", "items": [{"product_id": "P-44", "qty": 50}] }`

## 5. Agentic AI Feature Design
The AI layer enhances operations while enforcing deterministic safety boundaries.

1. **Replenishment Recommendations (Predictive Model)**:
   - *Design*: Consumes sales velocity, seasonality, and expiry graphs to recommend order volumes per hub.
   - *Guardrails*: Strictly advisory. Requires explicitly modeled **Human-in-the-Loop** approval by an Inventory Controller before PO dispatch.
2. **Anomaly Detection (Pattern Consistency)**:
   - *Design*: Unsupervised ML flags severe stock discrepancies and suspicious point-of-sale patterns (e.g., uncharacteristic bulk sales of particular drugs).
   - *Guardrails*: Generates priority alerts in the Admin Dashboard with full audit trails.
3. **Conversational Querying (LLM RAG Architecture)**:
   - *Design*: A natural language interface for Finance/Admin queries ("Show margin drops in State 2"). 
   - *Guardrails*: LLM relies on strict semantic Text-to-SQL logic against a read-only BI replica. Row-Level Security (RLS) ensures users only query data within their RBAC scope.

## 6. Security, Privacy & Compliance
* **Patient Privacy**: No raw Patient Identifiable Information (PII) is stored in standard sales logs; `prescription_ref` is tokenized/hashed.
* **Authentication**: OAuth2 / JWT with short expiration policies.
* **Encryption**: 
  * *In-Transit*: TLS 1.3 enforced on API Gateway.
  * *At-Rest*: AES-256 for PostgreSQL volumes. Fields handling sensitive healthcare logs use column-level encryption.
* **Auditability**: Every mutate action (Roles changes, Sales, Write-offs) appends to an immutable, append-only Event Store for compliance.
* **AI Coding Guardrails**: Code generated dynamically must pass static analysis (SAST) checks. LLM prompts are sanitized against prompt-injection.

## 7. Deployment & Observability Strategy
* **Container Orchestration**: Docker containers running natively on Kubernetes (EKS/AKS). Employs Horizontal Pod Autoscaler (HPA) to dynamically ramp up Sales Service pods during peak retail hours.
* **API Gateway**: NGINX / Kong handling reverse proxy, rate-limiting, and SSL termination.
* **Observability (Three Pillars)**:
  * **Logs**: Fluentd + Elasticsearch indexing structured JSON application logs.
  * **Metrics**: Prometheus & Grafana to monitor infrastructure SLA (Node CPU, API Latency).
  * **Traces**: OpenTelemetry natively hooked into Python services, exporting spans to Jaeger to bottleneck-hunt distributed checkouts.

## 8. Technology Stack Summary
- **Backend Languages/Frameworks**: Python 3.11, FastAPI (for async IO), SQLAlchemy (ORM), Celery (Background Tasks).
- **Databases**: PostgreSQL 15, Redis (Caching/Cart), Apache Kafka (Message Broker).
- **AI Tooling**: Scikit-learn (Anomalies), LangChain + OpenAI/Open-source models (Agentic querying).
- **Infra Automation**: Terraform, Docker, Kubernetes, Helm.
