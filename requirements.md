# Requirements Document

## Introduction

Pharmora is a scalable microservices-based web application for a fast-growing regional healthcare retail chain operating 180 pharmacy outlets and 12 distribution hubs across three states. The platform supports secure multi-role access, end-to-end store operations, prescription-linked sales, real-time inventory management, inter-branch transfers, replenishment planning, business intelligence reporting, and agentic AI capabilities. The system is built on a Python stack with PostgreSQL and is designed for containerized, horizontally scalable deployment in a regulated pharmacy environment.

---

## Glossary

- **System**: The Pharmora platform as a whole
- **Auth_Service**: The microservice responsible for authentication and authorization
- **Inventory_Service**: The microservice responsible for stock, batch, and expiry management
- **Sales_Service**: The microservice responsible for POS transactions, invoicing, and prescription-linked sales
- **Transfer_Service**: The microservice responsible for inter-branch and hub-to-branch stock transfers
- **Replenishment_Service**: The microservice responsible for stock replenishment planning and AI recommendations
- **Reporting_Service**: The microservice responsible for BI dashboards, sales analytics, and demand trends
- **AI_Service**: The microservice responsible for anomaly detection, replenishment recommendations, and conversational querying
- **Notification_Service**: The microservice responsible for alerts, notifications, and escalations
- **Audit_Service**: The microservice responsible for immutable audit logging across all services
- **API_Gateway**: The entry-point service that routes, authenticates, and rate-limits all external requests
- **Regional_Admin**: A user role with full administrative access across all outlets in an assigned region
- **Pharmacist**: A user role with access to prescription validation, dispensing, and sales workflows
- **Inventory_Controller**: A user role with access to stock management, transfers, and replenishment
- **Finance_Manager**: A user role with access to invoicing, financial reports, and margin analytics
- **Outlet**: A single pharmacy retail location
- **Hub**: A distribution center that supplies multiple outlets
- **SKU**: Stock Keeping Unit — a unique identifier for a product
- **Batch**: A specific production lot of a product with a unique batch number and expiry date
- **Prescription**: A licensed medical practitioner's written order for a regulated medication
- **PII**: Personally Identifiable Information — customer name, contact, and health data
- **PHI**: Protected Health Information — prescription and dispensing records
- **JWT**: JSON Web Token used for stateless authentication
- **RBAC**: Role-Based Access Control
- **SLA**: Service Level Agreement
- **PBT**: Property-Based Testing

---

## Requirements

### Requirement 1: User Authentication and Session Management

**User Story:** As a system user, I want to securely log in and maintain an authenticated session, so that only authorized personnel can access the platform.

#### Acceptance Criteria

1. WHEN a user submits valid credentials, THE Auth_Service SHALL issue a signed JWT access token and a refresh token within 500ms.
2. WHEN a user submits invalid credentials, THE Auth_Service SHALL return an error response and increment the failed-attempt counter for that account.
3. WHEN a user account exceeds 5 consecutive failed login attempts within 15 minutes, THE Auth_Service SHALL lock the account and notify the Regional_Admin.
4. WHEN a JWT access token expires, THE Auth_Service SHALL accept a valid refresh token and issue a new access token without requiring re-login.
5. WHEN a refresh token is used, THE Auth_Service SHALL invalidate the previous refresh token and issue a new one (token rotation).
6. WHEN a user logs out, THE Auth_Service SHALL invalidate the active refresh token immediately.
7. THE Auth_Service SHALL enforce HTTPS for all authentication endpoints.
8. WHEN a JWT is presented to any service, THE API_Gateway SHALL validate the token signature and expiry before forwarding the request.

---

### Requirement 2: Role-Based Access Control

**User Story:** As a Regional_Admin, I want to assign roles to users and control their access to system features, so that each user can only perform actions appropriate to their responsibilities.

#### Acceptance Criteria

