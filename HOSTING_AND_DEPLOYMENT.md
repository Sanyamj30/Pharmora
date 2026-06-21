# Pharmora: Production Hosting & Cloud Architecture Guide

This document outlines the hosting options, recommended cloud architectures, managed database/caching services, and DNS/SSL routing strategies for running **Pharmora** in a production-grade environment.

---

## 1. High-Level Production Hosting Architecture

For a regional healthcare retail chain with 180 outlets and 12 hubs, a highly available, multi-AZ (Availability Zone) cloud architecture is required. Below is the standard hosting blueprint utilizing AWS (Amazon Web Services) as the example cloud provider.

```
                  [ User Browser / Client App ]
                                |
                        ( HTTPS / Port 443 )
                                |
                    [ Route 53 (DNS Routing) ]
                                |
                    [ AWS WAF (Web Application Firewall) ]
                                |
             [ Application Load Balancer (ALB) ]
                                |
        +-----------------------v-----------------------+
        |                  Public Subnet                |
        |  [ Nginx Ingress Controller / ALB Ingress ]   |
        +-----------------------|-----------------------+
                                |
                                | (Private Routing)
                                |
  +-----------------------------v-----------------------------+
  |                        Private Subnet                     |
  |                                                           |
  |   Kubernetes Cluster (Amazon EKS)                         |
  |   +---------------------------------------------------+   |
  |   | [api-gateway]       [auth-svc]      [sales-svc]   |   |
  |   | [inventory-svc]     [frontend]      (Autoscaling) |   |
  |   +---------------------------------------------------+   |
  +-----------------------------|-----------------------------+
                                |
        +-----------------------+-----------------------+
        |                                               |
  +-----v-----------------------+                 +-----v-----------------------+
  |       Database Subnet       |                 |        Cache & Messaging    |
  |                             |                 |                             |
  |  [ Amazon RDS PostgreSQL ]  |                 |  [ ElastiCache Redis ]      |
  |  (Multi-AZ Replication)     |                 |  (Clustered, High-Avail)    |
  |                             |                 |                             |
  |                             |                 |  [ Amazon MSK (Kafka) ]     |
  +-----------------------------+                 +-----------------------------+
```

---

## 2. Cloud Provider Hosting Options

You can host Pharmora on any major cloud provider using fully managed services to reduce operational overhead.

### Option A: Amazon Web Services (AWS)
* **Compute (Microservices & Gateway)**: **Amazon Elastic Kubernetes Service (EKS)**. Configured with a managed node group spanning three Availability Zones. Uses Horizontal Pod Autoscaler (HPA) to scale nodes dynamically.
* **Databases**: **Amazon RDS for PostgreSQL 15** with Multi-AZ deployment enabled (automatic failover).
* **Caching & Rate Limiting**: **Amazon ElastiCache for Redis** (managed cluster).
* **Message Broker (Kafka)**: **Amazon Managed Streaming for Apache Kafka (MSK)**.
* **Storage (Secrets & Certs)**: **AWS Secrets Manager** (storing private JWT keys, DB passwords) and **AWS Certificate Manager (ACM)** for SSL certificates.

### Option B: Microsoft Azure
* **Compute**: **Azure Kubernetes Service (AKS)**.
* **Databases**: **Azure Database for PostgreSQL (Flexible Server)** with high availability.
* **Caching**: **Azure Cache for Redis**.
* **Message Broker**: **Azure Event Hubs** (using the Kafka protocol endpoint, allowing zero-change compatibility with our Kafka code).
* **Storage**: **Azure Key Vault** for secret management.

### Option C: Google Cloud Platform (GCP)
* **Compute**: **Google Kubernetes Engine (GKE)**.
* **Databases**: **Cloud SQL for PostgreSQL**.
* **Caching**: **Google Cloud Memorystore for Redis**.
* **Message Broker**: **Google Cloud Pub/Sub** (via a Kafka connector) or self-hosted Strimzi Kafka operator on GKE.
* **Storage**: **GCP Secret Manager**.

---

## 3. Step-by-Step Production Hosting Setup

### Step 3.1: Network isolation (VPC & Subnets)
To comply with healthcare data guidelines (HIPAA, GxP), the database and services must never be directly exposed to the public internet:
1. **Public Subnet**: Holds the load balancers and Ingress controllers.
2. **Private Subnet**: Holds the EKS/AKS workers running the backend services.
3. **Database Subnet**: Holds the PostgreSQL and Redis clusters, accessible only by security groups attached to the private subnet.

### Step 3.2: Domain, DNS, and SSL Setup
1. **Domain Registration**: Register your domain (e.g., `pharmorapro.com`) via Route 53 or Cloudflare.
2. **SSL Termination**: 
   - Provision an SSL certificate for `*.pharmorapro.com` using Let's Encrypt or AWS Certificate Manager (ACM).
   - Attach the SSL certificate to the Application Load Balancer (ALB). The ALB decrypts incoming HTTPS traffic and routes it as internal HTTP to the ingress controller.

### Step 3.3: Production Data Migration & Seeding
In production, do not run SQLite. You must configure the environment variable `DATABASE_URL` pointing to your managed PostgreSQL database:
```bash
DATABASE_URL=postgresql+asyncpg://db_user:secure_password@db-rds-hostname:5432/pharmorad
```
Run migrations via Alembic before starting the application pods:
```bash
alembic -c services/auth_service/alembic.ini upgrade head
```

---

## 4. Cost, Scalability, and Monitoring Estimates

### Cost Optimization:
* Use **ARM64 (AWS Graviton) nodes** for EKS and RDS (e.g., `m6g.xlarge`). They provide ~40% better price-performance compared to standard x86 instances.
* Configure **Spot Instances** for stateless components (frontend, sales service pods) and **On-Demand/Reserved Instances** for stateful components (databases).

### Observability:
* **Metrics**: Connect the Prometheus/Grafana agent to EKS to gather latency metrics (alerting if `p99` latency exceeds 3 seconds).
* **Logs**: Deploy a FluentBit daemonset on the Kubernetes nodes to forward all microservice logs directly to Amazon CloudWatch or Elasticsearch.
