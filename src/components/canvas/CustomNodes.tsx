import { Handle, Position } from '@xyflow/react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Code2,
  GitFork,
  Globe,
  Play,
  RotateCcw,
  ShieldAlert,
  Sliders,
  Trash2,
  Zap
} from 'lucide-react';
import React from 'react';
import { NodeData } from '../../types/workflow.js';

interface CustomNodeProps {
  id: string;
  data: NodeData & {
    onSelectNode?: (id: string) => void;
    onDeleteNode?: (id: string) => void;
  };
  selected?: boolean;
}

const getStatusBadge = (status?: string) => {
  switch (status) {
    case 'running':
      return (
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-cyan-400">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
          </span>
          Executing...
        </span>
      );
    case 'retrying':
      return (
        <span className="flex items-center gap-1 text-[11px] font-medium text-amber-400">
          <RotateCcw className="w-3 h-3 animate-spin" />
          Retrying Backoff
        </span>
      );
    case 'completed':
      return (
        <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400">
          <CheckCircle2 className="w-3 h-3" />
          Completed
        </span>
      );
    case 'compensating':
      return (
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-amber-400">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
          </span>
          Compensating...
        </span>
      );
    case 'compensated':
      return (
        <span className="flex items-center gap-1 text-[11px] font-medium text-purple-400">
          <RotateCcw className="w-3 h-3" />
          Compensated (Undone)
        </span>
      );
    case 'failed':
      return (
        <span className="flex items-center gap-1 text-[11px] font-medium text-rose-400">
          <AlertCircle className="w-3 h-3" />
          Failed (Retries Exhausted)
        </span>
      );
    default:
      return <span className="text-[11px] text-slate-500">Idle</span>;
  }
};

