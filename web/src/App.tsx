import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/layout/Layout';
import { DashboardPage } from './pages/Dashboard/DashboardPage';
import { IntakePage } from './pages/Intake/IntakePage';
import { WorkflowMonitorPage } from './pages/WorkflowMonitor/WorkflowMonitorPage';
import { ApprovalsPage } from './pages/Approvals/ApprovalsPage';
import { VerificationPage } from './pages/Verification/VerificationPage';
import { FinancePage } from './pages/Finance/FinancePage';
import { AuditTimelinePage } from './pages/Audit/AuditTimelinePage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/intake" element={<IntakePage />} />
            <Route path="/monitor" element={<WorkflowMonitorPage />} />
            <Route path="/monitor/:workflowId" element={<WorkflowMonitorPage />} />
            <Route path="/approvals" element={<ApprovalsPage />} />
            <Route path="/verification" element={<VerificationPage />} />
            <Route path="/finance" element={<FinancePage />} />
            <Route path="/audit" element={<AuditTimelinePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </AuthProvider>
    </BrowserRouter>
  );
};
