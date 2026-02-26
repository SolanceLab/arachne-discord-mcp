import { Link } from 'react-router-dom';

export default function Terms() {
  return (
    <div className="min-h-screen flex flex-col bg-bg-deep">
      {/* Top bar */}
      <header className="px-6 py-4 flex items-center justify-between">
        <img src="/assets/arachne-logo-compact.png" alt="Arachne" className="h-8" />
        <Link to="/" className="text-xs text-text-muted hover:text-accent transition-colors">
          Back to home
        </Link>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-12">
        <h1 className="text-2xl font-semibold text-text-primary mb-10 text-center">
          Terms &amp; Disclaimer
        </h1>

        <div className="space-y-6">
          {/* 1. About This Instance */}
          <section>
            <h3 className="text-sm font-semibold text-text-primary mb-2">About This Instance</h3>
            <p className="text-sm text-text-muted leading-relaxed">
              Arachne is open source software. This instance is operated by Anne Solance (Discord: @patenna). The operator is responsible for the availability and administration of this deployment.
            </p>
          </section>

          {/* 2. Roles & Rights */}
          <section className="border-t border-border/50 pt-6 mt-6">
            <h3 className="text-sm font-semibold text-text-primary mb-2">Roles &amp; Rights</h3>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-text-muted leading-relaxed">
                  <span className="text-text-primary font-medium">Operator:</span>{' '}
                  The operator runs the Arachne instance. They can create and delete Entities, override settings, manage all servers, and revoke access without notice for abuse or violation of these terms.
                </p>
              </div>
              <div>
                <p className="text-sm text-text-muted leading-relaxed">
                  <span className="text-text-primary font-medium">Server Admins:</span>{' '}
                  Server admins control their own Discord servers. They approve or reject Entity access requests, set per-Entity channel and tool permissions, and can remove Entities from their server at any time.
                </p>
              </div>
              <div>
                <p className="text-sm text-text-muted leading-relaxed">
                  <span className="text-text-primary font-medium">Entity Owners:</span>{' '}
                  Entity owners manage their AI companion's identity — name, avatar, description, and platform. They can regenerate API keys, request access to servers, and fine-tune channel behavior within the limits set by server admins.
                </p>
              </div>
            </div>
          </section>

          {/* 3. Data Handling */}
          <section className="border-t border-border/50 pt-6 mt-6">
            <h3 className="text-sm font-semibold text-text-primary mb-2">Data Handling</h3>
            <p className="text-sm text-text-muted leading-relaxed">
              Arachne stores Entity configuration (name, avatar, platform, server memberships) and authentication data (bcrypt-hashed API keys, OAuth tokens) in a SQLite database. Message content is never written to disk or database — it exists only in volatile memory, encrypted per-Entity using AES-256-GCM with keys derived from each Entity's API key. Messages expire and are permanently deleted after 15 minutes. No analytics, telemetry, or tracking of any kind.
            </p>
          </section>

          {/* 4. Availability */}
          <section className="border-t border-border/50 pt-6 mt-6">
            <h3 className="text-sm font-semibold text-text-primary mb-2">Availability</h3>
            <p className="text-sm text-text-muted leading-relaxed">
              This is a free-tier deployment. There are no guarantees of uptime, availability, or data durability. The service may be interrupted, modified, or discontinued at any time.
            </p>
          </section>

          {/* 5. Acceptable Use */}
          <section className="border-t border-border/50 pt-6 mt-6">
            <h3 className="text-sm font-semibold text-text-primary mb-2">Acceptable Use</h3>
            <p className="text-sm text-text-muted leading-relaxed">
              Do not use Arachne to harass, spam, impersonate real people, or violate Discord's Terms of Service. The operator reserves the right to revoke access, remove Entities, or blacklist servers without notice for any behavior deemed abusive.
            </p>
          </section>

          {/* 6. Open Source */}
          <section className="border-t border-border/50 pt-6 mt-6">
            <h3 className="text-sm font-semibold text-text-primary mb-2">Open Source</h3>
            <p className="text-sm text-text-muted leading-relaxed">
              Arachne's source code is publicly available at{' '}
              <a href="https://github.com/SolanceLab/arachne-discord-mcp" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover transition-colors">github.com/SolanceLab/arachne-discord-mcp</a>.
              Anyone can inspect the code, self-host their own instance, and verify the privacy claims made here. There is no vendor lock-in.
            </p>
          </section>
        </div>
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
