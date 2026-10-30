import React from 'react';

interface RiskBadgeProps {
  level?: string;
  action?: string;
  className?: string;
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({ level, action, className = '' }) => {
  // If action is supplied, derive risk type
  let color = 'bg-slate-800 text-slate-300 border-slate-700';
  let label = level || 'Standard';

  const normalized = (level || action || '').toLowerCase();

  if (normalized.includes('critical') || normalized.includes('security') || normalized.includes('privileged')) {
    color = 'bg-rose-500/15 text-rose-400 border-rose-500/30';
    label = level ? level.toUpperCase() : 'Privileged Access';
  } else if (normalized.includes('high') || normalized.includes('salary') || normalized.includes('discrepancy')) {
    color = 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    label = level ? level.toUpperCase() : 'Salary Structure';
  } else if (normalized.includes('medium') || normalized.includes('verification') || normalized.includes('education')) {
    color = 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    label = level ? level.toUpperCase() : 'Degree Verification';
  } else if (normalized.includes('low') || normalized.includes('approved') || normalized.includes('confirmed')) {
    color = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    label = level ? level.toUpperCase() : 'Standard Action';
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border tracking-wider uppercase ${color} ${className}`}
    >
      {label}
    </span>
  );
};

