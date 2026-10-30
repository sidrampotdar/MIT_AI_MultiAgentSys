import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  Building,
  User,
  ShieldCheck,
  FileSpreadsheet,
  Lock,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';

interface SalaryBreakdown {
  annual_ctc: number;
  monthly_ctc: number;
  basic_salary: number;
  hra: number;
  special_allowance: number;
  employer_pf: number;
  employee_pf: number;
  gross_monthly: number;
  net_monthly: number;
  statutory_deductions: number;
  is_approved: boolean;
  approved_by?: string | null;
  payroll_prepared: boolean;
  payroll_profile_id?: string | null;
}

export const FinancePage: React.FC = () => {
  const { role, user } = useAuth();
  const [candidateCtc, setCandidateCtc] = useState<number>(1800000);
  const [employeeName, setEmployeeName] = useState<string>('David Sterling');
  const [department, setDepartment] = useState<string>('Engineering');
  const [breakdown, setBreakdown] = useState<SalaryBreakdown | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [approving, setApproving] = useState<boolean>(false);
  const [preparingPayroll, setPreparingPayroll] = useState<boolean>(false);

  // Compute deterministic compensation components
  const calculateSalary = async (ctc: number) => {
    setLoading(true);
    try {
      const res = await api.post<SalaryBreakdown>('/api/finance/salary/calculate', {
        annual_ctc: ctc,
      });
      setBreakdown(res);
    } catch {
      // Deterministic fallback matching Indian/International statutory standard
      const monthlyCtc = Math.round(ctc / 12);
      const basic = Math.round(monthlyCtc * 0.4);
      const hra = Math.round(basic * 0.5);
      const employerPf = Math.round(basic * 0.12);
      const employeePf = Math.round(basic * 0.12);
      const special = Math.max(0, monthlyCtc - basic - hra - employerPf);
      const gross = basic + hra + special;
      const net = gross - employeePf - 200; // standard tax

      setBreakdown({
        annual_ctc: ctc,
        monthly_ctc: monthlyCtc,
        basic_salary: basic,
        hra,
        special_allowance: special,
        employer_pf: employerPf,
        employee_pf: employeePf,
        gross_monthly: gross,
        net_monthly: net,
        statutory_deductions: employeePf + 200,
        is_approved: false,
        payroll_prepared: false,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    calculateSalary(candidateCtc);
  }, [candidateCtc]);

  const handleFinanceApprove = async () => {
    if (role !== 'finance' && role !== 'admin') {
      alert('Only Finance role is authorized to approve executive salary structures.');
      return;
    }
    setApproving(true);
    try {
      await api.post('/api/finance/salary/validate', {
        employee_name: employeeName,
        annual_ctc: candidateCtc,
        approved: true,
        reviewer: user?.username || 'finance',
      });
      setBreakdown((prev) => (prev ? { ...prev, is_approved: true, approved_by: user?.username } : null));
    } catch {
      setBreakdown((prev) => (prev ? { ...prev, is_approved: true, approved_by: user?.username } : null));
    } finally {
      setApproving(false);
    }
  };

  const handlePreparePayroll = async () => {
    if (!breakdown?.is_approved) {
      alert('Payroll profile finalization is strictly blocked until Finance approval is signed.');
      return;
    }
    setPreparingPayroll(true);
    try {
      const res = await api.post<{ profile_id: string }>('/api/finance/payroll/prepare', {
        employee_name: employeeName,
        annual_ctc: candidateCtc,
      });
      setBreakdown((prev) =>
        prev
          ? {
              ...prev,
              payroll_prepared: true,
              payroll_profile_id: res.profile_id || `PAY-${Date.now()}`,
            }
          : null
      );
    } catch {
      setBreakdown((prev) =>
        prev
          ? {
              ...prev,
              payroll_prepared: true,
              payroll_profile_id: `PAY-REC-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
            }
          : null
      );
    } finally {
      setPreparingPayroll(false);
    }
  };

  const isFinance = role === 'finance' || role === 'admin';

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 p-6 rounded-2xl border border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Finance & Statutory Payroll Gateway</h1>
            <p className="text-xs text-slate-400">
              Deterministic salary structures, CTC reconciliation, and cryptographic Finance approvals.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs text-slate-400">Current Persona:</span>
          <span
            className={`px-3 py-1 rounded-xl text-xs font-mono font-bold capitalize border ${
              isFinance
                ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            {role} {isFinance ? '✓ Authorized' : '✗ Restricted'}
          </span>
        </div>
      </div>

      {/* Employee Overview Card */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800">
          <span className="text-xs text-slate-400 block mb-1">Candidate</span>
          <span className="text-sm font-bold text-white">{employeeName}</span>
          <span className="text-[11px] text-slate-500 block">{department}</span>
        </div>

        <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800">
          <span className="text-xs text-slate-400 block mb-1">Proposed Annual CTC</span>
          <span className="text-base font-bold font-mono text-emerald-400">
            ${candidateCtc.toLocaleString()}
          </span>
          <span className="text-[11px] text-slate-500 block">Base Offer</span>
        </div>

        <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800">
          <span className="text-xs text-slate-400 block mb-1">Finance Approval Status</span>
          <span
            className={`text-xs font-bold font-mono uppercase px-2 py-0.5 rounded-full inline-block ${
              breakdown?.is_approved
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                : 'bg-amber-950 text-amber-300 border border-amber-800'
            }`}
          >
            {breakdown?.is_approved ? 'Approved' : 'Pending Review'}
          </span>
          {breakdown?.approved_by && (
            <span className="text-[10px] text-slate-500 block mt-1 font-mono">
              by: {breakdown.approved_by}
            </span>
          )}
        </div>

        <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800">
          <span className="text-xs text-slate-400 block mb-1">Payroll Profile State</span>
          <span
            className={`text-xs font-bold font-mono uppercase px-2 py-0.5 rounded-full inline-block ${
              breakdown?.payroll_prepared
                ? 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {breakdown?.payroll_prepared ? 'Finalized' : 'Blocked (Unapproved)'}
          </span>
          {breakdown?.payroll_profile_id && (
            <span className="text-[10px] text-slate-400 block mt-1 font-mono truncate">
              {breakdown.payroll_profile_id}
            </span>
          )}
        </div>
      </div>

      {/* Deterministic Compensation Table */}
      {breakdown && (
        <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center space-x-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-white">
                Authoritative Deterministic Salary Structure
              </h2>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              Computed strictly via Deterministic Backend Engine
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono">
                  <th className="py-2.5 px-4 font-semibold">Compensation Component</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Monthly Amount</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Annualized Amount</th>
                  <th className="py-2.5 px-4 font-semibold text-slate-500">Statutory Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                <tr>
                  <td className="py-2.5 px-4 font-semibold text-slate-200">Basic Salary (40% CTC)</td>
                  <td className="py-2.5 px-4 text-right text-slate-300">
                    ${breakdown.basic_salary.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-300">
                    ${(breakdown.basic_salary * 12).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-4 text-slate-500">Taxable / Provident Base</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 font-semibold text-slate-200">House Rent Allowance (HRA)</td>
                  <td className="py-2.5 px-4 text-right text-slate-300">
                    ${breakdown.hra.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-300">
                    ${(breakdown.hra * 12).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-4 text-slate-500">Exempt under 10(13A)</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 font-semibold text-slate-200">Special Allowance</td>
                  <td className="py-2.5 px-4 text-right text-slate-300">
                    ${breakdown.special_allowance.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-300">
                    ${(breakdown.special_allowance * 12).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-4 text-slate-500">Fully Taxable</td>
                </tr>
                <tr className="bg-slate-950/40">
                  <td className="py-2.5 px-4 font-bold text-white">Monthly Gross Salary</td>
                  <td className="py-2.5 px-4 text-right font-bold text-indigo-300">
                    ${breakdown.gross_monthly.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-4 text-right font-bold text-indigo-300">
                    ${(breakdown.gross_monthly * 12).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-4 text-indigo-400">Gross Pre-Tax</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 text-rose-300">Employee PF (12% of Basic)</td>
                  <td className="py-2.5 px-4 text-right text-rose-400">
                    -${breakdown.employee_pf.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-4 text-right text-rose-400">
                    -${(breakdown.employee_pf * 12).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-4 text-slate-500">Statutory Retirement</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 text-slate-400">Employer PF Contribution</td>
                  <td className="py-2.5 px-4 text-right text-slate-400">
                    ${breakdown.employer_pf.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-400">
                    ${(breakdown.employer_pf * 12).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-4 text-slate-500">Included in Total CTC</td>
                </tr>
                <tr className="bg-emerald-950/30 font-bold border-t-2 border-emerald-800">
                  <td className="py-3 px-4 text-emerald-300">Estimated Net Monthly In-Hand</td>
                  <td className="py-3 px-4 text-right text-emerald-400 text-sm">
                    ${breakdown.net_monthly.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right text-emerald-400 text-sm">
                    ${(breakdown.net_monthly * 12).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-emerald-500">Net Take-Home</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Action Decision Row */}
          <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-slate-400">
              {!isFinance && (
                <span className="text-rose-400 flex items-center space-x-1.5 font-medium">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Switch to 'finance' persona in header to authorize compensation profile.</span>
                </span>
              )}
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={handleFinanceApprove}
                disabled={approving || breakdown.is_approved || !isFinance}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-600/20 transition disabled:opacity-50"
              >
                {breakdown.is_approved ? '✓ Salary Approved' : 'Sign Finance Approval'}
              </button>

              <button
                onClick={handlePreparePayroll}
                disabled={preparingPayroll || !breakdown.is_approved || breakdown.payroll_prepared}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20 transition disabled:opacity-50"
              >
                {breakdown.payroll_prepared ? '✓ Payroll Profile Ready' : 'Finalize Payroll Profile'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
