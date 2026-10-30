import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';
import { DashboardSummary } from '@/types';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock,
  UserPlus,
  ArrowRight,
  ShieldAlert,
  Cpu,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.get<DashboardSummary>('/api/dashboard/summary');
      setSummary(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard summary');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
    const interval = setInterval(fetchSummary, 10000); // Polling every 10s
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
              Operations & Workflow Hub
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
              Live Real-Time
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Human-in-the-loop operational dashboard coordinating AI agent execution and compliance checkpoints.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchSummary}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white glass-panel hover:bg-slate-800 transition-all active:scale-95"
            title="Refresh dashboard metrics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
          <Link
            to="/intake"
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/30 transition-all active:scale-95"
          >
            <UserPlus className="w-4 h-4" />
            <span>New Employee Intake</span>
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={fetchSummary}
            className="text-xs font-semibold underline hover:text-white"
          >
            Retry
          </button>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active Workflows */}
        <div className="glass-panel rounded-2xl p-5 glow-blue relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Active Workflows
            </span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white tracking-tight">
              {summary ? summary.workflows_active : isLoading ? '...' : 0}
            </span>
            <span className="text-xs text-slate-400">orchestrations running</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Total: {summary?.workflows_total || 0}</span>
            <span className="text-blue-400 font-medium flex items-center gap-1">
              Live DAG Engine <Sparkles className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* Pending Approvals */}
        <Link
          to="/approvals"
          className="glass-panel rounded-2xl p-5 glow-amber relative overflow-hidden group hover:border-amber-500/40 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Pending Approvals (HITL)
            </span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white tracking-tight">
              {summary ? summary.pending_approvals : isLoading ? '...' : 0}
            </span>
            <span className="text-xs text-amber-400 font-medium">requires action</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 group-hover:text-amber-300">
            <span>Pre-execution gates</span>
            <span className="flex items-center gap-1 font-semibold">
              Review Queue <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </Link>

        {/* Critical Flags */}
        <Link
          to="/verification"
          className="glass-panel rounded-2xl p-5 glow-rose relative overflow-hidden group hover:border-rose-500/40 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Critical Red Flags
            </span>
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white tracking-tight">
              {summary ? summary.red_flags_critical : isLoading ? '...' : 0}
            </span>
            <span className="text-xs text-rose-400 font-medium">escalated discrepancies</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 group-hover:text-rose-300">
            <span>Deterministic blocks</span>
            <span className="flex items-center gap-1 font-semibold">
              Investigate <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </Link>

        {/* Completed Onboardings */}
        <div className="glass-panel rounded-2xl p-5 glow-emerald relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Completed Onboardings
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white tracking-tight">
              {summary ? summary.workflows_completed : isLoading ? '...' : 0}
            </span>
            <span className="text-xs text-slate-400">fully verified & active</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Employees total: {summary?.employees_total || 0}</span>
            <span className="text-emerald-400 font-medium">100% Audited</span>
          </div>
        </div>
      </div>

      {/* Grid: Agent Summary & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent Operations Matrix */}
        <div className="lg:col-span-2 glass-panel rounded-2xl p-6 border border-slate-800">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-blue-400" />
              <h2 className="text-base font-bold text-white tracking-tight">
                Specialized AI Agent Performance
              </h2>
            </div>
            <span className="text-xs text-slate-400">Distributed Dispatcher</span>
          </div>

          <div className="mt-4 divide-y divide-slate-800/60">
            {summary?.agent_summary && summary.agent_summary.length > 0 ? (
              summary.agent_summary.map((ag) => (
                <div key={ag.agent} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-slate-200">
                      {ag.agent.replace(/_/g, ' ').toUpperCase()}
                    </span>
                    <span className="text-slate-500 text-[10px] block">
                      Autonomous delegated responsibility
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-mono">
                    <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                      {ag.completed} done
                    </span>
                    {ag.active > 0 && (
                      <span className="text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/20 animate-pulse">
                        {ag.active} active
                      </span>
                    )}
                    {ag.failed > 0 && (
                      <span className="text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20">
                        {ag.failed} failed
                      </span>
                    )}
                    {ag.blocked > 0 && (
                      <span className="text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                        {ag.blocked} blocked
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                No active agent task traces recorded yet. Start an intake to watch agents coordinate live.
              </div>
            )}
          </div>
        </div>

        {/* Recent Audit Timeline Stream */}
        <div className="glass-panel rounded-2xl p-6 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h2 className="text-base font-bold text-white tracking-tight">
                Live Audit Stream
              </h2>
              <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" /> SHA-256 Chained
              </span>
            </div>

            <div className="mt-4 space-y-3.5 max-h-[360px] overflow-y-auto pr-1">
              {summary?.recent_activity && summary.recent_activity.length > 0 ? (
                summary.recent_activity.slice(0, 7).map((act, i) => (
                  <div key={i} className="text-xs p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span className="font-mono text-blue-400">{act.actor}</span>
                      <span>{new Date(act.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="mt-1 font-medium text-slate-200">
                      {act.event_type.replace(/_/g, ' ')}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-slate-400 truncate">
                      WF: {act.workflow_id}
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-xs text-slate-400">
                  Audit events will stream here in real time.
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 mt-4">
            <Link
              to="/approvals"
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white glass-card hover:bg-slate-800 transition-colors"
            >
              <span>Go to Human-in-the-Loop Hub</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

