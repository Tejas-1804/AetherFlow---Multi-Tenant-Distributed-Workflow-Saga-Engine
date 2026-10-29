import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  ApiKeyRecord,
  AuditLogRecord,
  DeadLetterQueueItem,
  IsolationStrategy,
  TenantConfig,
  WorkflowDefinition,
  WorkflowExecution,
} from '../../types/workflow.js';

export interface MongoChangeEvent<T = any> {
  _id: { _data: string };
  operationType: 'insert' | 'update' | 'replace' | 'delete';
  fullDocument?: T;
  documentKey: { _id: string };
  ns: { db: string; coll: string };
  updateDescription?: {
    updatedFields?: Record<string, any>;
    removedFields?: string[];
  };
  clusterTime: string;
}

export interface CollectionQueryOptions {
  limit?: number;
  skip?: number;
  sort?: Record<string, 1 | -1>;
}

// In-Memory Virtual Mongo Collection with compound index emulation and Change Stream support
export class MongoCollection<T extends { id?: string; _id?: string; tenantId?: string }> {
  private documents: Map<string, T> = new Map();
  private changeStreamEmitter = new EventEmitter();
  public name: string;
  public dbName: string;

  constructor(name: string, dbName: string) {
    this.name = name;
    this.dbName = dbName;
  }

  public getDocId(doc: T): string {
    return (doc.id || doc._id || '') as string;
  }

  public async findOne(query: Partial<T> & Record<string, any>): Promise<T | null> {
    const docs = await this.find(query, { limit: 1 });
    return docs.length > 0 ? docs[0] : null;
  }

  public async find(query: Partial<T> & Record<string, any> = {}, options: CollectionQueryOptions = {}): Promise<T[]> {
    const results: T[] = [];
    for (const doc of this.documents.values()) {
      if (this.matchesQuery(doc, query)) {
        results.push(JSON.parse(JSON.stringify(doc)));
      }
    }

    if (options.sort) {
      const [field, dir] = Object.entries(options.sort)[0];
      results.sort((a: any, b: any) => {
        const valA = a[field];
        const valB = b[field];
        if (valA === valB) return 0;
        if (valA > valB) return dir === 1 ? 1 : -1;
        return dir === 1 ? -1 : 1;
      });
    }

    const skip = options.skip || 0;
    const limit = options.limit ? options.limit : results.length;
    return results.slice(skip, skip + limit);
  }

  public async insertOne(doc: T): Promise<T> {
    const cloned = JSON.parse(JSON.stringify(doc));
    const docId = this.getDocId(cloned) || crypto.randomUUID();
    cloned.id = docId;
    cloned._id = docId;

    this.documents.set(docId, cloned);

    const changeEvent: MongoChangeEvent<T> = {
      _id: { _data: crypto.randomBytes(16).toString('hex') },
      operationType: 'insert',
      fullDocument: JSON.parse(JSON.stringify(cloned)),
      documentKey: { _id: docId },
      ns: { db: this.dbName, coll: this.name },
      clusterTime: new Date().toISOString(),
    };
    this.changeStreamEmitter.emit('change', changeEvent);
    return JSON.parse(JSON.stringify(cloned));
  }

