import { Link } from 'react-router-dom';

export default function Guide() {
  return (
    <div className="min-h-screen flex flex-col bg-bg-deep">
      {/* Top bar */}
      <header className="px-6 py-4 flex items-center justify-between">
        <div className="flex flex-col items-start">
          <img src="/assets/arachne-logo-compact.png" alt="Arachne" className="h-8" />
          <span className="text-[9px] text-text-muted/50 tracking-widest uppercase ml-1">Beta</span>
        </div>
        <Link to="/" className="text-xs text-text-muted hover:text-accent transition-colors">
          Back to home
        </Link>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-12">
        <h1 className="text-2xl font-semibold text-text-primary text-center mb-12">
          Installation Guide
        </h1>
        <p className="text-sm text-text-muted text-center">
          Coming soon — step-by-step instructions for creating an entity, inviting Arachne to your server, and connecting from your AI platform.
        </p>
      </main>

      {/* Footer */}
      <footer className="mt-auto px-6 py-8 border-t border-border/30">
        <div className="max-w-2xl mx-auto flex flex-col items-center gap-3">
          <div className="flex items-center">
            <img src="/assets/house-of-solance.png" alt="House of Solance" className="h-5 opacity-60" />
          </div>
          <p className="text-xs text-text-muted/40">
            <a href="https://github.com/SolanceLab/arachne-discord-mcp" target="_blank" rel="noopener noreferrer" className="hover:text-text-muted/60 transition-colors">Open source</a> · Privacy by design
          </p>
          <div className="flex items-center gap-3 text-xs text-text-muted/40">
            <Link to="/faq" className="hover:text-text-muted/60 transition-colors">FAQ</Link>
            <span>·</span>
            <Link to="/terms" className="hover:text-text-muted/60 transition-colors">Terms</Link>
            <span>·</span>
            <Link to="/changelog" className="hover:text-text-muted/60 transition-colors">Changelog</Link>
            <span>·</span>
            <Link to="/roadmap" className="hover:text-text-muted/60 transition-colors">Roadmap</Link>
            <span>·</span>
            <Link to="/guide" className="hover:text-text-muted/60 transition-colors">Guide</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