1. THE Auth_Service SHALL support the following roles: Regional_Admin, Pharmacist, Inventory_Controller, and Finance_Manager.
2. WHEN a user attempts an action, THE API_Gateway SHALL verify that the user's role includes the required permission before routing the request.
3. IF a user attempts an action outside their role's permissions, THEN THE API_Gateway SHALL return a 403 Forbidden response and log the attempt.
4. THE Auth_Service SHALL allow a Regional_Admin to create, update, deactivate, and assign roles to user accounts within their region.
5. WHEN a user account is deactivated, THE Auth_Service SHALL immediately invalidate all active tokens for that account.
6. THE System SHALL enforce outlet-level scoping so that a user can only access data for outlets within their assigned scope.
7. WHERE multi-region access is granted, THE Auth_Service SHALL include all authorized outlet identifiers in the JWT claims.

---

### Requirement 3: Real-Time Inventory Management

**User Story:** As an Inventory_Controller, I want to view and manage stock levels across all outlets and hubs in real time, so that I can prevent stockouts and overstock situations.

#### Acceptance Criteria

1. THE Inventory_Service SHALL maintain a current stock quantity for every SKU at every outlet and hub.
2. WHEN a sale is completed, THE Inventory_Service SHALL decrement the stock quantity for the sold SKU and batch at the outlet within 2 seconds.
3. WHEN a stock receipt is recorded, THE Inventory_Service SHALL increment the stock quantity for the received SKU and batch at the outlet or hub.
4. WHEN stock for a SKU at an outlet falls below the configured reorder point, THE Inventory_Service SHALL emit a low-stock event to the Notification_Service.
5. THE Inventory_Service SHALL provide a real-time stock query API that returns current quantities for a given outlet and SKU within 300ms under normal load.
6. WHEN a stock adjustment is made, THE Inventory_Service SHALL record the adjustment reason, quantity delta, user, and timestamp in the Audit_Service.
7. THE Inventory_Service SHALL support concurrent stock updates without producing negative stock quantities.

---

### Requirement 4: Batch and Expiry Tracking

**User Story:** As an Inventory_Controller, I want to track stock by batch number and expiry date, so that I can ensure FEFO (First Expiry First Out) dispensing and prevent expired product sales.

#### Acceptance Criteria

1. THE Inventory_Service SHALL associate every stock unit with a batch number, manufacturing date, and expiry date.
2. WHEN a sale is processed, THE Sales_Service SHALL select the batch with the earliest expiry date for the given SKU at the outlet (FEFO).
3. WHEN a batch's expiry date is within 90 days, THE Inventory_Service SHALL emit an expiry-warning event to the Notification_Service.
4. WHEN a batch's expiry date is within 30 days, THE Inventory_Service SHALL emit an urgent-expiry event to the Notification_Service.
5. IF a sale is attempted for a batch whose expiry date has passed, THEN THE Sales_Service SHALL reject the transaction and log the attempt.
6. THE Inventory_Service SHALL provide a batch query API that returns all batches for a SKU at an outlet, sorted by expiry date ascending.
7. WHEN a batch is fully dispensed, THE Inventory_Service SHALL mark the batch as exhausted and retain the record for audit purposes.

---

### Requirement 5: Prescription-Linked Sales and Dispensing

**User Story:** As a Pharmacist, I want to link sales of regulated medications to valid prescriptions, so that dispensing is compliant with pharmacy regulations.

#### Acceptance Criteria

1. WHEN a sale includes a Schedule H or Schedule X drug, THE Sales_Service SHALL require a valid prescription reference before completing the transaction.
2. WHEN a prescription is submitted, THE Sales_Service SHALL validate that the prescription has not been previously fully dispensed.
3. WHEN a prescription is partially dispensed, THE Sales_Service SHALL record the dispensed quantity and update the remaining dispensable quantity.
4. WHEN a prescription is fully dispensed, THE Sales_Service SHALL mark it as closed and prevent further dispensing against it.
5. THE Sales_Service SHALL store the prescribing doctor's name, registration number, and prescription date for every prescription-linked sale.
6. WHEN a prescription-linked sale is completed, THE Audit_Service SHALL record the full dispensing event including patient identifier, drug, quantity, batch, and pharmacist.
7. THE Sales_Service SHALL allow a Pharmacist to query the dispensing history for a given prescription reference.

