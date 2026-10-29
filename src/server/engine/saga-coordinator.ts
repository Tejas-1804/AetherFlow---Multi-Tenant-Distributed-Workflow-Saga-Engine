import crypto from 'node:crypto';
import vm from 'node:vm';
import {
  DeadLetterQueueItem,
  NodeType,
  StepExecutionRecord,
  StepStatus,
  WorkflowDefinition,
  WorkflowExecution,
  WorkflowNode,
} from '../../types/workflow.js';
import { MultiTenantMongoManager } from '../db/mongo-manager.js';

export type EventBroadcaster = (event: {
  type: string;
  payload: any;
  tenantId: string;
  timestamp: string;
}) => void;

export class SagaCoordinator {
  private dbManager: MultiTenantMongoManager;
  private broadcaster: EventBroadcaster;

  constructor(broadcaster: EventBroadcaster = () => {}) {
    this.dbManager = MultiTenantMongoManager.getInstance();
    this.broadcaster = broadcaster;
  }

  /**
   * Main entry point: Executes a workflow as a distributed Saga transaction.
   */
  public async executeWorkflow(
    workflow: WorkflowDefinition,
    initialPayload: any = {},
    options: { simulateFailureAtNodeId?: string } = {}
  ): Promise<WorkflowExecution> {
    const executionId = `exec_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const execution: WorkflowExecution = {
      id: executionId,
      workflowId: workflow.id,
      workflowName: workflow.name,
      tenantId: workflow.tenantId,
      status: 'running',
      startedAt: now,
      triggerPayload: initialPayload,
      stepExecutions: {},
      compensationHistory: [],
      metrics: {
        totalSteps: workflow.nodes.length,
        completedSteps: 0,
        compensatedSteps: 0,
        retryCount: 0,
      },
    };

    // Initialize all step execution records
    for (const node of workflow.nodes) {
      execution.stepExecutions[node.id] = {
        nodeId: node.id,
        nodeLabel: node.data.label,
        nodeType: node.data.nodeType,
        status: 'pending',
        startedAt: now,
        attempts: 0,
        retryLog: [],
      };
    }

    await this.dbManager.saveExecution(execution);
    this.emitEvent('execution:started', { executionId, workflowId: workflow.id, execution }, workflow.tenantId);

    // Build node graph and find starting trigger
    const nodeMap = new Map<string, WorkflowNode>();
    for (const n of workflow.nodes) nodeMap.set(n.id, n);

    const triggerNode = workflow.nodes.find((n) => n.data.nodeType === 'trigger') || workflow.nodes[0];
    const completedNodeIdsInOrder: string[] = [];
    let currentPayload = { ...initialPayload };
    let hasFailure = false;
    let failedNodeId = '';
    let failureError = '';

    // Queue of nodes to process (starts with trigger)
    const queue: Array<{ nodeId: string; payload: any }> = [{ nodeId: triggerNode.id, payload: currentPayload }];
    const visited = new Set<string>();

    while (queue.length > 0 && !hasFailure) {
      const { nodeId, payload } = queue.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = nodeMap.get(nodeId);
      if (!node) continue;

      const stepRecord = execution.stepExecutions[nodeId];
      stepRecord.status = 'running';
      stepRecord.startedAt = new Date().toISOString();
      stepRecord.inputPayload = payload;

      this.emitStepUpdate(execution, nodeId, 'running', { inputPayload: payload });
      await this.dbManager.saveExecution(execution);

      // Check for simulated failure injected by testing UI
      const shouldSimulateFailure = options.simulateFailureAtNodeId === nodeId;

      // Execute node with exponential backoff retry loop
      const result = await this.executeStepWithRetry(node, payload, execution, shouldSimulateFailure);

      if (result.success) {
        stepRecord.status = 'completed';
        stepRecord.completedAt = new Date().toISOString();
        stepRecord.durationMs = result.durationMs;
        stepRecord.outputPayload = result.output;
        execution.metrics.completedSteps++;
        completedNodeIdsInOrder.push(nodeId);

        this.emitStepUpdate(execution, nodeId, 'completed', {
          outputPayload: result.output,
          durationMs: result.durationMs,
        });
        await this.dbManager.saveExecution(execution);

        // Update running payload
        currentPayload = { ...currentPayload, ...result.output };

        // Determine next nodes via outgoing edges and conditions
        const outgoingEdges = workflow.edges.filter((e) => e.source === nodeId);

        if (node.data.nodeType === 'condition') {
          const conditionPassed = Boolean(result.output?.conditionResult);
          const matchedHandle = conditionPassed ? 'true' : 'false';
          const validEdges = outgoingEdges.filter(
            (e) => e.sourceHandle === matchedHandle || e.label?.toLowerCase().includes(matchedHandle)
          );

          for (const edge of validEdges) {
            queue.push({ nodeId: edge.target, payload: currentPayload });
          }
        } else {
          for (const edge of outgoingEdges) {
            queue.push({ nodeId: edge.target, payload: currentPayload });
          }
        }
      } else {
        // Step failed after exhausting retries!
        hasFailure = true;
        failedNodeId = nodeId;
        failureError = result.error || 'Execution step failed';
        stepRecord.status = 'failed';
        stepRecord.completedAt = new Date().toISOString();
        stepRecord.error = failureError;

        execution.error = {
          failedNodeId,
          message: failureError,
          exhaustedAttempts: stepRecord.attempts,
        };

        this.emitStepUpdate(execution, nodeId, 'failed', { error: failureError });
        await this.dbManager.saveExecution(execution);
        break;
      }
    }

    if (hasFailure) {
      // Trigger Distributed Saga Compensation Rollback in reverse topological order (LIFO)
      await this.executeSagaCompensations(workflow, execution, completedNodeIdsInOrder, nodeMap);

      // Enqueue to Dead Letter Queue (DLQ)
      const dlqItem: DeadLetterQueueItem = {
        id: `dlq_${crypto.randomUUID().slice(0, 8)}`,
        executionId: execution.id,
        workflowId: workflow.id,
        workflowName: workflow.name,
        tenantId: workflow.tenantId,
        failedNodeId,
        failedNodeLabel: nodeMap.get(failedNodeId)?.data.label || failedNodeId,
        error: failureError,
        attempts: execution.stepExecutions[failedNodeId]?.attempts || 1,
        payloadSnapshot: currentPayload,
        enqueuedAt: new Date().toISOString(),
        status: 'unresolved',
      };

      await this.dbManager.enqueueDLQ(dlqItem);
      this.emitEvent('dlq:enqueued', { dlqItem }, workflow.tenantId);

      execution.status = 'dlq';
      execution.finishedAt = new Date().toISOString();
      await this.dbManager.saveExecution(execution);
      this.emitEvent('execution:failed', { execution }, workflow.tenantId);
    } else {
      // Workflow completed successfully
      execution.status = 'completed';
      execution.finishedAt = new Date().toISOString();
      await this.dbManager.saveExecution(execution);
      this.emitEvent('execution:completed', { execution }, workflow.tenantId);
    }

    return execution;
  }

  /**
   * Executes a single step with Exponential Backoff + Jitter retries
   */
  private async executeStepWithRetry(
    node: WorkflowNode,
    inputPayload: any,
    execution: WorkflowExecution,
    forceFailure = false
  ): Promise<{ success: boolean; output?: any; durationMs: number; error?: string }> {
    const startTime = Date.now();
    const retryPolicy = node.data.retryPolicy || {
      maxAttempts: 1,
      initialIntervalMs: 500,
      backoffMultiplier: 2,
      maxIntervalMs: 3000,
      enableJitter: true,
    };

    const maxAttempts = forceFailure ? retryPolicy.maxAttempts : Math.max(1, retryPolicy.maxAttempts);
    let attempt = 0;
    let lastError = '';

    while (attempt < maxAttempts) {
      attempt++;
      execution.stepExecutions[node.id].attempts = attempt;

      try {
        if (forceFailure) {
          throw new Error(`[SIMULATED 500 ERROR] Service downstream failure at ${node.data.label}`);
        }

        // Execute specific node logic
        const output = await this.executeNodeLogic(node, inputPayload);
        return {
          success: true,
          output,
          durationMs: Date.now() - startTime,
        };
      } catch (err: any) {
        lastError = err.message || 'Unknown step failure';
        execution.metrics.retryCount++;

        if (attempt < maxAttempts) {
          // Calculate exponential backoff delay
          let delayMs = retryPolicy.initialIntervalMs * Math.pow(retryPolicy.backoffMultiplier, attempt - 1);
          delayMs = Math.min(delayMs, retryPolicy.maxIntervalMs);

          if (retryPolicy.enableJitter) {
            // Apply randomized full jitter
            delayMs = Math.floor(delayMs * (0.5 + Math.random() * 0.5));
          }

          // Record retry attempt
          execution.stepExecutions[node.id].status = 'retrying';
          execution.stepExecutions[node.id].retryLog.push({
            attempt,
            delayMs,
            timestamp: new Date().toISOString(),
            error: lastError,
          });

          this.emitStepUpdate(execution, node.id, 'retrying', {
            attempt,
            delayMs,
            error: lastError,
          });
          await this.dbManager.saveExecution(execution);

          // Sleep before next retry
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    return {
      success: false,
      durationMs: Date.now() - startTime,
      error: lastError,
    };
  }

  /**
   * Node execution logic router (Sandboxed JS, Condition eval, Mock microservices)
   */
  private async executeNodeLogic(node: WorkflowNode, payload: any): Promise<any> {
    const { nodeType, action } = node.data;

    // Small realistic latency simulation for distributed async network calls
    await new Promise((resolve) => setTimeout(resolve, 250 + Math.random() * 200));

    switch (nodeType) {
      case 'trigger':
        return {
          ...payload,
          orderId: payload.orderId || `ORD-${Math.floor(10000 + Math.random() * 90000)}`,
          amount: payload.amount !== undefined ? payload.amount : 349.5,
          customerEmail: payload.customerEmail || 'tejas@acme.com',
          status: 'TRIGGERED',
        };

      case 'condition': {
        const expression = node.data.conditionExpression || 'payload.amount >= 250';
        try {
          const sandbox = { payload };
          const context = vm.createContext(sandbox);
          const result = vm.runInContext(expression, context, { timeout: 1000 });
          return {
            ...payload,
            conditionResult: Boolean(result),
            evaluatedExpression: expression,
          };
        } catch (err: any) {
          throw new Error(`Condition expression failed: ${err.message}`);
        }
      }

      case 'transform': {
        const script =
          action?.script ||
          `
          return {
            ...payload,
            transformed: true,
            processedAt: new Date().toISOString()
          };
        `;
        try {
          // Safe Node.js VM execution sandbox
          const sandbox = {
            payload,
            Math,
            Date,
            JSON,
            console: { log: () => {} },
          };
          const context = vm.createContext(sandbox);
          const wrappedScript = `(function() { ${script} })()`;
          const scriptResult = vm.runInContext(wrappedScript, context, { timeout: 2000 });
          return scriptResult;
        } catch (err: any) {
          throw new Error(`Sandbox transform failed: ${err.message}`);
        }
      }

      case 'delay': {
        const delayMs = node.data.delayMs || 500;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return { ...payload, delayedByMs: delayMs };
      }

      case 'saga_step':
      case 'http_action': {
        // Return deterministic distributed microservice transaction results
        const endpoint = action?.endpoint || '';

        if (endpoint.includes('payment/charge')) {
          return {
            ...payload,
            paymentId: `ch_${crypto.randomBytes(8).toString('hex')}`,
            paymentStatus: 'CAPTURED',
            chargeAmount: payload.amount || 349.5,
          };
        }

        if (endpoint.includes('inventory/reserve')) {
          return {
            ...payload,
            reservationId: `res_${crypto.randomBytes(6).toString('hex')}`,
            inventoryStatus: 'RESERVED_HOLD',
            warehouse: 'US-WEST-BAY-04',
          };
        }

        if (endpoint.includes('shipping/create-label')) {
          const isExpress = endpoint.includes('priority=express');
          return {
            ...payload,
            carrierWaybill: isExpress ? `FDX-EXP-${Date.now().toString().slice(-6)}` : `GND-STD-${Date.now().toString().slice(-6)}`,
            shippingMethod: isExpress ? 'FedEx Priority Overnight' : 'FedEx Ground Delivery',
            trackingStatus: 'MANIFEST_PRINTED',
          };
        }

        if (endpoint.includes('crm/create-customer')) {
          return {
            ...payload,
            crmCustomerId: `cus_${crypto.randomBytes(6).toString('hex')}`,
            crmStatus: 'ACTIVE_PROVISIONED',
          };
        }

        return {
          ...payload,
          stepResult: 'OK',
          executedEndpoint: endpoint,
        };
      }

      case 'end':
        return {
          ...payload,
          completedAt: new Date().toISOString(),
          finalStatus: 'SUCCESS',
        };

      default:
        return payload;
    }
  }

  /**
   * Executes Saga Compensations in Reverse Topological Order (LIFO)
   */
  private async executeSagaCompensations(
    workflow: WorkflowDefinition,
    execution: WorkflowExecution,
    completedNodeIdsInOrder: string[],
    nodeMap: Map<string, WorkflowNode>
  ) {
    execution.status = 'compensating';
    this.emitEvent('execution:compensating', { executionId: execution.id, execution }, workflow.tenantId);
    await this.dbManager.saveExecution(execution);

    // Reverse order: LIFO (Last In First Out)
    const reverseOrder = [...completedNodeIdsInOrder].reverse();

    for (const nodeId of reverseOrder) {
      const node = nodeMap.get(nodeId);
      if (!node || !node.data.compensation) continue;

      const stepRecord = execution.stepExecutions[nodeId];
      stepRecord.status = 'compensating';
      this.emitStepUpdate(execution, nodeId, 'compensating', { message: 'Executing rollback compensation...' });
      await this.dbManager.saveExecution(execution);

      // Rollback simulated execution latency
      await new Promise((resolve) => setTimeout(resolve, 400));

      try {
        const comp = node.data.compensation;
        const compActionStr = comp.endpoint || comp.script || 'Custom Rollback Handler';

        // Compensation succeeds
        stepRecord.status = 'compensated';
        stepRecord.compensationRecord = {
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          status: 'compensated',
          details: { endpoint: comp.endpoint, action: compActionStr },
        };

        execution.metrics.compensatedSteps++;
        execution.compensationHistory.push({
          nodeId,
          nodeLabel: node.data.label,
          timestamp: new Date().toISOString(),
          status: 'compensated',
          action: compActionStr,
        });

        this.emitStepUpdate(execution, nodeId, 'compensated', {
          compensationDetails: stepRecord.compensationRecord,
        });
        await this.dbManager.saveExecution(execution);
      } catch (err: any) {
        stepRecord.status = 'compensation_failed';
        stepRecord.compensationRecord = {
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          status: 'compensation_failed',
          error: err.message,
        };
        this.emitStepUpdate(execution, nodeId, 'compensation_failed', { error: err.message });
        await this.dbManager.saveExecution(execution);
      }
    }

    execution.status = 'compensated';
    this.emitEvent('execution:compensated', { execution }, workflow.tenantId);
    await this.dbManager.saveExecution(execution);
  }

  private emitStepUpdate(execution: WorkflowExecution, nodeId: string, status: StepStatus, extra: any = {}) {
    this.emitEvent(
      'step:update',
      {
        executionId: execution.id,
        nodeId,
        status,
        ...extra,
      },
      execution.tenantId
    );
  }

  private emitEvent(type: string, payload: any, tenantId: string) {
    this.broadcaster({
      type,
      payload,
      tenantId,
      timestamp: new Date().toISOString(),
    });
  }
}
