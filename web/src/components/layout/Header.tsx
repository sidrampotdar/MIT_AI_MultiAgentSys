import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Role } from '../../types';
import { User, ShieldCheck, ChevronDown, Check } from 'lucide-react';

const availableRoles: Array<{ role: Role; label: string; desc: string }> = [
  { role: 'admin', label: 'Admin', desc: 'System management' },
  { role: 'hr', label: 'HR Lead', desc: 'Intake, verification & final review' },
  { role: 'finance', label: 'Finance Manager', desc: 'Salary & payroll approvals' },
  { role: 'security', label: 'Security Lead', desc: 'Privileged access authorization' },
  { role: 'it', label: 'IT Engineer', desc: 'Accounts & equipment allocation' },
  { role: 'compliance', label: 'Compliance Officer', desc: 'Statutory exceptions' },
  { role: 'viewer', label: 'Viewer (Read-Only)', desc: 'Audit & observation only' },
];

export const Header: React.FC = () => {
  const { user, role, switchPersona } = useAuth();
  const [dropdownOpen, setDropdownOpen] = React.useState(false);

  return (
    <header className="h-16 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10">
      {/* Left indicator */}
      <div className="flex items-center space-x-3">
        <span className="flex h-2.5 w-2.5 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
        </span>
        <span className="text-xs font-mono text-slate-300">
          FastAPI AI Orchestrator: <span className="text-emerald-400 font-semibold">Active</span>
        </span>
      </div>

      {/* Right: Persona Switcher and User Info */}
      <div className="flex items-center space-x-4">
        {/* Persona Switcher Dropdown */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-slate-200 px-3 py-1.5 rounded-xl border border-slate-700 text-xs transition"
          >
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
            <span className="font-semibold capitalize">Persona: {role}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl py-1 z-30">
              <div className="px-3 py-2 border-b border-slate-800 text-[11px] text-slate-400">
                Switch active test persona:
              </div>
              {availableRoles.map((r) => (
                <button
                  key={r.role}
                  onClick={() => {
                    switchPersona(r.role);
                    setDropdownOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-slate-800 flex items-center justify-between transition"
                >
                  <div>
                    <div className="font-semibold text-white">{r.label}</div>
                    <div className="text-[10px] text-slate-400">{r.desc}</div>
                  </div>
                  {role === r.role && <Check className="w-4 h-4 text-indigo-400" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* User Card */}
        <div className="flex items-center space-x-2 pl-3 border-l border-slate-800 text-xs">
          <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 font-semibold uppercase">
            <User className="w-4 h-4" />
          </div>
          <div className="hidden sm:block">
            <div className="font-semibold text-white">{user?.full_name || 'System User'}</div>
            <div className="text-[10px] font-mono text-slate-400 uppercase">{user?.role}</div>
          </div>
        </div>
      </div>
    </header>
  );
};
