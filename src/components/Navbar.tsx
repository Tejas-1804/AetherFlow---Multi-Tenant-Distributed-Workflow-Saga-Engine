import {
  Activity,
  CheckCircle2,
  ChevronDown,
  Database,
  FileText,
  Key,
  Layers,
  RotateCcw,
  Server,
  Shield,
  ShieldAlert,
  Sparkles,
  User,
  Zap
} from 'lucide-react';
import React from 'react';
import { TenantConfig } from '../types/workflow.js';

interface NavbarProps {
  tenants: TenantConfig[];
  activeTenant: TenantConfig | null;
  onSelectTenant: (tenantId: string) => void;
  currentUser: { email: string; role: string; name: string };
  onSelectUser: (user: { email: string; role: string; name: string }) => void;
  wsConnected: boolean;
  dlqCount: number;
  onOpenDLQ: () => void;
  onOpenTenantSettings: () => void;
  onOpenAuditLogs: () => void;
  onOpenTemplates: () => void;
  onOpenTraces: () => void;
}

const DEMO_USERS = [
  { name: 'Tejas', email: 'tejas@acme.com', role: 'TENANT_ADMIN' },
  { name: 'Amaan', email: 'amaan@cyberdyne.com', role: 'TENANT_ADMIN' },
  { name: 'Priyanka', email: 'priyanka@quantum.io', role: 'TENANT_ADMIN' },
  { name: 'Rinkle Sharma', email: 'rinkle@helios.net', role: 'TENANT_ADMIN' },
  { name: 'Super Administrator', email: 'superadmin@orchestration.engine', role: 'SUPER_ADMIN' },
];

export const Navbar: React.FC<NavbarProps> = ({
  tenants,
  activeTenant,
  onSelectTenant,
  currentUser,
  onSelectUser,
  wsConnected,
  dlqCount,
  onOpenDLQ,
  onOpenTenantSettings,
  onOpenAuditLogs,
  onOpenTemplates,
  onOpenTraces,
}) => {
  return (
    <header className="h-16 bg-slate-900/90 border-b border-slate-800/80 backdrop-blur-md px-5 flex items-center justify-between z-30 shrink-0">
      {/* Brand & Tagline */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-emerald-400 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Zap className="w-4 h-4 text-slate-950 font-bold fill-current" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-tight text-white font-sans">AetherFlow</span>
              <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/50">
                v2.4 SAGA
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Distributed Workflow Engine & Saga Coordinator
            </p>
          </div>
        </div>

        {/* Tenant Selector */}
        <div className="hidden md:flex items-center gap-2 pl-4 border-l border-slate-800">
          <span className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">Tenant:</span>
          <select
            value={activeTenant?.id || ''}
            onChange={(e) => onSelectTenant(e.target.value)}
            className="px-2.5 py-1 text-xs font-semibold bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
          >
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          {/* Strategy Indicator Badge */}
          {activeTenant && (
            <button
              type="button"
              onClick={onOpenTenantSettings}
              title="Click to view & toggle MongoDB Isolation Architecture"
              className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono font-medium rounded-lg border transition-all ${
                activeTenant.isolationStrategy === 'dynamic_connection_pool'
                  ? 'bg-purple-950/60 text-purple-300 border-purple-800/50 hover:border-purple-600'
                  : 'bg-cyan-950/60 text-cyan-300 border-cyan-800/50 hover:border-cyan-600'
              }`}
            >
              {activeTenant.isolationStrategy === 'dynamic_connection_pool' ? (
                <>
                  <Server className="w-3 h-3 text-purple-400" />
                  Dynamic DB Pool
                </>
              ) : (
                <>
                  <Layers className="w-3 h-3 text-cyan-400" />
                  Discriminator Key
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2.5">
        {/* WebSocket Pulse */}
        <div
          title={wsConnected ? 'Change Stream WebSocket Connected' : 'Connecting to Change Stream...'}
          className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/60 border border-slate-800 text-[11px] font-mono"
        >
          <span className="relative flex h-2 w-2">
            {wsConnected && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            )}
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                wsConnected ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            ></span>
          </span>
          <span className={wsConnected ? 'text-emerald-400' : 'text-amber-400'}>
            {wsConnected ? 'Change Stream Live' : 'Connecting...'}
          </span>
        </div>

        {/* Templates Gallery Button */}
        <button
          type="button"
          onClick={onOpenTemplates}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/80 rounded-lg transition-all"
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          Templates
        </button>

        {/* Audit Logs Button */}
        <button
          type="button"
          onClick={onOpenAuditLogs}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/80 rounded-lg transition-all"
        >
          <FileText className="w-3.5 h-3.5 text-emerald-400" />
          Audit Trail
        </button>

        {/* Dead Letter Queue (DLQ) Button with Badge */}
        <button
          type="button"
          onClick={onOpenDLQ}
          className="relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-300 hover:text-rose-100 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 rounded-lg transition-all"
        >
          <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
          DLQ
          {dlqCount > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-rose-500 text-rose-950">
              {dlqCount}
            </span>
          )}
        </button>

        {/* User Role Switcher Dropdown */}
        <div className="flex items-center gap-1.5 pl-2 border-l border-slate-800">
          <select
            value={currentUser.email}
            onChange={(e) => {
              const u = DEMO_USERS.find((user) => user.email === e.target.value);
              if (u) onSelectUser(u);
            }}
            className="px-2.5 py-1 text-xs font-medium bg-slate-950 border border-slate-800 rounded-lg text-slate-300 font-mono focus:outline-none focus:border-cyan-500"
          >
            {DEMO_USERS.map((u) => (
              <option key={u.email} value={u.email}>
                {u.name} ({u.role === 'SUPER_ADMIN' ? 'Admin' : 'Tenant'})
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  );
};