  public async updateOne(
    query: Partial<T> & Record<string, any>,
    update: { $set?: Record<string, any>; $push?: Record<string, any> }
  ): Promise<boolean> {
    const existing = await this.findOne(query);
    if (!existing) return false;

    const docId = this.getDocId(existing);
    const updated = JSON.parse(JSON.stringify(existing));

    if (update.$set) {
      for (const [key, val] of Object.entries(update.$set)) {
        const parts = key.split('.');
        let curr: any = updated;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!curr[parts[i]]) curr[parts[i]] = {};
          curr = curr[parts[i]];
        }
        curr[parts[parts.length - 1]] = val;
      }
    }

    if (update.$push) {
      for (const [key, val] of Object.entries(update.$push)) {
        if (!Array.isArray(updated[key])) updated[key] = [];
        updated[key].push(val);
      }
    }

    this.documents.set(docId, updated);

    const changeEvent: MongoChangeEvent<T> = {
      _id: { _data: crypto.randomBytes(16).toString('hex') },
      operationType: 'update',
      fullDocument: JSON.parse(JSON.stringify(updated)),
      documentKey: { _id: docId },
      ns: { db: this.dbName, coll: this.name },
      updateDescription: {
        updatedFields: update.$set,
      },
      clusterTime: new Date().toISOString(),
    };
    this.changeStreamEmitter.emit('change', changeEvent);
    return true;
  }

  public async deleteOne(query: Partial<T> & Record<string, any>): Promise<boolean> {
    const existing = await this.findOne(query);
    if (!existing) return false;
    const docId = this.getDocId(existing);
    this.documents.delete(docId);

    const changeEvent: MongoChangeEvent<T> = {
      _id: { _data: crypto.randomBytes(16).toString('hex') },
      operationType: 'delete',
      documentKey: { _id: docId },
      ns: { db: this.dbName, coll: this.name },
      clusterTime: new Date().toISOString(),
    };
    this.changeStreamEmitter.emit('change', changeEvent);
    return true;
  }

  public async count(query: Partial<T> & Record<string, any> = {}): Promise<number> {
    const docs = await this.find(query);
    return docs.length;
  }

  public watch(pipeline?: Array<Record<string, any>>) {
    const stream = new EventEmitter();
    const listener = (event: MongoChangeEvent<T>) => {
      // Evaluate basic pipeline filter if provided (e.g. $match: { 'fullDocument.tenantId': ... })
      if (pipeline && pipeline.length > 0) {
        for (const stage of pipeline) {
          if (stage.$match) {
            for (const [matchKey, matchVal] of Object.entries(stage.$match)) {
              if (matchKey.startsWith('fullDocument.') && event.fullDocument) {
                const prop = matchKey.replace('fullDocument.', '');
                if ((event.fullDocument as any)[prop] !== matchVal) return;
              }
            }
          }
        }
      }
      stream.emit('change', event);
    };

    this.changeStreamEmitter.on('change', listener);
    return {
      on: (event: 'change' | 'error' | 'close', handler: (...args: any[]) => void) => stream.on(event, handler),
      close: () => {
        this.changeStreamEmitter.off('change', listener);
        stream.removeAllListeners();
      },
    };
  }

  private matchesQuery(doc: any, query: any): boolean {
    for (const [key, value] of Object.entries(query)) {
      if (key.includes('.')) {
        const parts = key.split('.');
        let val = doc;
        for (const p of parts) {
          val = val ? val[p] : undefined;
        }
        if (val !== value) return false;
      } else if (doc[key] !== value) {
        return false;
      }
    }
    return true;
  }
}

// Database instance containing all collections
export class MongoDatabase {
  public dbName: string;
  private collections: Map<string, MongoCollection<any>> = new Map();

  constructor(dbName: string) {
    this.dbName = dbName;
  }

  public collection<T extends { id?: string; _id?: string; tenantId?: string }>(name: string): MongoCollection<T> {
    if (!this.collections.has(name)) {
      this.collections.set(name, new MongoCollection<T>(name, this.dbName));
    }
    return this.collections.get(name)!;
  }
}

// Central Multi-Tenant MongoDB Manager with Discriminator Keys vs Dynamic Connection Pooling
export class MultiTenantMongoManager {
  private static instance: MultiTenantMongoManager;
  // Shared cluster database for Discriminator Key strategy
  private sharedDatabase: MongoDatabase;
  // Pool of dedicated databases for Dynamic Connection Pool strategy
  private dedicatedDatabasePool: Map<string, MongoDatabase> = new Map();
  // Master metadata collection (tenants, api_keys, audit_logs)
  private masterDb: MongoDatabase;

  public globalChangeStream = new EventEmitter();

  private constructor() {
    this.sharedDatabase = new MongoDatabase('orchestration_shared');
    this.masterDb = new MongoDatabase('orchestration_master');
    this.seedDefaultData();
  }

  public static getInstance(): MultiTenantMongoManager {
    if (!MultiTenantMongoManager.instance) {
      MultiTenantMongoManager.instance = new MultiTenantMongoManager();
    }
    return MultiTenantMongoManager.instance;
  }

