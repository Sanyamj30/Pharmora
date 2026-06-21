# Implementation Plan: Pharmora

## Overview

This plan sequences the implementation of Pharmora as a series of incremental coding steps. Each task builds on the previous, starting with shared infrastructure and working outward to domain services, AI features, and observability. All services are Python/FastAPI with PostgreSQL and Kafka.

---

## Tasks

- [ ] 1. Project scaffold and shared infrastructure
  - Create monorepo directory structure: `services/`, `shared/`, `infra/`, `tests/`
  - Set up `pyproject.toml` with shared dev dependencies: `fastapi`, `sqlalchemy`, `alembic`, `pydantic`, `httpx`, `pytest`, `hypothesis`, `pytest-asyncio`
  - Create `shared/` library with: base Pydantic models, error envelope schema, JWT utilities, structured logging middleware, OpenTelemetry instrumentation helpers, Kafka producer/consumer base classes
  - Create `docker-compose.yml` for local dev: PostgreSQL, Redis, Kafka (KRaft mode), Zookeeper-free
  - Create `Makefile` with targets: `test`, `lint`, `migrate`, `build`
  - _Requirements: 15.1, 15.2, 15.3, 16.1_

- [ ] 2. Auth Service
  - [ ] 2.1 Implement Auth Service database schema and Alembic migrations
    - Create `users`, `refresh_tokens`, `user_outlet_scope`, `regions` tables per design schema
    - Write Alembic migration scripts
    - _Requirements: 1.1, 2.1_

  - [ ] 2.2 Implement login, token issuance, and refresh endpoints
    - `POST /auth/login`: validate credentials, issue RS256 JWT + refresh token, enforce 500ms SLA
    - `POST /auth/refresh`: validate refresh token, rotate tokens (invalidate old, issue new)
    - `POST /auth/logout`: revoke refresh token
    - JWT claims: `sub`, `role`, `outlet_scope`, `region`, `iat`, `exp`
    - _Requirements: 1.1, 1.4, 1.5, 1.6_

  - [ ]* 2.3 Write property tests for Auth Service token lifecycle
    - **Property 1: JWT Issuance Correctness** — for any valid credential, response contains valid JWT structure
    - **Property 3: Refresh Token Rotation** — using same refresh token twice fails on second use
    - **Property 4: Logout Invalidates Refresh Token** — post-logout refresh attempt returns 401
    - **Validates: Requirements 1.1, 1.5, 1.6**

  - [ ] 2.4 Implement account lockout and user management endpoints
    - Track failed_login_attempts; lock account after 5 failures in 15 minutes
    - `POST /auth/users`, `PATCH /auth/users/{id}`, `DELETE /auth/users/{id}` (Regional_Admin only)
    - Deactivation immediately invalidates all active tokens via Redis token blocklist
    - _Requirements: 1.2, 1.3, 2.4, 2.5_

  - [ ]* 2.5 Write unit tests for account lockout
    - Test exact lockout threshold (5 failures), lockout notification event emission
    - Test deactivation token invalidation
    - **Validates: Requirements 1.2, 1.3, 2.5**

- [ ] 3. API Gateway
  - [ ] 3.1 Implement API Gateway with JWT validation middleware
    - FastAPI app with route proxying to downstream services
    - JWT validation middleware: verify RS256 signature, check `exp`, extract claims
    - Inject `X-User-ID`, `X-User-Role`, `X-Outlet-Scope`, `X-Trace-ID` headers
    - Return 401 for invalid/expired tokens, 403 for insufficient role
    - _Requirements: 1.8, 2.2, 2.3_

  - [ ] 3.2 Implement RBAC permission table and outlet scope enforcement
    - Define permission matrix: role → allowed endpoints
    - Middleware checks role permission before routing; returns 403 on mismatch
    - Outlet scope filter: attach outlet_scope to all downstream requests
    - _Requirements: 2.2, 2.3, 2.6, 2.7_

  - [ ]* 3.3 Write property tests for API Gateway RBAC and scope enforcement
    - **Property 5: JWT Gateway Validation** — valid JWT forwarded, invalid/expired rejected
    - **Property 6: RBAC Enforcement** — for all role/endpoint combinations, permit iff authorized
    - **Property 7: Outlet Scope Enforcement** — responses contain only in-scope outlet data
    - **Validates: Requirements 1.8, 2.2, 2.3, 2.6**

  - [ ] 3.4 Implement rate limiting and idempotency key caching
    - Per-user rate limit (100 req/min) and per-outlet rate limit (1000 req/min) using Redis sliding window
    - Cache idempotency key responses in Redis for 24 hours
    - _Requirements: 14.5, 6.6_

