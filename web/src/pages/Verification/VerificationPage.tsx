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
  Send,
  Inbox,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

interface VerificationRecord {
  verification_id: string;
  workflow_id: string;
  category: 'education' | 'employment';
  candidate_name: string;
  target_organization: string;
  status: 'pending' | 'in_progress' | 'verified' | 'discrepancy' | 'failed';
  claimed_data: Record<string, any>;
  verified_data?: Record<string, any>;
  discrepancies?: string[];
  email_thread_id?: string;
  updated_at: string;
}

interface EmailItem {
  message_id: string;
  thread_id: string;
  sender: string;
  recipient: string;
  subject: string;
  body: string;
  status: 'drafted' | 'waiting_approval' | 'approved' | 'sent' | 'waiting_reply' | 'reply_received' | 'processed';
  is_simulated: boolean;
  created_at: string;
}

export const VerificationPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'tracks' | 'emails'>('tracks');
  const [verifications, setVerifications] = useState<VerificationRecord[]>([]);
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [simulating, setSimulating] = useState<boolean>(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [verRes, emailRes] = await Promise.allSettled([
        api.get<VerificationRecord[]>('/api/verifications'),
        api.get<EmailItem[]>('/api/email/messages'),
      ]);

      if (verRes.status === 'fulfilled' && Array.isArray(verRes.value)) {
        setVerifications(verRes.value);
      } else {
        // Fallback default tracks for demo
        setVerifications([
          {
            verification_id: 'v-edu-1',
            workflow_id: 'wf-demo',
            category: 'education',
            candidate_name: 'Alice Chen',
            target_organization: 'MIT Registrar',
            status: 'verified',
            claimed_data: { degree: 'B.S. in Computer Science', year: 2020 },
            verified_data: { degree: 'B.S. in Computer Science', graduation_date: '2020-05-28' },
            updated_at: new Date().toISOString(),
          },
          {
            verification_id: 'v-emp-1',
            workflow_id: 'wf-demo',
            category: 'employment',
            candidate_name: 'Alice Chen',
            target_organization: 'Apex Innovations',
            status: 'in_progress',
            claimed_data: { title: 'Software Engineer', period: '2020-2024' },
            updated_at: new Date().toISOString(),
          },
        ]);
      }

      if (emailRes.status === 'fulfilled' && Array.isArray(emailRes.value)) {
        setEmails(emailRes.value);
      } else {
        setEmails([
          {
            message_id: 'em-1',
            thread_id: 'th-edu-1',
            sender: 'hr-verify@enterprise.test',
            recipient: 'registrar@mit.edu.test',
            subject: 'Verification Request: Alice Chen (Ref: #EDU-901)',
            body: 'Dear Registrar, Please verify the graduation credentials of candidate Alice Chen.',
            status: 'sent',
            is_simulated: true,
            created_at: new Date().toISOString(),
          },
          {
            message_id: 'em-2',
            thread_id: 'th-edu-1',
            sender: 'registrar@mit.edu.test',
            recipient: 'hr-verify@enterprise.test',
            subject: 'Re: Verification Request: Alice Chen (Ref: #EDU-901)',
            body: 'MIT Registrar confirms Alice Chen graduated with B.S. in Computer Science on May 28, 2020.',
            status: 'reply_received',
            is_simulated: true,
            created_at: new Date().toISOString(),
          },
        ]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const triggerMockReply = async (type: 'confirm' | 'discrepancy') => {
    setSimulating(true);
    try {
      await api.post('/api/email/mock-replies', {
        reply_scenario: type === 'confirm' ? 'university_confirms' : 'university_mismatch',
      });
      await fetchData();
    } catch (err: any) {
      alert(`Simulation failed: ${err.message || 'Error'}`);
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
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                activeTab === 'tracks' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Verification Tracks
            </button>
            <button
              onClick={() => setActiveTab('emails')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                activeTab === 'emails' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Email Operations ({emails.length})
            </button>
          </div>

          <button
            onClick={() => triggerMockReply('confirm')}
            disabled={simulating}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 rounded-xl transition disabled:opacity-50"
            title="Simulate university registrar positive confirmation"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Simulate Positive Reply</span>
          </button>

          <button
            onClick={() => triggerMockReply('discrepancy')}
            disabled={simulating}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 rounded-xl transition disabled:opacity-50"
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
          {verifications.map((v) => {
            const isEdu = v.category === 'education';
            const Icon = isEdu ? GraduationCap : Briefcase;

            return (
              <div
                key={v.verification_id}
                className="bg-slate-900/60 rounded-2xl border border-slate-800 p-5 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 bg-slate-950 rounded-xl border border-slate-800 text-indigo-400">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white capitalize">
                        {v.category} Verification
                      </h3>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Target: {v.target_organization}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-mono px-2.5 py-1 rounded-full uppercase font-bold ${
                      v.status === 'verified'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : v.status === 'discrepancy'
                        ? 'bg-rose-950 text-rose-300 border border-rose-800'
                        : 'bg-amber-950 text-amber-300 border border-amber-800'
                    }`}
                  >
                    {v.status}
                  </span>
                </div>

                <div className="space-y-2 text-xs bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
                  <div className="text-slate-400">
                    <span className="font-semibold text-slate-300">Candidate:</span> {v.candidate_name}
                  </div>
                  <div>
                    <span className="text-slate-400 block font-semibold mb-0.5">Claimed Details:</span>
                    <pre className="p-2 bg-slate-900 rounded font-mono text-[10px] text-slate-300">
                      {JSON.stringify(v.claimed_data, null, 2)}
                    </pre>
                  </div>

                  {v.verified_data && (
                    <div>
                      <span className="text-emerald-400 block font-semibold mb-0.5">Verified Data:</span>
                      <pre className="p-2 bg-slate-900 rounded font-mono text-[10px] text-emerald-300">
                        {JSON.stringify(v.verified_data, null, 2)}
                      </pre>
                    </div>
                  )}

                  {v.discrepancies && v.discrepancies.length > 0 && (
                    <div className="p-2 bg-rose-950/40 border border-rose-900/60 rounded text-rose-300 text-[11px]">
                      <span className="font-bold">Detected Discrepancies:</span>
                      <ul className="list-disc pl-4 mt-1">
                        {v.discrepancies.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
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
            {emails.map((msg) => (
              <div
                key={msg.message_id}
                className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 text-xs space-y-2"
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center space-x-2 font-mono">
                    <span className="text-indigo-400 font-bold">{msg.sender}</span>
                    <span className="text-slate-600">→</span>
                    <span className="text-emerald-400 font-bold">{msg.recipient}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {msg.is_simulated && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                        SIMULATED
                      </span>
                    )}
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded uppercase font-semibold bg-indigo-950 text-indigo-300 border border-indigo-900">
                      {msg.status}
                    </span>
                  </div>
                </div>

                <div className="text-sm font-semibold text-white">{msg.subject}</div>
                <p className="text-slate-300 leading-relaxed font-sans">{msg.body}</p>

                <div className="text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-900 flex items-center justify-between">
                  <span>Thread: {msg.thread_id}</span>
                  <span>{new Date(msg.created_at).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
