import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  UserPlus,
  Activity,
  CheckSquare,
  FileCheck2,
  DollarSign,
  History,
  Shield,
  Layers,
} from 'lucide-react';

interface SidebarProps {
  pendingApprovalsCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ pendingApprovalsCount = 0 }) => {
  const navItems = [
    { to: '/', label: 'Overview', icon: LayoutDashboard },
    { to: '/intake', label: 'Onboard Employee', icon: UserPlus },
    { to: '/monitor', label: 'Workflow Monitor', icon: Activity },
    {
      to: '/approvals',
      label: 'Approval Center',
      icon: CheckSquare,
      badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined,
    },
    { to: '/verification', label: 'Verifications & Emails', icon: FileCheck2 },
    { to: '/finance', label: 'Finance & Payroll', icon: DollarSign },
    { to: '/audit', label: 'Audit & Timeline', icon: History },
  ];

  return (
    <aside className="w-64 bg-slate-950/90 border-r border-slate-800/80 flex flex-col justify-between shrink-0 h-screen sticky top-0 backdrop-blur-md z-20">
      <div>
        {/* Brand Logo */}
        <div className="p-5 border-b border-slate-800/80 flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-tight text-white leading-tight">
              MIT AI Autonomous
            </h1>
            <p className="text-[10px] text-indigo-400 font-mono tracking-wider uppercase">
              Onboarding Fabric
            </p>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80'
                  }`
                }
              >
                <div className="flex items-center space-x-3">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-amber-500 text-slate-950 rounded-full animate-pulse">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* System Status Footnote */}
      <div className="p-4 border-t border-slate-900/80 bg-slate-950/50">
        <div className="flex items-center space-x-2 text-[11px] text-slate-400">
          <Shield className="w-3.5 h-3.5 text-emerald-400" />
          <span>RBAC Enforced • Zero Default Admin</span>
        </div>
      </div>
    </aside>
  );
};