- [ ] 4. Checkpoint — Auth and Gateway
  - Ensure all Auth Service and API Gateway tests pass. Verify JWT round-trip locally with docker-compose. Ask the user if questions arise.

- [ ] 5. Inventory Service
  - [ ] 5.1 Implement Inventory Service database schema and Alembic migrations
    - Create `products`, `stock_levels`, `batches`, `stock_adjustments` tables per design schema
    - Add index `idx_batches_expiry` on `(outlet_id, product_id, expiry_date) WHERE status = 'ACTIVE'`
    - Add CHECK constraint `total_quantity >= 0` on `stock_levels`
    - _Requirements: 3.1, 4.1_

  - [ ] 5.2 Implement stock level CRUD and real-time query endpoints
    - `GET /inventory/{outlet_id}/stock` — current stock levels with Redis cache (TTL 30s)
    - `GET /inventory/{outlet_id}/stock/{sku_id}` — single SKU stock
    - `POST /inventory/{outlet_id}/receipts` — record receipt, increment stock, emit `inventory.stock.updated` Kafka event
    - `POST /inventory/{outlet_id}/adjustments` — manual adjustment with reason, emit audit event
    - Use `SELECT ... FOR UPDATE` with optimistic locking to prevent negative stock
    - _Requirements: 3.1, 3.2, 3.3, 3.6, 3.7_

  - [ ]* 5.3 Write property tests for stock conservation
    - **Property 8: Stock Conservation Invariant** — for any sequence of operations, stock never goes negative and final quantity equals sum of deltas
    - **Property 10: Audit Record on Stock Adjustment** — every adjustment produces an audit record with required fields
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.6, 3.7**

  - [ ] 5.4 Implement batch tracking and FEFO query endpoints
    - `GET /inventory/{outlet_id}/batches/{sku_id}` — return active batches sorted by expiry_date ASC
    - `GET /inventory/{outlet_id}/expiry-alerts` — batches expiring within N days
    - Batch exhaustion: when quantity reaches 0, set status = 'EXHAUSTED'
    - _Requirements: 4.1, 4.6, 4.7_

  - [ ]* 5.5 Write property tests for batch management
    - **Property 11: Batch Fields Completeness** — all batch records have non-null batch_number, manufacture_date, expiry_date with expiry > manufacture
    - **Property 15: Batch List Sort Order** — batch list response is sorted by expiry_date ascending
    - **Property 16: Exhausted Batch Status** — batch with quantity=0 has status EXHAUSTED
    - **Validates: Requirements 4.1, 4.6, 4.7**

  - [ ] 5.6 Implement low-stock and expiry event emission
    - After every stock update, check if quantity < reorder_point; if so, publish `inventory.low_stock` Kafka event
    - Scheduled job (every 6 hours): scan batches for expiry within 90 days, publish `inventory.expiry_warning` or `inventory.expiry_urgent` events
    - _Requirements: 3.4, 4.3, 4.4_

  - [ ]* 5.7 Write property tests for event emission
    - **Property 9: Low-Stock Event Emission** — for any SKU where stock < reorder_point, low-stock event exists
    - **Property 13: Expiry Alert Emission** — batches within 90 days have warning event; within 30 days have urgent event
    - **Validates: Requirements 3.4, 4.3, 4.4**

