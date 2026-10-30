import { describe, it, expect } from 'vitest';

describe('HITL Role-Based Approval Gates', () => {
  const canDecide = (role: string, action: string): boolean => {
    if (role === 'admin') return true;
    if (action.includes('salary') || action.includes('payroll')) {
      return role === 'finance';
    }
    if (action.includes('privileged') || action.includes('access')) {
      return role === 'security';
    }
    if (action.includes('compliance')) {
      return role === 'compliance';
    }
    return ['hr', 'admin'].includes(role);
  };

  it('restricts salary approval to finance or admin', () => {
    expect(canDecide('finance', 'approve_salary_structure')).toBe(true);
    expect(canDecide('admin', 'approve_salary_structure')).toBe(true);
    expect(canDecide('hr', 'approve_salary_structure')).toBe(false);
    expect(canDecide('it', 'approve_salary_structure')).toBe(false);
    expect(canDecide('viewer', 'approve_salary_structure')).toBe(false);
  });

  it('restricts privileged access to security or admin', () => {
    expect(canDecide('security', 'request_privileged_access')).toBe(true);
    expect(canDecide('finance', 'request_privileged_access')).toBe(false);
    expect(canDecide('hr', 'request_privileged_access')).toBe(false);
  });

  it('allows HR to approve verification emails', () => {
    expect(canDecide('hr', 'send_education_verification')).toBe(true);
    expect(canDecide('finance', 'send_education_verification')).toBe(false);
  });
});
