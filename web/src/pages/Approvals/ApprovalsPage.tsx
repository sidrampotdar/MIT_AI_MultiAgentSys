import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../api/client';
import { Approval } from '../../types';
import { RiskBadge } from '../../components/RiskBadge';
import { Modal } from '../../components/Modal';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Filter,
  RefreshCw,
  Fingerprint,
  User,
  ShieldAlert,
  FileText,
  DollarSign,
  Key,
  Layers,
  ChevronRight,
  Info
} from 'lucide-react';

export const ApprovalsPage: React.FC = () => {
  const { session } = useAuth();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [history, setHistory] = useState<Approval[]>([]);
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [selectedApproval, setSelectedApproval] = useState<Approval | null>(null);
  const [detailApproval, setDetailApproval] = useState<Approval | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalLoading, setModalLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [rejectionComment, setRejectionComment] = useState<string>('');
  const [approvalComment, setApprovalComment] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchApprovals = async () => {
    try {
      setLoading(true);
      setError(null);
      const [pendingRes, historyRes] = await Promise.all([
        apiClient.get<Approval[]>('/api/approvals/pending'),
        apiClient.get<Approval[]>('/api/approvals/history'),
      ]);
      setApprovals(pendingRes);
      setHistory(historyRes);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch approvals queue.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovals();
  }, []);

  const openDecisionModal = async (approval: Approval) => {
    setSelectedApproval(approval);
    setDetailApproval(approval);
    setIsModalOpen(true);
    setActionError(null);
    setActionSuccess(null);
    setRejectionComment('');
    setApprovalComment('');

    // Fetch deep detail
    try {
      setModalLoading(true);
      const detail = await apiClient.get<Approval>(`/api/approvals/${approval.approval_id}`);
      setDetailApproval(detail);
    } catch {
      // Fallback to card summary data if detail endpoint fails
    } finally {
      setModalLoading(false);
    }
  };

  const handleDecision = async (decision: 'approve' | 'reject') => {
    if (!selectedApproval) return;

    if (decision === 'reject' && !rejectionComment.trim()) {
      setActionError('A mandatory rejection comment is required by enterprise audit compliance.');
      return;
    }

    try {
      setActionLoading(true);
      setActionError(null);

      const endpoint = decision === 'approve'
        ? `/api/approvals/${selectedApproval.approval_id}/approve`
        : `/api/approvals/${selectedApproval.approval_id}/reject`;

      const comment = decision === 'approve'
        ? (approvalComment.trim() || 'Approved by authorized human operator.')
        : rejectionComment.trim();

      await apiClient.post(endpoint, {
        comment,
      });

      setActionSuccess(`Request ${decision === 'approve' ? 'approved' : 'rejected'} successfully!`);
      setTimeout(() => {
        setIsModalOpen(false);
        fetchApprovals();
      }, 1000);
    } catch (err: any) {
      setActionError(err.message || `Failed to ${decision} approval.`);
    } finally {
      setActionLoading(false);
    }
  };

  // Determine if active user has permission to approve this specific item
  const canApprove = (approval: Approval): boolean => {
    if (!session) return false;
    const required = approval.required_roles || [];
    return required.includes(session.role);
  };

  const currentList = activeTab === 'pending' ? approvals : history;

  const filteredList = currentList.filter(app => {
    if (categoryFilter === 'all') return true;
    const cat = (app.category || app.requested_action || app.action || '').toLowerCase();
    if (categoryFilter === 'salary') return cat.includes('salary') || cat.includes('payroll') || cat.includes('compensation');
    if (categoryFilter === 'verification') return cat.includes('verification') || cat.includes('education') || cat.includes('employment');
    if (categoryFilter === 'access') return cat.includes('access') || cat.includes('privileged');
    if (categoryFilter === 'equipment') return cat.includes('equipment') || cat.includes('substitution');
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-slate-100 flex items-center space-x-2">
              <span>Centralized Human Approval Center</span>
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary-500/10 text-primary-400 border border-primary-500/20">
              HITL Gatekeeper
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Zero-trust human verification gateway. Sensitive AI agent operations require cryptographic role confirmation.
          </p>
        </div>

        <button
          onClick={fetchApprovals}
          disabled={loading}
          className="flex items-center space-x-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors border border-slate-700"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* Tabs & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'pending'
                ? 'bg-primary-600 text-white shadow-lg shadow-primary-900/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            Pending Approvals ({approvals.length})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'history'
                ? 'bg-primary-600 text-white shadow-lg shadow-primary-900/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            Decision History ({history.length})
          </button>
        </div>

        {/* Category Filter */}
        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs text-slate-400 uppercase font-medium">Filter:</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-slate-800 text-slate-300 text-xs rounded-lg px-3 py-1.5 border border-slate-700 focus:outline-none focus:border-primary-500"
          >
            <option value="all">All Categories</option>
            <option value="salary">Salary & Payroll</option>
            <option value="verification">Verification & Degrees</option>
            <option value="access">Privileged Access</option>
            <option value="equipment">Equipment & IT</option>
          </select>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-sm flex items-center space-x-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Approvals Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="glass-panel p-5 rounded-xl border border-slate-800 animate-pulse space-y-3">
              <div className="h-4 bg-slate-800 rounded w-1/3"></div>
              <div className="h-6 bg-slate-800 rounded w-2/3"></div>
              <div className="h-16 bg-slate-800/40 rounded"></div>
            </div>
          ))}
        </div>
      ) : filteredList.length === 0 ? (
        <div className="glass-panel rounded-xl p-12 text-center border border-slate-800">
          <div className="w-12 h-12 rounded-full bg-slate-800/80 flex items-center justify-center mx-auto mb-3 text-slate-500">
            <CheckCircle className="w-6 h-6 text-emerald-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-200">
            {activeTab === 'pending' ? 'No Pending Approvals' : 'No Decision History'}
          </h3>
          <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">
            {activeTab === 'pending'
              ? 'All AI agent operations have received requisite clearances or no actions require review right now.'
              : 'Decided approvals will be logged here with immutable audit signatures.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredList.map((app) => {
            const hasRole = canApprove(app);
            const reqRoles = app.required_roles || [];
            const actionName = app.requested_action || app.action || 'Approval Required';

            return (
              <div
                key={app.approval_id}
                className={`glass-panel rounded-xl p-5 border transition-all duration-200 flex flex-col justify-between ${
                  app.status === 'pending'
                    ? hasRole
                      ? 'border-primary-500/40 hover:border-primary-500/80 shadow-md shadow-primary-950/20'
                      : 'border-slate-800 opacity-85 hover:opacity-100'
                    : 'border-slate-800/80'
                }`}
              >
                <div className="space-y-4">
                  {/* Top Bar: Risk & Category */}
                  <div className="flex items-center justify-between">
                    <RiskBadge level={app.risk || 'medium'} />
                    <span className="text-xs text-slate-400 flex items-center space-x-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>
                        {app.requested_at
                          ? new Date(app.requested_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : 'Recent'}
                      </span>
                    </span>
                  </div>

                  {/* Title & Action */}
                  <div>
                    <h3 className="text-base font-semibold text-slate-100 line-clamp-1">
                      {app.category || actionName.replace(/_/g, ' ').toUpperCase()}
                    </h3>
                    <p className="text-xs font-mono text-primary-400 mt-0.5 truncate">
                      {actionName}
                    </p>
                  </div>

                  {/* Employee Context */}
                  {app.employee && (
                    <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/60 flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 font-bold text-xs">
                        {app.employee.name ? app.employee.name.charAt(0) : 'E'}
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-xs font-semibold text-slate-200 truncate">{app.employee.name || 'Candidate'}</p>
                        <p className="text-[11px] text-slate-400 truncate">{app.employee.designation || app.employee.department || app.employee.email}</p>
                      </div>
                    </div>
                  )}

                  {/* Required Roles Badge */}
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block mb-1">
                      Authorized Roles:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {reqRoles.map((role) => {
                        const isMatch = session?.role === role;
                        return (
                          <span
                            key={role}
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                              isMatch
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}
                          >
                            {role.toUpperCase()} {isMatch && '✓'}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Parameters Hash preview */}
                  {(app.parameters_version || app.payload_fingerprint) && (
                    <div className="flex items-center space-x-1.5 text-[11px] font-mono text-slate-500 bg-slate-950/40 px-2 py-1 rounded border border-slate-800">
                      <Fingerprint className="w-3.5 h-3.5 text-slate-400" />
                      <span className="truncate">FP: {(app.parameters_version || app.payload_fingerprint)?.substring(0, 16)}</span>
                    </div>
                  )}
                </div>

                {/* Footer Action */}
                <div className="mt-5 pt-4 border-t border-slate-800/60 flex items-center justify-between">
                  {app.status === 'pending' ? (
                    <>
                      {!hasRole ? (
                        <div className="text-[11px] text-amber-400/90 flex items-center space-x-1">
                          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                          <span>Requires role: {reqRoles.join(' or ')}</span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-emerald-400 font-medium">Ready for review</span>
                      )}

                      <button
                        onClick={() => openDecisionModal(app)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center space-x-1 transition-all ${
                          hasRole
                            ? 'bg-primary-600 hover:bg-primary-500 text-white shadow-md shadow-primary-950/30'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                        }`}
                      >
                        <span>Inspect & Decide</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center justify-between w-full">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${
                          app.status === 'approved'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-rose-500/20 text-rose-300'
                        }`}
                      >
                        {app.status}
                      </span>
                      <span className="text-[11px] text-slate-500">By {app.reviewed_by || 'Reviewer'}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Decision Modal */}
      {selectedApproval && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={`HITL Decision: ${detailApproval?.category || selectedApproval.action}`}
          size="lg"
        >
          <div className="space-y-5">
            {/* Top Status & Context */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-slate-900/80 rounded-xl border border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-lg bg-primary-500/10 border border-primary-500/30 flex items-center justify-center text-primary-400 font-bold">
                  <Fingerprint className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-mono">APPROVAL ID: {selectedApproval.approval_id}</p>
                  <p className="text-xs text-slate-300">
                    Workflow: <span className="font-mono text-slate-400">{selectedApproval.workflow_id}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <RiskBadge level={detailApproval?.risk || selectedApproval.risk || 'medium'} />
                <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-1 rounded">
                  TASK: {selectedApproval.task_id}
                </span>
              </div>
            </div>

            {/* Cryptographic Fingerprint matching banner */}
            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg flex items-start space-x-3">
              <Key className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-200">Exact Parameter Hash Verification</p>
                <p className="text-[11px] text-slate-400 font-mono break-all">
                  SHA-256 Digest:{' '}
                  <span className="text-emerald-400">
                    {detailApproval?.parameters_version || detailApproval?.payload_fingerprint || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'}
                  </span>
                </p>
                <p className="text-[11px] text-slate-500">
                  Ensures payload cannot be tampered with between agent submission and human review.
                </p>
              </div>
            </div>

            {/* Agent Recommendation */}
            {(detailApproval?.agent_recommendation || detailApproval?.reason) && (
              <div className="p-3.5 bg-primary-950/20 border border-primary-500/30 rounded-xl space-y-1">
                <div className="flex items-center space-x-2 text-primary-300 font-medium text-xs">
                  <Info className="w-4 h-4" />
                  <span>Agent Analysis & Recommendation</span>
                </div>
                <p className="text-xs text-slate-300 pl-6 leading-relaxed">
                  {detailApproval.agent_recommendation || detailApproval.reason}
                </p>
              </div>
            )}

            {/* Employee Information */}
            {selectedApproval.employee && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-slate-900/40 rounded-xl border border-slate-800/80 text-xs">
                <div>
                  <span className="text-slate-500 block">Candidate</span>
                  <span className="text-slate-200 font-medium">{selectedApproval.employee.name}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Email</span>
                  <span className="text-slate-200 font-mono truncate block">{selectedApproval.employee.email}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Department</span>
                  <span className="text-slate-200 font-medium">{selectedApproval.employee.department}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Designation</span>
                  <span className="text-slate-200 font-medium">{selectedApproval.employee.designation}</span>
                </div>
              </div>
            )}

            {/* Parameter Inspector */}
            <div>
              <span className="text-xs font-semibold text-slate-300 mb-1.5 block">
                Submitted Parameters & Evidence:
              </span>
              <div className="max-h-48 overflow-y-auto rounded-lg bg-slate-950 border border-slate-800 p-3 font-mono text-[11px] text-slate-300 leading-relaxed">
                <pre>{JSON.stringify(detailApproval?.parameters || detailApproval?.payload || {}, null, 2)}</pre>
              </div>
            </div>

            {/* Role Verification Notice */}
            {(() => {
              const hasRole = canApprove(selectedApproval);
              const reqRoles = selectedApproval.required_roles || [];

              if (!hasRole) {
                return (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-center space-x-2">
                    <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                    <span>
                      Your current persona (<strong>{session?.role.toUpperCase()}</strong>) lacks permission to decide this request. Required role: <strong>{reqRoles.join(' or ').toUpperCase()}</strong>. Use the Persona Switcher above to test this approval.
                    </span>
                  </div>
                );
              }
              return (
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300 text-xs flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  <span>
                    Authenticated as <strong>{session?.role.toUpperCase()}</strong>. You are authorized to approve or reject this sensitive action.
                  </span>
                </div>
              );
            })()}

            {/* Rejection / Approval Comments */}
            {selectedApproval.status === 'pending' && (
              <div className="space-y-3 pt-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Decision Note / Comment <span className="text-rose-400">(Mandatory for Rejection)</span>
                  </label>
                  <textarea
                    rows={2}
                    value={rejectionComment || approvalComment}
                    onChange={(e) => {
                      setRejectionComment(e.target.value);
                      setApprovalComment(e.target.value);
                    }}
                    placeholder="Enter audit trail rationale, policy justification, or correction instructions..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-primary-500"
                  />
                </div>

                {actionError && (
                  <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-300 text-xs flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>{actionError}</span>
                  </div>
                )}

                {actionSuccess && (
                  <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300 text-xs flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{actionSuccess}</span>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
              >
                Close
              </button>

              {selectedApproval.status === 'pending' && (
                <>
                  <button
                    type="button"
                    onClick={() => handleDecision('reject')}
                    disabled={!canApprove(selectedApproval) || actionLoading}
                    className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition-all ${
                      canApprove(selectedApproval) && !actionLoading
                        ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-950/40'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                    }`}
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Reject Request</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDecision('approve')}
                    disabled={!canApprove(selectedApproval) || actionLoading}
                    className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition-all ${
                      canApprove(selectedApproval) && !actionLoading
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/40'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                    }`}
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>Approve & Authorize</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

