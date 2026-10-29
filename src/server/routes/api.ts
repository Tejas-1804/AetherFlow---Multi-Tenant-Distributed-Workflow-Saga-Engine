import { Router } from 'express';
import { MultiTenantMongoManager } from '../db/mongo-manager.js';
import { DAGValidator } from '../engine/dag-validator.js';
import { SagaCoordinator } from '../engine/saga-coordinator.js';
import { createAuthMiddleware, requireRole } from '../middleware/auth.js';
import { createTenantMiddleware, TenantContextRequest } from '../middleware/tenant-context.js';

export function createApiRouter(sagaCoordinator: SagaCoordinator): Router {
  const router = Router();
  const dbManager = MultiTenantMongoManager.getInstance();

  // Public Health check
  router.get('/health', async (_req, res) => {
    res.json({
      status: 'UP',
      engine: 'AetherFlow Distributed Saga Workflow Engine',
      version: '2.4.0',
      timestamp: new Date().toISOString(),
      cluster: 'Production-Ready Simulated Multi-Tenant Cluster',
    });
  });

  // Apply Tenant Context & Authentication middleware to all /api routes below
  const tenantMiddleware = createTenantMiddleware();
  const authMiddleware = createAuthMiddleware();

  router.use(tenantMiddleware);
  router.use(authMiddleware);

  /**
   * TENANT MANAGEMENT & ISOLATION STRATEGY
   */
  router.get('/tenants', async (_req: TenantContextRequest, res) => {
    const tenants = await dbManager.getTenants();
    res.json(tenants);
  });

  router.put('/tenants/:tenantId/strategy', requireRole(['SUPER_ADMIN', 'TENANT_ADMIN']), async (req: TenantContextRequest, res) => {
    const { tenantId } = req.params;
    const { strategy } = req.body;

    if (strategy !== 'discriminator_key' && strategy !== 'dynamic_connection_pool') {
      res.status(400).json({ error: 'INVALID_STRATEGY', message: 'Strategy must be discriminator_key or dynamic_connection_pool' });
      return;
    }

    const updated = await dbManager.updateTenantStrategy(tenantId, strategy);

    await dbManager.logAudit({
      tenantId,
      actor: {
        userId: 'admin_sys',
        email: req.userEmail || 'admin@orchestration.engine',
        role: req.userRole || 'TENANT_ADMIN',
      },
      action: 'UPDATE_ISOLATION_STRATEGY',
      resource: 'tenants',
      resourceId: tenantId,
      details: { newStrategy: strategy },
      ipAddress: req.ip || '127.0.0.1',
    });

    res.json(updated);
  });

  router.get('/tenants/:tenantId/benchmark', async (req: TenantContextRequest, res) => {
    const { tenantId } = req.params;
    const tenant = await dbManager.getTenantConfig(tenantId);
    const strategy = tenant?.isolationStrategy || 'discriminator_key';

    // Architectural Simulation Benchmark
    const simulatedMetrics = strategy === 'discriminator_key'
      ? {
          strategy: 'discriminator_key',
          strategyLabel: 'Shared Cluster with Discriminator Key (tenantId)',
          storageFootprintMB: 4.2,
          activeDbConnections: 1, // Single shared pool connection
          readLatencyP95Ms: 3.8,
          writeLatencyP95Ms: 7.2,
          crossTenantIsolationScore: 'Logical (Query-Level Compound Index { tenantId: 1, status: 1 })',
          riskLevel: 'Low (Strict query filtering enforced by ORM/Repository layer)',
          maxTenantsPerCluster: '10,000+',
          recommendedFor: 'Cost-sensitive SaaS, mid-market tiers, high tenant density',
        }
      : {
          strategy: 'dynamic_connection_pool',
          strategyLabel: 'Dynamic Multi-Database Connection Pool (db_tenant_xxx)',
          storageFootprintMB: 18.5,
          activeDbConnections: 12, // Dedicated pooled connections per tenant
          readLatencyP95Ms: 1.9,
          writeLatencyP95Ms: 4.5,
          crossTenantIsolationScore: 'Physical (Complete Dedicated Database Isolation)',
          riskLevel: 'Zero (Physical DB barrier, separate encryption keys & backup snapshots)',
          maxTenantsPerCluster: '250 - 500 (bounded by MongoDB connection handles)',
          recommendedFor: 'Enterprise Tier, HIPAA / SOC-2 / PCI-DSS compliance, customized retention',
        };

    res.json(simulatedMetrics);
  });

  /**
   * WORKFLOWS CRUD & VALIDATION
   */
  router.get('/workflows', async (req: TenantContextRequest, res) => {
    const tenantId = req.tenantId!;
    const workflows = await dbManager.getWorkflows(tenantId);
    res.json(workflows);
  });

  router.get('/workflows/:id', async (req: TenantContextRequest, res) => {
    const tenantId = req.tenantId!;
    const workflow = await dbManager.getWorkflow(tenantId, req.params.id);
    if (!workflow) {
      res.status(404).json({ error: 'WORKFLOW_NOT_FOUND', message: 'Workflow not found for this tenant.' });
      return;
    }
    res.json(workflow);
  });

  router.post('/workflows/validate', async (req: TenantContextRequest, res) => {
    const { nodes, edges } = req.body;
    const result = DAGValidator.validate(nodes || [], edges || []);
    res.json(result);
  });

  router.post('/workflows', async (req: TenantContextRequest, res) => {
    const tenantId = req.tenantId!;
    const workflowData = req.body;

    // Validate DAG before saving
    const validation = DAGValidator.validate(workflowData.nodes || [], workflowData.edges || []);
    if (!validation.isValid) {
      res.status(400).json({
        error: 'DAG_VALIDATION_FAILED',
        message: 'Workflow graph failed DAG validation checks.',
        details: validation.errors,
      });
      return;
    }

    const workflowToSave = {
      ...workflowData,
      tenantId,
      updatedAt: new Date().toISOString(),
      createdAt: workflowData.createdAt || new Date().toISOString(),
    };

    const saved = await dbManager.saveWorkflow(workflowToSave);

    await dbManager.logAudit({
      tenantId,
      actor: {
        userId: 'actor_id',
        email: req.userEmail || 'admin@acme.com',
        role: req.userRole || 'TENANT_ADMIN',
      },
      action: 'SAVE_WORKFLOW',
      resource: 'workflows',
      resourceId: saved.id,
      details: { name: saved.name, version: saved.version },
      ipAddress: req.ip || '127.0.0.1',
    });

    res.status(201).json({ workflow: saved, validation });
  });

  router.delete('/workflows/:id', async (req: TenantContextRequest, res) => {
    const tenantId = req.tenantId!;
    const deleted = await dbManager.deleteWorkflow(tenantId, req.params.id);
    res.json({ success: deleted });
  });

  /**
   * SAGA EXECUTION ENGINE
   */
  router.post('/workflows/:id/execute', async (req: TenantContextRequest, res) => {
    const tenantId = req.tenantId!;
    const workflow = await dbManager.getWorkflow(tenantId, req.params.id);

    if (!workflow) {
      res.status(404).json({ error: 'WORKFLOW_NOT_FOUND', message: 'Workflow not found.' });
      return;
    }

    const { payload, simulateFailureAtNodeId } = req.body;

    // Trigger asynchronous Saga execution in background
    sagaCoordinator
      .executeWorkflow(workflow, payload || {}, { simulateFailureAtNodeId })
      .catch((err) => console.error('Saga execution error:', err));

    res.status(202).json({
      message: 'Saga workflow execution scheduled and running.',
      workflowId: workflow.id,
      tenantId,
      simulatingFailureAtNodeId: simulateFailureAtNodeId || null,
    });
  });

  /**
   * EXECUTIONS & TRACES
   */
  router.get('/executions', async (req: TenantContextRequest, res) => {
    const tenantId = req.tenantId!;
    const executions = await dbManager.getExecutions(tenantId);
    res.json(executions);
  });

  router.get('/executions/:id', async (req: TenantContextRequest, res) => {
    const tenantId = req.tenantId!;
    const execution = await dbManager.getExecution(tenantId, req.params.id);
    if (!execution) {
      res.status(404).json({ error: 'EXECUTION_NOT_FOUND', message: 'Execution trace not found.' });
      return;
    }
    res.json(execution);
  });

  /**
   * DEAD LETTER QUEUE (DLQ)
   */
  router.get('/dlq', async (req: TenantContextRequest, res) => {
    const tenantId = req.tenantId!;
    const items = await dbManager.getDLQItems(tenantId);
    res.json(items);
  });

  router.post('/dlq/:id/replay', async (req: TenantContextRequest, res) => {
    const tenantId = req.tenantId!;
    const items = await dbManager.getDLQItems(tenantId);
    const item = items.find((i) => i.id === req.params.id);

    if (!item) {
      res.status(404).json({ error: 'DLQ_ITEM_NOT_FOUND', message: 'DLQ record not found.' });
      return;
    }

    const workflow = await dbManager.getWorkflow(tenantId, item.workflowId);
    if (!workflow) {
      res.status(404).json({ error: 'WORKFLOW_NOT_FOUND', message: 'Origin workflow not found for replay.' });
      return;
    }

    await dbManager.resolveDLQItem(item.id, 'replayed');

    // Redrive execution without simulated failure
    sagaCoordinator
      .executeWorkflow(workflow, item.payloadSnapshot || {})
      .catch((err) => console.error('DLQ replay error:', err));

    res.json({ message: 'DLQ item replayed into Saga engine.', id: item.id });
  });

  router.post('/dlq/:id/discard', async (req: TenantContextRequest, res) => {
    await dbManager.resolveDLQItem(req.params.id, 'discarded');
    res.json({ message: 'DLQ item marked as discarded.' });
  });

  /**
   * CRYPTOGRAPHIC API KEYS
   */
  router.get('/keys', async (req: TenantContextRequest, res) => {
    const keys = await dbManager.getApiKeys(req.tenantId!);
    res.json(keys);
  });

  router.post('/keys', async (req: TenantContextRequest, res) => {
    const { name, scopes } = req.body;
    const { keyRecord, rawSecret } = await dbManager.createApiKey(
      req.tenantId!,
      name || 'Production Service API Key',
      scopes || ['workflows:read', 'workflows:execute']
    );

    await dbManager.logAudit({
      tenantId: req.tenantId!,
      actor: {
        userId: 'actor_id',
        email: req.userEmail || 'admin@acme.com',
        role: req.userRole || 'TENANT_ADMIN',
      },
      action: 'GENERATE_API_KEY',
      resource: 'api_keys',
      resourceId: keyRecord.id,
      details: { prefix: keyRecord.keyPrefix, scopes },
      ipAddress: req.ip || '127.0.0.1',
    });

    res.status(201).json({ keyRecord, rawSecret });
  });

  router.delete('/keys/:id', async (req: TenantContextRequest, res) => {
    await dbManager.revokeApiKey(req.tenantId!, req.params.id);
    res.json({ message: 'API Key revoked successfully.' });
  });

  /**
   * AUDIT LOGS
   */
  router.get('/audit', async (req: TenantContextRequest, res) => {
    const logs = await dbManager.getAuditLogs(req.tenantId!);
    res.json(logs);
  });

  /**
   * MOCK MICROSERVICES (Simulating external distributed services for Saga testing)
   */
  router.post('/mock/payment/charge', (req, res) => {
    res.json({
      status: 'SUCCESS',
      transactionId: `txn_ch_${Date.now()}`,
      chargedAt: new Date().toISOString(),
    });
  });

  router.post('/mock/payment/refund', (req, res) => {
    res.json({
      status: 'REFUNDED',
      refundId: `ref_${Date.now()}`,
      refundedAt: new Date().toISOString(),
    });
  });

  router.post('/mock/inventory/reserve', (req, res) => {
    res.json({
      status: 'RESERVED',
      reservationRef: `hold_${Date.now()}`,
      reservedAt: new Date().toISOString(),
    });
  });

  router.post('/mock/inventory/release', (req, res) => {
    res.json({
      status: 'RELEASED',
      releasedAt: new Date().toISOString(),
    });
  });

  router.post('/mock/shipping/create-label', (req, res) => {
    res.json({
      status: 'CREATED',
      waybill: `TRK-${Math.floor(100000 + Math.random() * 900000)}`,
      createdAt: new Date().toISOString(),
    });
  });

  router.post('/mock/shipping/cancel-label', (req, res) => {
    res.json({
      status: 'VOIDED',
      cancelledAt: new Date().toISOString(),
    });
  });

  router.post('/mock/crm/create-customer', (req, res) => {
    res.json({
      status: 'CREATED',
      customerId: `cus_${Date.now()}`,
      createdAt: new Date().toISOString(),
    });
  });

  router.post('/mock/crm/archive-customer', (req, res) => {
    res.json({
      status: 'ARCHIVED',
      archivedAt: new Date().toISOString(),
    });
  });

  return router;
}
