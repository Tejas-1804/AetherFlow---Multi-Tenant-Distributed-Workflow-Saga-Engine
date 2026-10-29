import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Play,
  RotateCcw,
  ShieldAlert,
  Trash2,
  X
} from 'lucide-react';
import React, { useState } from 'react';
import { DeadLetterQueueItem } from '../../types/workflow.js';

interface DeadLetterQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: DeadLetterQueueItem[];
  onReplay: (id: string) => void;
  onDiscard: (id: string) => void;
}

export const DeadLetterQueueModal: React.FC<DeadLetterQueueModalProps> = ({
  isOpen,
  onClose,
  items,
  onReplay,
  onDiscard,
}) => {
  if (!isOpen) return null;

  const [selectedItem, setSelectedItem] = useState<DeadLetterQueueItem | null>(items[0] || null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-rose-950/60 border border-rose-800/40 text-rose-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">Dead Letter Queue (DLQ)</h3>
              <p className="text-xs text-slate-400">
                Poisoned jobs & unrecoverable transaction failures retained for root-cause inspection and manual redrive.
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

        {/* Content */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12">
          {/* Item List (Left) */}
          <div className="md:col-span-5 border-r border-slate-800/80 overflow-y-auto p-4 space-y-2 bg-slate-950/20">
            {items.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                The Dead Letter Queue is currently empty. No poisoned transactions.
              </div>
            ) : (
              items.map((item) => {
                const isSelected = selectedItem?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedItem(item)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-slate-800/90 border-rose-500/80 shadow-md'
                        : 'bg-slate-950/50 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-200 truncate">{item.failedNodeLabel}</span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded capitalize ${
                          item.status === 'replayed'
                            ? 'bg-emerald-950 text-emerald-400'
                            : item.status === 'discarded'
                            ? 'bg-slate-800 text-slate-400'
                            : 'bg-rose-950 text-rose-300'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-rose-300/80 line-clamp-1 mt-1 font-mono">{item.error}</p>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2 font-mono">
                      <span>{item.workflowName}</span>
                      <span>{new Date(item.enqueuedAt).toLocaleTimeString()}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Item Inspector (Right) */}
          <div className="md:col-span-7 overflow-y-auto p-5 space-y-5">
            {selectedItem ? (
              <div className="space-y-4">
                {/* Error Banner */}
                <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-900/60 text-rose-200 space-y-1">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                    <span>Failed Step: {selectedItem.failedNodeLabel}</span>
                  </div>
                  <p className="text-xs font-mono text-rose-300 pl-6">{selectedItem.error}</p>
                  <p className="text-[11px] text-slate-400 pl-6">
                    Exhausted {selectedItem.attempts} retry attempts before enqueuing.
                  </p>
                </div>

                {/* Metadata Details */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-slate-950/50 border border-slate-800">
                    <span className="text-[10px] uppercase font-mono text-slate-500">Execution Reference</span>
                    <p className="font-mono text-slate-200 mt-0.5">{selectedItem.executionId}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950/50 border border-slate-800">
                    <span className="text-[10px] uppercase font-mono text-slate-500">Tenant Namespace</span>
                    <p className="font-mono text-slate-200 mt-0.5">{selectedItem.tenantId}</p>
                  </div>
                </div>

                {/* Payload Snapshot */}
                <div>
                  <span className="text-xs uppercase font-mono text-slate-400">State Snapshot at Time of Failure</span>
                  <pre className="mt-1.5 p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-cyan-300 overflow-x-auto max-h-56">
                    {JSON.stringify(selectedItem.payloadSnapshot || {}, null, 2)}
                  </pre>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => onReplay(selectedItem.id)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-emerald-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-all shadow-lg shadow-emerald-500/20"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Redrive / Replay into Saga Engine
                  </button>
                  <button
                    type="button"
                    onClick={() => onDiscard(selectedItem.id)}
                    className="px-4 py-2.5 text-xs font-medium text-slate-400 hover:text-rose-400 bg-slate-800 hover:bg-slate-700/80 rounded-xl transition-colors"
                  >
                    Discard Poison Pill
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-500">Select an item from the list to inspect.</div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