// Common card container with interactive action controls
const NodeCard: React.FC<{
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  accentColor: string;
  borderColor: string;
  selected?: boolean;
  status?: string;
  onEdit?: () => void;
  onDelete?: () => void;
  children?: React.ReactNode;
}> = ({ title, subtitle, icon, accentColor, borderColor, selected, status, onEdit, onDelete, children }) => {
  return (
    <div
      className={`group relative min-w-[270px] max-w-[320px] rounded-xl bg-slate-900/95 backdrop-blur-md border transition-all duration-200 shadow-xl ${
        selected ? 'ring-2 ring-cyan-400 border-cyan-400/80 shadow-cyan-500/10' : borderColor
      }`}
    >
      {/* Node Header */}
      <div className="p-3.5 border-b border-slate-800/80">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-lg ${accentColor}`}>{icon}</div>
            <div>
              <h4 className="text-xs font-semibold text-slate-100 tracking-tight leading-snug">{title}</h4>
              {subtitle && <p className="text-[11px] text-slate-400 line-clamp-1">{subtitle}</p>}
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
            {onEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                title="Configure Node"
                className="p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition-colors"
              >
                <Sliders className="w-3.5 h-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                title="Delete Node"
                className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Body Details */}
      {children && <div className="p-3.5 space-y-2 text-xs">{children}</div>}

      {/* Status Bar */}
      <div className="px-3.5 py-2 bg-slate-950/60 rounded-b-xl border-t border-slate-800/50 flex items-center justify-between">
        <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500">Status</span>
        <div>{getStatusBadge(status)}</div>
      </div>
    </div>
  );
};

export const TriggerNode: React.FC<CustomNodeProps> = ({ id, data, selected }) => {
  return (
    <div onClick={() => data.onSelectNode?.(id)}>
      <NodeCard
        title={data.label}
        subtitle="Pipeline Webhook Trigger"
        icon={<Zap className="w-4 h-4 text-emerald-400" />}
        accentColor="bg-emerald-950/60 border border-emerald-800/40"
        borderColor="border-emerald-900/40 hover:border-emerald-600/60"
        selected={selected}
        status={data.status}
        onEdit={() => data.onSelectNode?.(id)}
        onDelete={() => data.onDeleteNode?.(id)}
      >
        <div className="flex items-center justify-between text-slate-400 font-mono text-[11px]">
          <span>Event: POST /webhook</span>
          <span className="text-emerald-400">Entry Point</span>
        </div>
      </NodeCard>
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-emerald-400 !border-2 !border-slate-950" />
    </div>
  );
};

export const SagaStepNode: React.FC<CustomNodeProps> = ({ id, data, selected }) => {
  const retryPolicy = data.retryPolicy || { maxAttempts: 3, backoffMultiplier: 2 };
  const hasCompensation = Boolean(data.compensation);

  return (
    <div onClick={() => data.onSelectNode?.(id)}>
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-cyan-400 !border-2 !border-slate-950" />
      <NodeCard
        title={data.label}
        subtitle={data.description || 'Distributed Saga Transaction'}
        icon={<Globe className="w-4 h-4 text-cyan-400" />}
        accentColor="bg-cyan-950/60 border border-cyan-800/40"
        borderColor="border-cyan-900/40 hover:border-cyan-600/60"
        selected={selected}
        status={data.status}
        onEdit={() => data.onSelectNode?.(id)}
        onDelete={() => data.onDeleteNode?.(id)}
      >
        {/* Forward Action */}
        <div className="flex items-center justify-between text-slate-300 font-mono text-[11px] bg-slate-950/40 p-1.5 rounded">
          <span className="text-cyan-400 font-semibold">{data.action?.method || 'POST'}</span>
          <span className="text-slate-400 truncate max-w-[160px]">{data.action?.endpoint || '/api/service'}</span>
        </div>

        {/* Saga Compensation & Retry Summary */}
        <div className="flex items-center justify-between text-[11px] pt-1">
          <div className="flex items-center gap-1.5">
            {hasCompensation ? (
              <span className="flex items-center gap-1 text-purple-300 bg-purple-950/50 border border-purple-800/40 px-2 py-0.5 rounded text-[10px]">
                <RotateCcw className="w-2.5 h-2.5 text-purple-400" />
                Compensatable
              </span>
            ) : (
              <span className="text-slate-500 text-[10px]">No Rollback</span>
            )}
          </div>
          <span className="text-slate-400 font-mono text-[10px]">
            {retryPolicy.maxAttempts}x Retries (Exp Backoff)
          </span>
        </div>
      </NodeCard>
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-cyan-400 !border-2 !border-slate-950" />
    </div>
  );
};

export const ConditionNode: React.FC<CustomNodeProps> = ({ id, data, selected }) => {
  return (
    <div onClick={() => data.onSelectNode?.(id)}>
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-amber-400 !border-2 !border-slate-950" />
      <NodeCard
        title={data.label}
        subtitle="Conditional Decision Branch"
        icon={<GitFork className="w-4 h-4 text-amber-400" />}
        accentColor="bg-amber-950/60 border border-amber-800/40"
        borderColor="border-amber-900/40 hover:border-amber-600/60"
        selected={selected}
        status={data.status}
        onEdit={() => data.onSelectNode?.(id)}
        onDelete={() => data.onDeleteNode?.(id)}
      >
        <div className="p-2 rounded bg-slate-950/70 border border-slate-800 font-mono text-[11px] text-amber-300">
          <code>{data.conditionExpression || 'payload.amount >= 250'}</code>
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
          <span className="text-emerald-400">➔ Upper: True</span>
          <span className="text-rose-400">➔ Lower: False</span>
        </div>
      </NodeCard>
      {/* Top Handle for True branch */}
      <Handle
        type="source"
        position={Position.Right}
        id="true"
        style={{ top: '35%' }}
        className="!w-3 !h-3 !bg-emerald-400 !border-2 !border-slate-950"
      />
      {/* Bottom Handle for False branch */}
      <Handle
        type="source"
        position={Position.Right}
        id="false"
        style={{ top: '65%' }}
        className="!w-3 !h-3 !bg-rose-400 !border-2 !border-slate-950"
      />
    </div>
  );
};

export const TransformNode: React.FC<CustomNodeProps> = ({ id, data, selected }) => {
  return (
    <div onClick={() => data.onSelectNode?.(id)}>
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-indigo-400 !border-2 !border-slate-950" />
      <NodeCard
        title={data.label}
        subtitle="Sandboxed JS VM Transform"
        icon={<Code2 className="w-4 h-4 text-indigo-400" />}
        accentColor="bg-indigo-950/60 border border-indigo-800/40"
        borderColor="border-indigo-900/40 hover:border-indigo-600/60"
        selected={selected}
        status={data.status}
        onEdit={() => data.onSelectNode?.(id)}
        onDelete={() => data.onDeleteNode?.(id)}
      >
        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono bg-slate-950/50 p-1.5 rounded">
          <span>Runtime: Node.js VM</span>
          <span className="text-indigo-300">Timeout 2000ms</span>
        </div>
      </NodeCard>
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-indigo-400 !border-2 !border-slate-950" />
    </div>
  );
};

export const DelayNode: React.FC<CustomNodeProps> = ({ id, data, selected }) => {
  return (
    <div onClick={() => data.onSelectNode?.(id)}>
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-sky-400 !border-2 !border-slate-950" />
      <NodeCard
        title={data.label}
        subtitle="Asynchronous Wait Timer"
        icon={<Clock className="w-4 h-4 text-sky-400" />}
        accentColor="bg-sky-950/60 border border-sky-800/40"
        borderColor="border-sky-900/40 hover:border-sky-600/60"
        selected={selected}
        status={data.status}
        onEdit={() => data.onSelectNode?.(id)}
        onDelete={() => data.onDeleteNode?.(id)}
      >
        <div className="flex items-center justify-between text-[11px] text-slate-300 font-mono bg-slate-950/50 p-1.5 rounded">
          <span>Pause Duration</span>
          <span className="text-sky-300 font-bold">{data.delayMs || 1000} ms</span>
        </div>
      </NodeCard>
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-sky-400 !border-2 !border-slate-950" />
    </div>
  );
};

export const EndNode: React.FC<CustomNodeProps> = ({ id, data, selected }) => {
  return (
    <div onClick={() => data.onSelectNode?.(id)}>
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-emerald-400 !border-2 !border-slate-950" />
      <NodeCard
        title={data.label}
        subtitle="Terminal Workflow Seal"
        icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />}
        accentColor="bg-emerald-950/60 border border-emerald-800/40"
        borderColor="border-emerald-900/40 hover:border-emerald-600/60"
        selected={selected}
        status={data.status}
        onEdit={() => data.onSelectNode?.(id)}
        onDelete={() => data.onDeleteNode?.(id)}
      >
        <div className="text-[11px] text-slate-400">
          Saga transaction sealed and marked completed.
        </div>
      </NodeCard>
    </div>
  );
};

export const nodeTypes = {
  triggerNode: TriggerNode,
  sagaStepNode: SagaStepNode,
  conditionNode: ConditionNode,
  transformNode: TransformNode,
  delayNode: DelayNode,
  endNode: EndNode,
};
