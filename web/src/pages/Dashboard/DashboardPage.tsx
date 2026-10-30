import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import {
  Users,
  Activity,
  CheckCircle,
  AlertOctagon,
  Clock,
  ArrowRight,
  ShieldCheck,
  UserPlus,
  Bot,
  RefreshCw,
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const summary = await api.get<any>('/api/dashboard/summary');
      setData(summary);
    } catch (err: any) {
      console.warn('Dashboard fetch notice:', err.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  const totalEmployees = data?.employees_total ?? data?.total_employees ?? 0;
  const activeWorkflows = data?.workflows_active ?? data?.active_workflows ?? 0;
  const pendingApprovals = data?.pending_approvals ?? 0;
  const criticalRedFlags = data?.red_flags_critical ?? data?.critical_red_flags ?? 0;
  const highRedFlags = data?.red_flags_high ?? 0;
  const recentActivities = data?.recent_activity ?? data?.recent_activities ?? [];
  const agentSummary = data?.agent_summary ?? [];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900/80 via-slate-900/60 to-indigo-950/40 p-6 rounded-2xl border border-slate-800 backdrop-blur-md">
        <div>
          <span className="text-[11px] font-mono uppercase tracking-wider text-indigo-400 font-semibold">
            Enterprise Autonomous Orchestration
          </span>
          <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight mt-0.5">
            Operations Command Center
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time multi-agent onboarding execution, HITL approval gates, and compliance monitoring.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => navigate('/intake')}
            className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/30 transition cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Onboard New Employee</span>
          </button>
          <button
            onClick={fetchSummary}
            className="p-2 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 rounded-xl border border-slate-800 transition cursor-pointer"
            title="Refresh metrics"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Employees */}
        <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Employees</span>
            <Users className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono mt-2">{totalEmployees}</div>
          <span className="text-[11px] text-slate-500 mt-1 block">Registered in company directory</span>
        </div>

        {/* Active Workflows */}
        <div
          onClick={() => navigate('/monitor')}
          className="p-4 bg-slate-900/60 hover:bg-slate-800/60 rounded-xl border border-slate-800 cursor-pointer transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Active Workflows</span>
            <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 font-mono mt-2">{activeWorkflows}</div>
          <span className="text-[11px] text-indigo-400 mt-1 flex items-center space-x-1">
            <span>View Execution Monitor</span>
            <ArrowRight className="w-3 h-3" />
          </span>
        </div>

        {/* Pending Approvals */}
        <div
          onClick={() => navigate('/approvals')}
          className="p-4 bg-slate-900/60 hover:bg-slate-800/60 rounded-xl border border-slate-800 cursor-pointer transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Pending Approvals</span>
            <ShieldCheck className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400 font-mono mt-2">{pendingApprovals}</div>
          <span className="text-[11px] text-indigo-400 mt-1 flex items-center space-x-1">
            <span>Review in HITL Center</span>
            <ArrowRight className="w-3 h-3" />
          </span>
        </div>

        {/* Critical & High Red Flags */}
        <div
          onClick={() => navigate('/audit')}
          className="p-4 bg-slate-900/60 hover:bg-slate-800/60 rounded-xl border border-slate-800 cursor-pointer transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Security Red Flags</span>
            <AlertOctagon className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-400 font-mono mt-2">
            {criticalRedFlags + highRedFlags}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            {criticalRedFlags} critical • {highRedFlags} high severity
          </span>
        </div>
      </div>

      {/* Two Column Section: Recent Activity & Agent Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Recent Activity Feed */}
        <div className="lg:col-span-7 bg-slate-900/60 rounded-2xl border border-slate-800 p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-bold text-white">Live Operations Feed</h2>
            </div>
            <button
              onClick={() => navigate('/monitor')}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center space-x-1 cursor-pointer"
            >
              <span>Inspect Monitor</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-3">
            {recentActivities.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-xs">
                No recent activity recorded. Start an onboarding workflow to begin orchestration.
              </div>
            ) : (
              recentActivities.map((act: any, i: number) => {
                const title = act.message || `${act.actor}: ${act.event_type?.replace(/_/g, ' ')}`;
                return (
                  <div
                    key={act.event_id || i}
                    className="p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
                      <div className="truncate">
                        <p className="text-slate-200 font-medium truncate capitalize">{title}</p>
                        <span className="text-[10px] font-mono text-slate-500">
                          {act.status || 'ok'} {act.workflow_id ? `• wid: ${act.workflow_id}` : ''}
                        </span>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono text-slate-500 shrink-0">
                      {act.timestamp ? new Date(act.timestamp).toLocaleTimeString() : '—'}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Multi-Agent Swarm Health */}
        <div className="lg:col-span-5 bg-slate-900/60 rounded-2xl border border-slate-800 p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
            <div className="flex items-center space-x-2">
              <Bot className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-white">Agent Swarm Execution State</h2>
            </div>
            <span className="text-xs font-mono text-emerald-400">11 Registered</span>
          </div>

          <div className="space-y-2.5">
            {[
              { name: 'Planner Agent', role: 'Dynamic DAG Planner', key: 'planner_agent' },
              { name: 'Document Agent', role: 'OCR & Parsing', key: 'document_agent' },
              { name: 'Education Verification', role: 'Registrar Inquiry', key: 'education_verification_agent' },
              { name: 'Employment Verification', role: 'History Check', key: 'employment_verification_agent' },
              { name: 'Email Operations', role: 'Outreach & Reply Engine', key: 'email_operations_agent' },
              { name: 'Finance Agent', role: 'Salary & Statutory PF', key: 'finance_agent' },
              { name: 'HR Agent', role: 'Intake & Final Authorization', key: 'hr_agent' },
              { name: 'Account Agent', role: 'IT Credentials', key: 'account_agent' },
              { name: 'Equipment Agent', role: 'Hardware & Asset Allocation', key: 'equipment_agent' },
              { name: 'Compliance Agent', role: 'Statutory Exceptions', key: 'compliance_agent' },
            ].map((ag) => {
              const stat = agentSummary.find((s: any) => s.agent === ag.key);
              const isActive = (stat?.active ?? 0) > 0;
              const completed = stat?.completed ?? 0;

              return (
                <div
                  key={ag.name}
                  className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-800 flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-semibold text-slate-200">{ag.name}</span>
                    <span className="text-[10px] text-slate-500 block">{ag.role}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {completed > 0 && (
                      <span className="text-[10px] font-mono text-emerald-400">
                        {completed} done
                      </span>
                    )}
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase ${
                        isActive
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-slate-900 text-slate-400 border border-slate-800'
                      }`}
                    >
                      {isActive ? 'active' : 'idle'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
