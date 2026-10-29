import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AuditLogModal } from './components/audit/AuditLogModal.js';
import { WorkflowCanvas } from './components/canvas/WorkflowCanvas.js';
import { DeadLetterQueueModal } from './components/dlq/DeadLetterQueueModal.js';
import { LiveTraceDrawer } from './components/execution/LiveTraceDrawer.js';
import { NodeConfigModal } from './components/inspector/NodeConfigModal.js';
import { Navbar } from './components/Navbar.js';
import { TemplateGalleryModal } from './components/templates/TemplateGalleryModal.js';
import { TenantSettingsModal } from './components/tenant/TenantSettingsModal.js';
import {
  DeadLetterQueueItem,
  IsolationStrategy,
  TenantConfig,
  ValidationResult,
  WorkflowDefinition,
  WorkflowExecution,
  WorkflowNode,
} from './types/workflow.js';

export default function App() {
  const [tenants, setTenants] = useState<TenantConfig[]>([]);
  const [activeTenant, setActiveTenant] = useState<TenantConfig | null>(null);
  const [currentUser, setCurrentUser] = useState({
    name: 'Tejas',
    email: 'tejas@acme.com',
    role: 'TENANT_ADMIN',
  });

  const [workflow, setWorkflow] = useState<WorkflowDefinition | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeExecution, setActiveExecution] = useState<WorkflowExecution | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [dlqItems, setDlqItems] = useState<DeadLetterQueueItem[]>([]);

  // Modal open states
  const [isNodeModalOpen, setIsNodeModalOpen] = useState(false);
  const [isDLQOpen, setIsDLQOpen] = useState(false);
  const [isTenantSettingsOpen, setIsTenantSettingsOpen] = useState(false);
  const [isAuditLogsOpen, setIsAuditLogsOpen] = useState(false);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [isTraceDrawerOpen, setIsTraceDrawerOpen] = useState(false);

  // WebSocket state
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Initial Load: Fetch Tenants & DLQ
  useEffect(() => {
    fetchTenants();
    fetchDLQ();
  }, []);

  // When active tenant changes, fetch its workflows
  useEffect(() => {
    if (activeTenant) {
      fetchWorkflows(activeTenant.id);
    }
  }, [activeTenant]);

  // Connect WebSocket for real-time Saga traces & MongoDB Change Streams
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const connectWs = () => {
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setWsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            handleWebSocketMessage(data);
          } catch (e) {
            console.error('Error parsing WS message:', e);
          }
        };

        ws.onclose = () => {
          setWsConnected(false);
          // Auto reconnect after 3 seconds
          setTimeout(connectWs, 3000);
        };

        ws.onerror = () => {
          setWsConnected(false);
        };
      } catch (err) {
        console.error('WebSocket connection error:', err);
      }
    };

    connectWs();

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const handleWebSocketMessage = useCallback(
    (event: any) => {
      const { type, payload } = event;

      if (type === 'execution:started') {
        setIsExecuting(true);
        setActiveExecution(payload.execution);
        setIsTraceDrawerOpen(true);
        // Reset node visual statuses to idle/pending
        if (workflow) {
          setWorkflow((prev) =>
            prev
              ? {
                  ...prev,
                  nodes: prev.nodes.map((n) => ({
                    ...n,
                    data: { ...n.data, status: 'idle' },
                  })),
                }
              : null
          );
        }
      }

      if (type === 'step:update') {
        const { nodeId, status, extra } = payload;
        // Update workflow canvas node status
        setWorkflow((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, status } } : n)),
          };
        });

        // Update active execution trace drawer
        setActiveExecution((prev) => {
          if (!prev) return null;
          const step = prev.stepExecutions[nodeId];
          if (!step) return prev;
          return {
            ...prev,
            stepExecutions: {
              ...prev.stepExecutions,
              [nodeId]: {
                ...step,
                status,
                ...payload,
              },
            },
          };
        });
      }

      if (type === 'execution:completed' || type === 'execution:failed' || type === 'execution:compensated') {
        setIsExecuting(false);
        if (payload.execution) {
          setActiveExecution(payload.execution);
        }
      }

      if (type === 'dlq:enqueued') {
        if (payload.dlqItem) {
          setDlqItems((prev) => [payload.dlqItem, ...prev]);
        }
      }
    },
    [workflow]
  );

  const fetchTenants = async () => {
    try {
      const res = await fetch('/api/tenants');
      if (res.ok) {
        const data: TenantConfig[] = await res.json();
        setTenants(data);
        if (data.length > 0 && !activeTenant) {
          setActiveTenant(data[0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch tenants:', err);
    }
  };

  const fetchWorkflows = async (tenantId: string) => {
    try {
      const res = await fetch('/api/workflows', {
        headers: { 'x-tenant-id': tenantId },
      });
      if (res.ok) {
        const data: WorkflowDefinition[] = await res.json();
        if (data.length > 0) {
          setWorkflow(data[0]);
          validateDAG(data[0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch workflows:', err);
    }
  };

  const fetchDLQ = async () => {
    try {
      const res = await fetch('/api/dlq');
      if (res.ok) {
        const data = await res.json();
        setDlqItems(data);
      }
    } catch (err) {
      console.error('Failed to fetch DLQ:', err);
    }
  };

  const validateDAG = async (wf: WorkflowDefinition) => {
    try {
      const res = await fetch('/api/workflows/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes: wf.nodes, edges: wf.edges }),
      });
      if (res.ok) {
        const result: ValidationResult = await res.json();
        setValidationResult(result);
      }
    } catch (err) {
      console.error('DAG validation error:', err);
    }
  };

  const handleUpdateWorkflow = (updated: WorkflowDefinition) => {
    setWorkflow(updated);
    validateDAG(updated);
  };

  const handleSaveWorkflow = async () => {
    if (!workflow || !activeTenant) return;
    try {
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': activeTenant.id,
          'x-demo-role': currentUser.role,
          'x-demo-email': currentUser.email,
        },
        body: JSON.stringify(workflow),
      });

      if (res.ok) {
        const { workflow: saved } = await res.json();
        setWorkflow(saved);
      }
    } catch (err) {
      console.error('Save workflow failed:', err);
    }
  };

  const handleExecuteWorkflow = async (simulateFailureNodeId?: string) => {
    if (!workflow || !activeTenant) return;
    setIsExecuting(true);
    setIsTraceDrawerOpen(true);

    try {
      await fetch(`/api/workflows/${workflow.id}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': activeTenant.id,
        },
        body: JSON.stringify({
          payload: {
            orderId: `ORD-${Math.floor(10000 + Math.random() * 90000)}`,
            amount: 349.5,
            customerEmail: currentUser.email,
            customerTier: 'PLATINUM',
          },
          simulateFailureAtNodeId: simulateFailureNodeId,
        }),
      });
    } catch (err) {
      console.error('Execute workflow failed:', err);
      setIsExecuting(false);
    }
  };

  const handleRedriveDLQ = async (id: string) => {
    if (!activeTenant) return;
    try {
      const res = await fetch(`/api/dlq/${id}/replay`, {
        method: 'POST',
        headers: { 'x-tenant-id': activeTenant.id },
      });
      if (res.ok) {
        setIsDLQOpen(false);
        setIsTraceDrawerOpen(true);
        fetchDLQ();
      }
    } catch (err) {
      console.error('Redrive DLQ failed:', err);
    }
  };

  const handleDiscardDLQ = async (id: string) => {
    try {
      const res = await fetch(`/api/dlq/${id}/discard`, { method: 'POST' });
      if (res.ok) {
        setDlqItems((prev) => prev.filter((i) => i.id !== id));
      }
    } catch (err) {
      console.error('Discard DLQ failed:', err);
    }
  };

  const handleUpdateTenantStrategy = async (tenantId: string, strategy: IsolationStrategy) => {
    const res = await fetch(`/api/tenants/${tenantId}/strategy`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': tenantId,
        'x-demo-role': currentUser.role,
        'x-demo-email': currentUser.email,
      },
      body: JSON.stringify({ strategy }),
    });

    if (res.ok) {
      const updatedTenant: TenantConfig = await res.json();
      setActiveTenant(updatedTenant);
      setTenants((prev) => prev.map((t) => (t.id === tenantId ? updatedTenant : t)));
    }
  };

  const handleSelectTemplate = (templateData: any) => {
    if (!activeTenant) return;
    const newWorkflow: WorkflowDefinition = {
      id: `wf_${Date.now()}`,
      tenantId: activeTenant.id,
      name: templateData.name,
      description: templateData.description,
      version: 1,
      status: 'active',
      triggerType: 'webhook',
      tags: ['saga', 'template'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: templateData.nodes,
      edges: templateData.edges,
    };
    setWorkflow(newWorkflow);
    validateDAG(newWorkflow);
  };

  const selectedNode = workflow?.nodes.find((n) => n.id === selectedNodeId) || null;

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-[#0b0f19] text-slate-100 font-sans">
      {/* Top Navbar */}
      <Navbar
        tenants={tenants}
        activeTenant={activeTenant}
        onSelectTenant={(id) => {
          const t = tenants.find((item) => item.id === id);
          if (t) setActiveTenant(t);
        }}
        currentUser={currentUser}
        onSelectUser={setCurrentUser}
        wsConnected={wsConnected}
        dlqCount={dlqItems.filter((i) => i.status === 'unresolved').length}
        onOpenDLQ={() => setIsDLQOpen(true)}
        onOpenTenantSettings={() => setIsTenantSettingsOpen(true)}
        onOpenAuditLogs={() => setIsAuditLogsOpen(true)}
        onOpenTemplates={() => setIsTemplatesOpen(true)}
        onOpenTraces={() => setIsTraceDrawerOpen(true)}
      />

      {/* Main Visual DAG Canvas Area */}
      <main className="flex-1 relative w-full h-full overflow-hidden">
        {workflow ? (
          <WorkflowCanvas
            workflow={workflow}
            onUpdateWorkflow={handleUpdateWorkflow}
            onSelectNode={(id) => {
              setSelectedNodeId(id);
              setIsNodeModalOpen(true);
            }}
            onExecute={handleExecuteWorkflow}
            isExecuting={isExecuting}
            validationResult={validationResult}
            onValidate={() => workflow && validateDAG(workflow)}
          />
        ) : (
          <div className="flex items-center justify-center w-full h-full text-slate-500 text-sm">
            Loading workflow canvas...
          </div>
        )}
      </main>

      {/* Node Configuration Inspector Modal */}
      <NodeConfigModal
        node={selectedNode}
        isOpen={isNodeModalOpen}
        onClose={() => setIsNodeModalOpen(false)}
        onSave={(updated) => {
          if (!workflow) return;
          const newNodes = workflow.nodes.map((n) => (n.id === updated.id ? updated : n));
          handleUpdateWorkflow({ ...workflow, nodes: newNodes });
        }}
      />

      {/* Live Distributed Saga Trace Drawer */}
      <LiveTraceDrawer
        execution={activeExecution}
        isOpen={isTraceDrawerOpen}
        onClose={() => setIsTraceDrawerOpen(false)}
        onRedrive={handleRedriveDLQ}
      />

      {/* Dead Letter Queue (DLQ) Modal */}
      <DeadLetterQueueModal
        isOpen={isDLQOpen}
        onClose={() => setIsDLQOpen(false)}
        items={dlqItems}
        onReplay={handleRedriveDLQ}
        onDiscard={handleDiscardDLQ}
      />

      {/* Multi-Tenant MongoDB Isolation Settings Modal */}
      <TenantSettingsModal
        isOpen={isTenantSettingsOpen}
        onClose={() => setIsTenantSettingsOpen(false)}
        activeTenant={activeTenant}
        onUpdateStrategy={handleUpdateTenantStrategy}
        onRefreshTenants={fetchTenants}
      />

      {/* Cryptographic Audit Log Modal */}
      <AuditLogModal
        isOpen={isAuditLogsOpen}
        onClose={() => setIsAuditLogsOpen(false)}
        tenantId={activeTenant?.id || 'acme_logistics'}
      />

      {/* Workflow Template Gallery Modal */}
      <TemplateGalleryModal
        isOpen={isTemplatesOpen}
        onClose={() => setIsTemplatesOpen(false)}
        onSelectTemplate={handleSelectTemplate}
      />
    </div>
  );
}
