import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  Clock,
  Code2,
  Copy,
  ExternalLink,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Terminal,
  X
} from 'lucide-react';
import React, { useState } from 'react';
import { StepExecutionRecord, StepStatus, WorkflowExecution } from '../../types/workflow.js';

interface LiveTraceDrawerProps {
  execution: WorkflowExecution | null;
  isOpen: boolean;
  onClose: () => void;
  onRedrive?: (executionId: string) => void;
}

export const LiveTraceDrawer: React.FC<LiveTraceDrawerProps> = ({ execution, isOpen, onClose, onRedrive }) => {
  if (!isOpen || !execution) return null;

  const [selectedStepId, setSelectedStepId] = useState<string | null>(
    Object.keys(execution.stepExecutions)[0] || null
  );
  const [activeTab, setActiveTab] = useState<'timeline' | 'payload' | 'compensations'>('timeline');

  const selectedStep: StepExecutionRecord | undefined = selectedStepId
    ? execution.stepExecutions[selectedStepId]
    : undefined;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
            <CheckCircle2 className="w-3.5 h-3.5" />
            SUCCESSFUL
          </span>
        );
      case 'compensating':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-amber-950/60 text-amber-400 border border-amber-800/40">
            <RotateCcw className="w-3.5 h-3.5 animate-spin" />
            COMPENSATING SAGA
          </span>
        );
      case 'compensated':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-purple-950/60 text-purple-300 border border-purple-800/40">
            <RotateCcw className="w-3.5 h-3.5" />
            COMPENSATED (REVERSED)
          </span>
        );
      case 'dlq':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-rose-950/60 text-rose-300 border border-rose-800/40">
            <ShieldAlert className="w-3.5 h-3.5" />
            DEAD LETTER QUEUE
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-cyan-950/60 text-cyan-400 border border-cyan-800/40">
            <Clock className="w-3.5 h-3.5 animate-pulse" />
            RUNNING
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-3xl bg-slate-900/98 backdrop-blur-xl border-l border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
        <div>
          <div className="flex items-center gap-3">
            <h3 className="text-base font-bold text-slate-100">{execution.workflowName}</h3>
            {getStatusBadge(execution.status)}
          </div>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Execution ID: <span className="text-cyan-400">{execution.id}</span> · Tenant:{' '}
            <span className="text-slate-300">{execution.tenantId}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Summary Metric Ribbon */}
      <div className="grid grid-cols-4 gap-2 p-3 bg-slate-950/60 border-b border-slate-800/80 text-xs">
        <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
          <span className="text-[10px] uppercase font-mono text-slate-500">Total Steps</span>
          <p className="text-sm font-bold text-slate-200 mt-0.5">{execution.metrics.totalSteps}</p>
        </div>
        <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
          <span className="text-[10px] uppercase font-mono text-slate-500">Completed</span>
          <p className="text-sm font-bold text-emerald-400 mt-0.5">{execution.metrics.completedSteps}</p>
        </div>
        <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
          <span className="text-[10px] uppercase font-mono text-slate-500">Compensated</span>
          <p className="text-sm font-bold text-purple-400 mt-0.5">{execution.metrics.compensatedSteps}</p>
        </div>
        <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
          <span className="text-[10px] uppercase font-mono text-slate-500">Total Retries</span>
          <p className="text-sm font-bold text-amber-400 mt-0.5">{execution.metrics.retryCount}</p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 p-2 bg-slate-950/30 border-b border-slate-800 text-xs font-medium">
        <button
          type="button"
          onClick={() => setActiveTab('timeline')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            activeTab === 'timeline' ? 'bg-cyan-500/10 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Distributed Step Timeline
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('compensations')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            activeTab === 'compensations'
              ? 'bg-purple-500/10 text-purple-300 font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Saga Rollback Log ({execution.compensationHistory.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('payload')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            activeTab === 'payload' ? 'bg-slate-800 text-slate-100 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Payload State Inspector
        </button>
      </div>

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* Error Alert Banner if Execution Failed */}
        {execution.error && (
          <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-900/60 text-rose-200 space-y-1">
            <div className="flex items-center gap-2 font-semibold text-xs">
              <AlertCircle className="w-4 h-4 text-rose-400" />
              <span>Downstream Step Failure Triggered Saga Rollback</span>
            </div>
            <p className="text-xs text-rose-300/90 font-mono pl-6">{execution.error.message}</p>
            <p className="text-[11px] text-slate-400 pl-6">
              Failed after {execution.error.exhaustedAttempts} exponential backoff attempts. Job enqueued in Dead
              Letter Queue.
            </p>
          </div>
        )}

        {/* Tab 1: Timeline & Step Details */}
        {activeTab === 'timeline' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            {/* Step List (Left Column) */}
            <div className="md:col-span-5 space-y-2">
              <h4 className="text-[11px] uppercase font-mono text-slate-400 tracking-wider">Executed Steps</h4>
              {Object.entries(execution.stepExecutions).map(([nodeId, step]) => {
                const isSelected = selectedStepId === nodeId;
                return (
                  <button
                    key={nodeId}
                    type="button"
                    onClick={() => setSelectedStepId(nodeId)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-slate-800/90 border-cyan-500/80 shadow-md'
                        : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-200 truncate">{step.nodeLabel}</span>
                      <span className="text-[10px] font-mono capitalize text-slate-400">{step.status}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1 font-mono">
                      <span>{step.durationMs ? `${step.durationMs}ms` : 'Pending'}</span>
                      {step.attempts > 1 && (
                        <span className="text-amber-400">{step.attempts} attempts</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Selected Step Inspection (Right Column) */}
            <div className="md:col-span-7 space-y-4">
              {selectedStep ? (
                <div className="space-y-4 p-4 rounded-xl bg-slate-950/50 border border-slate-800">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">{selectedStep.nodeLabel}</h4>
                      <p className="text-[10px] font-mono text-slate-400">Node ID: {selectedStep.nodeId}</p>
                    </div>
                    <span className="text-xs font-mono uppercase text-cyan-400">{selectedStep.status}</span>
                  </div>

                  {/* Retry Log if Retried */}
                  {selectedStep.retryLog.length > 0 && (
                    <div className="space-y-2 p-3 rounded-lg bg-amber-950/20 border border-amber-900/40">
                      <h5 className="text-[11px] font-semibold text-amber-300 flex items-center gap-1.5">
                        <RotateCcw className="w-3 h-3 text-amber-400" />
                        Exponential Backoff Retry History
                      </h5>
                      {selectedStep.retryLog.map((r, i) => (
                        <div key={i} className="text-[11px] font-mono text-amber-200/80 flex items-center justify-between">
                          <span>Attempt #{r.attempt} (Backoff: {r.delayMs}ms)</span>
                          <span className="text-rose-400 truncate max-w-[140px]">{r.error}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Compensation details if compensated */}
                  {selectedStep.compensationRecord && (
                    <div className="p-3 rounded-lg bg-purple-950/20 border border-purple-900/40 space-y-1">
                      <h5 className="text-[11px] font-semibold text-purple-300 flex items-center gap-1.5">
                        <RotateCcw className="w-3 h-3 text-purple-400" />
                        Saga Rollback Action Executed
                      </h5>
                      <p className="text-[11px] text-purple-200 font-mono">
                        Endpoint: {selectedStep.compensationRecord.details?.endpoint || 'Compensated'}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        Completed at: {selectedStep.compensationRecord.completedAt}
                      </p>
                    </div>
                  )}

                  {/* Step Input Payload */}
                  <div>
                    <span className="text-[10px] uppercase font-mono text-slate-400">Step Input Payload</span>
                    <pre className="mt-1 p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-cyan-200 overflow-x-auto max-h-40">
                      {JSON.stringify(selectedStep.inputPayload || {}, null, 2)}
                    </pre>
                  </div>

                  {/* Step Output Payload */}
                  {selectedStep.outputPayload && (
                    <div>
                      <span className="text-[10px] uppercase font-mono text-slate-400">Step Output Payload</span>
                      <pre className="mt-1 p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-40">
                        {JSON.stringify(selectedStep.outputPayload, null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* Error if Failed */}
                  {selectedStep.error && (
                    <div>
                      <span className="text-[10px] uppercase font-mono text-rose-400">Error Description</span>
                      <div className="mt-1 p-2.5 rounded-lg bg-rose-950/30 border border-rose-900/50 text-rose-300 font-mono text-xs">
                        {selectedStep.error}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-slate-500">Select a step to view execution trace.</div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Saga Compensations */}
        {activeTab === 'compensations' && (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-slate-950/50 border border-slate-800 text-xs text-slate-300">
              <p className="font-semibold text-slate-200 mb-1">Reverse Topological Order (LIFO) Rollbacks</p>
              When a distributed transaction fails downstream, completed steps are compensated in strict reverse order
              to guarantee eventual consistency across all microservices.
            </div>

            {execution.compensationHistory.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No compensations were triggered for this execution (workflow ran without unrecoverable errors).
              </div>
            ) : (
              <div className="space-y-2">
                {execution.compensationHistory.map((comp, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-slate-950/50 border border-purple-900/40 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-purple-950 border border-purple-700/60 flex items-center justify-center font-mono text-[11px] text-purple-300 font-bold">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="font-semibold text-slate-200">{comp.nodeLabel}</p>
                        <p className="text-[11px] text-purple-300 font-mono">{comp.action}</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-purple-400 uppercase font-mono">
                      Compensated
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Complete Payload State */}
        {activeTab === 'payload' && (
          <div className="space-y-4">
            <div>
              <span className="text-[11px] uppercase font-mono text-slate-400">Initial Trigger Payload</span>
              <pre className="mt-1 p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-cyan-300 overflow-x-auto">
                {JSON.stringify(execution.triggerPayload || {}, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-950/40 text-xs">
        <span className="text-slate-500 font-mono">Started: {new Date(execution.startedAt).toLocaleTimeString()}</span>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors font-medium"
        >
          Close Drawer
        </button>
      </div>
    </div>
  );
};
