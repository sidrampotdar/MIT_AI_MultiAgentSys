import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { RedFlagItem } from '../../types';
import { History, ShieldAlert, CheckCircle, Clock, AlertTriangle, ShieldCheck } from 'lucide-react';

interface AuditEvent {
  event_id: string;
  timestamp: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, any>;
}

export const AuditTimelinePage: React.FC = () => {
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [redFlags, setRedFlags] = useState<RedFlagItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'audit' | 'redflags'>('audit');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [auditRes, flagsRes] = await Promise.allSettled([
        api.get<AuditEvent[]>('/api/audit'),
        api.get<RedFlagItem[]>('/api/red-flags'),
      ]);

      if (auditRes.status === 'fulfilled' && Array.isArray(auditRes.value)) {
        setAuditEvents(auditRes.value);
      }
      if (flagsRes.status === 'fulfilled' && Array.isArray(flagsRes.value)) {
        setRedFlags(flagsRes.value);
      }
    } catch (err) {
      console.warn('Error fetching audit data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleResolveFlag = async (flagId: string) => {
    const reason = prompt('Enter resolution justification:');
    if (!reason) return;
    try {
      await api.post(`/api/red-flags/${encodeURIComponent(flagId)}/resolve`, {
        resolution_notes: reason,
      });
      fetchData();
    } catch (err: any) {
      alert(`Could not resolve flag: ${err.message || 'Error'}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between bg-slate-900/40 p-5 rounded-2xl border border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-purple-950 border border-purple-800 flex items-center justify-center text-purple-400">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">System Audit & Compliance Ledger</h2>
            <p className="text-xs text-slate-400">
              Immutable event log, security decisions, and AI-detected red-flag discrepancies.
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition ${
              activeTab === 'audit' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Audit Log ({auditEvents.length})
          </button>
          <button
            onClick={() => setActiveTab('redflags')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition flex items-center space-x-1.5 ${
              activeTab === 'redflags' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Red Flags ({redFlags.length})</span>
          </button>
        </div>
      </div>

      {/* Content */}
      {activeTab === 'audit' ? (
        <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-5">
          {auditEvents.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
              No audit events recorded yet.
            </div>
          ) : (
            <div className="space-y-3">
              {auditEvents.map((ev, i) => (
                <div
                  key={ev.event_id || i}
                  className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2 font-mono">
                      <span className="font-bold text-white">{ev.action}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300">
                        {ev.actor}
                      </span>
                      <span className="text-slate-500">• {ev.entity_type}: {ev.entity_id}</span>
                    </div>
                    {ev.details && (
                      <p className="text-slate-400 text-[11px] font-mono truncate max-w-2xl">
                        {JSON.stringify(ev.details)}
                      </p>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono flex items-center space-x-1 shrink-0">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(ev.timestamp).toLocaleString()}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-5">
          {redFlags.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              Zero active red flags. System operates within statutory risk parameters.
            </div>
          ) : (
            <div className="space-y-3">
              {redFlags.map((flag) => (
                <div
                  key={flag.flag_id}
                  className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded-full font-bold ${
                          flag.severity === 'critical'
                            ? 'bg-rose-950 text-rose-300 border border-rose-800'
                            : 'bg-amber-950 text-amber-300 border border-amber-800'
                        }`}
                      >
                        {flag.severity}
                      </span>
                      <span className="font-semibold text-white">{flag.category}</span>
                      <span className="text-slate-500 font-mono text-[11px]">
                        wf: {flag.workflow_id}
                      </span>
                    </div>
                    <p className="text-slate-300">{flag.message}</p>
                    {flag.evidence && (
                      <pre className="p-2 bg-slate-900 rounded font-mono text-[10px] text-slate-400 overflow-x-auto max-h-24">
                        {JSON.stringify(flag.evidence, null, 2)}
                      </pre>
                    )}
                  </div>

                  <div className="shrink-0">
                    {flag.resolved ? (
                      <span className="flex items-center space-x-1 text-emerald-400 text-xs font-mono">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Resolved ({flag.resolved_by})</span>
                      </span>
                    ) : (
                      <button
                        onClick={() => handleResolveFlag(flag.flag_id)}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition"
                      >
                        Resolve Discrepancy
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
