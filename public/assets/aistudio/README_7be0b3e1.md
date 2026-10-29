# Multi-Tenant Distributed Workflow & Saga Orchestration Engine

An enterprise-grade, student-friendly distributed workflow orchestration engine inspired by **Temporal** and **Zapier**. Built with React Flow, Node.js, Express, WebSockets, MongoDB, and Docker.

---

## Architecture Overview

```
                      ┌────────────────────────────────────────┐
                      │          React SPA Dashboard           │
                      │    (Visual DAG Builder, Live Trace)    │
                      └──────────────────┬─────────────────────┘
                                         │  HTTP / WebSocket (/ws)
                                         ▼
                      ┌────────────────────────────────────────┐
                      │         Express API Gateway            │
                      │ (Auth, RBAC, Rate Limiting, Tenancy)   │
                      └──────────────────┬─────────────────────┘
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   ▼                                           ▼
       ┌───────────────────────┐                   ┌───────────────────────┐
       │   Workflow Engine     │                   │  Change Stream / Bus  │
       │ (State Machine, DAG)  │                   │   (MongoDB / Redis)   │
       └───────────┬───────────┘                   └───────────────────────┘
                   │
         ┌─────────┴─────────┐
         ▼                   ▼
┌──────────────────┐┌──────────────────┐
│  Worker Pool     ││  Saga Coordinator│
│(VM Sandbox, HTTP)││(LIFO Rollbacks)  │
└────────┬─────────┘└────────┬─────────┘
         │                   │
         └─────────┬─────────┘
                   ▼
┌──────────────────────────────────────┐
│       Dead Letter Queue (DLQ)        │
│   (Max Attempt Exhaustion Store)     │
└──────────────────────────────────────┘
```

---

## Key Features

1. **Multi-Tenant Architecture**: Strict organizational isolation. Documents contain `tenantId`, verified by database query filtering and JWT / API-key middleware.
2. **Visual DAG Workflow Builder**: Powered by `@xyflow/react`. Create, connect, configure, duplicate, and validate nodes visually.
3. **DAG Cycle & Reachability Validation**: Detects circular loops (White-Gray-Black DFS graph coloring), unreachable orphan nodes, missing START/END nodes, and broken condition branches.
4. **Saga Orchestration Pattern**: If downstream operations fail after retry exhaustion, compensating actions execute in reverse topological order (LIFO) to guarantee eventual consistency.
5. **Exponential Backoff Retry Engine**: Configurable retry policies with initial delays, multipliers, and jitter for transient errors (500, 502, 503, 504, timeouts).
6. **Dead Letter Queue (DLQ)**: Retains unrecoverable failed jobs for root-cause inspection and manual replay.
7. **Sandboxed Code Transformations**: Executes arbitrary JavaScript transformation scripts in isolated VM contexts with strict execution timeouts.
8. **Real-Time WebSocket Tracing**: Live node status changes, retry attempts, Saga rollbacks, and event streams.
9. **Role-Based Access Control (RBAC)**: Support for `SUPER_ADMIN`, `TENANT_ADMIN`, and `TENANT_USER`.
10. **Secure API Key Management**: Keys prefixed with `wk_live_`, hashed with SHA-256 before storage.
11. **Tenant Rate Limiting**: Per-tenant sliding window request limiting with HTTP 429 backpressure.

---

## Quick Start

### Local Development
```bash
# 1. Install dependencies
npm install

# 2. Start full-stack development server (Express + Vite on Port 3000)
npm run dev

# 3. Run automated tests
npx tsx test/workflow-engine.test.ts
```

### Docker Compose
```bash
docker-compose up --build
```

---

## Seed Accounts (1-Click Switchable in UI)

| Role | Name | Email | Password | Organization |
| :--- | :--- | :--- | :--- | :--- |
| **TENANT_ADMIN** | Tejas | `tejas@acme.com` | `Tejas123!` | Acme Logistics Global |
| **TENANT_ADMIN** | Amaan | `amaan@cyberdyne.com` | `Amaan123!` | Cyberdyne Systems Corp |
| **TENANT_ADMIN** | Priyanka | `priyanka@quantum.io` | `Priyanka123!` | Quantum Dynamics Corp |
| **TENANT_ADMIN** | Rinkle Sharma | `rinkle@helios.net` | `Rinkle123!` | Helios Cloud Systems |
| **SUPER_ADMIN** | System Administrator | `superadmin@orchestration.engine` | `Admin123!` | Platform Global |

---

## Demonstration Scenarios

### 1. Success Scenario
Execute the pre-loaded **E-Commerce Order Processing** workflow:
- Captures Payment via HTTP
- Reserves Warehouse Inventory
- Evaluates Condition (In Stock)
- Creates Carrier Waybill
- Formats Invoice in VM Sandbox
- Terminal state: **SUCCESS**

### 2. Saga Rollback & DLQ Failure Scenario
Click **"Simulate Failure & Rollback"** on the dashboard:
- Payment Capture: **SUCCESS**
- Inventory Reservation: **SUCCESS**
- Carrier Waybill: **FAILS** (Simulated 500 error)
- System retries 3 times with exponential backoff
- Retries exhausted -> enqueued to **Dead Letter Queue**
- **Saga Compensation Coordinator** begins reverse rollback:
  - 1. Release Inventory (Compensated)
  - 2. Refund Payment (Compensated)
- Final state: **COMPENSATED** (Eventual consistency preserved!)
