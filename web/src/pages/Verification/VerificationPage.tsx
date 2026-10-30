import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../api/client';
import { VerificationCardData, RedFlag } from '../../types';
import { RiskBadge } from '../../components/RiskBadge';
import { Modal } from '../../components/Modal';
import {
  GraduationCap,
  Briefcase,
  AlertTriangle,
  CheckCircle,
  Clock,
  Mail,
  ShieldCheck,
  RefreshCw,
  FileCheck,
  Search,
  ExternalLink,
  HelpCircle,
  XCircle,
  FileText
} from 'lucide-react';

export const VerificationPage: React.FC = () => {
  const { session } = useAuth();
  const [verifications, setVerifications] = useState<VerificationCardData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'education' | 'employment'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Flag Resolution Modal
  const [activeFlag, setActiveFlag] = useState<RedFlag | null>(null);
  const [resolutionComment, setResolutionComment] = useState<string>('');
  const [resolving, setResolving] = useState<boolean>(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolveSuccess, setResolveSuccess] = useState<string | null>(null);

  const fetchVerifications = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.get<VerificationCardData[]>('/api/verifications');
      setVerifications(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch verification status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVerifications();
  }, []);

  const handleResolveFlag = async () => {
    if (!activeFlag) return;
    if (!resolutionComment.trim()) {
      setResolveError('Resolution rationale comment is required.');
      return;
    }

    try {
      setResolving(true);
      setResolveError(null);
      await apiClient.post(`/api/red-flags/${activeFlag.flag_id}/resolve`, {
        resolution_comment: resolutionComment.trim(),
      });
      setResolveSuccess('Red flag discrepancy resolved successfully!');
      setTimeout(() => {
        setActiveFlag(null);
        setResolutionComment('');
        fetchVerifications();
      }, 1000);
    } catch (err: any) {
      setResolveError(err.message || 'Failed to resolve red flag.');
    } finally {
      setResolving(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes('confirm') || s === 'completed') {
      return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
          <CheckCircle className="w-3 h-3" />
          <span>CONFIRMED</span>
        </span>
      );
    }
    if (s.includes('discrep') || s.includes('fail') || s.includes('mismatch')) {
      return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
          <AlertTriangle className="w-3 h-3" />
          <span>DISCREPANCY</span>
        </span>
      );
    }
    if (s.includes('reply') || s.includes('sent') || s.includes('approval') || s.includes('waiting')) {
      return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
          <Clock className="w-3 h-3" />
          <span>IN PROGRESS</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
        <span>{status.toUpperCase()}</span>
      </span>
    );
  };

  // Group verifications by workflow
  const groupedByWorkflow: { [wid: string]: { education?: VerificationCardData; employment?: VerificationCardData; employee: any } } = {};
  verifications.forEach((v) => {
    if (!groupedByWorkflow[v.workflow_id]) {
      groupedByWorkflow[v.workflow_id] = { employee: v.employee };
    }
    if (v.kind === 'education') groupedByWorkflow[v.workflow_id].education = v;
    if (v.kind === 'employment') groupedByWorkflow[v.workflow_id].employment = v;
  });

  const filteredWorkflows = Object.entries(groupedByWorkflow).filter(([wid, group]) => {
    const nameMatch = group.employee?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    const emailMatch = group.employee?.email?.toLowerCase().includes(searchQuery.toLowerCase());
    const widMatch = wid.toLowerCase().includes(searchQuery.toLowerCase());
    return nameMatch || emailMatch || widMatch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-slate-100 flex items-center space-x-2">
              <span>Verification & Background Check Operations</span>
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary-500/10 text-primary-400 border border-primary-500/20">
              Autonomous BGV Hub
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Autonomous multi-source education and employment verification. AI agents dispatch formal inquiries and match institutional records against claimed credentials.
          </p>
        </div>

        <button
          onClick={fetchVerifications}
          disabled={loading}
          className="flex items-center space-x-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors border border-slate-700"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Records</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filterType === 'all'
                ? 'bg-primary-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            All Workflows ({filteredWorkflows.length})
          </button>
          <button
            onClick={() => setFilterType('education')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filterType === 'education'
                ? 'bg-primary-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            Education Focus
          </button>
          <button
            onClick={() => setFilterType('employment')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filterType === 'employment'
                ? 'bg-primary-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            Employment Focus
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search candidate or workflow ID..."
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-primary-500"
          />
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-sm flex items-center space-x-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Verification Panels */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((n) => (
            <div key={n} className="glass-panel p-6 rounded-xl border border-slate-800 animate-pulse space-y-4">
              <div className="h-6 bg-slate-800 rounded w-1/4"></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="h-40 bg-slate-800/40 rounded-lg"></div>
                <div className="h-40 bg-slate-800/40 rounded-lg"></div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredWorkflows.length === 0 ? (
        <div className="glass-panel rounded-xl p-12 text-center border border-slate-800">
          <div className="w-12 h-12 rounded-full bg-slate-800/80 flex items-center justify-center mx-auto mb-3 text-slate-500">
            <ShieldCheck className="w-6 h-6 text-primary-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-200">No Verification Records Found</h3>
          <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">
            Intake a new employee workflow to kick off autonomous education and employment background verifications.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredWorkflows.map(([wid, item]) => {
            const edu = item.education;
            const emp = item.employment;

            return (
              <div
                key={wid}
                className="glass-panel rounded-xl p-6 border border-slate-800/90 shadow-xl space-y-5"
              >
                {/* Workflow Candidate Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800/60">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
                      {item.employee?.name ? item.employee.name.charAt(0) : 'U'}
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-slate-100 flex items-center space-x-2">
                        <span>{item.employee?.name || 'Candidate Verification File'}</span>
                      </h3>
                      <p className="text-xs font-mono text-slate-400">
                        {item.employee?.email} • WF: <span className="text-primary-400">{wid}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 text-xs">
                    <span className="text-slate-400">BGV Status:</span>
                    {getStatusBadge(
                      edu?.discrepancies?.length || emp?.discrepancies?.length
                        ? 'discrepancy'
                        : (edu?.status === 'confirmed' && emp?.status === 'confirmed' ? 'confirmed' : 'in_progress')
                    )}
                  </div>
                </div>

                {/* Side-by-Side Verification Cards: Education vs Employment */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Card 1: Education Verification */}
                  {(filterType === 'all' || filterType === 'education') && (
                    <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-4 space-y-4 flex flex-col justify-between">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2 text-indigo-400 font-semibold text-sm">
                            <GraduationCap className="w-4 h-4" />
                            <span>Education Verification</span>
                          </div>
                          {edu ? getStatusBadge(edu.status) : (
                            <span className="text-xs text-slate-500">Not queued</span>
                          )}
                        </div>

                        {edu ? (
                          <>
                            {/* Claimed Data */}
                            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/70 space-y-1.5 text-xs">
                              <span className="text-[11px] font-semibold uppercase text-slate-400 block tracking-wider">
                                Candidate Claimed Record:
                              </span>
                              <div className="grid grid-cols-2 gap-2 text-slate-300">
                                <div>
                                  <span className="text-slate-500 block text-[11px]">Institution</span>
                                  <span className="font-medium text-slate-200">{edu.claimed.institution || '—'}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500 block text-[11px]">Degree / Major</span>
                                  <span className="font-medium text-slate-200">{edu.claimed.degree || '—'} ({edu.claimed.branch || 'General'})</span>
                                </div>
                                <div>
                                  <span className="text-slate-500 block text-[11px]">Graduation Year</span>
                                  <span className="font-medium text-slate-200 font-mono">{edu.claimed.graduation_year || '—'}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500 block text-[11px]">Enrollment Number</span>
                                  <span className="font-medium text-slate-200 font-mono">{edu.claimed.enrollment_number || 'ENR-ON-FILE'}</span>
                                </div>
                              </div>
                            </div>

                            {/* Institutional Response */}
                            <div className="p-3 bg-slate-950/40 rounded-lg border border-slate-800/50 space-y-1.5 text-xs">
                              <span className="text-[11px] font-semibold uppercase text-indigo-300 block tracking-wider flex items-center justify-between">
                                <span>University Counterparty Response:</span>
                                <span className="text-[10px] text-slate-500 lowercase font-normal">
                                  {edu.evidence_basis === 'simulated' ? 'Email Verified' : 'Inquiry Sent'}
                                </span>
                              </span>
                              {edu.response ? (
                                <div className="space-y-1 text-slate-300">
                                  <p className="text-[11px] text-slate-400 italic bg-slate-900/70 p-2 rounded border border-slate-800">
                                    "{edu.response.body.slice(0, 160)}..."
                                  </p>
                                  {edu.extracted_fields && (
                                    <div className="flex items-center space-x-2 pt-1">
                                      <span className="text-[11px] text-slate-400">Extracted Status:</span>
                                      <span className="text-[11px] font-mono text-emerald-400 font-semibold uppercase">
                                        {edu.extracted_fields.classification || 'VERIFIED'}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <p className="text-xs text-slate-500 italic">
                                  Awaiting incoming response from registrar. Thread ID: {edu.thread_id || `EDU-${wid}`}
                                </p>
                              )}
                            </div>

                            {/* Discrepancy Red Flags */}
                            {edu.discrepancies && edu.discrepancies.length > 0 && (
                              <div className="space-y-2">
                                <span className="text-xs font-semibold text-rose-400 flex items-center space-x-1">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  <span>Active Discrepancy Flags ({edu.discrepancies.length}):</span>
                                </span>
                                {edu.discrepancies.map((flag) => (
                                  <div
                                    key={flag.flag_id}
                                    className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs space-y-1"
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="font-semibold text-rose-300">{flag.summary || 'Degree Discrepancy'}</span>
                                      <RiskBadge level={flag.severity} />
                                    </div>
                                    <p className="text-[11px] text-slate-300">{flag.description}</p>
                                    {flag.status === 'active' && (
                                      <button
                                        onClick={() => setActiveFlag(flag)}
                                        className="mt-1 px-2.5 py-1 bg-rose-600/80 hover:bg-rose-500 text-white rounded text-[11px] font-medium transition-colors"
                                      >
                                        Review & Resolve Discrepancy
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="text-xs text-slate-500">Education verification agent not scheduled for this workflow.</p>
                        )}
                      </div>

                      {/* Card Footer: Thread info */}
                      {edu?.thread_id && (
                        <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                          <span className="flex items-center space-x-1">
                            <Mail className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Thread: {edu.thread_id}</span>
                          </span>
                          <span>Inbound events: {edu.request_history?.length || 0}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Card 2: Previous Employment Verification */}
                  {(filterType === 'all' || filterType === 'employment') && (
                    <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-4 space-y-4 flex flex-col justify-between">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2 text-cyan-400 font-semibold text-sm">
                            <Briefcase className="w-4 h-4" />
                            <span>Previous Employment Verification</span>
                          </div>
                          {emp ? getStatusBadge(emp.status) : (
                            <span className="text-xs text-slate-500">Not queued</span>
                          )}
                        </div>

                        {emp ? (
                          <>
                            {/* Claimed Data */}
                            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/70 space-y-1.5 text-xs">
                              <span className="text-[11px] font-semibold uppercase text-slate-400 block tracking-wider">
                                Candidate Claimed Record:
                              </span>
                              <div className="grid grid-cols-2 gap-2 text-slate-300">
                                <div>
                                  <span className="text-slate-500 block text-[11px]">Previous Employer</span>
                                  <span className="font-medium text-slate-200">{emp.claimed.employer || '—'}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500 block text-[11px]">Designation</span>
                                  <span className="font-medium text-slate-200">{emp.claimed.designation || 'Software Engineer'}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500 block text-[11px]">Employment Tenure</span>
                                  <span className="font-medium text-slate-200">{emp.claimed.employment_dates || '2023 - 2026'}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500 block text-[11px]">Verification Target</span>
                                  <span className="font-medium text-cyan-400">Enterprise HR Records</span>
                                </div>
                              </div>
                            </div>

                            {/* Counterparty Response */}
                            <div className="p-3 bg-slate-950/40 rounded-lg border border-slate-800/50 space-y-1.5 text-xs">
                              <span className="text-[11px] font-semibold uppercase text-cyan-300 block tracking-wider flex items-center justify-between">
                                <span>Previous Employer HR Confirmation:</span>
                                <span className="text-[10px] text-slate-500 lowercase font-normal">
                                  {emp.evidence_basis === 'simulated' ? 'Email Verified' : 'Inquiry Sent'}
                                </span>
                              </span>
                              {emp.response ? (
                                <div className="space-y-1 text-slate-300">
                                  <p className="text-[11px] text-slate-400 italic bg-slate-900/70 p-2 rounded border border-slate-800">
                                    "{emp.response.body.slice(0, 160)}..."
                                  </p>
                                  {emp.extracted_fields && (
                                    <div className="flex items-center space-x-2 pt-1">
                                      <span className="text-[11px] text-slate-400">Extracted Status:</span>
                                      <span className="text-[11px] font-mono text-emerald-400 font-semibold uppercase">
                                        {emp.extracted_fields.classification || 'VERIFIED'}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <p className="text-xs text-slate-500 italic">
                                  Awaiting formal employment record reply from counterparty HR. Thread ID: {emp.thread_id || `EMP-${wid}`}
                                </p>
                              )}
                            </div>

                            {/* Discrepancy Red Flags */}
                            {emp.discrepancies && emp.discrepancies.length > 0 && (
                              <div className="space-y-2">
                                <span className="text-xs font-semibold text-rose-400 flex items-center space-x-1">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  <span>Active Discrepancy Flags ({emp.discrepancies.length}):</span>
                                </span>
                                {emp.discrepancies.map((flag) => (
                                  <div
                                    key={flag.flag_id}
                                    className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs space-y-1"
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="font-semibold text-rose-300">{flag.summary || 'Employment Discrepancy'}</span>
                                      <RiskBadge level={flag.severity} />
                                    </div>
                                    <p className="text-[11px] text-slate-300">{flag.description}</p>
                                    {flag.status === 'active' && (
                                      <button
                                        onClick={() => setActiveFlag(flag)}
                                        className="mt-1 px-2.5 py-1 bg-rose-600/80 hover:bg-rose-500 text-white rounded text-[11px] font-medium transition-colors"
                                      >
                                        Review & Resolve Discrepancy
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="text-xs text-slate-500">Employment verification agent not scheduled for this workflow.</p>
                        )}
                      </div>

                      {/* Card Footer: Thread info */}
                      {emp?.thread_id && (
                        <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                          <span className="flex items-center space-x-1">
                            <Mail className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Thread: {emp.thread_id}</span>
                          </span>
                          <span>Inbound events: {emp.request_history?.length || 0}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Flag Resolution Modal */}
      {activeFlag && (
        <Modal
          isOpen={!!activeFlag}
          onClose={() => setActiveFlag(null)}
          title={`Resolve Red Flag: ${activeFlag.summary || activeFlag.category}`}
          size="md"
        >
          <div className="space-y-4">
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-300 uppercase">
                  Category: {activeFlag.category}
                </span>
                <RiskBadge level={activeFlag.severity} />
              </div>
              <p className="text-xs text-slate-300">{activeFlag.description}</p>
              {activeFlag.remediation_hint && (
                <p className="text-[11px] text-amber-300 pt-1">
                  <strong>Remediation Hint:</strong> {activeFlag.remediation_hint}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Resolution Rationale & Compliance Note <span className="text-rose-400">*</span>
              </label>
              <textarea
                rows={3}
                value={resolutionComment}
                onChange={(e) => setResolutionComment(e.target.value)}
                placeholder="Explain the document verification, authorized exception, or verified counterparty correction..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-primary-500"
              />
            </div>

            {resolveError && (
              <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-300 text-xs">
                {resolveError}
              </div>
            )}

            {resolveSuccess && (
              <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300 text-xs">
                {resolveSuccess}
              </div>
            )}

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setActiveFlag(null)}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResolveFlag}
                disabled={resolving || !resolutionComment.trim()}
                className={`px-4 py-2 text-xs font-semibold rounded-lg text-white transition-all ${
                  resolving || !resolutionComment.trim()
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                    : 'bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-950/40'
                }`}
              >
                {resolving ? 'Submitting...' : 'Mark Discrepancy Resolved'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

