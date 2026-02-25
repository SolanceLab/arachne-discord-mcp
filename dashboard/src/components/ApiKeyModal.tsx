import { useState } from 'react';

interface ApiKeyModalProps {
  apiKey: string;
  onClose: () => void;
}

export default function ApiKeyModal({ apiKey, onClose }: ApiKeyModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-bg-card border border-border rounded-lg p-6 max-w-lg w-full mx-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-2">API Key</h3>
        <p className="text-sm text-text-muted mb-4">
          Copy this key now. It will not be shown again.
        </p>
        <div className="bg-bg-deep border border-border rounded p-3 font-mono text-xs break-all mb-4">
          {apiKey}
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={handleCopy}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm rounded transition-colors"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-bg-surface hover:bg-border text-text-muted text-sm rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
