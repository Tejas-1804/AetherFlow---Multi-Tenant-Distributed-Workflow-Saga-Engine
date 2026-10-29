import { CheckCircle2, Globe, Layers, Sparkles, X, Zap } from 'lucide-react';
import React from 'react';
import { WorkflowDefinition } from '../../types/workflow.js';

interface TemplateGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (template: Partial<WorkflowDefinition>) => void;
}

export const TemplateGalleryModal: React.FC<TemplateGalleryModalProps> = ({ isOpen, onClose, onSelectTemplate }) => {
  if (!isOpen) return null;

  const templates: Array<{
    id: string;
    name: string;
    description: string;
    tags: string[];
    stepsCount: number;
    hasCompensations: boolean;
    templateData: any;
  }> = [
    {
      id: 'ecom_fulfillment',
      name: 'Distributed E-Commerce Order Fulfillment Saga',
      description: 'End-to-end distributed transaction with Stripe capture, warehouse stock hold, conditional express shipping, and sandboxed VAT invoice calculation.',
      tags: ['Saga Pattern', 'Stripe', 'Inventory', 'Rollback'],
      stepsCount: 7,
      hasCompensations: true,
      templateData: {
        name: 'E-Commerce Order Fulfillment with Saga Compensations',
        description: 'Distributed transaction pipeline coordinating payment capture, inventory reservation, carrier waybills, and invoice generation with automatic reverse compensation on failure.',
        nodes: [
          {
            id: 'node_trigger',
            type: 'triggerNode',
            position: { x: 50, y: 220 },
            data: { label: 'Order Placed Webhook', nodeType: 'trigger', status: 'idle' },
          },
          {
            id: 'node_payment',
            type: 'sagaStepNode',
            position: { x: 300, y: 220 },
            data: {
              label: 'Capture Stripe Payment',
              nodeType: 'saga_step',
              status: 'idle',
              action: { type: 'mock_service', endpoint: '/api/mock/payment/charge', method: 'POST' },
              compensation: { type: 'mock_service', endpoint: '/api/mock/payment/refund', method: 'POST' },
              retryPolicy: { maxAttempts: 3, initialIntervalMs: 500, backoffMultiplier: 2, maxIntervalMs: 3000, enableJitter: true },
            },
          },
          {
            id: 'node_inventory',
            type: 'sagaStepNode',
            position: { x: 560, y: 220 },
            data: {
              label: 'Reserve Warehouse Inventory',
              nodeType: 'saga_step',
              status: 'idle',
              action: { type: 'mock_service', endpoint: '/api/mock/inventory/reserve', method: 'POST' },
              compensation: { type: 'mock_service', endpoint: '/api/mock/inventory/release', method: 'POST' },
              retryPolicy: { maxAttempts: 3, initialIntervalMs: 400, backoffMultiplier: 1.5, maxIntervalMs: 3000, enableJitter: true },
            },
          },
          {
            id: 'node_check_vip',
            type: 'conditionNode',
            position: { x: 820, y: 220 },
            data: { label: 'High-Value Order Check', nodeType: 'condition', status: 'idle', conditionExpression: 'payload.amount >= 250' },
          },
          {
            id: 'node_express_shipping',
            type: 'sagaStepNode',
            position: { x: 1080, y: 120 },
            data: {
              label: 'FedEx Express Courier Label',
              nodeType: 'saga_step',
              status: 'idle',
              action: { type: 'mock_service', endpoint: '/api/mock/shipping/create-label?priority=express', method: 'POST' },
              compensation: { type: 'mock_service', endpoint: '/api/mock/shipping/cancel-label', method: 'POST' },
              retryPolicy: { maxAttempts: 2, initialIntervalMs: 600, backoffMultiplier: 2, maxIntervalMs: 3000, enableJitter: false },
            },
          },
          {
            id: 'node_standard_shipping',
            type: 'sagaStepNode',
            position: { x: 1080, y: 320 },
            data: {
              label: 'Ground Logistics Label',
              nodeType: 'saga_step',
              status: 'idle',
              action: { type: 'mock_service', endpoint: '/api/mock/shipping/create-label?priority=standard', method: 'POST' },
              compensation: { type: 'mock_service', endpoint: '/api/mock/shipping/cancel-label', method: 'POST' },
              retryPolicy: { maxAttempts: 2, initialIntervalMs: 600, backoffMultiplier: 2, maxIntervalMs: 3000, enableJitter: false },
            },
          },
          {
            id: 'node_format_invoice',
            type: 'transformNode',
            position: { x: 1350, y: 220 },
            data: {
              label: 'Format Tax Invoice (Sandbox VM)',
              nodeType: 'transform',
              status: 'idle',
              action: {
                type: 'script',
                script: `const subtotal = payload.amount || 299; return { invoiceId: 'INV-992', total: subtotal * 1.0825 };`,
              },
            },
          },
          {
            id: 'node_end',
            type: 'endNode',
            position: { x: 1600, y: 220 },
            data: { label: 'Order Confirmed & Sealed', nodeType: 'end', status: 'idle' },
          },
        ],
        edges: [
          { id: 'e1', source: 'node_trigger', target: 'node_payment', animated: true },
          { id: 'e2', source: 'node_payment', target: 'node_inventory', animated: true },
          { id: 'e3', source: 'node_inventory', target: 'node_check_vip', animated: true },
          { id: 'e4_t', source: 'node_check_vip', target: 'node_express_shipping', sourceHandle: 'true', label: 'True (>= $250)', animated: true },
          { id: 'e4_f', source: 'node_check_vip', target: 'node_standard_shipping', sourceHandle: 'false', label: 'False (< $250)', animated: true },
          { id: 'e5_exp', source: 'node_express_shipping', target: 'node_format_invoice', animated: true },
          { id: 'e5_std', source: 'node_standard_shipping', target: 'node_format_invoice', animated: true },
          { id: 'e6', source: 'node_format_invoice', target: 'node_end', animated: true },
        ],
      },
    },
    {
      id: 'user_onboarding',
      name: 'Autonomous Tenant User Provisioning Pipeline',
      description: 'Zero-trust employee onboarding configuring IAM accounts, Stripe customer records, and Slack workspaces with full compensating rollbacks.',
      tags: ['IAM', 'Provisioning', 'Zero-Trust', 'Saga'],
      stepsCount: 4,
      hasCompensations: true,
      templateData: {
        name: 'Autonomous Tenant User Provisioning Pipeline',
        description: 'Zero-trust enterprise user onboarding pipeline configuring IAM, Stripe customer account, and access rights.',
        nodes: [
          {
            id: 'node_trigger',
            type: 'triggerNode',
            position: { x: 60, y: 200 },
            data: { label: 'HR Provisioning Trigger', nodeType: 'trigger', status: 'idle' },
          },
          {
            id: 'node_iam',
            type: 'sagaStepNode',
            position: { x: 320, y: 200 },
            data: {
              label: 'Create Corporate IAM Identity',
              nodeType: 'saga_step',
              status: 'idle',
              action: { type: 'mock_service', endpoint: '/api/mock/crm/create-customer', method: 'POST' },
              compensation: { type: 'mock_service', endpoint: '/api/mock/crm/archive-customer', method: 'POST' },
              retryPolicy: { maxAttempts: 3, initialIntervalMs: 500, backoffMultiplier: 2, maxIntervalMs: 3000, enableJitter: true },
            },
          },
          {
            id: 'node_transform',
            type: 'transformNode',
            position: { x: 600, y: 200 },
            data: {
              label: 'Generate Zero-Trust RBAC Tokens',
              nodeType: 'transform',
              status: 'idle',
              action: {
                type: 'script',
                script: `return { ...payload, rbacRole: 'DEVELOPER', grantedPermissions: ['read', 'write'] };`,
              },
            },
          },
          {
            id: 'node_end',
            type: 'endNode',
            position: { x: 880, y: 200 },
            data: { label: 'User Provisioned & Active', nodeType: 'end', status: 'idle' },
          },
        ],
        edges: [
          { id: 'e1', source: 'node_trigger', target: 'node_iam', animated: true },
          { id: 'e2', source: 'node_iam', target: 'node_transform', animated: true },
          { id: 'e3', source: 'node_transform', target: 'node_end', animated: true },
        ],
      },
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-950/60 border border-cyan-800/40 text-cyan-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">Enterprise Workflow Templates</h3>
              <p className="text-xs text-slate-400">
                Battle-tested distributed transactional pipelines pre-configured with forward steps & Saga rollbacks.
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

        {/* Templates Grid */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="p-5 rounded-2xl bg-slate-950/50 border border-slate-800 hover:border-cyan-500/60 transition-all group flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-2 max-w-lg">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-100 group-hover:text-cyan-300 transition-colors">
                    {tpl.name}
                  </h4>
                  {tpl.hasCompensations && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/40">
                      Saga Rollback Enabled
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{tpl.description}</p>
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {tpl.tags.map((tag) => (
                    <span key={tag} className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded">
                      #{tag}
                    </span>
                  ))}
                  <span className="text-[10px] font-mono text-slate-500">· {tpl.stepsCount} Nodes</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  onSelectTemplate(tpl.templateData);
                  onClose();
                }}
                className="px-4 py-2 text-xs font-semibold text-cyan-950 bg-cyan-400 hover:bg-cyan-300 rounded-xl transition-all shadow-lg shadow-cyan-500/20 shrink-0"
              >
                Load Template
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