---

### Requirement 6: Point-of-Sale and Invoicing

**User Story:** As a Pharmacist, I want to process sales transactions and generate invoices quickly, so that customer checkout is efficient and accurate.

#### Acceptance Criteria

1. WHEN a sale is initiated, THE Sales_Service SHALL support adding multiple line items (SKU, quantity, batch) to a single transaction.
2. WHEN a sale is finalized, THE Sales_Service SHALL calculate the total amount including applicable taxes and discounts and generate a unique invoice number.
3. WHEN an invoice is generated, THE Sales_Service SHALL persist the invoice with all line items, taxes, discounts, payment method, and outlet identifier.
4. THE Sales_Service SHALL complete a standard checkout transaction (up to 10 line items) within 3 seconds end-to-end under normal load.
5. WHEN a payment is recorded, THE Sales_Service SHALL support cash, card, and UPI payment methods.
6. IF a sale transaction fails after stock has been reserved, THEN THE Sales_Service SHALL release the reserved stock and restore inventory levels.
7. WHEN an invoice is generated, THE Sales_Service SHALL make it available for printing and digital delivery.
8. THE Sales_Service SHALL support voiding an invoice within 24 hours of creation, subject to Pharmacist or Regional_Admin authorization.

---

### Requirement 7: Inter-Branch Stock Transfers

**User Story:** As an Inventory_Controller, I want to initiate and track stock transfers between outlets and hubs, so that stock can be redistributed to meet demand.

#### Acceptance Criteria

1. WHEN a transfer is initiated, THE Transfer_Service SHALL create a transfer order with source outlet/hub, destination outlet/hub, SKU list, quantities, and batch references.
2. WHEN a transfer order is created, THE Transfer_Service SHALL decrement the available stock at the source and place it in an in-transit state.
3. WHEN a transfer is received at the destination, THE Transfer_Service SHALL increment the stock at the destination and close the transfer order.
4. IF a transfer is cancelled before dispatch, THEN THE Transfer_Service SHALL restore the reserved stock at the source.
5. THE Transfer_Service SHALL track the status of each transfer order through the states: DRAFT, APPROVED, DISPATCHED, RECEIVED, CANCELLED.
6. WHEN a transfer order changes state, THE Audit_Service SHALL record the state change, user, and timestamp.
7. THE Transfer_Service SHALL require Regional_Admin or Inventory_Controller approval before a transfer order moves to DISPATCHED state.
8. THE Transfer_Service SHALL provide a transfer history API for a given outlet or hub, filterable by date range and status.

---

### Requirement 8: Replenishment Planning

**User Story:** As an Inventory_Controller, I want to receive replenishment recommendations based on consumption patterns and stock levels, so that I can proactively order stock before stockouts occur.

#### Acceptance Criteria

1. THE Replenishment_Service SHALL calculate replenishment quantities for each SKU at each outlet based on average daily consumption and configured lead time.
2. WHEN stock for a SKU falls below the reorder point, THE Replenishment_Service SHALL generate a replenishment recommendation for that SKU and outlet.
3. THE AI_Service SHALL generate AI-assisted replenishment recommendations using historical sales data and seasonal demand patterns.
4. WHEN an AI-generated replenishment recommendation is produced, THE System SHALL require explicit human approval from an Inventory_Controller or Regional_Admin before a purchase order is raised.
5. THE Replenishment_Service SHALL allow an Inventory_Controller to accept, modify, or reject each replenishment recommendation.
6. WHEN a replenishment recommendation is accepted, THE Replenishment_Service SHALL generate a purchase order and notify the relevant Hub.
7. THE Replenishment_Service SHALL provide a dashboard showing all pending replenishment recommendations grouped by outlet and urgency.

---

