import React from 'react';
import { useAuth, PERSONAS } from '@/context/AuthContext';
import { Role } from '@/types';
import { ShieldCheck, UserCheck, ChevronDown } from 'lucide-react';

export const PersonaSwitcher: React.FC = () => {
  const { activeRole, switchPersona, isLoading } = useAuth();
  const [isOpen, setIsOpen] = React.useState(false);
  const currentPersona = PERSONAS[activeRole];

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
          currentPersona.badgeColor
        } hover:brightness-110 active:scale-95`}
        title="Toggle active persona to test RBAC live"
      >
        <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
        <span className="font-semibold tracking-wide uppercase">{currentPersona.label}</span>
        <span className="text-slate-400 font-normal hidden sm:inline">({activeRole})</span>
        <ChevronDown className="w-3.5 h-3.5 opacity-70" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-72 rounded-xl glass-panel shadow-2xl z-50 p-2 border border-slate-700/60 divide-y divide-slate-800 animate-in fade-in zoom-in-95 duration-100">
            <div className="p-2 pb-3">
              <div className="flex items-center justify-between text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">
                <span>Active Persona Tester</span>
                <ShieldCheck className="w-4 h-4 text-blue-400" />
              </div>
              <p className="text-xs text-slate-400">
                Switch role live to test Human-in-the-Loop decision permissions and 403 enforcement.
              </p>
            </div>

            <div className="py-1.5 space-y-1">
              {(Object.keys(PERSONAS) as Role[]).map((r) => {
                const p = PERSONAS[r];
                const isSelected = activeRole === r;
                return (
                  <button
                    key={r}
                    onClick={() => {
                      switchPersona(r);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between transition-colors ${
                      isSelected
                        ? 'bg-blue-600/20 text-blue-200 border border-blue-500/30 font-semibold'
                        : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${p.badgeColor.split(' ')[0]}`} />
                        <span>{p.label}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">
                        {p.description}
                      </div>
                    </div>
                    {isSelected && <UserCheck className="w-4 h-4 text-blue-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

