import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Role, UserSession } from '@/types';
import { api, registerAuthErrorHandlers } from '@/api/client';

export interface PersonaConfig {
  role: Role;
  label: string;
  badgeColor: string;
  description: string;
  authorizedFor: string[];
}

export const PERSONAS: Record<Role, PersonaConfig> = {
  admin: {
    role: 'admin',
    label: 'Admin',
    badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    description: 'System Administration & Full Observability',
    authorizedFor: ['Workflows', 'Agents', 'Users', 'Tools', 'Audit Trail'],
  },
  hr: {
    role: 'hr',
    label: 'HR Operations',
    badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    description: 'Candidate Intake & Verification Signoffs',
    authorizedFor: ['Candidate Intake', 'Education Verifications', 'Employment Verifications', 'Final Approval'],
  },
  finance: {
    role: 'finance',
    label: 'Finance Lead',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    description: 'Deterministic Salary & Payroll Signoffs',
    authorizedFor: ['Salary Calculation', 'Salary Structure Approvals', 'Payroll Profile Finalization'],
  },
  it: {
    role: 'it',
    label: 'IT & Equipment',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    description: 'Equipment Procurement & Standard Accounts',
    authorizedFor: ['Equipment Substitution', 'Standard Accounts', 'Asset Tracking'],
  },
  security: {
    role: 'security',
    label: 'InfoSec',
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    description: 'Privileged Access Approvals & Red-Flags',
    authorizedFor: ['Privileged Access Decisions', 'Security Policy Exceptions'],
  },
  compliance: {
    role: 'compliance',
    label: 'Compliance',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    description: 'Regulatory Compliance & Policy Audits',
    authorizedFor: ['Policy Acknowledgements', 'Compliance Review'],
  },
  viewer: {
    role: 'viewer',
    label: 'Auditor / Viewer',
    badgeColor: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
    description: 'Read-only access for demonstration & audit',
    authorizedFor: ['Read-only Views', 'Timeline Inspection'],
  },
};

interface AuthContextType {
  user: UserSession | null;
  session: UserSession | null;
  activeRole: Role;
  isLoading: boolean;
  switchPersona: (role: Role) => Promise<void>;
  forbiddenWarning: string | null;
  clearForbiddenWarning: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeRole, setActiveRole] = useState<Role>(() => {
    return (localStorage.getItem('onboarding_active_persona') as Role) || 'admin';
  });

  const [user, setUser] = useState<UserSession | null>(() => {
    const cached = localStorage.getItem('onboarding_user_session');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        return null;
      }
    }
    return {
      username: 'admin',
      role: 'admin',
      full_name: 'System Administrator',
    };
  });

  const [isLoading, setIsLoading] = useState(false);
  const [forbiddenWarning, setForbiddenWarning] = useState<string | null>(null);

  useEffect(() => {
    registerAuthErrorHandlers(
      () => {
        // 401 callback: re-authenticate as current active role
        switchPersona(activeRole);
      },
      (detail: string) => {
        // 403 callback
        setForbiddenWarning(detail);
        setTimeout(() => setForbiddenWarning(null), 6000);
      }
    );
  }, [activeRole]);

  const switchPersona = async (role: Role) => {
    setIsLoading(true);
    setForbiddenWarning(null);
    try {
      // Call backend to authenticate as this persona and receive JWT token
      const res = await api.post<{
        access_token: string;
        user: { username: string; role: Role; full_name: string };
      }>('/api/auth/persona', { persona: role });

      localStorage.setItem('onboarding_access_token', res.access_token);
      localStorage.setItem('onboarding_active_persona', role);

      const session: UserSession = {
        ...res.user,
        token: res.access_token,
      };

      localStorage.setItem('onboarding_user_session', JSON.stringify(session));
      setUser(session);
      setActiveRole(role);
    } catch (err) {
      console.warn('Backend persona quick-login fallback:', err);
      // Fallback local session if backend unreachable
      localStorage.setItem('onboarding_active_persona', role);
      setActiveRole(role);
      const fallbackSession: UserSession = {
        username: role,
        role: role,
        full_name: PERSONAS[role]?.label || role.toUpperCase(),
      };
      setUser(fallbackSession);
      localStorage.setItem('onboarding_user_session', JSON.stringify(fallbackSession));
    } finally {
      setIsLoading(false);
    }
  };

  // Initial token bootstrap on mount
  useEffect(() => {
    if (!localStorage.getItem('onboarding_access_token')) {
      switchPersona(activeRole);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session: user,
        activeRole,
        isLoading,
        switchPersona,
        forbiddenWarning,
        clearForbiddenWarning: () => setForbiddenWarning(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