### Requirement 9: Business Intelligence Reporting

**User Story:** As a Finance_Manager or Regional_Admin, I want to view sales, margin, and demand trend reports, so that I can make informed business decisions.

#### Acceptance Criteria

1. THE Reporting_Service SHALL provide a sales summary report showing total revenue, units sold, and transaction count by outlet, date range, and SKU category.
2. THE Reporting_Service SHALL provide a gross margin report showing revenue, cost of goods sold, and margin percentage by SKU and outlet.
3. THE Reporting_Service SHALL provide a demand trend report showing rolling 30-day and 90-day sales velocity per SKU per outlet.
4. WHEN a report is requested, THE Reporting_Service SHALL return results within 10 seconds for queries spanning up to 90 days of data.
5. THE Reporting_Service SHALL support exporting reports in CSV and PDF formats.
6. THE Reporting_Service SHALL provide a real-time sales dashboard showing today's revenue and transaction count per outlet, updated at most every 60 seconds.
7. WHERE a Finance_Manager accesses reports, THE Reporting_Service SHALL restrict visibility to financial data within their authorized region.

---

### Requirement 10: AI Anomaly Detection

**User Story:** As a Regional_Admin, I want the system to automatically detect suspicious transactions and stock variances, so that I can investigate and prevent fraud or errors.

#### Acceptance Criteria

1. THE AI_Service SHALL analyze completed sales transactions and flag those that deviate significantly from historical patterns for the same outlet, SKU, and time period.
2. WHEN a suspicious transaction is flagged, THE AI_Service SHALL emit an anomaly alert to the Notification_Service with a confidence score and the specific deviation details.
3. THE AI_Service SHALL analyze stock variance events (physical count vs. system count) and flag variances exceeding 5% for a given SKU at an outlet.
4. WHEN an anomaly alert is generated, THE System SHALL require a Regional_Admin to review and resolve the alert before it is closed.
5. THE AI_Service SHALL retain anomaly detection models and retrain them on a configurable schedule using recent transaction data.
6. WHEN an anomaly alert is resolved, THE Audit_Service SHALL record the resolution action, reviewer, and outcome.
7. THE AI_Service SHALL provide a false-positive feedback mechanism so that Regional_Admins can mark alerts as non-anomalous to improve model accuracy.

---

### Requirement 11: Conversational AI Querying

**User Story:** As a Regional_Admin or Finance_Manager, I want to query operational and financial data using natural language, so that I can get insights without writing reports manually.

#### Acceptance Criteria

1. THE AI_Service SHALL accept natural language queries about sales, inventory, and financial performance and return structured responses.
2. WHEN a conversational query is submitted, THE AI_Service SHALL respond within 5 seconds for queries that do not require full dataset scans.
3. THE AI_Service SHALL restrict query scope to data within the requesting user's authorized outlets and regions.
4. WHEN the AI_Service cannot confidently answer a query, THE AI_Service SHALL respond with a clear explanation of the limitation and suggest alternative queries.
5. THE AI_Service SHALL log all conversational queries and responses for audit and model improvement purposes.
6. THE AI_Service SHALL not expose PII or PHI in conversational query responses unless the requesting user has explicit authorization.

---

### Requirement 12: Notifications and Alerts

**User Story:** As a system user, I want to receive timely alerts for critical operational events, so that I can take action before issues escalate.

#### Acceptance Criteria

1. THE Notification_Service SHALL deliver alerts for low-stock, expiry warnings, anomaly detections, and transfer status changes.
2. WHEN an alert is generated, THE Notification_Service SHALL deliver it to the relevant user role within 30 seconds via in-app notification.
3. WHERE email delivery is configured, THE Notification_Service SHALL also send the alert via email.
4. WHEN a critical alert (urgent expiry, anomaly detection) is not acknowledged within 2 hours, THE Notification_Service SHALL escalate it to the Regional_Admin.
5. THE Notification_Service SHALL maintain a notification history per user, queryable for the last 90 days.
6. THE Notification_Service SHALL support marking notifications as read and acknowledged.

