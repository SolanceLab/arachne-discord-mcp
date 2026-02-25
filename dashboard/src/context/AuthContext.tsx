import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { apiFetch, getToken, setToken, clearToken, AuthError } from '../lib/api';

interface AdminServer {
  id: string;
  name: string;
  icon: string | null;
}

interface OwnedEntity {
  id: string;
  name: string;
  avatar_url: string | null;
}

export interface User {
  id: string;
  username: string;
  avatar: string | null;
  is_operator: boolean;
  admin_servers: AdminServer[];
  owned_entities: OwnedEntity[];
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (code: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const data = await apiFetch<User>('/api/auth/me');
      setUser(data);
    } catch (err) {
      if (err instanceof AuthError) {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (getToken()) {
      fetchMe();
    } else {
      setLoading(false);
    }
  }, [fetchMe]);

  const login = async (code: string) => {
    const data = await apiFetch<{ token: string }>('/api/auth/callback', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    setToken(data.token);
    await fetchMe();
  };

  const logout = () => {
    clearToken();
    setUser(null);
  };

  const refresh = fetchMe;

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
