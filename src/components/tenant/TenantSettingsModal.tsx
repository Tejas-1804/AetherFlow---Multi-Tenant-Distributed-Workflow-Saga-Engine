import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  Database,
  ExternalLink,
  Gauge,
  Key,
  Layers,
  Lock,
  Plus,
  RefreshCw,
  Server,
  Shield,
  Trash2,
  X,
  Zap
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { ApiKeyRecord, IsolationStrategy, TenantConfig } from '../../types/workflow.js';

interface TenantSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTenant: TenantConfig | null;
  onUpdateStrategy: (tenantId: string, strategy: IsolationStrategy) => Promise<void>;
  onRefreshTenants: () => void;
}

export const TenantSettingsModal: React.FC<TenantSettingsModalProps> = ({
  isOpen,
  onClose,
  activeTenant,
  onUpdateStrategy,
  onRefreshTenants,
}) => {
  if (!isOpen || !activeTenant) return null;

  const [activeTab, setActiveTab] = useState<'architecture' | 'ratelimit' | 'apikeys'>('architecture');
  const [strategy, setStrategy] = useState<IsolationStrategy>(activeTenant.isolationStrategy);
  const [isUpdatingStrategy, setIsUpdatingStrategy] = useState(false);
  const [benchmarkData, setBenchmarkData] = useState<any>(null);
  const [loadingBenchmark, setLoadingBenchmark] = useState(false);

  // API Key management
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [isCreatingKey, setIsCreatingKey] = useState(false);

  useEffect(() => {
    if (activeTenant) {
      setStrategy(activeTenant.isolationStrategy);
      loadBenchmark(activeTenant.id);
      loadApiKeys(activeTenant.id);
    }
  }, [activeTenant]);

  const loadBenchmark = async (tenantId: string) => {
    setLoadingBenchmark(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/benchmark`);
      if (res.ok) {
        const data = await res.json();
        setBenchmarkData(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingBenchmark(false);
    }
  };

  const loadApiKeys = async (tenantId: string) => {
    try {
      const res = await fetch('/api/keys', {
        headers: { 'x-tenant-id': tenantId },
      });
      if (res.ok) {
        const data = await res.json();
        setApiKeys(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleStrategyChange = async (newStrategy: IsolationStrategy) => {
    setStrategy(newStrategy);
    setIsUpdatingStrategy(true);
    try {
      await onUpdateStrategy(activeTenant.id, newStrategy);
      await loadBenchmark(activeTenant.id);
      onRefreshTenants();
    } finally {
      setIsUpdatingStrategy(false);
    }
  };

  const handleCreateApiKey = async () => {
    if (!newKeyName.trim()) return;
    setIsCreatingKey(true);
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': activeTenant.id,
        },
        body: JSON.stringify({
          name: newKeyName,
          scopes: ['workflows:read', 'workflows:write', 'workflows:execute'],
        }),
      });

      if (res.ok) {
        const { keyRecord, rawSecret } = await res.json();
        setApiKeys([keyRecord, ...apiKeys]);
        setCreatedSecret(rawSecret);
        setNewKeyName('');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsCreatingKey(false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    try {
      const res = await fetch(`/api/keys/${keyId}`, {
        method: 'DELETE',
        headers: { 'x-tenant-id': activeTenant.id },
      });
      if (res.ok) {
        setApiKeys(apiKeys.filter((k) => k.id !== keyId));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCopySecret = () => {
    if (!createdSecret) return;
    navigator.clipboard.writeText(createdSecret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-950/60 border border-cyan-800/40 text-cyan-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">
                Multi-Tenant Architecture & Security: {activeTenant.name}
              </h3>
              <p className="text-xs text-slate-400">
                MongoDB Isolation Strategies, Sliding-Window Rate Limits, and Cryptographic API Keys.
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

        {/* Tab Selector */}
        <div className="flex items-center gap-1 px-5 pt-3 border-b border-slate-800 text-xs font-medium bg-slate-950/20">
          <button
            type="button"
            onClick={() => setActiveTab('architecture')}
            className={`pb-3 px-3 border-b-2 transition-all ${
              activeTab === 'architecture'
                ? 'border-cyan-400 text-cyan-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            MongoDB Isolation Strategies
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ratelimit')}
            className={`pb-3 px-3 border-b-2 transition-all ${
              activeTab === 'ratelimit'
                ? 'border-cyan-400 text-cyan-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Rate Limiting & Quotas
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('apikeys')}
            className={`pb-3 px-3 border-b-2 transition-all ${
              activeTab === 'apikeys'
                ? 'border-cyan-400 text-cyan-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Cryptographic API Keys
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: MongoDB Isolation Strategies */}
          {activeTab === 'architecture' && (
            <div className="space-y-6">
              {/* Architecture Comparison Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Option A: Discriminator Key */}
                <div
                  onClick={() => handleStrategyChange('discriminator_key')}
                  className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                    strategy === 'discriminator_key'
                      ? 'bg-cyan-950/30 border-cyan-500 ring-1 ring-cyan-500 shadow-xl'
                      : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Layers className="w-5 h-5 text-cyan-400" />
                      <h4 className="text-sm font-bold text-slate-100">Discriminator Key Model</h4>
                    </div>
                    {strategy === 'discriminator_key' && (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-400 text-cyan-950">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                    Shared physical database and collections. Every document includes a mandatory <code className="text-cyan-300 font-mono">tenantId</code>{' '}
                    discriminator field.
                  </p>

                  <div className="mt-4 p-3 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-400 space-y-1">
                    <p className="text-slate-200 font-semibold">MongoDB Compound Index:</p>
                    <p className="text-cyan-300">{'{ tenantId: 1, status: 1, createdAt: -1 }'}</p>
                    <p className="text-slate-500 text-[10px] pt-1">
                      Enforces index-bound partitioning and eliminates full collection scans.
                    </p>
                  </div>

                  <div className="mt-4 space-y-1.5 text-xs text-slate-400">
                    <div className="flex items-center justify-between">
                      <span>Resource Overhead:</span>
                      <span className="text-emerald-400 font-medium">Ultra-Low (Shared pool)</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Tenant Density:</span>
                      <span className="text-emerald-400 font-medium">10,000+ Tenants</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Isolation Level:</span>
                      <span className="text-slate-300 font-medium">Logical (Query-level enforcement)</span>
                    </div>
                  </div>
                </div>

                {/* Option B: Dynamic Connection Pool */}
                <div
                  onClick={() => handleStrategyChange('dynamic_connection_pool')}
                  className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                    strategy === 'dynamic_connection_pool'
                      ? 'bg-purple-950/30 border-purple-500 ring-1 ring-purple-500 shadow-xl'
                      : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Server className="w-5 h-5 text-purple-400" />
                      <h4 className="text-sm font-bold text-slate-100">Dynamic Multi-Database Pool</h4>
                    </div>
                    {strategy === 'dynamic_connection_pool' && (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-purple-400 text-purple-950">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                    Dedicated MongoDB database per enterprise tenant (e.g.{' '}
                    <code className="text-purple-300 font-mono">db_tenant_{activeTenant.slug}</code>). Dynamically
                    instantiated and cached in the connection pool.
                  </p>

                  <div className="mt-4 p-3 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-400 space-y-1">
                    <p className="text-slate-200 font-semibold">Dynamic Connection Route:</p>
                    <p className="text-purple-300">pool.getTenantConnection('{activeTenant.id}')</p>
                    <p className="text-slate-500 text-[10px] pt-1">
                      Guarantees physical partition, isolated KMS keys, and zero cross-tenant bleeding.
                    </p>
                  </div>

                  <div className="mt-4 space-y-1.5 text-xs text-slate-400">
                    <div className="flex items-center justify-between">
                      <span>Resource Overhead:</span>
                      <span className="text-amber-400 font-medium">Moderate (Pooled socket handles)</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Tenant Density:</span>
                      <span className="text-slate-300 font-medium">250 - 500 Tenants/Cluster</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Isolation Level:</span>
                      <span className="text-purple-400 font-medium">Physical (Zero bleed guarantee)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Architectural Benchmark Metrics */}
              {benchmarkData && (
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                      <Gauge className="w-4 h-4 text-cyan-400" />
                      Live Architectural Benchmark for Current Strategy
                    </h5>
                    <span className="text-[10px] font-mono text-slate-500">Simulated Cluster P95 Metrics</span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-[10px] uppercase font-mono text-slate-500">Read Latency (P95)</span>
                      <p className="text-sm font-bold text-cyan-400 mt-0.5">{benchmarkData.readLatencyP95Ms} ms</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-[10px] uppercase font-mono text-slate-500">Write Latency (P95)</span>
                      <p className="text-sm font-bold text-cyan-400 mt-0.5">{benchmarkData.writeLatencyP95Ms} ms</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-[10px] uppercase font-mono text-slate-500">Active DB Handles</span>
                      <p className="text-sm font-bold text-slate-200 mt-0.5">{benchmarkData.activeDbConnections}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-[10px] uppercase font-mono text-slate-500">Storage Footprint</span>
                      <p className="text-sm font-bold text-slate-200 mt-0.5">{benchmarkData.storageFootprintMB} MB</p>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs space-y-1">
                    <p className="text-slate-300">
                      <span className="font-semibold text-slate-200">Security & Compliance Profile:</span>{' '}
                      {benchmarkData.crossTenantIsolationScore}
                    </p>
                    <p className="text-slate-400 text-[11px]">
                      <span className="font-semibold text-slate-300">Best Suited For:</span>{' '}
                      {benchmarkData.recommendedFor}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Rate Limiting & Sliding Windows */}
          {activeTab === 'ratelimit' && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 space-y-2">
                <h4 className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  Sliding-Window Token Bucket Quotas
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Every inbound HTTP and trigger request undergoes token-bucket verification in Express middleware.
                  Exceeded requests receive HTTP 429 backpressure with <code className="text-cyan-300 font-mono">X-RateLimit-*</code> RFC
                  headers.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 space-y-2">
                  <label className="text-xs font-medium text-slate-300">Rate Limit (Requests per Minute)</label>
                  <p className="text-xl font-bold font-mono text-cyan-400">
                    {activeTenant.rateLimit.maxRequestsPerMin} req / min
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Standard rolling 60-second sliding window per tenant context.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 space-y-2">
                  <label className="text-xs font-medium text-slate-300">Burst Protection Capacity</label>
                  <p className="text-xl font-bold font-mono text-amber-400">
                    {activeTenant.rateLimit.burstLimit} concurrent burst
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Allows sudden short spikes without dropping legitimate asynchronous webhook triggers.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Cryptographic API Keys */}
          {activeTab === 'apikeys' && (
            <div className="space-y-6">
              {/* Generate Key Input */}
              <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 space-y-3">
                <h4 className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                  <Key className="w-4 h-4 text-cyan-400" />
                  Generate New Cryptographic Service Key
                </h4>
                <p className="text-xs text-slate-400">
                  Keys are generated with entropy prefix <code className="text-cyan-300 font-mono">wk_live_...</code> and stored as SHA-256
                  hashes. Secrets cannot be recovered after initial display.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="Key Label (e.g., Stripe Webhook Relay Key)"
                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    type="button"
                    disabled={isCreatingKey || !newKeyName.trim()}
                    onClick={handleCreateApiKey}
                    className="px-4 py-2 bg-cyan-400 hover:bg-cyan-300 text-cyan-950 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Generate Key
                  </button>
                </div>
              </div>

              {/* Show Secret Notice if newly created */}
              {createdSecret && (
                <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/60 space-y-2 animate-in fade-in">
                  <div className="flex items-center justify-between text-xs text-emerald-300 font-semibold">
                    <span>API Key Generated Successfully! Copy it now:</span>
                    <button
                      type="button"
                      onClick={() => setCreatedSecret(null)}
                      className="text-slate-400 hover:text-slate-200"
                    >
                      Dismiss
                    </button>
                  </div>
                  <div className="flex items-center gap-2 bg-slate-950 p-2.5 rounded-lg border border-emerald-900/60 font-mono text-xs text-emerald-400">
                    <span className="flex-1 select-all break-all">{createdSecret}</span>
                    <button
                      type="button"
                      onClick={handleCopySecret}
                      className="p-1.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded transition-colors"
                    >
                      {copiedSecret ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Existing API Keys Table */}
              <div className="space-y-3">
                <h5 className="text-xs uppercase font-mono font-semibold text-slate-400 tracking-wider">
                  Active Service Keys ({apiKeys.length})
                </h5>
                {apiKeys.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500 rounded-xl bg-slate-950/30 border border-slate-800">
                    No active API keys for this tenant.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {apiKeys.map((key) => (
                      <div
                        key={key.id}
                        className="p-3 rounded-xl bg-slate-950/50 border border-slate-800 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-200">{key.name}</span>
                            <span className="font-mono text-[11px] text-cyan-400">{key.keyPrefix}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-1">
                            <span>Scopes: {key.scopes.join(', ')}</span>
                            <span>·</span>
                            <span>Created: {new Date(key.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRevokeKey(key.id)}
                          className="px-2.5 py-1 text-[11px] text-rose-400 hover:bg-rose-950/40 rounded transition-colors"
                        >
                          Revoke
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
            Close Settings
          </button>
        </div>
      </div>
    </div>
  );
};
