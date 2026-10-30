import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import {
  FileCheck2,
  Mail,
  GraduationCap,
  Briefcase,
  AlertTriangle,
  CheckCircle,
  Clock,
  Sparkles,
} from 'lucide-react';

export const VerificationPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'tracks' | 'emails'>('tracks');
  const [verifications, setVerifications] = useState<any[]>([]);
  const [emails, setEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [simulating, setSimulating] = useState<boolean>(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [verRes, emailRes] = await Promise.allSettled([
        api.get<any[]>('/api/verifications'),
        api.get<any[]>('/api/email/messages'),
      ]);

      if (verRes.status === 'fulfilled' && Array.isArray(verRes.value)) {
        setVerifications(verRes.value);
      }
      if (emailRes.status === 'fulfilled' && Array.isArray(emailRes.value)) {
        setEmails(emailRes.value);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const triggerMockReply = async (outcome: 'confirmed' | 'mismatch') => {
    const firstWfId = verifications[0]?.workflow_id || 'WF-F0E87FFFE4';
    setSimulating(true);
    try {
      await api.post('/api/email/mock-replies', {
        workflow_id: firstWfId,
        kind: 'education',
        outcome,
        body: outcome === 'confirmed'
          ? 'Registrar confirms degree and graduation date matched candidate record.'
          : 'Registrar records show candidate graduation year does not match certificate submission.',
      });
      await fetchData();
    } catch (err: any) {
      alert(`Simulation notice: ${err.message || 'Complete'}`);
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 p-6 rounded-2xl border border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-800 flex items-center justify-center text-cyan-400">
            <FileCheck2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Verification & Email Operations Hub</h1>
            <p className="text-xs text-slate-400">
              Autonomous university & employer background verification and simulated email lifecycles.
            </p>
          </div>
        </div>

        {/* Tab & Simulation Controls */}
        <div className="flex items-center space-x-2 flex-wrap gap-2">
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setActiveTab('tracks')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                activeTab === 'tracks' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Verification Tracks ({verifications.length})
            </button>
            <button
              onClick={() => setActiveTab('emails')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                activeTab === 'emails' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Email Operations ({emails.length})
            </button>
          </div>

          <button
            onClick={() => triggerMockReply('confirmed')}
            disabled={simulating}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 rounded-xl transition disabled:opacity-50 cursor-pointer"
            title="Simulate positive verification confirmation"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Simulate Confirmation</span>
          </button>

          <button
            onClick={() => triggerMockReply('mismatch')}
            disabled={simulating}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 rounded-xl transition disabled:opacity-50 cursor-pointer"
            title="Simulate degree discrepancy (Scenario B)"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Simulate Discrepancy</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      {activeTab === 'tracks' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {verifications.length === 0 ? (
            <div className="col-span-2 text-center py-12 text-slate-500 text-xs bg-slate-900/60 rounded-2xl border border-slate-800">
              <FileCheck2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
              No background verification tracks active.
            </div>
          ) : (
            verifications.map((v, idx) => {
              const kind = v.kind || v.category || 'education';
              const isEdu = kind === 'education';
              const Icon = isEdu ? GraduationCap : Briefcase;
              const candidate = v.employee?.name || v.candidate_name || 'Candidate';
              const targetOrg = v.claimed?.institution || v.claimed?.employer || v.target_organization || 'Institution';
              const status = v.status || v.task_status || 'pending';

              return (
                <div
                  key={v.verification_id || idx}
                  className="bg-slate-900/60 rounded-2xl border border-slate-800 p-5 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className="p-2 bg-slate-950 rounded-xl border border-slate-800 text-indigo-400">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white capitalize">
                          {kind} Verification
                        </h3>
                        <span className="text-[10px] text-slate-400 font-mono">
                          Target: {targetOrg}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-mono px-2.5 py-1 rounded-full uppercase font-bold ${
                        status === 'verified' || status === 'completed'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : status === 'discrepancy' || status === 'escalated'
                          ? 'bg-rose-950 text-rose-300 border border-rose-800'
                          : 'bg-amber-950 text-amber-300 border border-amber-800'
                      }`}
                    >
                      {status}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
                    <div className="text-slate-400">
                      <span className="font-semibold text-slate-300">Candidate:</span> {candidate}
                    </div>

                    {v.claimed && (
                      <div>
                        <span className="text-slate-400 block font-semibold mb-0.5">Claimed Details:</span>
                        <pre className="p-2 bg-slate-900 rounded font-mono text-[10px] text-slate-300 overflow-x-auto max-h-24">
                          {JSON.stringify(v.claimed, null, 2)}
                        </pre>
                      </div>
                    )}

                    {v.documents && v.documents.length > 0 && (
                      <div>
                        <span className="text-slate-400 block font-semibold mb-0.5">Submitted Documents:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {v.documents.map((doc: any) => (
                            <span
                              key={doc.document_id}
                              className="text-[10px] font-mono bg-slate-900 text-indigo-300 px-2 py-0.5 rounded border border-slate-800"
                            >
                              {doc.doc_type} ({doc.status})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Email Operations View */
        <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center space-x-2">
              <Mail className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-bold text-white">Simulated Communication Transcripts</h2>
            </div>
            <span className="text-xs font-mono text-slate-400">Lifecycle: DRAFTED → SENT → REPLY</span>
          </div>

          <div className="space-y-3">
            {emails.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-xs">
                No outbound or inbound email messages queued yet.
              </div>
            ) : (
              emails.map((msg, i) => (
                <div
                  key={msg.message_id || i}
                  className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center space-x-2 font-mono">
                      <span className="text-indigo-400 font-bold">{msg.sender}</span>
                      <span className="text-slate-600">→</span>
                      <span className="text-emerald-400 font-bold">{msg.recipient}</span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded uppercase font-semibold bg-indigo-950 text-indigo-300 border border-indigo-900">
                      {msg.status}
                    </span>
                  </div>

                  <div className="text-sm font-semibold text-white">{msg.subject}</div>
                  <p className="text-slate-300 leading-relaxed font-sans">{msg.body}</p>

                  <div className="text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-900 flex items-center justify-between">
                    <span>Thread: {msg.thread_id}</span>
                    <span>{msg.created_at ? new Date(msg.created_at).toLocaleString() : '—'}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