- [ ] 6. Sales Service
  - [ ] 6.1 Implement Sales Service database schema and Alembic migrations
    - Create `transactions`, `transaction_line_items`, `prescriptions`, `prescription_items` tables per design schema
    - Add generated column `remaining_quantity` on `prescription_items`
    - _Requirements: 5.1, 6.1_

  - [ ] 6.2 Implement prescription registration and dispensing endpoints
    - `POST /sales/prescriptions` — register prescription with doctor details and line items
    - `GET /sales/prescriptions/{ref}` — get prescription with dispensing history
    - `POST /sales/prescriptions/{ref}/dispense` — dispense against prescription; validate not CLOSED; update dispensed_quantity; set status PARTIAL or CLOSED
    - Encrypt patient_id with AES-256-GCM before DB write
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 6.3 Write property tests for prescription lifecycle
    - **Property 18: Closed Prescription Dispensing Rejection** — dispensing against CLOSED prescription returns error
    - **Property 19: Prescription Quantity Invariant** — dispensed + remaining = prescribed at all times; CLOSED when fully dispensed
    - **Validates: Requirements 5.2, 5.3, 5.4**

  - [ ] 6.4 Implement checkout transaction endpoint with FEFO and regulated drug validation
    - `POST /sales/transactions` — create transaction with line items
    - For each line item: call Inventory_Service to get FEFO batch; validate batch not expired; validate prescription for Schedule H/X drugs
    - Reserve stock via Inventory_Service before committing transaction
    - Calculate total_amount = subtotal + tax_amount - discount_amount
    - On success: persist transaction, publish `sale.completed` Kafka event
    - On failure: publish `sale.failed` event to trigger stock release compensation
    - _Requirements: 4.2, 4.5, 5.1, 6.1, 6.2, 6.3, 6.6_

  - [ ]* 6.5 Write property tests for checkout correctness
    - **Property 12: FEFO Batch Selection** — selected batch has minimum expiry_date among available batches
    - **Property 14: Expired Batch Sale Rejection** — sale with expired batch returns error, no stock decrement
    - **Property 17: Regulated Drug Requires Prescription** — Schedule H/X sale without prescription_id returns error
    - **Property 21: Invoice Total Arithmetic Invariant** — total = subtotal + tax - discount; subtotal = sum(qty × unit_price)
    - **Property 22: Failed Transaction Stock Release** — failed transaction restores reserved stock to pre-reservation value
    - **Validates: Requirements 4.2, 4.5, 5.1, 6.1, 6.2, 6.3, 6.6**

  - [ ] 6.6 Implement invoice void and audit endpoints
    - `POST /sales/transactions/{id}/void` — void invoice if within 24 hours; require Pharmacist or Regional_Admin role
    - `GET /sales/invoices/{invoice_number}` — retrieve invoice with line items
    - Emit `sale.voided` Kafka event on void; Audit_Service consumes and records
    - _Requirements: 6.8, 13.1_

  - [ ]* 6.7 Write property tests for invoice void window
    - **Property 23: Invoice Void Time Window** — void within 24h succeeds; void after 24h returns error
    - **Validates: Requirements 6.8**

  - [ ]* 6.8 Write property test for prescription audit completeness
    - **Property 20: Prescription Audit Completeness** — every prescription-linked sale produces audit record with patient_id, product_id, quantity, batch_id, pharmacist_id, timestamp
    - **Validates: Requirements 5.6**

- [ ] 7. Checkpoint — Inventory and Sales
  - Ensure all Inventory and Sales Service tests pass. Verify FEFO selection and prescription flow end-to-end. Ask the user if questions arise.

- [ ] 8. Transfer Service
  - [ ] 8.1 Implement Transfer Service database schema and Alembic migrations
    - Create `transfer_orders`, `transfer_line_items` tables per design schema
    - _Requirements: 7.1_

  - [ ] 8.2 Implement transfer order lifecycle endpoints
    - `POST /transfers` — create DRAFT transfer order; call Inventory_Service to reserve source stock
    - `PATCH /transfers/{id}/approve` — move DRAFT → APPROVED (Regional_Admin or Inventory_Controller)
    - `PATCH /transfers/{id}/dispatch` — move APPROVED → DISPATCHED
    - `PATCH /transfers/{id}/receive` — move DISPATCHED → RECEIVED; call Inventory_Service to increment destination stock
    - `PATCH /transfers/{id}/cancel` — move DRAFT/APPROVED → CANCELLED; call Inventory_Service to release reserved stock
    - Reject invalid state transitions with 422 error
    - Emit `transfer.state_changed` Kafka event on every transition; Audit_Service consumes
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [ ]* 8.3 Write property tests for transfer correctness
    - **Property 24: Transfer Stock Conservation** — source_after = source_before - qty; destination_after = destination_before + qty
    - **Property 25: Transfer Cancellation Stock Restore** — cancelled transfer restores source stock to pre-transfer value
    - **Property 26: Transfer State Machine Validity** — only valid transitions succeed; invalid transitions return 422
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**

  - [ ] 8.4 Implement transfer history query endpoint
    - `GET /transfers?outlet_id=&status=&from=&to=` — paginated list with filters
    - _Requirements: 7.8_

