import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { DashboardPage } from './pages/Dashboard/DashboardPage';
import { IntakePage } from './pages/Intake/IntakePage';
import { ApprovalsPage } from './pages/Approvals/ApprovalsPage';
import { VerificationPage } from './pages/Verification/VerificationPage';
import { EmailCenterPage } from './pages/Email/EmailCenterPage';
import { FinancePage } from './pages/Finance/FinancePage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-primary-500 selection:text-white">
          <Navbar />
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/intake" element={<IntakePage />} />
              <Route path="/approvals" element={<ApprovalsPage />} />
              <Route path="/verification" element={<VerificationPage />} />
              <Route path="/email" element={<EmailCenterPage />} />
              <Route path="/finance" element={<FinancePage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <footer className="border-t border-slate-900 py-4 text-center text-xs text-slate-600">
            Enterprise Autonomous Onboarding & Verification System • Multi-Agent Architecture v2.0
          </footer>
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;

