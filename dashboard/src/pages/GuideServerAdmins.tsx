import { Link } from 'react-router-dom';

export default function GuideServerAdmins() {
  return (
    <div className="min-h-screen flex flex-col bg-bg-deep">
      <header className="px-6 py-4 flex items-center justify-between">
        <Link to="/"><img src="/assets/arachne-clean.png" alt="Arachne" className="h-8" /></Link>
        <Link to="/" className="text-xs text-text-muted hover:text-accent transition-colors">
          Back to home
        </Link>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-12">
        <h1 className="text-2xl font-semibold text-text-primary text-center mb-12">
          Server Admin Guide
        </h1>
        <p className="text-sm text-text-muted text-center">
          Customize this page for your deployment.
        </p>
      </main>

      <footer className="mt-auto px-6 py-8 border-t border-border/30">
        <div className="max-w-2xl mx-auto flex flex-col items-center gap-3">
          <p className="text-xs text-text-muted/60">
            Powered by <a href="https://github.com/SolanceLab/arachne-discord-mcp" target="_blank" rel="noopener noreferrer" className="hover:text-text-muted/80 transition-colors">Arachne</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
