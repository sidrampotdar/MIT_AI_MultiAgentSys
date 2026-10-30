import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { PersonaSwitcher } from '@/components/PersonaSwitcher';
import {
  LayoutDashboard,
  UserPlus,
  CheckSquare,
  ShieldAlert,
  Mail,
  BadgeDollarSign,
  Bot,
  AlertCircle,
  X,
} from 'lucide-react';

export const Navbar: React.FC<{ pendingApprovalsCount?: number }> = ({ pendingApprovalsCount = 0 }) => {
  const { forbiddenWarning, clearForbiddenWarning } = useAuth();

  const navLinks = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/intake', label: 'Employee Intake', icon: UserPlus },
    {
      to: '/approvals',
      label: 'Approvals (HITL)',
      icon: CheckSquare,
      badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : null,
    },
    { to: '/verification', label: 'Verifications', icon: ShieldAlert },
    { to: '/email', label: 'Email Operations', icon: Mail },
    { to: '/finance', label: 'Finance & Payroll', icon: BadgeDollarSign },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
      {forbiddenWarning && (
        <div className="bg-rose-500/20 border-b border-rose-500/40 px-4 py-2 text-xs text-rose-200 flex items-center justify-between animate-in slide-in-from-top">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="font-medium">RBAC Permission Denied:</span>
            <span>{forbiddenWarning}</span>
          </div>
          <button onClick={clearForbiddenWarning} className="text-rose-400 hover:text-white p-0.5">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <NavLink to="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="font-extrabold text-sm sm:text-base tracking-tight text-white block">
                  Antigravity<span className="text-blue-400">Ops</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono -mt-1 block">
                  Autonomous Multi-Agent Hub
                </span>
              </div>
            </NavLink>

            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map(({ to, label, icon: Icon, badge }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all relative ${
                      isActive
                        ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                  {badge && (
                    <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950 animate-pulse">
                      {badge}
                    </span>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <PersonaSwitcher />
          </div>
        </div>
      </div>

      {/* Mobile nav */}
      <div className="md:hidden border-t border-slate-800/80 px-2 py-1.5 flex overflow-x-auto gap-1">
        {navLinks.map(({ to, label, icon: Icon, badge }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap ${
                isActive
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`
            }
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
            {badge && (
              <span className="px-1 py-0.2 rounded-full text-[9px] font-bold bg-amber-500 text-slate-950">
                {badge}
              </span>
            )}
          </NavLink>
        ))}
      </div>
    </header>
  );
};

