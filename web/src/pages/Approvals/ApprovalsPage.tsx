import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  CheckSquare,
  ShieldCheck,
  ShieldAlert,
  Lock,
  RefreshCw,
} from 'lucide-react';

export const ApprovalsPage: React.FC = () => {
  const { user, role } = useAuth();
  const [approvals, setApprovals] = useState<any[]>([]);
  const [selectedApproval, setSelectedApproval] = useState<any | null>(null);
  const [comment, setComment] = useState<string>('');
  const [processing, setProcessing] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<any[]>('/api/approvals/pending');
      setApprovals(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.warn('Approvals fetch error:', err.message);
      setApprovals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  // Check role eligibility using backend's required_roles or fallback
  const canDecide = (app: any): boolean => {
    if (!role) return false;
    if (role === 'admin') return true;
    if (Array.isArray(app.required_roles) && app.required_roles.length > 0) {
      return app.required_roles.includes(role);
    }
    const action = app.requested_action || '';
    if (action.includes('salary') || action.includes('payroll')) {
      return role === 'finance';
    }
    if (action.includes('privileged') || action.includes('access')) {
      return role === 'security';
    }
    if (action.includes('compliance')) {
      return role === 'compliance';
    }
    return ['hr', 'admin'].includes(role);
  };

  const handleDecision = async (decision: 'approve' | 'reject') => {
    if (!selectedApproval) return;

    if (decision === 'reject' && !comment.trim()) {
      alert('A justification reason is mandatory for rejecting an AI-requested action.');
      return;
    }

    setProcessing(true);
    try {
      const endpoint = `/api/approvals/${encodeURIComponent(selectedApproval.approval_id)}/${decision}`;
      await api.post(endpoint, {
        comment: comment.trim() || (decision === 'approve' ? 'Approved by authorized human reviewer' : 'Rejected'),
      });

      setSelectedApproval(null);
      setComment('');
      fetchApprovals();
    } catch (err: any) {
      alert(`Approval decision failed: ${err.message || 'Server error'}`);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 p-6 rounded-2xl border border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-amber-950 border border-amber-800 flex items-center justify-center text-amber-400">
            <CheckSquare className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center space-x-2">
              <span>Human-in-the-Loop Approval Center</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 font-mono border border-amber-800">
                {approvals.length} Pending
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Cryptographically verified decision gates for sensitive financial, credential, and verification actions.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs text-slate-400">Acting as:</span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-indigo-300 font-mono text-xs font-semibold capitalize border border-slate-700">
            {role}
          </span>
          <button
            onClick={fetchApprovals}
            className="p-2 text-slate-400 hover:text-white bg-slate-900 rounded-xl border border-slate-800 transition cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Approvals Table / Grid */}
      <div className="bg-slate-900/60 rounded-2xl border border-slate-800 overflow-hidden">
        {approvals.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            <ShieldCheck className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
            <p className="font-semibold text-slate-300">All Decision Queues Cleared</p>
            <p className="text-slate-500 mt-1">
              No pending approval requests require human authorization at this time.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {approvals.map((app) => {
              const eligible = canDecide(app);
              const employeeName = app.employee?.name || app.employee_name || 'Candidate';
              const risk = app.risk || app.severity || 'medium';

              return (
                <div
                  key={app.approval_id}
                  className="p-4 hover:bg-slate-800/40 transition flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center space-x-2 flex-wrap gap-1">
                      <span
                        className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded-full font-bold ${
                          risk === 'critical'
                            ? 'bg-rose-950 text-rose-300 border border-rose-800'
                            : 'bg-amber-950 text-amber-300 border border-amber-800'
                        }`}
                      >
                        {risk}
                      </span>
                      <span className="font-mono text-indigo-400 font-bold">{app.requested_action}</span>
                      <span className="text-slate-500">
                        • Req by: <span className="text-slate-300">{app.requesting_agent || 'Agent'}</span>
                      </span>
                      <span className="text-slate-300 font-medium font-mono">({employeeName})</span>
                    </div>

                    <p className="text-slate-200 text-sm font-medium">{app.description || app.action_summary || app.category}</p>

                    <div className="flex items-center space-x-3 text-[11px] text-slate-400 font-mono">
                      <span>Workflow: {app.workflow_id}</span>
                      <span>Requested: {app.requested_at ? new Date(app.requested_at).toLocaleTimeString() : '—'}</span>
                      {app.required_roles && (
                        <span className="text-indigo-400">
                          Authorized: {app.required_roles.join(', ')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-2 shrink-0">
                    <button
                      onClick={() => {
                        setSelectedApproval(app);
                        setComment('');
                      }}
                      className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold transition cursor-pointer"
                    >
                      Review & Decide
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Decision Modal */}
      {selectedApproval && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Lock className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Review Sensitive Action</h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 uppercase">
                {selectedApproval.category || 'Approval'}
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-500 block mb-0.5">Requested Action:</span>
                <p className="font-mono text-indigo-300 font-semibold">{selectedApproval.requested_action}</p>
              </div>

              <div>
                <span className="text-slate-500 block mb-0.5">Summary:</span>
                <p className="text-slate-200 leading-relaxed">
                  {selectedApproval.description || selectedApproval.action_summary}
                </p>
              </div>

              {selectedApproval.agent_recommendation && (
                <div className="p-3 bg-indigo-950/40 border border-indigo-900/60 rounded-xl text-indigo-300">
                  <span className="font-bold block mb-1">Agent Recommendation:</span>
                  <p>{selectedApproval.agent_recommendation}</p>
                </div>
              )}

              {/* Rationale Input */}
              <div className="space-y-1 pt-1">
                <label className="block text-slate-400 font-medium">
                  Reviewer Notes / Rejection Reason:
                </label>
                <textarea
                  rows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Mandatory for rejection; optional for approval"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-indigo-500 text-xs"
                />
              </div>

              {!canDecide(selectedApproval) && (
                <div className="p-2.5 bg-rose-950/40 border border-rose-900/60 rounded-xl text-rose-300 text-[11px] flex items-center space-x-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>
                    Your active persona ({role}) is not authorized. Required: {selectedApproval.required_roles?.join(', ') || 'Authorized roles'}
                  </span>
                </div>
              )}
            </div>

            {/* Modal Buttons */}
            <div className="flex items-center justify-end space-x-2.5 pt-3 border-t border-slate-800">
              <button
                onClick={() => setSelectedApproval(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Close
              </button>

              <button
                onClick={() => handleDecision('reject')}
                disabled={processing || !canDecide(selectedApproval)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
              >
                Reject Action
              </button>

              <button
                onClick={() => handleDecision('approve')}
                disabled={processing || !canDecide(selectedApproval)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
              >
                Approve & Execute
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
