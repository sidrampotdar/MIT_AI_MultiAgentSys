import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { api } from '../../api/client';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pendingCount, setPendingCount] = useState<number>(0);

  useEffect(() => {
    const checkPending = async () => {
      try {
        const apps = await api.get<any[]>('/api/approvals/pending');
        if (Array.isArray(apps)) {
          setPendingCount(apps.length);
        }
      } catch {
        // quiet ignore
      }
    };
    checkPending();
    const interval = setInterval(checkPending, 8000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 font-sans">
      <Sidebar pendingApprovalsCount={pendingCount} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 p-6 md:p-8 overflow-y-auto max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
