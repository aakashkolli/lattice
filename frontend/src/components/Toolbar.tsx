'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PresenceState } from '@/lib/lattice-provider';
import { LatticeIcon } from './LatticeIcon';

export type ExportFormat = 'txt' | 'md' | 'clipboard';
export type EditorMode = 'text' | 'markdown';

const AVATAR_COLORS = [
  '#f97316','#8b5cf6','#06b6d4','#ec4899',
  '#10b981','#f59e0b','#6366f1','#ef4444',
  '#14b8a6','#a855f7',
];

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(name: string): string {
  return name
    .split(/[-_ ]/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

interface Props {
  roomId: string;
  title: string;
  cursors: PresenceState[];
  mode: EditorMode;
  commentsOpen: boolean;
  onTitleChange: (t: string) => void;
  onShare: () => void;
  onNewRoom: () => void;
  onExport: (format: ExportFormat) => void;
  onClearDoc: () => void;
  onModeChange: (mode: EditorMode) => void;
  onToggleComments: () => void;
}

const MODE_LABELS: Record<EditorMode, string> = {
  text: 'Text',
  markdown: 'Markdown',
};

export function Toolbar({
  title,
  cursors,
  mode,
  commentsOpen,
  onTitleChange,
  onShare,
  onNewRoom,
  onExport,
  onClearDoc,
  onModeChange,
  onToggleComments,
}: Props) {
  const titleRef = useRef<HTMLInputElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const maxAvatars = 3;
  const visible = cursors.slice(0, maxAvatars);
  const overflow = cursors.length - maxAvatars;

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') titleRef.current?.blur();
    },
    [],
  );

  useEffect(() => {
    if (!exportOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [exportOpen]);

  const handleExportOption = useCallback((format: ExportFormat) => {
    setExportOpen(false);
    onExport(format);
  }, [onExport]);

  return (
    <header className="toolbar">
      {/* Brand */}
      <div className="toolbar-brand">
        <div className="toolbar-logo">
          <LatticeIcon size={16} color="#ffffff" />
        </div>
        Lattice
      </div>

      <div className="toolbar-divider" />

      {/* Editable document title */}
      <input
        ref={titleRef}
        className="toolbar-title-input"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        onKeyDown={handleTitleKeyDown}
        placeholder="Untitled Document"
        spellCheck={false}
        aria-label="Document title"
      />

      {/* Mode toggle */}
      <div className="mode-toggle" role="group" aria-label="Editor mode">
        {(Object.keys(MODE_LABELS) as EditorMode[]).map((m) => (
          <button
            key={m}
            className={`mode-btn ${mode === m ? 'mode-btn-active' : ''}`}
            onClick={() => onModeChange(m)}
            aria-pressed={mode === m}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      <div className="toolbar-right">
        {/* Collaborator avatars */}
        {cursors.length > 0 && (
          <div className="avatar-stack" title={`${cursors.length} collaborator${cursors.length > 1 ? 's' : ''} online`}>
            {visible.map((c) => (
              <div
                key={c.clientId}
                className="avatar"
                style={{ background: avatarColor(c.name) }}
                title={c.name}
              >
                {initials(c.name)}
              </div>
            ))}
            {overflow > 0 && (
              <div className="avatar avatar-overflow">+{overflow}</div>
            )}
          </div>
        )}

        {/* Comments toggle */}
        <button
          className={`btn btn-ghost btn-sm ${commentsOpen ? 'btn-active' : ''}`}
          onClick={onToggleComments}
          title="Toggle comments"
          aria-pressed={commentsOpen}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          Comments
        </button>

        {/* Export */}
        <div className="export-menu" ref={exportRef}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setExportOpen((o) => !o)}
            aria-haspopup="true"
            aria-expanded={exportOpen}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: -2 }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          {exportOpen && (
            <div className="export-dropdown" role="menu">
              <button className="export-item" role="menuitem" onClick={() => handleExportOption('txt')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
                <span>
                  <span className="export-item-label">Plain Text</span>
                  <span className="export-item-hint">.txt file</span>
                </span>
              </button>
              <button className="export-item" role="menuitem" onClick={() => handleExportOption('md')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <path d="M7 8v8M11 12l3-4 3 4M11 12v4"/>
                </svg>
                <span>
                  <span className="export-item-label">Markdown</span>
                  <span className="export-item-hint">.md file</span>
                </span>
              </button>
              <div className="export-divider" />
              <button className="export-item" role="menuitem" onClick={() => handleExportOption('clipboard')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                <span>
                  <span className="export-item-label">Copy to Clipboard</span>
                  <span className="export-item-hint">Plain text</span>
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Clear document */}
        <button className="btn btn-ghost btn-sm" onClick={onClearDoc} title="Clear document">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
            Clear
        </button>

        {/* New room */}
        <button className="btn btn-secondary btn-sm" onClick={onNewRoom}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New
        </button>

        {/* Share */}
        <button className="btn btn-primary btn-sm" onClick={onShare}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
          Share
        </button>
      </div>
    </header>
  );
}