- [ ] 9. Audit Service
  - [ ] 9.1 Implement Audit Service database schema and append-only enforcement
    - Create `audit_events` table per design schema
    - Revoke UPDATE and DELETE privileges on `audit_events` for the application DB user
    - Create a dedicated `audit_writer` DB role with INSERT-only access
    - _Requirements: 13.1, 13.2_

  - [ ] 9.2 Implement audit event write and query endpoints
    - `POST /audit/events` — internal endpoint (service-to-service only); write audit record; validate all required fields present
    - `GET /audit/events?user_id=&entity_type=&entity_id=&from=&to=` — query audit records with filters
    - Kafka consumer: consume `sale.completed`, `sale.voided`, `transfer.state_changed`, `stock.adjusted` events and write audit records
    - _Requirements: 13.1, 13.3, 13.4_

  - [ ]* 9.3 Write property tests for audit correctness
    - **Property 33: Audit Record Completeness** — every written audit event has non-null service_name, event_type, entity_type, entity_id, user_id, created_at
    - **Property 34: Audit Record Immutability** — any attempt to update or delete an audit record is rejected
    - **Validates: Requirements 13.1, 13.2**

- [ ] 10. Replenishment Service
  - [ ] 10.1 Implement Replenishment Service database schema and Alembic migrations
    - Create `replenishment_recommendations`, `purchase_orders`, `purchase_order_items` tables per design schema
    - _Requirements: 8.1_

  - [ ] 10.2 Implement rule-based replenishment recommendation engine
    - Kafka consumer: consume `inventory.low_stock` events
    - For each low-stock event: query 30-day avg daily consumption from Reporting_Service; calculate `recommended_qty = ceil(avg_daily × lead_time × 1.2)`; create PENDING recommendation with source = 'RULE_BASED'
    - `GET /replenishment/recommendations` — list pending recommendations grouped by outlet and urgency
    - _Requirements: 8.1, 8.2_

  - [ ]* 10.3 Write property test for replenishment quantity calculation
    - **Property 27: Replenishment Quantity Lower Bound** — recommended_qty >= ceil(avg_daily_consumption × lead_time_days) for all recommendations
    - **Validates: Requirements 8.1**

  - [ ] 10.4 Implement recommendation approval workflow and PO generation
    - `POST /replenishment/recommendations/{id}/approve` — set status APPROVED, set reviewed_by; generate purchase_order record; notify Hub via Notification_Service
    - `POST /replenishment/recommendations/{id}/reject` — set status REJECTED
    - `POST /replenishment/recommendations/{id}/modify` — update quantity, set status APPROVED with reviewed_by
    - Enforce: AI_GENERATED recommendations must have reviewed_by set before PO creation
    - _Requirements: 8.3, 8.4, 8.5, 8.6_

  - [ ]* 10.5 Write property test for AI recommendation human approval gate
    - **Property 28: AI Recommendation Requires Human Approval** — AI_GENERATED recommendation with no reviewed_by cannot produce a purchase order
    - **Validates: Requirements 8.3, 8.4**