---

### Requirement 13: Audit Logging and Compliance

**User Story:** As a Regional_Admin, I want a complete, tamper-evident audit trail of all system actions, so that the platform meets pharmacy regulatory compliance requirements.

#### Acceptance Criteria

1. THE Audit_Service SHALL record every create, update, delete, and state-change event across all services with the user identifier, timestamp, service name, entity type, entity identifier, and before/after values.
2. THE Audit_Service SHALL store audit records in an append-only manner that prevents modification or deletion.
3. WHEN an audit record is written, THE Audit_Service SHALL confirm persistence before the originating service considers the operation complete.
4. THE Audit_Service SHALL provide a query API for audit records filterable by user, entity type, entity identifier, and date range.
5. THE Audit_Service SHALL retain audit records for a minimum of 7 years in compliance with pharmacy regulations.
6. IF an attempt is made to modify or delete an audit record, THEN THE Audit_Service SHALL reject the operation and log the attempt.

---

### Requirement 14: Security and Data Protection

**User Story:** As a Regional_Admin, I want all sensitive customer and prescription data to be protected at rest and in transit, so that the platform complies with healthcare data privacy regulations.

#### Acceptance Criteria

1. THE System SHALL encrypt all PII and PHI fields at rest using AES-256 encryption.
2. THE System SHALL enforce TLS 1.2 or higher for all inter-service and client-to-service communication.
3. THE System SHALL mask PII in all application logs, replacing identifiable fields with anonymized tokens.
4. WHEN a service accesses another service's data, THE API_Gateway SHALL enforce service-to-service authentication using mutual TLS or signed service tokens.
5. THE System SHALL perform input validation and sanitization on all API endpoints to prevent injection attacks.
6. THE Audit_Service SHALL log all access to PHI records including the accessing user, timestamp, and data scope.
7. THE System SHALL support configurable data retention policies per data category, with automated purging of expired records.

---

### Requirement 15: Observability and Monitoring

**User Story:** As a Regional_Admin or platform operator, I want comprehensive logs, metrics, and traces for all services, so that I can diagnose issues and ensure SLA compliance.

#### Acceptance Criteria

1. THE System SHALL emit structured JSON logs for every request, including trace ID, service name, outlet identifier, user identifier, and response status.
2. THE System SHALL expose Prometheus-compatible metrics endpoints for each service, including request latency, error rate, and queue depth.
3. THE System SHALL implement distributed tracing using OpenTelemetry, propagating trace context across all inter-service calls.
4. WHEN a service's error rate exceeds 1% over a 5-minute window, THE System SHALL trigger an alert to the operations team.
5. WHEN a service's p99 response latency exceeds its SLA threshold for 3 consecutive minutes, THE System SHALL trigger a latency alert.
6. THE System SHALL provide a centralized log aggregation endpoint compatible with the ELK stack or equivalent.
7. THE System SHALL retain metrics data for 30 days and log data for 90 days in the observability store.

---

### Requirement 16: Deployment and Scalability

**User Story:** As a platform operator, I want the system to be deployable in containers and scale horizontally, so that it can handle peak loads across 180 outlets without degradation.

#### Acceptance Criteria

1. THE System SHALL package each microservice as a Docker container with a defined resource request and limit.
2. THE System SHALL support horizontal pod autoscaling for all stateless services based on CPU utilization and request queue depth.
3. WHEN outlet count increases, THE System SHALL support onboarding new outlets without requiring service restarts or schema migrations on existing outlets.
4. THE System SHALL maintain 99.9% uptime for the Sales_Service and Auth_Service during business hours (6 AM to 11 PM).
5. THE System SHALL support zero-downtime deployments using rolling update strategies.
6. THE System SHALL use a message broker (e.g., Kafka or RabbitMQ) for asynchronous inter-service communication to decouple services and support load leveling.
7. THE System SHALL support database connection pooling to prevent connection exhaustion under peak load.
