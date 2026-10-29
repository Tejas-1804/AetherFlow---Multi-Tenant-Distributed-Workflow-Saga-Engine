import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Connection,
  Controls,
  Edge,
  MiniMap,
  Node,
  ReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Code2,
  FileDown,
  GitFork,
  Globe,
  LayoutGrid,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Zap
} from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import { NodeType, ValidationResult, WorkflowDefinition, WorkflowEdge, WorkflowNode } from '../../types/workflow.js';
import { nodeTypes } from './CustomNodes.js';

interface WorkflowCanvasProps {
  workflow: WorkflowDefinition;
  onUpdateWorkflow: (updated: WorkflowDefinition) => void;
  onSelectNode: (nodeId: string) => void;
  onExecute: (simulateFailureNodeId?: string) => void;
  isExecuting: boolean;
  validationResult: ValidationResult | null;
  onValidate: () => void;
}

export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({
  workflow,
  onUpdateWorkflow,
  onSelectNode,
  onExecute,
  isExecuting,
  validationResult,
  onValidate,
}) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Wire node callbacks into data
  const nodes = useMemo(() => {
    return workflow.nodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        onSelectNode: (id: string) => {
          setSelectedNodeId(id);
          onSelectNode(id);
        },
        onDeleteNode: (id: string) => {
          handleDeleteNode(id);
        },
      },
    }));
  }, [workflow.nodes, onSelectNode]);

  const edges = workflow.edges;

  // Node position & selection changes
  const onNodesChange = useCallback(
    (changes: any) => {
      const updatedNodes = applyNodeChanges(changes, workflow.nodes as any) as unknown as WorkflowNode[];
      onUpdateWorkflow({ ...workflow, nodes: updatedNodes });
    },
    [workflow, onUpdateWorkflow]
  );

  // Edge changes
  const onEdgesChange = useCallback(
    (changes: any) => {
      const updatedEdges = applyEdgeChanges(changes, workflow.edges as any) as unknown as WorkflowEdge[];
      onUpdateWorkflow({ ...workflow, edges: updatedEdges });
    },
    [workflow, onUpdateWorkflow]
  );

  // Connection between nodes
  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge: Edge = {
        ...params,
        id: `e_${params.source}_${params.target}_${Date.now()}`,
        animated: true,
        style: { stroke: '#06b6d4', strokeWidth: 2 },
      } as Edge;
      const updatedEdges = addEdge(newEdge, workflow.edges as any) as unknown as WorkflowEdge[];
      onUpdateWorkflow({ ...workflow, edges: updatedEdges });
    },
    [workflow, onUpdateWorkflow]
  );

  // Delete node
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      const filteredNodes = workflow.nodes.filter((n) => n.id !== nodeId);
      const filteredEdges = workflow.edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
      onUpdateWorkflow({ ...workflow, nodes: filteredNodes, edges: filteredEdges });
    },
    [workflow, onUpdateWorkflow]
  );

  // Add new node to canvas
  const handleAddNode = (type: NodeType) => {
    const id = `node_${type}_${Date.now().toString().slice(-4)}`;
    const xOffset = 100 + workflow.nodes.length * 60;
    const yOffset = 200 + (workflow.nodes.length % 3) * 60;

    let nodeData: any = {
      label: `New ${type.replace('_', ' ').toUpperCase()}`,
      nodeType: type,
      status: 'idle',
    };

    let reactFlowType = 'sagaStepNode';

    switch (type) {
      case 'trigger':
        reactFlowType = 'triggerNode';
        nodeData.label = 'Incoming Webhook Event';
        break;
      case 'saga_step':
        reactFlowType = 'sagaStepNode';
        nodeData = {
          ...nodeData,
          label: 'Microservice Transaction',
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
            maxIntervalMs: 3000,
            enableJitter: true,
          },
        };
        break;
      case 'condition':
        reactFlowType = 'conditionNode';
        nodeData.label = 'Evaluate Business Rule';
        nodeData.conditionExpression = 'payload.amount >= 250';
        break;
      case 'transform':
        reactFlowType = 'transformNode';
        nodeData.label = 'Transform Data (JS VM)';
        nodeData.action = {
          type: 'script',
          script: 'return { ...payload, formatted: true };',
        };
        break;
      case 'delay':
        reactFlowType = 'delayNode';
        nodeData.label = 'Pause Execution';
        nodeData.delayMs = 1500;
        break;
      case 'end':
        reactFlowType = 'endNode';
        nodeData.label = 'Transaction Finalized';
        break;
    }

    const newNode: WorkflowNode = {
      id,
      type: reactFlowType,
      position: { x: xOffset, y: yOffset },
      data: nodeData,
    };

    onUpdateWorkflow({
      ...workflow,
      nodes: [...workflow.nodes, newNode],
    });
  };

  // Auto-Layout DAG: Topological hierarchical alignment
  const handleAutoLayout = () => {
    if (!validationResult || validationResult.topologicalLevels.length === 0) {
      onValidate();
    }

    const levels = validationResult?.topologicalLevels || [];
    if (levels.length === 0) return;

    const newNodes = [...workflow.nodes];
    const nodeMap = new Map(newNodes.map((n) => [n.id, n]));

    levels.forEach((levelNodeIds, levelIndex) => {
      const x = 60 + levelIndex * 280;
      levelNodeIds.forEach((nodeId, nodeIndex) => {
        const node = nodeMap.get(nodeId);
        if (node) {
          const totalInLevel = levelNodeIds.length;
          const y = 180 + (nodeIndex - (totalInLevel - 1) / 2) * 160;
          node.position = { x, y };
        }
      });
    });

    onUpdateWorkflow({ ...workflow, nodes: newNodes });
  };

  // Remove the cycle edge automatically
  const handleBreakCycle = () => {
    if (!validationResult || !validationResult.hasCycle || validationResult.cycleNodes.length < 2) return;
    const cycleNodes = validationResult.cycleNodes;
    const source = cycleNodes[cycleNodes.length - 2];
    const target = cycleNodes[cycleNodes.length - 1];

    const filteredEdges = workflow.edges.filter((e) => !(e.source === source && e.target === target));
    onUpdateWorkflow({ ...workflow, edges: filteredEdges });
  };

  // Find high-risk step to simulate downstream failure
  const downstreamSagaStep = workflow.nodes.find(
    (n) => n.data.nodeType === 'saga_step' && n.id !== workflow.nodes[0]?.id
  );

  return (
    <div className="relative w-full h-full flex flex-col bg-[#0b0f19] overflow-hidden">
      {/* Top Controls Toolbar */}
      <div className="absolute top-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 backdrop-blur-md border border-slate-800/80 p-2.5 rounded-xl shadow-2xl">
        {/* Left: Add Node Palette */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
          <span className="text-[11px] font-mono text-slate-500 uppercase tracking-wider px-2">Add:</span>
          <button
            type="button"
            onClick={() => handleAddNode('trigger')}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-300 bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-800/50 rounded-lg transition-all"
          >
            <Zap className="w-3.5 h-3.5" />
            Trigger
          </button>
          <button
            type="button"
            onClick={() => handleAddNode('saga_step')}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-cyan-300 bg-cyan-950/40 hover:bg-cyan-900/50 border border-cyan-800/50 rounded-lg transition-all"
          >
            <Globe className="w-3.5 h-3.5" />
            Saga Step
          </button>
          <button
            type="button"
            onClick={() => handleAddNode('condition')}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-amber-300 bg-amber-950/40 hover:bg-amber-900/50 border border-amber-800/50 rounded-lg transition-all"
          >
            <GitFork className="w-3.5 h-3.5" />
            Condition
          </button>
          <button
            type="button"
            onClick={() => handleAddNode('transform')}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-indigo-300 bg-indigo-950/40 hover:bg-indigo-900/50 border border-indigo-800/50 rounded-lg transition-all"
          >
            <Code2 className="w-3.5 h-3.5" />
            JS Transform
          </button>
          <button
            type="button"
            onClick={() => handleAddNode('delay')}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-sky-300 bg-sky-950/40 hover:bg-sky-900/50 border border-sky-800/50 rounded-lg transition-all"
          >
            <Clock className="w-3.5 h-3.5" />
            Delay
          </button>
          <button
            type="button"
            onClick={() => handleAddNode('end')}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-300 bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-800/50 rounded-lg transition-all"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            End
          </button>
        </div>

        {/* Right: Validation & Run Controls */}
        <div className="flex items-center gap-2">
          {/* Auto Layout */}
          <button
            type="button"
            onClick={handleAutoLayout}
            title="Auto-align DAG hierarchically"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 rounded-lg transition-all"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-cyan-400" />
            Auto-Layout
          </button>

          {/* Validate DAG */}
          <button
            type="button"
            onClick={onValidate}
            title="Verify Directed Acyclic Graph constraints"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 rounded-lg transition-all"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            Validate DAG
          </button>

          {/* Simulate Failure & Saga Rollback */}
          <button
            type="button"
            disabled={isExecuting}
            onClick={() => onExecute(downstreamSagaStep?.id || 'node_express_shipping')}
            title="Fails downstream step to demonstrate reverse LIFO compensations and Dead Letter Queue"
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-rose-200 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800/60 rounded-lg transition-all shadow-lg shadow-rose-950/30 disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
            Simulate Saga Rollback
          </button>

          {/* Execute Normal Workflow */}
          <button
            type="button"
            disabled={isExecuting}
            onClick={() => onExecute()}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-emerald-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
          >
            {isExecuting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Executing Saga...
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                Run Workflow
              </>
            )}
          </button>
        </div>
      </div>

      {/* Cycle Detection Banner Alert */}
      {validationResult?.hasCycle && (
        <div className="absolute top-20 left-4 right-4 z-20 flex items-center justify-between gap-4 p-3 bg-rose-950/90 border border-rose-700/80 text-rose-200 rounded-xl shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <div>
              <p className="text-xs font-semibold">Graph Loop / Cycle Detected!</p>
              <p className="text-[11px] text-rose-300/90 font-mono mt-0.5">
                {validationResult.errors.find((e) => e.type === 'cycle')?.message}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleBreakCycle}
            className="px-3 py-1.5 text-xs font-semibold text-rose-950 bg-rose-300 hover:bg-rose-200 rounded-lg transition-colors shrink-0"
          >
            Fix: Break Cycle Edge
          </button>
        </div>
      )}

      {/* React Flow Visual Canvas */}
      <div className="w-full h-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          attributionPosition="bottom-left"
          className="bg-[#0b0f19]"
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="#1e293b" />
          <Controls className="!bg-slate-900 !border !border-slate-800 !rounded-lg !shadow-xl [&>button]:!bg-slate-900 [&>button]:!border-slate-800 [&>button]:!text-slate-300 hover:[&>button]:!bg-slate-800" />
          <MiniMap
            nodeStrokeColor="#06b6d4"
            nodeColor="#0f172a"
            maskColor="rgba(11, 15, 25, 0.85)"
            className="!bg-slate-900/90 !border !border-slate-800 !rounded-xl !shadow-xl"
          />
        </ReactFlow>
      </div>
    </div>
  );
};