- [ ] 11. Notification Service
  - [ ] 11.1 Implement Notification Service with Kafka consumer and delivery
    - Kafka consumers for: `inventory.low_stock`, `inventory.expiry_warning`, `inventory.expiry_urgent`, `transfer.state_changed`, `ai.anomaly_detected`
    - Persist notification records to DB with status UNREAD
    - `GET /notifications` — list notifications for authenticated user (last 90 days)
    - `PATCH /notifications/{id}/read` — mark as read
    - _Requirements: 12.1, 12.2, 12.5, 12.6_

  - [ ] 11.2 Implement escalation job and email delivery
    - Celery beat job: every 15 minutes, find critical alerts unacknowledged for > 2 hours; escalate to Regional_Admin
    - WHERE email configured: send email via SMTP/SendGrid on alert creation
    - _Requirements: 12.3, 12.4_

- [ ] 12. Reporting Service
  - [ ] 12.1 Implement Reporting Service with read replica connection and report endpoints
    - Connect to PostgreSQL read replica for all queries
    - `GET /reports/sales-summary` — aggregate revenue, units, transaction count by outlet/date/category
    - `GET /reports/gross-margin` — revenue, COGS, margin% by SKU and outlet
    - `GET /reports/demand-trends` — rolling 30/90-day sales velocity per SKU per outlet
    - Apply outlet_scope filter from JWT claims on all queries
    - _Requirements: 9.1, 9.2, 9.3, 9.7_

  - [ ]* 12.2 Write property test for sales report arithmetic consistency
    - **Property 29: Sales Report Arithmetic Consistency** — reported total_revenue equals sum of non-voided transaction total_amounts in the date range and outlet
    - **Validates: Requirements 9.1**

  - [ ] 12.3 Implement real-time dashboard and export endpoints
    - `GET /reports/dashboard/realtime` — today's revenue and transaction count per outlet (Redis-cached, TTL 60s)
    - `POST /reports/export?format=csv|pdf` — generate and return CSV or PDF export using `pandas` + `reportlab`
    - _Requirements: 9.5, 9.6_

- [ ] 13. Checkpoint — Transfer, Audit, Replenishment, Notification, Reporting
  - Ensure all tests pass for these services. Verify Kafka event flows end-to-end with docker-compose. Ask the user if questions arise.

- [ ] 14. AI Service — Anomaly Detection
  - [ ] 14.1 Implement AI Service database schema and Alembic migrations
    - Create `anomaly_alerts`, `ai_query_log`, `product_embeddings` tables per design schema
    - Enable `pgvector` extension
    - _Requirements: 10.1_

  - [ ] 14.2 Implement transaction anomaly detection model and alert pipeline
    - Kafka consumer: consume `sale.completed` events
    - Feature extraction: amount, quantity, time-of-day, outlet_id, sku_id, day-of-week
    - Isolation Forest model (scikit-learn): train on 90-day rolling window per outlet; retrain weekly via Celery beat
    - Flag transactions with anomaly score > 0.75; create `anomaly_alerts` record with confidence_score and deviation_details
    - Publish `ai.anomaly_detected` Kafka event
    - _Requirements: 10.1, 10.2, 10.5_

  - [ ]* 14.3 Write property tests for anomaly detection correctness
    - **Property 30: Anomaly Confidence Score Validity** — all anomaly alert records have confidence_score in [0.0, 1.0] and non-empty deviation_details
    - **Validates: Requirements 10.1, 10.2**

  - [ ] 14.4 Implement anomaly alert review and false-positive feedback endpoints
    - `GET /ai/anomalies` — list open anomaly alerts for user's outlet scope
    - `POST /ai/anomalies/{id}/resolve` — set status RESOLVED, resolved_by, resolved_at; emit audit event
    - `POST /ai/anomalies/{id}/false-positive` — set status FALSE_POSITIVE; store feedback for model retraining
    - Enforce: status change requires resolved_by to be non-null
    - _Requirements: 10.4, 10.6, 10.7_

  - [ ]* 14.5 Write property test for anomaly review gate
    - **Property 31: Anomaly Requires Review Before Close** — status cannot be RESOLVED or FALSE_POSITIVE without non-null resolved_by and resolved_at
    - **Validates: Requirements 10.4**

