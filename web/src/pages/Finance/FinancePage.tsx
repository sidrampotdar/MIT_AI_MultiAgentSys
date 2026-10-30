import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../api/client';
import { FinanceOverviewRow, FinanceWorkflowView, SalaryStructure } from '../../types';
import { RiskBadge } from '../../components/RiskBadge';
import { Modal } from '../../components/Modal';
import {
  DollarSign,
  Calculator,
  CheckCircle,
  AlertTriangle,
  FileCheck,
  RefreshCw,
  CreditCard,
  ShieldAlert,
  ArrowRight,
  TrendingUp,
  Percent,
  Check,
  Building,
  User,
  Sliders,
  Send
} from 'lucide-react';

export const FinancePage: React.FC = () => {
  const { session } = useAuth();
  const [overviewRows, setOverviewRows] = useState<FinanceOverviewRow[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [workflowDetail, setWorkflowDetail] = useState<FinanceWorkflowView | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Active view tab: 'overview' | 'calculator'
  const [activeTab, setActiveTab] = useState<'overview' | 'detail' | 'calculator'>('overview');

  // Interactive Calculator State
  const [calcCtc, setCalcCtc] = useState<number>(2400000);
  const [calcDesignation, setCalcDesignation] = useState<string>('Software Engineer');
  const [calcTaxRegime, setCalcTaxRegime] = useState<'new' | 'old'>('new');
  const [calcResult, setCalcResult] = useState<SalaryStructure | null>(null);
  const [calcLoading, setCalcLoading] = useState<boolean>(false);

  // Approval / Payroll Actions State
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Correction Request Modal State
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState<boolean>(false);
  const [correctionReason, setCorrectionReason] = useState<string>('');

  const fetchOverview = async () => {
    try {
      setLoading(true);
      setError(null);
      const rows = await apiClient.get<FinanceOverviewRow[]>('/api/finance/overview');
      setOverviewRows(rows);
      if (rows.length > 0 && !selectedWorkflowId) {
        setSelectedWorkflowId(rows[0].workflow_id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load finance overview.');
    } finally {
      setLoading(false);
    }
  };

  const fetchWorkflowDetail = async (workflowId: string) => {
    try {
      setDetailLoading(true);
      setActionMessage(null);
      const detail = await apiClient.get<FinanceWorkflowView>(`/api/finance/workflows/${workflowId}`);
      setWorkflowDetail(detail);
      setSelectedWorkflowId(workflowId);
    } catch (err: any) {
      setError(err.message || 'Failed to load detailed finance view.');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  useEffect(() => {
    if (selectedWorkflowId) {
      fetchWorkflowDetail(selectedWorkflowId);
    }
  }, [selectedWorkflowId]);

  // Calculate interactive test structure
  const handleCalculateTest = async () => {
    try {
      setCalcLoading(true);
      const result = await apiClient.post<SalaryStructure>('/api/finance/salary/calculate', {
        annual_ctc: calcCtc,
        designation: calcDesignation,
        tax_regime: calcTaxRegime,
        allow_grade_override: true,
      });
      setCalcResult(result);
    } catch (err: any) {
      setError(err.message || 'Failed to calculate salary breakdown.');
    } finally {
      setCalcLoading(false);
    }
  };

  // Run calculation on initial load of calculator
  useEffect(() => {
    if (activeTab === 'calculator' && !calcResult) {
      handleCalculateTest();
    }
  }, [activeTab]);

  // Handle Finance Approval Action
  const handleApproveSalary = async () => {
    if (!workflowDetail?.finance_approval?.approval_id) return;
    try {
      setActionLoading(true);
      setActionMessage(null);
      await apiClient.post(`/api/approvals/${workflowDetail.finance_approval.approval_id}/approve`, {
        comment: 'Salary structure verified against band policies and approved by Finance.',
      });
      setActionMessage({ type: 'success', text: 'Salary structure approved by Finance successfully!' });
      if (selectedWorkflowId) {
        fetchWorkflowDetail(selectedWorkflowId);
        fetchOverview();
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Approval failed.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Payroll Profile Preparation Action
  const handlePreparePayroll = async () => {
    if (!workflowDetail) return;
    try {
      setActionLoading(true);
      setActionMessage(null);
      await apiClient.post('/api/finance/payroll/prepare', {
        workflow_id: workflowDetail.workflow_id,
        employee_email: workflowDetail.employee.email,
        annual_ctc: workflowDetail.approved_annual_ctc,
      });
      setActionMessage({ type: 'success', text: 'Payroll profile initialized & queued for finalization!' });
      if (selectedWorkflowId) {
        fetchWorkflowDetail(selectedWorkflowId);
        fetchOverview();
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Payroll preparation failed.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Correction Request
  const handleRequestCorrection = async () => {
    if (!selectedWorkflowId || !correctionReason.trim()) return;
    try {
      setActionLoading(true);
      await apiClient.post(`/api/finance/workflows/${selectedWorkflowId}/request-correction`, {
        reason: correctionReason.trim(),
      });
      setIsCorrectionModalOpen(false);
      setCorrectionReason('');
      setActionMessage({ type: 'success', text: 'Correction request submitted. HR notified to adjust parameters.' });
      fetchWorkflowDetail(selectedWorkflowId);
      fetchOverview();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to submit correction request.' });
    } finally {
      setActionLoading(false);
    }
  };

  const isFinance = session?.role === 'finance';

  const formatCurrency = (val?: number) => {
    if (val === undefined || isNaN(val)) return '₹0';
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-slate-100 flex items-center space-x-2">
              <span>Finance & Compensation Operations</span>
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Deterministic Payroll Engine
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Zero-hallucination salary breakdowns, statutory tax compliance, and double-entry CTC reconciliation under Finance persona governance.
          </p>
        </div>

        <button
          onClick={() => {
            fetchOverview();
            if (selectedWorkflowId) fetchWorkflowDetail(selectedWorkflowId);
          }}
          disabled={loading || detailLoading}
          className="flex items-center space-x-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors border border-slate-700"
        >
          <RefreshCw className={`w-4 h-4 ${loading || detailLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'overview'
              ? 'bg-primary-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Building className="w-4 h-4" />
          <span>Compensation Overview ({overviewRows.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('detail')}
          className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'detail'
              ? 'bg-primary-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <FileCheck className="w-4 h-4" />
          <span>Active Salary Breakdown & Governance</span>
        </button>
        <button
          onClick={() => setActiveTab('calculator')}
          className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'calculator'
              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-950/40'
              : 'text-emerald-300 hover:text-emerald-200 hover:bg-emerald-950/40 border border-emerald-900/50'
          }`}
        >
          <Calculator className="w-4 h-4" />
          <span>Live CTC Structure Simulator</span>
        </button>
      </div>

      {/* Global Alerts */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-sm flex items-center space-x-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {actionMessage && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center space-x-2 ${
            actionMessage.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          )}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* TAB 1: Compensation Overview Table */}
      {activeTab === 'overview' && (
        <div className="glass-panel rounded-xl border border-slate-800 overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
              Employee Compensation & Payroll Profiles
            </h3>
            <span className="text-xs text-slate-500">Click row to inspect complete breakdown</span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-slate-500 text-xs animate-pulse">
              Loading compensation records...
            </div>
          ) : overviewRows.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs">
              No employee onboarding workflows found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 text-slate-400 uppercase text-[11px] font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Candidate / Workflow</th>
                    <th className="py-3 px-4">Approved CTC</th>
                    <th className="py-3 px-4">Engine Calculation</th>
                    <th className="py-3 px-4">Reconciliation</th>
                    <th className="py-3 px-4">Finance Approval</th>
                    <th className="py-3 px-4">Payroll Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {overviewRows.map((row) => {
                    const isSelected = selectedWorkflowId === row.workflow_id;
                    return (
                      <tr
                        key={row.workflow_id}
                        onClick={() => {
                          setSelectedWorkflowId(row.workflow_id);
                          setActiveTab('detail');
                        }}
                        className={`hover:bg-slate-800/40 cursor-pointer transition-colors ${
                          isSelected ? 'bg-primary-950/20' : ''
                        }`}
                      >
                        <td className="py-3 px-4">
                          <p className="font-semibold text-slate-200">{row.employee.name || row.employee.first_name || 'Candidate'}</p>
                          <p className="text-[11px] font-mono text-slate-400">{row.workflow_id} • {row.employee.department}</p>
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-emerald-400">
                          {formatCurrency(row.approved_annual_ctc)}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase ${
                              row.salary_calculation_status === 'completed'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                            }`}
                          >
                            {row.salary_calculation_status}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {row.ctc_reconciled ? (
                            <span className="inline-flex items-center space-x-1 text-emerald-400 text-xs font-semibold">
                              <Check className="w-3.5 h-3.5" />
                              <span>100% RECONCILED</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 text-rose-400 text-xs font-semibold">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>DISCREPANCY</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase ${
                              row.finance_approval_status === 'approved'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : row.finance_approval_status === 'pending'
                                ? 'bg-amber-500/10 text-amber-400'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {row.finance_approval_status}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono text-xs text-slate-300 uppercase">
                            {row.payroll_status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="text-primary-400 font-semibold hover:underline flex items-center justify-end space-x-1">
                            <span>Inspect</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Detailed Salary Breakdown & Governance */}
      {activeTab === 'detail' && (
        <div className="space-y-6">
          {detailLoading ? (
            <div className="glass-panel p-8 rounded-xl border border-slate-800 animate-pulse space-y-4">
              <div className="h-6 bg-slate-800 rounded w-1/3"></div>
              <div className="h-48 bg-slate-800/40 rounded"></div>
            </div>
          ) : !workflowDetail ? (
            <div className="glass-panel p-12 text-center rounded-xl border border-slate-800 text-slate-400">
              Select an employee record from the overview table to inspect salary structure.
            </div>
          ) : (
            <>
              {/* Top Banner: Employee Context + Action Controls */}
              <div className="glass-panel p-5 rounded-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                    ₹
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h2 className="text-lg font-bold text-slate-100">{workflowDetail.employee.name}</h2>
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-primary-500/10 text-primary-400 border border-primary-500/20 font-mono">
                        {workflowDetail.employee.employee_id || 'PENDING ID'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      {workflowDetail.employee.designation} • {workflowDetail.employee.department} • WF: {workflowDetail.workflow_id}
                    </p>
                  </div>
                </div>

                {/* Governance Action Buttons */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* Finance Role check warning */}
                  {!isFinance && (
                    <div className="text-[11px] text-amber-400 flex items-center space-x-1 bg-amber-500/10 px-2.5 py-1 rounded border border-amber-500/20">
                      <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>Switch to FINANCE persona to approve</span>
                    </div>
                  )}

                  {workflowDetail.finance_approval?.status === 'pending' && (
                    <>
                      <button
                        onClick={() => setIsCorrectionModalOpen(true)}
                        disabled={actionLoading || !isFinance}
                        className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-rose-300 border border-slate-700 transition-colors"
                      >
                        Request Correction
                      </button>

                      <button
                        onClick={handleApproveSalary}
                        disabled={actionLoading || !isFinance}
                        className={`px-4 py-2 rounded-lg text-xs font-semibold text-white flex items-center space-x-1.5 transition-all ${
                          isFinance && !actionLoading
                            ? 'bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-950/40'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                        }`}
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>Approve Salary Structure</span>
                      </button>
                    </>
                  )}

                  {workflowDetail.payroll.status !== 'completed' && (
                    <button
                      onClick={handlePreparePayroll}
                      disabled={actionLoading || !isFinance}
                      className={`px-4 py-2 rounded-lg text-xs font-semibold text-white flex items-center space-x-1.5 transition-all ${
                        isFinance && !actionLoading
                          ? 'bg-primary-600 hover:bg-primary-500 shadow-lg shadow-primary-950/40'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                      }`}
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>Finalize Payroll Profile</span>
                    </button>
                  )}
                </div>
              </div>

              {/* CTC Reconciliation & Status Badges */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="glass-panel p-4 rounded-xl border border-slate-800 space-y-1">
                  <span className="text-[11px] uppercase text-slate-400 font-semibold tracking-wider">Approved Annual CTC</span>
                  <p className="text-xl font-bold font-mono text-emerald-400">
                    {formatCurrency(workflowDetail.approved_annual_ctc)}
                  </p>
                  <p className="text-[11px] text-slate-500">Board-authorized package</p>
                </div>

                <div className="glass-panel p-4 rounded-xl border border-slate-800 space-y-1">
                  <span className="text-[11px] uppercase text-slate-400 font-semibold tracking-wider">Mathematical Match</span>
                  <div className="flex items-center space-x-2 pt-0.5">
                    {workflowDetail.validation.ctc_reconciled ? (
                      <span className="px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-bold flex items-center space-x-1">
                        <Check className="w-3.5 h-3.5" />
                        <span>100% RECONCILED</span>
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30 text-xs font-bold flex items-center space-x-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>UNRECONCILED</span>
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">Zero rounding discrepancy</p>
                </div>

                <div className="glass-panel p-4 rounded-xl border border-slate-800 space-y-1">
                  <span className="text-[11px] uppercase text-slate-400 font-semibold tracking-wider">Finance Approval</span>
                  <div className="pt-0.5">
                    <span
                      className={`px-2.5 py-1 rounded text-xs font-bold uppercase inline-block ${
                        workflowDetail.finance_approval?.status === 'approved'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : workflowDetail.finance_approval?.status === 'pending'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {workflowDetail.finance_approval?.status || 'NOT REQUESTED'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono">
                    By: {workflowDetail.finance_approval?.reviewed_by || 'Awaiting Review'}
                  </p>
                </div>

                <div className="glass-panel p-4 rounded-xl border border-slate-800 space-y-1">
                  <span className="text-[11px] uppercase text-slate-400 font-semibold tracking-wider">Payroll Profile</span>
                  <div className="pt-0.5">
                    <span
                      className={`px-2.5 py-1 rounded text-xs font-bold uppercase inline-block ${
                        workflowDetail.payroll.status === 'completed'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : 'bg-primary-500/10 text-primary-400 border border-primary-500/30'
                      }`}
                    >
                      {workflowDetail.payroll.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono">
                    Profile ID: {workflowDetail.payroll.profile_id || 'Uncommitted'}
                  </p>
                </div>
              </div>

              {/* Salary Breakdown Table (Monthly vs Annual) */}
              <div className="glass-panel rounded-xl border border-slate-800 overflow-hidden shadow-xl">
                <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100">Statutory Compensation Breakdown</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Calculated by deterministic Salary Engine according to Indian Labor Regulations</p>
                  </div>
                  <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20">
                    TAX REGIME: NEW (Default FY26)
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900/80 text-slate-400 uppercase text-[11px] font-semibold border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Component</th>
                        <th className="py-3 px-4">Policy Basis</th>
                        <th className="py-3 px-4 text-right">Monthly (INR)</th>
                        <th className="py-3 px-4 text-right">Annual (INR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                      <tr>
                        <td className="py-3 px-4 font-sans font-medium text-slate-200">Basic Salary</td>
                        <td className="py-3 px-4 font-sans text-slate-400">50% of Total CTC</td>
                        <td className="py-3 px-4 text-right font-semibold">{formatCurrency(workflowDetail.monthly.basic)}</td>
                        <td className="py-3 px-4 text-right font-semibold">{formatCurrency(workflowDetail.structure.basic)}</td>
                      </tr>
                      <tr>
                        <td className="py-3 px-4 font-sans font-medium text-slate-200">House Rent Allowance (HRA)</td>
                        <td className="py-3 px-4 font-sans text-slate-400">40% of Basic Salary</td>
                        <td className="py-3 px-4 text-right">{formatCurrency(workflowDetail.monthly.hra)}</td>
                        <td className="py-3 px-4 text-right">{formatCurrency(workflowDetail.structure.hra)}</td>
                      </tr>
                      <tr>
                        <td className="py-3 px-4 font-sans font-medium text-slate-200">Special Allowance</td>
                        <td className="py-3 px-4 font-sans text-slate-400">Balancing Allowance</td>
                        <td className="py-3 px-4 text-right">{formatCurrency(workflowDetail.monthly.special_allowance)}</td>
                        <td className="py-3 px-4 text-right">{formatCurrency(workflowDetail.structure.special_allowance)}</td>
                      </tr>
                      <tr>
                        <td className="py-3 px-4 font-sans font-medium text-slate-200">Employer Provident Fund (PF)</td>
                        <td className="py-3 px-4 font-sans text-slate-400">12% of Basic (Statutory)</td>
                        <td className="py-3 px-4 text-right">{formatCurrency(workflowDetail.monthly.employer_pf)}</td>
                        <td className="py-3 px-4 text-right">{formatCurrency(workflowDetail.structure.employer_pf)}</td>
                      </tr>
                      <tr className="bg-slate-900/40">
                        <td className="py-3 px-4 font-sans font-semibold text-slate-100">Gross Monthly / Annual CTC</td>
                        <td className="py-3 px-4 font-sans text-slate-400 font-semibold">Cost to Company</td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-400">{formatCurrency(workflowDetail.monthly.annual_ctc)}</td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-400">{formatCurrency(workflowDetail.structure.annual_ctc)}</td>
                      </tr>
                      <tr>
                        <td className="py-3 px-4 font-sans font-medium text-rose-300">Employee PF (Deduction)</td>
                        <td className="py-3 px-4 font-sans text-slate-400">12% of Basic (Deduction)</td>
                        <td className="py-3 px-4 text-right text-rose-300">-{formatCurrency(workflowDetail.monthly.employee_pf)}</td>
                        <td className="py-3 px-4 text-right text-rose-300">-{formatCurrency(workflowDetail.structure.employee_pf)}</td>
                      </tr>
                      <tr className="bg-emerald-950/20 font-bold border-t-2 border-emerald-500/30">
                        <td className="py-3 px-4 font-sans text-emerald-300">Estimated Net In-Hand Salary</td>
                        <td className="py-3 px-4 font-sans text-emerald-400/80">Take-Home (Pre-TDS)</td>
                        <td className="py-3 px-4 text-right text-emerald-300">
                          {formatCurrency((workflowDetail.monthly.annual_ctc || 0) - (workflowDetail.monthly.employer_pf || 0) - (workflowDetail.monthly.employee_pf || 0))}
                        </td>
                        <td className="py-3 px-4 text-right text-emerald-300">
                          {formatCurrency((workflowDetail.structure.annual_ctc || 0) - (workflowDetail.structure.employer_pf || 0) - (workflowDetail.structure.employee_pf || 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 3: Live CTC Simulator / Playground */}
      {activeTab === 'calculator' && (
        <div className="glass-panel p-6 rounded-xl border border-emerald-900/40 shadow-2xl space-y-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">Deterministic Salary Engine Sandbox</h2>
              <p className="text-xs text-slate-400">
                Simulate CTC band adjustments, tax regime impacts, and statutory breakdowns before approving employee packages.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Proposed Annual CTC (INR)</label>
              <input
                type="number"
                value={calcCtc}
                onChange={(e) => setCalcCtc(Number(e.target.value))}
                step={50000}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Target Designation</label>
              <select
                value={calcDesignation}
                onChange={(e) => setCalcDesignation(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="Associate Software Engineer">Associate Software Engineer (₹6L - ₹12L)</option>
                <option value="Software Engineer">Software Engineer (₹12L - ₹25L)</option>
                <option value="Senior Software Engineer">Senior Software Engineer (₹25L - ₹45L)</option>
                <option value="Staff Engineer">Staff Engineer (₹45L - ₹75L)</option>
                <option value="Principal Engineer">Principal Engineer (₹75L+)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Income Tax Regime</label>
              <select
                value={calcTaxRegime}
                onChange={(e) => setCalcTaxRegime(e.target.value as any)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="new">New Regime (Standard Default)</option>
                <option value="old">Old Regime (With Exemptions)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleCalculateTest}
              disabled={calcLoading}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-emerald-950/40 transition-all flex items-center space-x-1.5"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{calcLoading ? 'Computing Breakdown...' : 'Compute Salary Breakdown'}</span>
            </button>
          </div>

          {/* Calculator Output Table */}
          {calcResult && (
            <div className="border border-slate-800 rounded-xl overflow-hidden mt-4">
              <div className="bg-slate-900/90 p-3 border-b border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">Simulated Compensation Breakdown</span>
                <span className="text-xs font-mono text-emerald-400">Total: {formatCurrency(calcResult.annual_ctc)}</span>
              </div>
              <table className="w-full text-left text-xs">
                <tbody className="divide-y divide-slate-800 font-mono text-slate-300">
                  <tr className="bg-slate-950/40">
                    <td className="py-2.5 px-4 font-sans text-slate-400">Basic Pay (50%)</td>
                    <td className="py-2.5 px-4 text-right font-semibold">{formatCurrency(calcResult.basic)}</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-sans text-slate-400">House Rent Allowance (HRA)</td>
                    <td className="py-2.5 px-4 text-right">{formatCurrency(calcResult.hra)}</td>
                  </tr>
                  <tr className="bg-slate-950/40">
                    <td className="py-2.5 px-4 font-sans text-slate-400">Special Allowance</td>
                    <td className="py-2.5 px-4 text-right">{formatCurrency(calcResult.special_allowance)}</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-sans text-slate-400">Employer Provident Fund</td>
                    <td className="py-2.5 px-4 text-right">{formatCurrency(calcResult.employer_pf)}</td>
                  </tr>
                  <tr className="bg-emerald-950/20 font-bold">
                    <td className="py-2.5 px-4 font-sans text-emerald-300">Estimated Annual In-Hand</td>
                    <td className="py-2.5 px-4 text-right text-emerald-300">
                      {formatCurrency(calcResult.annual_ctc - calcResult.employer_pf - calcResult.employee_pf)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Salary Correction Request Modal */}
      {isCorrectionModalOpen && (
        <Modal
          isOpen={isCorrectionModalOpen}
          onClose={() => setIsCorrectionModalOpen(false)}
          title="Request Salary Package Correction"
          size="md"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-400">
              Rejecting this approval with a correction request will inform HR and return the workflow to data alignment.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Correction Justification & Target Bands <span className="text-rose-400">*</span>
              </label>
              <textarea
                rows={3}
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                placeholder="e.g. CTC exceeds department grade maximum for Software Engineer by ₹2,00,000. Realign base package."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-primary-500"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsCorrectionModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRequestCorrection}
                disabled={actionLoading || !correctionReason.trim()}
                className={`px-4 py-2 text-xs font-semibold rounded-lg text-white transition-all ${
                  actionLoading || !correctionReason.trim()
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                    : 'bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-950/40'
                }`}
              >
                {actionLoading ? 'Submitting...' : 'Submit Correction Request'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