  /**
   * Resolves the target MongoDatabase instance based on the tenant's isolation strategy.
   * - 'discriminator_key': returns the single shared cluster DB. Caller MUST filter by tenantId!
   * - 'dynamic_connection_pool': returns a dedicated isolated DB (e.g. 'db_tenant_acme') from the connection pool.
   */
  public async getDatabaseForTenant(tenantId: string): Promise<{ db: MongoDatabase; strategy: IsolationStrategy }> {
    const tenant = await this.getTenantConfig(tenantId);
    const strategy = tenant?.isolationStrategy || 'discriminator_key';

    if (strategy === 'dynamic_connection_pool') {
      const dbName = tenant?.dedicatedDbName || `db_tenant_${tenantId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
      if (!this.dedicatedDatabasePool.has(dbName)) {
        // Dynamically provision and register dedicated database in connection pool
        const dedicatedDb = new MongoDatabase(dbName);
        this.dedicatedDatabasePool.set(dbName, dedicatedDb);
        this.attachDbChangeStream(dedicatedDb);
      }
      return {
        db: this.dedicatedDatabasePool.get(dbName)!,
        strategy,
      };
    }

    return {
      db: this.sharedDatabase,
      strategy,
    };
  }

  public getMasterDatabase(): MongoDatabase {
    return this.masterDb;
  }

  public async getTenants(): Promise<TenantConfig[]> {
    return await this.masterDb.collection<TenantConfig>('tenants').find();
  }

  public async getTenantConfig(tenantId: string): Promise<TenantConfig | null> {
    return await this.masterDb.collection<TenantConfig>('tenants').findOne({ id: tenantId });
  }

  public async updateTenantStrategy(tenantId: string, strategy: IsolationStrategy): Promise<TenantConfig | null> {
    await this.masterDb.collection<TenantConfig>('tenants').updateOne(
      { id: tenantId },
      { $set: { isolationStrategy: strategy } }
    );
    return await this.getTenantConfig(tenantId);
  }

  /**
   * Safe Multi-Tenant Workflow Operations
   */
  public async getWorkflows(tenantId: string): Promise<WorkflowDefinition[]> {
    const { db, strategy } = await this.getDatabaseForTenant(tenantId);
    const coll = db.collection<WorkflowDefinition>('workflows');

    // In Discriminator Key mode, enforce tenantId filter to guarantee no cross-tenant leakage.
    // In Dynamic Connection Pool mode, tenantId filter is defense-in-depth, but isolation is already physically enforced.
    const query = strategy === 'discriminator_key' ? { tenantId } : {};
    return await coll.find(query);
  }

  public async getWorkflow(tenantId: string, workflowId: string): Promise<WorkflowDefinition | null> {
    const { db, strategy } = await this.getDatabaseForTenant(tenantId);
    const coll = db.collection<WorkflowDefinition>('workflows');
    const query = strategy === 'discriminator_key' ? { id: workflowId, tenantId } : { id: workflowId };
    return await coll.findOne(query);
  }

  public async saveWorkflow(workflow: WorkflowDefinition): Promise<WorkflowDefinition> {
    const { db, strategy } = await this.getDatabaseForTenant(workflow.tenantId);
    const coll = db.collection<WorkflowDefinition>('workflows');

    const existing = await coll.findOne({ id: workflow.id });
    if (existing) {
      await coll.updateOne({ id: workflow.id }, { $set: workflow });
      return workflow;
    } else {
      return await coll.insertOne(workflow);
    }
  }

  public async deleteWorkflow(tenantId: string, workflowId: string): Promise<boolean> {
    const { db, strategy } = await this.getDatabaseForTenant(tenantId);
    const coll = db.collection<WorkflowDefinition>('workflows');
    const query = strategy === 'discriminator_key' ? { id: workflowId, tenantId } : { id: workflowId };
    return await coll.deleteOne(query);
  }

  /**
   * Execution Persistence
   */
  public async saveExecution(execution: WorkflowExecution): Promise<WorkflowExecution> {
    const { db } = await this.getDatabaseForTenant(execution.tenantId);
    const coll = db.collection<WorkflowExecution>('executions');
    const existing = await coll.findOne({ id: execution.id });
    if (existing) {
      await coll.updateOne({ id: execution.id }, { $set: execution });
      return execution;
    } else {
      return await coll.insertOne(execution);
    }
  }

  public async getExecutions(tenantId: string, limit = 50): Promise<WorkflowExecution[]> {
    const { db, strategy } = await this.getDatabaseForTenant(tenantId);
    const coll = db.collection<WorkflowExecution>('executions');
    const query = strategy === 'discriminator_key' ? { tenantId } : {};
    return await coll.find(query, { limit, sort: { startedAt: -1 } });
  }

  public async getExecution(tenantId: string, executionId: string): Promise<WorkflowExecution | null> {
    const { db, strategy } = await this.getDatabaseForTenant(tenantId);
    const coll = db.collection<WorkflowExecution>('executions');
    const query = strategy === 'discriminator_key' ? { id: executionId, tenantId } : { id: executionId };
    return await coll.findOne(query);
  }

  /**
   * Dead Letter Queue (DLQ)
   */
  public async enqueueDLQ(item: DeadLetterQueueItem): Promise<DeadLetterQueueItem> {
    const coll = this.masterDb.collection<DeadLetterQueueItem>('dead_letter_queue');
    return await coll.insertOne(item);
  }

  public async getDLQItems(tenantId?: string): Promise<DeadLetterQueueItem[]> {
    const coll = this.masterDb.collection<DeadLetterQueueItem>('dead_letter_queue');
    const query = tenantId ? { tenantId } : {};
    return await coll.find(query, { sort: { enqueuedAt: -1 } });
  }

  public async resolveDLQItem(id: string, status: 'replayed' | 'discarded'): Promise<boolean> {
    const coll = this.masterDb.collection<DeadLetterQueueItem>('dead_letter_queue');
    return await coll.updateOne(
      { id },
      { $set: { status, replayedAt: new Date().toISOString() } }
    );
  }

  /**
   * Cryptographic API Keys
   */
  public async getApiKeys(tenantId: string): Promise<ApiKeyRecord[]> {
    const coll = this.masterDb.collection<ApiKeyRecord>('api_keys');
    return await coll.find({ tenantId, revoked: false });
  }

  public async createApiKey(tenantId: string, name: string, scopes: string[]): Promise<{ keyRecord: ApiKeyRecord; rawSecret: string }> {
    const coll = this.masterDb.collection<ApiKeyRecord>('api_keys');
    const rawSecret = `wk_live_${crypto.randomBytes(24).toString('base64url')}`;
    const keyPrefix = rawSecret.slice(0, 14);
    const hashedSecret = crypto.createHash('sha256').update(rawSecret).digest('hex');

    const keyRecord: ApiKeyRecord = {
      id: crypto.randomUUID(),
      tenantId,
      keyPrefix: `${keyPrefix}...`,
      hashedSecret,
      name,
      scopes,
      createdAt: new Date().toISOString(),
      revoked: false,
    };

    await coll.insertOne(keyRecord);
    return { keyRecord, rawSecret };
  }

  public async verifyApiKey(rawKey: string): Promise<{ valid: boolean; tenantId?: string; scopes?: string[] }> {
    if (!rawKey.startsWith('wk_live_')) return { valid: false };
    const coll = this.masterDb.collection<ApiKeyRecord>('api_keys');
    const hashed = crypto.createHash('sha256').update(rawKey).digest('hex');
    const record = await coll.findOne({ hashedSecret: hashed, revoked: false });

    if (!record) return { valid: false };
    // Update last used timestamp
    await coll.updateOne({ id: record.id }, { $set: { lastUsedAt: new Date().toISOString() } });
    return { valid: true, tenantId: record.tenantId, scopes: record.scopes };
  }

  public async revokeApiKey(tenantId: string, keyId: string): Promise<boolean> {
    const coll = this.masterDb.collection<ApiKeyRecord>('api_keys');
    return await coll.updateOne({ id: keyId, tenantId }, { $set: { revoked: true } });
  }

  /**
   * Cryptographic Tamper-Evident Audit Logs
   */
  public async logAudit(entry: Omit<AuditLogRecord, 'id' | 'timestamp' | 'signature'>): Promise<AuditLogRecord> {
    const coll = this.masterDb.collection<AuditLogRecord>('audit_logs');
    const timestamp = new Date().toISOString();
    const id = crypto.randomUUID();

    // Create HMAC SHA-256 signature to guarantee log integrity
    const payloadToSign = `${id}:${entry.tenantId}:${entry.actor.email}:${entry.action}:${timestamp}`;
    const secret = process.env.API_KEY_SECRET || 'wk_live_secret_hash_salt_2026';
    const signature = crypto.createHmac('sha256', secret).update(payloadToSign).digest('hex');

    const record: AuditLogRecord = {
      ...entry,
      id,
      timestamp,
      signature,
    };
    return await coll.insertOne(record);
  }

  public async getAuditLogs(tenantId: string, limit = 50): Promise<AuditLogRecord[]> {
    const coll = this.masterDb.collection<AuditLogRecord>('audit_logs');
    return await coll.find({ tenantId }, { limit, sort: { timestamp: -1 } });
  }

  private attachDbChangeStream(db: MongoDatabase) {
    const colls = ['workflows', 'executions'];
    for (const collName of colls) {
      const stream = db.collection(collName).watch();
      stream.on('change', (event) => {
        this.globalChangeStream.emit('change', event);
      });
    }
  }

  // Pre-seed sample enterprise tenants and workflows
  private seedDefaultData() {
    const tenantsColl = this.masterDb.collection<TenantConfig>('tenants');

    const defaultTenants: TenantConfig[] = [
      {
        id: 'acme_logistics',
        name: 'Acme Global Logistics',
        slug: 'acme-logistics',
        isolationStrategy: 'discriminator_key',
        rateLimit: { maxRequestsPerMin: 120, burstLimit: 30 },
        createdAt: '2026-01-15T08:00:00Z',
        plan: 'enterprise',
        activeWorkflowsCount: 4,
      },
      {
        id: 'cyberdyne_systems',
        name: 'Cyberdyne Systems Corp',
        slug: 'cyberdyne',
        isolationStrategy: 'dynamic_connection_pool',
        dedicatedDbName: 'db_tenant_cyberdyne_corp',
        rateLimit: { maxRequestsPerMin: 250, burstLimit: 60 },
        createdAt: '2026-02-01T10:30:00Z',
        plan: 'enterprise',
        activeWorkflowsCount: 3,
      },
      {
        id: 'quantum_dynamics',
        name: 'Quantum Dynamics Corp',
        slug: 'quantum-dynamics',
        isolationStrategy: 'discriminator_key',
        rateLimit: { maxRequestsPerMin: 90, burstLimit: 20 },
        createdAt: '2026-03-10T14:15:00Z',
        plan: 'scale',
        activeWorkflowsCount: 2,
      },
      {
        id: 'helios_cloud',
        name: 'Helios Cloud Systems',
        slug: 'helios-cloud',
        isolationStrategy: 'dynamic_connection_pool',
        dedicatedDbName: 'db_tenant_helios_cloud',
        rateLimit: { maxRequestsPerMin: 180, burstLimit: 40 },
        createdAt: '2026-04-05T09:00:00Z',
        plan: 'enterprise',
        activeWorkflowsCount: 2,
      },
    ];

    for (const t of defaultTenants) {
      tenantsColl.insertOne(t);
    }

    this.attachDbChangeStream(this.sharedDatabase);

    // Seed comprehensive enterprise workflows for Acme and Cyberdyne
    this.seedDefaultWorkflows();
  }

  private seedDefaultWorkflows() {
    const ecomOrderSaga: WorkflowDefinition = {
      id: 'wf_ecom_order_saga',
      tenantId: 'acme_logistics',
      name: 'E-Commerce Order Fulfillment with Saga Compensations',
      description: 'Distributed transaction pipeline coordinating payment capture, inventory reservation, carrier waybills, and invoice generation with automatic reverse compensation on failure.',
      version: 1,
      status: 'active',
      triggerType: 'webhook',
      tags: ['ecommerce', 'saga', 'payments', 'inventory'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        {
          id: 'node_trigger',
          type: 'triggerNode',
          position: { x: 50, y: 220 },
          data: {
            label: 'Order Placed Webhook',
            description: 'Receives customer checkout payload',
            nodeType: 'trigger',
            status: 'idle',
            action: { type: 'http' },
          },
        },
        {
          id: 'node_payment',
          type: 'sagaStepNode',
          position: { x: 300, y: 220 },
          data: {
            label: 'Capture Stripe Payment',
            description: 'Charges payment gateway authorization',
            nodeType: 'saga_step',
            status: 'idle',
            idempotencyKey: 'pmt_{{payload.orderId}}',
            action: {
              type: 'mock_service',
              endpoint: '/api/mock/payment/charge',
              method: 'POST',
              timeoutMs: 3000,
            },
            compensation: {
              type: 'mock_service',
              endpoint: '/api/mock/payment/refund',
              method: 'POST',
              timeoutMs: 4000,
            },
            retryPolicy: {
              maxAttempts: 3,
              initialIntervalMs: 500,
              backoffMultiplier: 2,
              maxIntervalMs: 4000,
              enableJitter: true,
            },
          },
        },
        {
          id: 'node_inventory',
          type: 'sagaStepNode',
          position: { x: 560, y: 220 },
          data: {
            label: 'Reserve Warehouse Inventory',
            description: 'Places atomic hold on SKU stock',
            nodeType: 'saga_step',
            status: 'idle',
            idempotencyKey: 'inv_{{payload.orderId}}',
            action: {
              type: 'mock_service',
              endpoint: '/api/mock/inventory/reserve',
              method: 'POST',
              timeoutMs: 3000,
            },
            compensation: {
              type: 'mock_service',
              endpoint: '/api/mock/inventory/release',
              method: 'POST',
              timeoutMs: 4000,
            },
            retryPolicy: {
              maxAttempts: 3,
              initialIntervalMs: 400,
              backoffMultiplier: 1.5,
              maxIntervalMs: 3000,
              enableJitter: true,
            },
          },
        },
        {
          id: 'node_check_vip',
          type: 'conditionNode',
          position: { x: 820, y: 220 },
          data: {
            label: 'High-Value Order Check',
            description: 'Routes orders over $250 to express priority dispatch',
            nodeType: 'condition',
            status: 'idle',
            conditionExpression: 'payload.amount >= 250',
          },
        },
        {
          id: 'node_express_shipping',
          type: 'sagaStepNode',
          position: { x: 1080, y: 120 },
          data: {
            label: 'FedEx Express Courier Label',
            description: 'Generates overnight air waybill (High-Value)',
            nodeType: 'saga_step',
            status: 'idle',
            idempotencyKey: 'shp_exp_{{payload.orderId}}',
            action: {
              type: 'mock_service',
              endpoint: '/api/mock/shipping/create-label?priority=express',
              method: 'POST',
              timeoutMs: 3500,
            },
            compensation: {
              type: 'mock_service',
              endpoint: '/api/mock/shipping/cancel-label',
              method: 'POST',
              timeoutMs: 3500,
            },
            retryPolicy: {
              maxAttempts: 2,
              initialIntervalMs: 600,
              backoffMultiplier: 2,
              maxIntervalMs: 3000,
              enableJitter: false,
            },
          },
        },
        {
          id: 'node_standard_shipping',
          type: 'sagaStepNode',
          position: { x: 1080, y: 320 },
          data: {
            label: 'Ground Logistics Label',
            description: 'Standard regional warehouse dispatch',
            nodeType: 'saga_step',
            status: 'idle',
            idempotencyKey: 'shp_std_{{payload.orderId}}',
            action: {
              type: 'mock_service',
              endpoint: '/api/mock/shipping/create-label?priority=standard',
              method: 'POST',
              timeoutMs: 3500,
            },
            compensation: {
              type: 'mock_service',
              endpoint: '/api/mock/shipping/cancel-label',
              method: 'POST',
              timeoutMs: 3500,
            },
            retryPolicy: {
              maxAttempts: 2,
              initialIntervalMs: 600,
              backoffMultiplier: 2,
              maxIntervalMs: 3000,
              enableJitter: false,
            },
          },
        },
        {
          id: 'node_format_invoice',
          type: 'transformNode',
          position: { x: 1350, y: 220 },
          data: {
            label: 'Format Tax Invoice (Sandbox VM)',
            description: 'Calculates jurisdictional VAT/GST and formats confirmation receipt',
            nodeType: 'transform',
            status: 'idle',
            action: {
              type: 'script',
              script: `
// Sandboxed JavaScript transformer
const subtotal = payload.amount || 299.00;
const taxRate = 0.0825;
const tax = +(subtotal * taxRate).toFixed(2);
const total = +(subtotal + tax).toFixed(2);

return {
  invoiceNumber: 'INV-' + Math.floor(100000 + Math.random() * 900000),
  currency: 'USD',
  subtotal,
  tax,
  total,
  carrierWaybill: payload.carrierWaybill || 'TRK-9921-US',
  fulfilledAt: new Date().toISOString()
};
`,
            },
          },
        },
        {
          id: 'node_end',
          type: 'endNode',
          position: { x: 1600, y: 220 },
          data: {
            label: 'Order Confirmed & Sealed',
            description: 'Terminal saga success milestone',
            nodeType: 'end',
            status: 'idle',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'node_trigger', target: 'node_payment', animated: true },
        { id: 'e2', source: 'node_payment', target: 'node_inventory', animated: true },
        { id: 'e3', source: 'node_inventory', target: 'node_check_vip', animated: true },
        { id: 'e4_true', source: 'node_check_vip', target: 'node_express_shipping', sourceHandle: 'true', label: 'True (>= $250)', animated: true },
        { id: 'e4_false', source: 'node_check_vip', target: 'node_standard_shipping', sourceHandle: 'false', label: 'False (< $250)', animated: true },
        { id: 'e5_exp', source: 'node_express_shipping', target: 'node_format_invoice', animated: true },
        { id: 'e5_std', source: 'node_standard_shipping', target: 'node_format_invoice', animated: true },
        { id: 'e6', source: 'node_format_invoice', target: 'node_end', animated: true },
      ],
    };

    // Save initial workflow into shared DB (Acme)
    this.sharedDatabase.collection('workflows').insertOne(ecomOrderSaga);

    // Also seed a workflow into Cyberdyne Systems dedicated database
    const userProvisioningSaga: WorkflowDefinition = {
      id: 'wf_user_provisioning_saga',
      tenantId: 'cyberdyne_systems',
      name: 'Autonomous Tenant User Provisioning Pipeline',
      description: 'Zero-trust enterprise user onboarding pipeline configuring IAM, Stripe customer account, Okta token vault, and Slack workspace.',
      version: 1,
      status: 'active',
      triggerType: 'webhook',
      tags: ['identity', 'iam', 'billing', 'saga'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        {
          id: 'node_trigger',
          type: 'triggerNode',
          position: { x: 50, y: 180 },
          data: {
            label: 'New Employee Provisioning Request',
            description: 'HRIS sync trigger',
            nodeType: 'trigger',
            status: 'idle',
          },
        },
        {
          id: 'node_crm',
          type: 'sagaStepNode',
          position: { x: 320, y: 180 },
          data: {
            label: 'Create Corporate IAM Profile',
            description: 'Provisions directory service user identity',
            nodeType: 'saga_step',
            status: 'idle',
            action: {
              type: 'mock_service',
              endpoint: '/api/mock/crm/create-customer',
              method: 'POST',
              timeoutMs: 3000,
            },
            compensation: {
              type: 'mock_service',
              endpoint: '/api/mock/crm/archive-customer',
              method: 'POST',
              timeoutMs: 3000,
            },
            retryPolicy: {
              maxAttempts: 3,
              initialIntervalMs: 500,
              backoffMultiplier: 2,
              maxIntervalMs: 4000,
              enableJitter: true,
            },
          },
        },
        {
          id: 'node_end',
          type: 'endNode',
          position: { x: 620, y: 180 },
          data: {
            label: 'Provisioning Completed',
            description: 'User access granted',
            nodeType: 'end',
            status: 'idle',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'node_trigger', target: 'node_crm', animated: true },
        { id: 'e2', source: 'node_crm', target: 'node_end', animated: true },
      ],
    };

    // Store in Cyberdyne's dedicated database in connection pool
    const cyberdyneDb = new MongoDatabase('db_tenant_cyberdyne_corp');
    this.dedicatedDatabasePool.set('db_tenant_cyberdyne_corp', cyberdyneDb);
    cyberdyneDb.collection('workflows').insertOne(userProvisioningSaga);
    this.attachDbChangeStream(cyberdyneDb);
  }
}
