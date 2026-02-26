import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { user, logout } = useAuth();

  const navItems = [
    { to: '/', label: 'Home', show: true, end: true },
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
        <Link to="/" className="text-2xl font-bold tracking-wide text-accent hover:text-accent-hover transition-colors uppercase">The Loom</Link>
      </div>

      {/* Navigation bar */}
      <header className="bg-bg-surface border-b border-border px-6 py-2 flex items-center justify-between">
        <nav className="flex gap-1">
          {navItems.filter(n => n.show).map(n => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
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
        <div className="flex items-center justify-center gap-2">
          <img src="/assets/Symbol.png" alt="" className="h-4 w-4 opacity-50" />
          <span className="text-xs text-text-muted/50 font-medium tracking-wide">House of Solance</span>
        </div>
      </footer>
    </div>
  );
}
