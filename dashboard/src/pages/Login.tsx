import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';

export default function Login() {
  const { user, loading } = useAuth();
  const [redirecting, setRedirecting] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-text-muted">Loading...</div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/entities" replace />;
  }

  const handleLogin = async () => {
    setRedirecting(true);
    try {
      const data = await apiFetch<{ url: string }>('/api/auth/discord-url');
      window.location.href = data.url;
    } catch {
      setRedirecting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-accent mb-2">The Loom</h1>
        <p className="text-text-muted mb-8">Arachne Entity Management</p>
        <button
          onClick={handleLogin}
          disabled={redirecting}
          className="px-6 py-3 bg-[#5865F2] hover:bg-[#4752C4] text-white font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {redirecting ? 'Redirecting...' : 'Login with Discord'}
        </button>
      </div>
    </div>
  );
}
