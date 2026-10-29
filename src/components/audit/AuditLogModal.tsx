import { CheckCircle2, FileText, Lock, ShieldCheck, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { AuditLogRecord } from '../../types/workflow.js';

interface AuditLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
}

export const AuditLogModal: React.FC<AuditLogModalProps> = ({ isOpen, onClose, tenantId }) => {
  if (!isOpen) return null;

  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch('/api/audit', {
          headers: { 'x-tenant-id': tenantId },
        });
        if (res.ok) {
          const data = await res.json();
          setLogs(data);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, [tenantId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-950/60 border border-emerald-800/40 text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">Cryptographic Audit Trail</h3>
              <p className="text-xs text-slate-400">
                Immutable, tamper-evident log records verified by SHA-256 HMAC cryptographic seals.
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

        {/* Log Entries Table */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500">Loading audit records...</div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No audit log entries recorded for this tenant yet.
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-200">{log.action}</span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-cyan-400">
                        {log.resource}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400">
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-400 font-mono text-[11px]">
                    <span>
                      Actor: <span className="text-slate-200">{log.actor.email}</span> ({log.actor.role})
                    </span>
                    <span>IP: {log.ipAddress}</span>
                  </div>

                  {/* Cryptographic Signature Seal */}
                  <div className="p-2 rounded bg-slate-900 border border-slate-800/80 flex items-center justify-between font-mono text-[10px] text-slate-400">
                    <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                      <Lock className="w-3 h-3" />
                      HMAC SHA-256 Seal:
                    </span>
                    <span className="text-slate-500 truncate max-w-sm">{log.signature}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors"
          >
            Close Audit Logs
          </button>
        </div>
      </div>
    </div>
  );
};
