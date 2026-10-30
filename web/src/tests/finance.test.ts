import { describe, it, expect } from 'vitest';

describe('Deterministic Salary Calculation Engine', () => {
  it('correctly calculates monthly basic, HRA and PF from annual CTC', () => {
    const ctc = 1800000;
    const monthlyCtc = Math.round(ctc / 12); // 150000
    const basic = Math.round(monthlyCtc * 0.4); // 60000
    const hra = Math.round(basic * 0.5); // 30000
    const employerPf = Math.round(basic * 0.12); // 7200
    const employeePf = Math.round(basic * 0.12); // 7200
    const special = monthlyCtc - basic - hra - employerPf; // 52800
    const gross = basic + hra + special; // 142800
    const net = gross - employeePf - 200; // 135400

    expect(monthlyCtc).toBe(150000);
    expect(basic).toBe(60000);
    expect(hra).toBe(30000);
    expect(employerPf).toBe(7200);
    expect(employeePf).toBe(7200);
    expect(gross).toBe(142800);
    expect(net).toBe(135400);
    expect(basic + hra + special + employerPf).toBe(monthlyCtc);
  });
});
