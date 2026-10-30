import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/layout/Layout';
import { WorkflowMonitorPage } from './pages/WorkflowMonitor/WorkflowMonitorPage';
import { AuditTimelinePage } from './pages/Audit/AuditTimelinePage';

// Placeholder views for Person 1's domain so navigation is interactive
const PlaceholderView: React.FC<{ title: string; subtitle: string; iconName?: string }> = ({
  title,
  subtitle,
}) => (
  <div className="p-8 bg-slate-900/40 rounded-2xl border border-slate-800 text-center space-y-3">
    <h2 className="text-xl font-bold text-white">{title}</h2>
    <p className="text-sm text-slate-400 max-w-md mx-auto">{subtitle}</p>
    <div className="pt-4 flex justify-center">
      <a
        href="/monitor"
        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition"
      >
        Go to Live Workflow Monitor
      </a>
    </div>
  </div>
);

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Navigate to="/monitor" replace />} />
            <Route
              path="/intake"
              element={
                <PlaceholderView
                  title="Employee Onboarding Intake Portal"
                  subtitle="Enterprise employee registration with validated CTC, education, and previous employment details (Person 1)."
                />
              }
            />
            <Route path="/monitor" element={<WorkflowMonitorPage />} />
            <Route path="/monitor/:workflowId" element={<WorkflowMonitorPage />} />
            <Route
              path="/approvals"
              element={
                <PlaceholderView
                  title="Human-in-the-Loop Approval Center"
                  subtitle="Role-restricted approval queue enforcing exact parameter validation and cryptographic signatures (Person 1)."
                />
              }
            />
            <Route
              path="/verification"
              element={
                <PlaceholderView
                  title="Verification & Email Operations Center"
                  subtitle="University degree validation, employment history tracks, and simulated email operations (Person 1)."
                />
              }
            />
            <Route
              path="/finance"
              element={
                <PlaceholderView
                  title="Finance & Deterministic Payroll Profile"
                  subtitle="Authoritative CTC breakdown calculation, Finance-role approval gate, and payroll finalization (Person 1)."
                />
              }
            />
            <Route path="/audit" element={<AuditTimelinePage />} />
            <Route path="*" element={<Navigate to="/monitor" replace />} />
          </Routes>
        </Layout>
      </AuthProvider>
    </BrowserRouter>
  );
};