- [ ] 15. AI Service — Replenishment Recommendations
  - [ ] 15.1 Implement LightGBM replenishment recommendation model
    - Train LightGBM regression model on historical sales data (features: rolling velocity, day-of-week, seasonal index, outlet size)
    - Celery beat job: weekly retraining using last 12 months of sales data from Reporting DB
    - Generate AI recommendations for all SKUs at all outlets; store with source = 'AI_GENERATED' and ai_confidence_score
    - Publish recommendations to Replenishment_Service via Kafka `ai.replenishment_recommendation` topic
    - _Requirements: 8.3_

- [ ] 16. AI Service — Conversational Querying
  - [ ] 16.1 Implement LangChain conversational query endpoint with scope enforcement
    - `POST /ai/query` — accept natural language query; extract outlet_scope from JWT
    - LangChain agent with PostgreSQL read-only tool; LLM generates SQL
    - Scope injection: wrap all generated SQL with `WHERE outlet_id IN (outlet_scope)` before execution
    - PII post-processing: strip patient_id, doctor_name, prescription_ref from response
    - Log query + response to `ai_query_log`
    - Return structured "cannot answer" response when LLM confidence < threshold
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [ ]* 16.2 Write property test for conversational query scope enforcement
    - **Property 32: Conversational Query Scope Enforcement** — for any query, response data references only outlets in user's outlet_scope; out-of-scope data never appears
    - **Validates: Requirements 11.3**

- [ ] 17. Security hardening
  - [ ] 17.1 Implement PII/PHI encryption and log masking
    - Add AES-256-GCM encryption/decryption utilities in `shared/` for patient_id and prescription fields
    - Add structured logging middleware that masks PII fields (patient_id, email, phone, doctor_name) with anonymized tokens
    - _Requirements: 14.1, 14.3_

  - [ ] 17.2 Implement input validation and security headers
    - Enforce Pydantic v2 strict mode on all API request models
    - Add security headers middleware: `Content-Security-Policy`, `X-Content-Type-Options`, `Strict-Transport-Security`
    - Add PHI access logging: every read of prescription/patient data emits audit event
    - _Requirements: 14.5, 14.6_

- [ ] 18. Observability instrumentation
  - [ ] 18.1 Instrument all services with OpenTelemetry and Prometheus metrics
    - Add OpenTelemetry SDK to all services: trace every HTTP request and Kafka message with trace_id propagation
    - Expose `/metrics` Prometheus endpoint on each service with: `http_request_duration_seconds`, `http_requests_total`, `kafka_consumer_lag`, `db_query_duration_seconds`
    - Add structured JSON logging with trace_id, service_name, outlet_id, user_id, response_status on every request
    - _Requirements: 15.1, 15.2, 15.3_

  - [ ] 18.2 Create Kubernetes manifests and HPA configurations
    - Write `Deployment`, `Service`, `ConfigMap`, `Secret` manifests for all 10 services
    - Write HPA manifests for Sales_Service (min 3, max 20), Inventory_Service (min 2, max 10), API_Gateway (min 3, max 15)
    - Write `PodDisruptionBudget` for Sales_Service and Auth_Service (minAvailable: 2)
    - Configure rolling update strategy: `maxSurge: 1, maxUnavailable: 0`
    - _Requirements: 16.1, 16.2, 16.4, 16.5_

  - [ ] 18.3 Create Grafana dashboard definitions and alerting rules
    - Write Grafana dashboard JSON for: per-service error rate, p99 latency, Kafka consumer lag, DB connection pool utilization
    - Write Prometheus alerting rules: error_rate > 1% over 5m, p99 latency > SLA for 3m, Kafka lag > 10000
    - _Requirements: 15.4, 15.5_

- [ ] 19. Final checkpoint — Full integration
  - Ensure all service tests pass. Run full end-to-end test: login → checkout → transfer → replenishment → report → AI query. Verify Kafka event flows, audit trail completeness, and RBAC enforcement. Ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use Python `hypothesis` library with `@settings(max_examples=100)` minimum
- All property tests must include the comment: `# Feature: pharmora, Property N: <property_text>`
- Alembic migrations run as Kubernetes Jobs before each service deployment rollout
- All services use SQLAlchemy async ORM with asyncpg driver for non-blocking DB access
