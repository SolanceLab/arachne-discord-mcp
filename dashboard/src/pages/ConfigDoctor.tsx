import { useState } from 'react';

interface ValidationResult {
  status: 'idle' | 'valid' | 'json-error' | 'structure-warning';
  message: string;
  details?: string[];
  contextSnippet?: string;
}

export default function ConfigDoctor() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<ValidationResult>({ status: 'idle', message: '' });

  const validate = () => {
    const trimmed = input.trim();
    if (!trimmed) {
      setResult({ status: 'idle', message: '' });
      return;
    }

    // Step 1: Try to parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      const e = err as SyntaxError;
      const posMatch = e.message.match(/position\s+(\d+)/i);
      const position = posMatch ? parseInt(posMatch[1], 10) : undefined;

      // Detect common issues
      const details: string[] = [];

      if (/,\s*[}\]]/.test(trimmed)) {
        details.push('Trailing comma detected — JSON does not allow commas before } or ].');
      }

      if (/'.+'\s*:/.test(trimmed) || /:\s*'.+'/.test(trimmed)) {
        details.push('Single quotes detected — JSON requires double quotes for all strings.');
      }

      if (/\/\/.*$|\/\*[\s\S]*?\*\//m.test(trimmed)) {
        details.push('Comments detected — JSON does not support comments.');
      }

      if (details.length === 0) {
        details.push('Check for missing commas between entries, mismatched brackets, or extra characters.');
      }

      // Generate context snippet around error position
      let contextSnippet: string | undefined;
      if (position !== undefined) {
        const start = Math.max(0, position - 40);
        const end = Math.min(trimmed.length, position + 40);
        const before = trimmed.slice(start, position);
        const after = trimmed.slice(position, end);
        contextSnippet = `${start > 0 ? '...' : ''}${before}\u25B6${after}${end < trimmed.length ? '...' : ''}`;
      }

      setResult({
        status: 'json-error',
        message: e.message,
        details,
        contextSnippet,
      });
      return;
    }

    // Step 2: Check structure
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      setResult({
        status: 'structure-warning',
        message: 'Config must be a JSON object (starts with { and ends with })',
        details: ['Your config should look like: { "mcpServers": { ... } }'],
      });
      return;
    }

    const obj = parsed as Record<string, unknown>;
    const warnings: string[] = [];

    // Check for mcpServers key
    if (!('mcpServers' in obj)) {
      const keys = Object.keys(obj);
      const hasUrlInAny = keys.some(k => {
        const val = obj[k];
        return typeof val === 'object' && val !== null && ('url' in val || 'command' in val);
      });

      if (hasUrlInAny) {
        setResult({
          status: 'structure-warning',
          message: 'Missing "mcpServers" wrapper',
          details: [
            'It looks like you pasted the server entries without the outer wrapper.',
            'Your file needs to look like this:',
            '{ "mcpServers": { ...your entries here... } }',
            'Wrap your entries inside "mcpServers" and try again.',
          ],
        });
        return;
      }

      warnings.push('No "mcpServers" key found — Claude Desktop expects this key to discover MCP servers.');
    }

    // Check mcpServers structure
    const mcpServers = obj.mcpServers;
    if (mcpServers !== undefined) {
      if (typeof mcpServers !== 'object' || mcpServers === null || Array.isArray(mcpServers)) {
        setResult({
          status: 'structure-warning',
          message: '"mcpServers" should be an object, not ' + (Array.isArray(mcpServers) ? 'an array' : typeof mcpServers),
          details: ['It should look like: "mcpServers": { "server-name": { ... } }'],
        });
        return;
      }

      const servers = mcpServers as Record<string, unknown>;
      const serverNames = Object.keys(servers);

      if (serverNames.length === 0) {
        warnings.push('"mcpServers" is empty — no servers configured.');
      }

      for (const name of serverNames) {
        const server = servers[name];
        if (typeof server !== 'object' || server === null) {
          warnings.push(`"${name}" should be an object with connection details.`);
          continue;
        }

        const s = server as Record<string, unknown>;
        const hasUrl = 'url' in s;
        const hasCommand = 'command' in s;

        if (!hasUrl && !hasCommand) {
          warnings.push(`"${name}" has no "url" (for HTTP transport) or "command" (for stdio transport).`);
        }

        if (hasUrl && !hasCommand) {
          warnings.push(`"${name}" uses the "url" format — this crashes some versions of Claude Desktop. Use "npx mcp-remote" instead (see Known Bug below).`);
        }

        if (hasUrl && typeof s.url === 'string' && s.url.includes('YOUR_API_KEY')) {
          warnings.push(`"${name}" still has the placeholder YOUR_API_KEY in the URL — replace it with your actual key.`);
        }

        if (hasUrl && s.headers && typeof s.headers === 'object') {
          const headers = s.headers as Record<string, unknown>;
          if (headers.Authorization && typeof headers.Authorization === 'string' && headers.Authorization.includes('YOUR_API_KEY')) {
            warnings.push(`"${name}" still has the placeholder YOUR_API_KEY in the Authorization header.`);
          }
        }
      }

      if (warnings.length === 0) {
        setResult({
          status: 'valid',
          message: `Valid config with ${serverNames.length} MCP server${serverNames.length === 1 ? '' : 's'}: ${serverNames.join(', ')}`,
          details: ['JSON syntax is correct and the structure looks good. If Claude Desktop still won\'t start, try fully quitting and restarting the app.'],
        });
        return;
      }
    }

    if (warnings.length > 0) {
      setResult({
        status: 'structure-warning',
        message: 'Valid JSON, but found structural issues',
        details: warnings,
      });
    } else {
      setResult({
        status: 'valid',
        message: 'JSON is valid',
        details: ['The syntax is correct. If you\'re still having issues, make sure "mcpServers" contains your server entries.'],
      });
    }
  };

  const statusColors = {
    idle: '',
    valid: 'border-success bg-success/10',
    'json-error': 'border-danger bg-danger/10',
    'structure-warning': 'border-warning bg-warning/10',
  };

  const statusIcons = {
    idle: '',
    valid: '\u2713 ',
    'json-error': '\u2717 ',
    'structure-warning': '\u26A0 ',
  };

  const statusTextColors = {
    idle: '',
    valid: 'text-success',
    'json-error': 'text-danger',
    'structure-warning': 'text-warning',
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-text-primary mb-2">Config Doctor</h1>
      <p className="text-sm text-text-muted mb-6">
        Paste your <code className="text-accent">claude_desktop_config.json</code> below to check for errors.
        <span className="block mt-1 text-xs text-text-muted/60">
          Everything runs in your browser — your config and API keys never leave this page.
        </span>
      </p>

      <textarea
        value={input}
        onChange={e => { setInput(e.target.value); setResult({ status: 'idle', message: '' }); }}
        placeholder={'Paste your claude_desktop_config.json contents here...\n\nExample:\n{\n  "mcpServers": {\n    "my-entity": {\n      "url": "https://...",\n      "headers": {\n        "Authorization": "Bearer ..."\n      }\n    }\n  }\n}'}
        className="w-full h-64 bg-bg-deep border border-border rounded-lg p-4 font-mono text-xs text-text-primary placeholder:text-text-muted/30 resize-y focus:outline-none focus:border-accent/50 transition-colors"
        spellCheck={false}
      />

      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={validate}
          disabled={!input.trim()}
          className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm rounded transition-colors"
        >
          Validate
        </button>
        {input.trim() && (
          <button
            onClick={() => { setInput(''); setResult({ status: 'idle', message: '' }); }}
            className="px-3 py-2 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {result.status !== 'idle' && (
        <div className={`mt-5 border rounded-lg p-4 ${statusColors[result.status]}`}>
          <p className={`text-sm font-medium ${statusTextColors[result.status]}`}>
            {statusIcons[result.status]}{result.message}
          </p>

          {result.contextSnippet && (
            <pre className="mt-3 text-[11px] text-text-muted bg-bg-deep/50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all font-mono">
              {result.contextSnippet}
            </pre>
          )}

          {result.details && result.details.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {result.details.map((d, i) => (
                <li key={i} className="text-xs text-text-muted leading-relaxed">
                  {d}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-6 border border-danger/30 bg-danger/5 rounded-lg p-4">
        <h2 className="text-sm font-medium text-danger mb-2">Known Bug: "url" format crashes Claude Desktop</h2>
        <div className="text-xs text-text-muted space-y-2">
          <p>
            Some versions of Claude Desktop crash on startup if your config uses the <code className="text-danger">"url"</code> + <code className="text-danger">"headers"</code> format for remote MCP servers. The app shows <strong>"Claude Desktop failed to Launch"</strong> and won't open.
          </p>
          <div>
            <p className="font-medium text-danger/80 mb-1">This will crash:</p>
            <pre className="text-[11px] bg-bg-deep/50 rounded p-2 overflow-x-auto">{`"my-entity": {
  "url": "https://...",
  "headers": { "Authorization": "Bearer ..." }
}`}</pre>
          </div>
          <div>
            <p className="font-medium text-success mb-1">Use this instead:</p>
            <pre className="text-[11px] bg-bg-deep/50 rounded p-2 overflow-x-auto">{`"my-entity": {
  "command": "npx",
  "args": [
    "-y", "mcp-remote",
    "https://...",
    "--header",
    "Authorization:Bearer YOUR_API_KEY"
  ]
}`}</pre>
          </div>
          <p>
            The <code className="text-accent">npx mcp-remote</code> approach bridges the remote server through stdio, which all Claude Desktop versions support. Requires <code className="text-accent">Node.js</code> installed.
          </p>
          <p className="text-[10px] text-text-muted/60">
            The Connect modal on this site already uses the safe format. If you copied an older snippet with "url"/"headers", replace it.
          </p>
        </div>
      </div>

      <div className="mt-8 border-t border-border/30 pt-6">
        <h2 className="text-sm font-medium text-text-primary mb-3">Common mistakes</h2>
        <div className="space-y-3 text-xs text-text-muted">
          <div>
            <p className="font-medium text-text-primary mb-0.5">Missing comma between servers</p>
            <p>If you have multiple MCP servers, each entry needs a comma after its closing <code className="text-accent">{'}'}</code> (except the last one).</p>
          </div>
          <div>
            <p className="font-medium text-text-primary mb-0.5">Pasting without the wrapper</p>
            <p>The snippet from the Connect modal goes <em>inside</em> <code className="text-accent">{'"mcpServers": { }'}</code> — don't replace the whole file with just the snippet.</p>
          </div>
          <div>
            <p className="font-medium text-text-primary mb-0.5">Forgot to replace YOUR_API_KEY</p>
            <p>The placeholder <code className="text-warning">YOUR_API_KEY</code> must be replaced with the actual key you received when creating your Entity.</p>
          </div>
          <div>
            <p className="font-medium text-text-primary mb-0.5">Trailing comma</p>
            <p>JSON doesn't allow a comma after the last item. Remove any comma right before <code className="text-accent">{'}'}</code> or <code className="text-accent">{']'}</code>.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
