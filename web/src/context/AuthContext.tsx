import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client';
import { CurrentUser, Role } from '../types';

interface AuthContextType {
  user: CurrentUser | null;
  loading: boolean;
  role: Role;
  login: (username: string, role?: Role) => Promise<void>;
  switchPersona: (role: Role) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<CurrentUser | null>(api.getCurrentUser());
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // Attempt auto-login with default 'admin' or stored token
    const initAuth = async () => {
      try {
        if (!user) {
          const defaultUser = await api.login('admin');
          setUser(defaultUser);
        } else {
          // Verify session via me endpoint
          const me = await api.get<CurrentUser>('/api/auth/me');
          setUser(me);
        }
      } catch (err) {
        // Fallback to offline / mock user if backend is not yet started
        setUser({
          username: 'admin',
          role: 'admin',
          full_name: 'System Administrator (Local)',
        });
      } finally {
        setLoading(false);
      }
    };
    initAuth();
  }, []);

  const login = async (username: string, targetRole: Role = 'admin') => {
    setLoading(true);
    try {
      const loggedIn = await api.login(username);
      setUser(loggedIn);
    } catch {
      setUser({
        username,
        role: targetRole,
        full_name: `${username.toUpperCase()} User`,
      });
    } finally {
      setLoading(false);
    }
  };

  const switchPersona = async (newRole: Role) => {
    setLoading(true);
    try {
      const switched = await api.switchPersona(newRole);
      setUser(switched);
    } catch {
      setUser({
        username: newRole,
        role: newRole,
        full_name: `${newRole.toUpperCase()} Persona`,
      });
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    api.clearSession();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        role: user?.role || 'viewer',
        login,
        switchPersona,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
