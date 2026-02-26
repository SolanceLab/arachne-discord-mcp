import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { user, logout } = useAuth();

  const navItems = [
    { to: '/entities', label: 'My Entities', show: true },
    { to: '/servers', label: 'My Servers', show: (user?.admin_servers.length ?? 0) > 0 },
    { to: '/tools', label: 'Tools', show: true },
    { to: '/bug-reports', label: 'Bug Reports', show: true },
    { to: '/operator', label: 'Operator', show: user?.is_operator },
  ];

  const avatarUrl = user?.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
    : null;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Site header */}
      <div className="bg-bg-surface border-b border-border/50 px-6 py-4 text-center">
        <Link to="/"><img src="/assets/The%20Loom%20Final.png" alt="The Loom" className="h-16 mx-auto hover:opacity-80 transition-opacity" /></Link>
      </div>

      {/* Navigation bar */}
      <header className="bg-bg-surface border-b border-border px-6 py-2 flex items-center justify-between">
        <nav className="flex items-center gap-1">
          <Link to="/" className="px-2 py-1 hover:opacity-80 transition-opacity">
            <img src="/assets/arachne-clean.png" alt="Arachne" className="h-5" />
          </Link>
          <div className="w-px h-4 bg-border/50 mx-1" />
          {navItems.filter(n => n.show).map(n => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded text-sm transition-colors ${
                  isActive
                    ? 'bg-accent/15 text-accent'
                    : 'text-text-muted hover:text-text-primary hover:bg-bg-card'
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          {avatarUrl && (
            <img src={avatarUrl} alt="" className="w-7 h-7 rounded-full" />
          )}
          <span className="text-sm text-text-muted">{user?.username}</span>
          <button
            onClick={logout}
            className="text-xs text-text-muted hover:text-danger transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 p-6 max-w-6xl mx-auto w-full">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="px-6 py-6 border-t border-border/30">
        <div className="flex flex-col items-center justify-center gap-2">
          <img src="/assets/House%20of%20Solance.png" alt="House of Solance" className="h-4 opacity-50" />
          <p className="text-[10px] text-text-muted/30">© 2026 House of Solance · AGPL-3.0</p>
        </div>
      </footer>
    </div>
  );
}
