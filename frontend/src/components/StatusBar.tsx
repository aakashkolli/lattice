'use client';

import type { ConnectionState } from '@/lib/lattice-provider';

interface Props {
  connState: ConnectionState;
  wordCount: number;
  charCount: number;
}

export function StatusBar({ connState, wordCount, charCount }: Props) {

  const connColor =
    connState === 'synced' ? 'var(--success)'
    : connState === 'disconnected' ? 'var(--danger)'
    : 'var(--text-muted)';

  const connLabel =
    connState === 'synced' ? 'Saved'
    : connState === 'disconnected' ? 'Offline'
    : connState === 'connecting' ? 'Connecting'
    : connState === 'syncing' ? 'Syncing'
    : 'Reconnecting';

  return (
    <footer className="status-bar">
      <span className="status-bar-item">
        {wordCount} word{wordCount !== 1 ? 's' : ''}
      </span>

      <span className="sep">·</span>

      <span className="status-bar-item">
        {charCount} char{charCount !== 1 ? 's' : ''}
      </span>

      <span style={{ marginLeft: 'auto' }} />

      <span className="status-bar-item" style={{ color: connColor }}>
        {connLabel}
      </span>
    </footer>
  );
}
