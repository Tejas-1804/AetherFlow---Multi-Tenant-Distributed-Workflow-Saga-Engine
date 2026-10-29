import {
  Code2,
  Globe,
  RotateCcw,
  Sliders,
  X,
  Zap
} from 'lucide-react';
import React, { useState } from 'react';
import { WorkflowNode } from '../../types/workflow.js';

interface NodeConfigModalProps {
  node: WorkflowNode | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedNode: WorkflowNode) => void;
}

export const NodeConfigModal: React.FC<NodeConfigModalProps> = ({ node, isOpen, onClose, onSave }) => {
  if (!isOpen || !node) return null;

  const [label, setLabel] = useState(node.data.label || '');
  const [description, setDescription] = useState(node.data.description || '');
  const [method, setMethod] = useState(node.data.action?.method || 'POST');
  const [endpoint, setEndpoint] = useState(node.data.action?.endpoint || '');
  const [timeoutMs, setTimeoutMs] = useState(node.data.action?.timeoutMs || 3000);

  // Compensation settings
  const [hasCompensation, setHasCompensation] = useState(Boolean(node.data.compensation));
  const [compEndpoint, setCompEndpoint] = useState(node.data.compensation?.endpoint || '');
  const [compMethod, setCompMethod] = useState(node.data.compensation?.method || 'POST');

  // Retry settings
  const [maxAttempts, setMaxAttempts] = useState(node.data.retryPolicy?.maxAttempts ?? 3);
  const [initialIntervalMs, setInitialIntervalMs] = useState(node.data.retryPolicy?.initialIntervalMs ?? 500);
  const [backoffMultiplier, setBackoffMultiplier] = useState(node.data.retryPolicy?.backoffMultiplier ?? 2);
  const [enableJitter, setEnableJitter] = useState(node.data.retryPolicy?.enableJitter ?? true);

  // Condition Expression
  const [conditionExpression, setConditionExpression] = useState(node.data.conditionExpression || 'payload.amount >= 250');

  // Script
  const [script, setScript] = useState(
    node.data.action?.script ||
      `// Transform input payload safely in isolated Node.js VM
return {
  ...payload,
  transformedAt: new Date().toISOString()
};`
  );

  const [idempotencyKey, setIdempotencyKey] = useState(node.data.idempotencyKey || '');

  const handleSave = () => {
    const updated: WorkflowNode = {
      ...node,
      data: {
        ...node.data,
        label,
        description,
        idempotencyKey: idempotencyKey || undefined,
        conditionExpression: node.data.nodeType === 'condition' ? conditionExpression : undefined,
        action: {
          ...node.data.action,
          type: node.data.nodeType === 'transform' ? 'script' : 'mock_service',
          method,
          endpoint,
          timeoutMs,
          script: node.data.nodeType === 'transform' ? script : undefined,
        },
        compensation: hasCompensation
          ? {
              type: 'mock_service',
              endpoint: compEndpoint || '/api/mock/payment/refund',
              method: compMethod,
              timeoutMs: 4000,
            }
          : undefined,
        retryPolicy: {
          maxAttempts,
          initialIntervalMs,
          backoffMultiplier,
          maxIntervalMs: 10000,
          enableJitter,
        },
      },
    };

    onSave(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-5 bg-slate-900/95 border-b border-slate-800 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-950/60 border border-cyan-800/40 text-cyan-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100">Configure Node: {node.data.label}</h3>
              <p className="text-xs text-slate-400 font-mono">
                ID: {node.id} · Type: {node.data.nodeType.toUpperCase()}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-6">
          {/* General Information */}
          <div className="space-y-4">
            <h4 className="text-xs uppercase font-mono font-semibold tracking-wider text-slate-400">General Info</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Step Label</label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Idempotency Key Pattern</label>
                <input
                  type="text"
                  value={idempotencyKey}
                  placeholder="e.g. pmt_{{payload.orderId}}"
                  onChange={(e) => setIdempotencyKey(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Description / Documentation</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Condition Expression (If Condition Node) */}
          {node.data.nodeType === 'condition' && (
            <div className="space-y-3 p-4 rounded-xl bg-amber-950/20 border border-amber-900/40">
              <h4 className="text-xs uppercase font-mono font-semibold tracking-wider text-amber-300">
                Condition Logic Expression
              </h4>
              <p className="text-xs text-slate-400">
                Evaluated against the running JSON payload. Returns true/false to branch execution.
              </p>
              <input
                type="text"
                value={conditionExpression}
                onChange={(e) => setConditionExpression(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-amber-300 font-mono focus:outline-none focus:border-amber-500"
              />
            </div>
          )}

          {/* JavaScript Sandbox Script (If Transform Node) */}
          {node.data.nodeType === 'transform' && (
            <div className="space-y-3 p-4 rounded-xl bg-indigo-950/20 border border-indigo-900/40">
              <div className="flex items-center justify-between">
                <h4 className="text-xs uppercase font-mono font-semibold tracking-wider text-indigo-300">
                  Node.js Isolated VM Transformation Script
                </h4>
                <span className="text-[10px] font-mono text-slate-500">Timeout 2000ms</span>
              </div>
              <textarea
                rows={6}
                value={script}
                onChange={(e) => setScript(e.target.value)}
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-indigo-200 font-mono focus:outline-none focus:border-indigo-500 leading-relaxed"
              />
            </div>
          )}

          {/* Forward Action (HTTP / Mock Microservice) */}
          {node.data.nodeType !== 'condition' && node.data.nodeType !== 'transform' && (
            <div className="space-y-4 p-4 rounded-xl bg-slate-950/40 border border-slate-800">
              <div className="flex items-center justify-between">
                <h4 className="text-xs uppercase font-mono font-semibold tracking-wider text-cyan-400 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" />
                  Forward Step Action
                </h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-1">
                  <label className="block text-xs font-medium text-slate-300 mb-1">HTTP Method</label>
                  <select
                    value={method}
                    onChange={(e: any) => setMethod(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 font-mono"
                  >
                    <option value="POST">POST</option>
                    <option value="GET">GET</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </div>
                <div className="md:col-span-3">
                  <label className="block text-xs font-medium text-slate-300 mb-1">Service Endpoint URL</label>
                  <input
                    type="text"
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    placeholder="/api/mock/payment/charge"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Saga Compensation Undo Definition */}
          {node.data.nodeType === 'saga_step' && (
            <div className="space-y-4 p-4 rounded-xl bg-purple-950/20 border border-purple-900/40">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-purple-400" />
                  <h4 className="text-xs uppercase font-mono font-semibold tracking-wider text-purple-300">
                    Saga Compensation (Undo Transaction)
                  </h4>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasCompensation}
                    onChange={(e) => setHasCompensation(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-purple-600 focus:ring-0"
                  />
                  <span>Enable Compensation</span>
                </label>
              </div>

              {hasCompensation && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2">
                  <div className="md:col-span-1">
                    <label className="block text-xs font-medium text-slate-300 mb-1">Rollback Method</label>
                    <select
                      value={compMethod}
                      onChange={(e: any) => setCompMethod(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-purple-900/60 rounded-lg text-xs text-slate-200 font-mono"
                    >
                      <option value="POST">POST</option>
                      <option value="DELETE">DELETE</option>
                      <option value="PUT">PUT</option>
                    </select>
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Rollback Compensation Endpoint
                    </label>
                    <input
                      type="text"
                      value={compEndpoint}
                      onChange={(e) => setCompEndpoint(e.target.value)}
                      placeholder="/api/mock/payment/refund"
                      className="w-full px-3 py-2 bg-slate-950 border border-purple-900/60 rounded-lg text-xs text-slate-200 font-mono"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Exponential Backoff Retry Policy */}
          <div className="space-y-4 p-4 rounded-xl bg-slate-950/40 border border-slate-800">
            <h4 className="text-xs uppercase font-mono font-semibold tracking-wider text-amber-400">
              Exponential Backoff Retry Policy
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Max Retry Attempts</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={maxAttempts}
                  onChange={(e) => setMaxAttempts(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Initial Interval (ms)</label>
                <input
                  type="number"
                  min="100"
                  step="100"
                  value={initialIntervalMs}
                  onChange={(e) => setInitialIntervalMs(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Backoff Multiplier</label>
                <input
                  type="number"
                  min="1"
                  step="0.5"
                  value={backoffMultiplier}
                  onChange={(e) => setBackoffMultiplier(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 font-mono"
                />
              </div>
            </div>
            <div className="pt-1 flex items-center justify-between text-xs text-slate-400">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableJitter}
                  onChange={(e) => setEnableJitter(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-cyan-600 focus:ring-0"
                />
                <span>Add Randomized Jitter to prevent thundering herd</span>
              </label>
              <span className="font-mono text-[11px] text-slate-500">
                Formula: delay = min(maxInterval, initial * (multiplier ^ attempt))
              </span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 p-5 bg-slate-900/95 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 text-xs font-semibold text-cyan-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors shadow-lg shadow-cyan-500/20"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};
