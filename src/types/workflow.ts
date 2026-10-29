export type NodeType =
  | 'trigger'
  | 'saga_step'
  | 'http_action'
  | 'condition'
  | 'transform'
  | 'delay'
  | 'end';

export type StepStatus =
  | 'idle'
  | 'pending'
  | 'running'
  | 'retrying'
  | 'completed'
  | 'failed'
  | 'compensating'
  | 'compensated'
  | 'compensation_failed';

export type WorkflowStatus =
  | 'draft'
  | 'active'
  | 'paused'
  | 'archived';

export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'compensating'
  | 'compensated'
  | 'dlq';

export type IsolationStrategy =
  | 'discriminator_key'     // Shared collection, tenantId discriminator + compound indexes
  | 'dynamic_connection_pool'; // Dedicated database connection per tenant (db_tenant_xxx)

export interface RetryPolicy {
  maxAttempts: number;
  initialIntervalMs: number;
  backoffMultiplier: number;
  maxIntervalMs: number;
  enableJitter: boolean;
}

export interface CompensationDefinition {
  type: 'http' | 'script' | 'mock_service';
  endpoint?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  payloadTemplate?: string;
  script?: string;
  timeoutMs?: number;
}

export interface ActionDefinition {
  type: 'http' | 'script' | 'mock_service' | 'eval';
  endpoint?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  payloadTemplate?: string;
  script?: string;
  timeoutMs?: number;
}

export interface NodeData {
  label: string;
  description?: string;
  nodeType: NodeType;
  status?: StepStatus;
  action?: ActionDefinition;
  compensation?: CompensationDefinition;
  retryPolicy?: RetryPolicy;
  conditionExpression?: string; // e.g. "payload.orderTotal > 100"
  delayMs?: number;
  idempotencyKey?: string;
  lastExecution?: {
    attempt: number;
    durationMs: number;
    input?: any;
    output?: any;
    error?: string;
    compensatedAt?: string;
  };
}

export interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: NodeData;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  label?: string;
  animated?: boolean;
  style?: Record<string, any>;
}

export interface WorkflowDefinition {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  version: number;
  status: WorkflowStatus;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: string;
  updatedAt: string;
  triggerType: 'manual' | 'webhook' | 'event_stream' | 'cron';
  tags: string[];
}

export interface StepExecutionRecord {
  nodeId: string;
  nodeLabel: string;
  nodeType: NodeType;
  status: StepStatus;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  attempts: number;
  retryLog: Array<{
    attempt: number;
    delayMs: number;
    timestamp: string;
    error: string;
  }>;
  inputPayload?: any;
  outputPayload?: any;
  error?: string;
  compensationRecord?: {
    startedAt: string;
    completedAt?: string;
    status: 'compensating' | 'compensated' | 'compensation_failed';
    error?: string;
    details?: any;
  };
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  workflowName: string;
  tenantId: string;
  status: ExecutionStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  triggerPayload: any;
  stepExecutions: Record<string, StepExecutionRecord>;
  compensationHistory: Array<{
    nodeId: string;
    nodeLabel: string;
    timestamp: string;
    status: 'compensated' | 'failed';
    action: string;
  }>;
  error?: {
    failedNodeId: string;
    message: string;
    exhaustedAttempts: number;
  };
  metrics: {
    totalSteps: number;
    completedSteps: number;
    compensatedSteps: number;
    retryCount: number;
  };
}

export interface DeadLetterQueueItem {
  id: string;
  executionId: string;
  workflowId: string;
  workflowName: string;
  tenantId: string;
  failedNodeId: string;
  failedNodeLabel: string;
  error: string;
  attempts: number;
  payloadSnapshot: any;
  enqueuedAt: string;
  status: 'unresolved' | 'replayed' | 'discarded';
  replayedAt?: string;
}

export interface TenantConfig {
  id: string;
  name: string;
  slug: string;
  isolationStrategy: IsolationStrategy;
  dedicatedDbName?: string;
  rateLimit: {
    maxRequestsPerMin: number;
    burstLimit: number;
  };
  createdAt: string;
  plan: 'enterprise' | 'scale' | 'pro';
  activeWorkflowsCount: number;
}

export interface ApiKeyRecord {
  id: string;
  tenantId: string;
  keyPrefix: string;
  hashedSecret: string;
  name: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
  revoked: boolean;
}

export interface AuditLogRecord {
  id: string;
  tenantId: string;
  actor: {
    userId: string;
    email: string;
    role: string;
  };
  action: string;
  resource: string;
  resourceId: string;
  details: any;
  timestamp: string;
  ipAddress: string;
  signature: string; // HMAC SHA-256 tamper-evident seal
}

export interface ValidationResult {
  isValid: boolean;
  hasCycle: boolean;
  cycleNodes: string[];
  errors: Array<{
    type: 'cycle' | 'unreachable' | 'missing_trigger' | 'orphan' | 'invalid_condition';
    message: string;
    nodeIds: string[];
  }>;
  warnings: Array<{
    message: string;
    nodeIds: string[];
  }>;
  topologicalLevels: string[][];
}

export interface WebSocketEvent {
  type:
    | 'execution:started'
    | 'execution:progress'
    | 'execution:completed'
    | 'execution:failed'
    | 'execution:compensating'
    | 'execution:compensated'
    | 'step:update'
    | 'dlq:enqueued'
    | 'change_stream:event';
  payload: any;
  tenantId: string;
  timestamp: string;
}
