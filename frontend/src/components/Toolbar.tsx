'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PresenceState } from '@/lib/lattice-provider';
import type { Text as YText } from 'yjs';
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
  title: string;
  cursors: PresenceState[];
  mode: EditorMode;
  commentsOpen: boolean;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  yText: YText | null;
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

function AvatarCard({ cursor, yText }: { cursor: PresenceState; yText: string | null }) {
  const prevFromRef = useRef(cursor.cursorFrom);
  const changedAtRef = useRef(Date.now());

  useEffect(() => {
    if (prevFromRef.current !== cursor.cursorFrom) {
      prevFromRef.current = cursor.cursorFrom;
      changedAtRef.current = Date.now();
    }
  });

  const color = avatarColor(cursor.name);
  const isTyping = prevFromRef.current !== cursor.cursorFrom || Date.now() - changedAtRef.current < 2000;

  let lineLabel: string | null = null;
  if (yText !== null && cursor.cursorFrom > 0) {
    lineLabel = `line ${yText.slice(0, cursor.cursorFrom).split('\n').length}`;
  }

  return (
    <div className="avatar-tooltip">
      <div className="avatar-tooltip-row">
        <div className="avatar-tooltip-swatch" style={{ background: color }} />
        <span>{cursor.name}</span>
      </div>
      {lineLabel && <div className="avatar-tooltip-detail">{lineLabel}</div>}
      {isTyping && (
        <div className="typing-dots">
          <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
        </div>
      )}
    </div>
  );
}

export function Toolbar({
  title,
  cursors,
  mode,
  commentsOpen,
  theme,
  toggleTheme,
  yText,
  onTitleChange,
  onShare,
  onNewRoom,
  onExport,
  onClearDoc,
  onModeChange,
  onToggleComments,
}: Props) {
  const router = useRouter();
  const titleRef = useRef<HTMLInputElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const yTextStr = useMemo(() => yText?.toString() ?? null, [yText, cursors]);

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
      {/* Brand — clickable, navigates to / */}
      <button
        className="toolbar-brand"
        onClick={() => router.push('/')}
      >
        <div className="toolbar-logo">
          <LatticeIcon size={16} color="#ffffff" />
        </div>
        Lattice
      </button>

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

      <div className="toolbar-divider" />

      {/* Doc cluster: Comments, Export, Clear */}
      <button
        className={`btn btn-ghost btn-icon ${commentsOpen ? 'btn-active' : ''}`}
        onClick={onToggleComments}
        title="Toggle comments"
        aria-pressed={commentsOpen}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </button>

      {/* Export dropdown — icon-only trigger */}
      <div className="export-menu" ref={exportRef}>
        <button
          className="btn btn-ghost btn-icon"
          onClick={() => setExportOpen((o) => !o)}
          aria-haspopup="true"
          aria-expanded={exportOpen}
          title="Export document"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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

      {/* Clear document — icon-only */}
      <button className="btn btn-ghost btn-icon" onClick={onClearDoc} title="Clear document">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        </svg>
      </button>

      <div className="toolbar-divider" />

      {/* Room cluster: Avatars, Theme toggle, New, Share */}
      <div className="toolbar-right">
        {/* Collaborator avatars with rings and hover cards */}
        {cursors.length > 0 && (
          <div className="avatar-stack">
            {visible.map((c) => (
              <div key={c.clientId} className="avatar-wrapper">
                <div
                  className="avatar"
                  style={{
                    background: avatarColor(c.name),
                    boxShadow: `0 0 0 2px var(--surface), 0 0 0 4px ${avatarColor(c.name)}`,
                  }}
                >
                  {initials(c.name)}
                </div>
                <AvatarCard cursor={c} yText={yTextStr} />
              </div>
            ))}
            {overflow > 0 && (
              <div className="avatar avatar-overflow" style={{ marginLeft: -6 }}>+{overflow}</div>
            )}
          </div>
        )}

        {/* Theme toggle */}
        <button
          className="btn btn-ghost btn-icon-sm"
          onClick={toggleTheme}
          title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        >
          {theme === 'light' ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/>
              <line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/>
              <line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>

        {/* New room — icon-only */}
        <button className="btn btn-ghost btn-icon" onClick={onNewRoom} title="New room">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>

        {/* Share — keeps text label as primary CTA */}
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
