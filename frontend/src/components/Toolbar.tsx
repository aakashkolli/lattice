'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PresenceState } from '@/lib/lattice-provider';

export type ExportFormat = 'txt' | 'md' | 'clipboard';
export type EditorMode   = 'text' | 'markdown';

const AVATAR_COLORS = ['#f97316','#8b5cf6','#06b6d4','#ec4899','#10b981','#f59e0b','#6366f1','#ef4444'];

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(name: string): string {
  return name.split(/[-_ ]/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

interface Props {
  roomId: string;
  title: string;
  cursors: PresenceState[];
  mode: EditorMode;
  onTitleChange: (t: string) => void;
  onShare: () => void;
  onNewRoom: () => void;
  onExport: (format: ExportFormat) => void;
  onClearDoc: () => void;
  onModeChange: (mode: EditorMode) => void;
}

export function Toolbar({ title, cursors, mode, onTitleChange, onShare, onNewRoom, onExport, onClearDoc, onModeChange }: Props) {
  const titleRef = useRef<HTMLInputElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') titleRef.current?.blur();
  }, []);

  useEffect(() => {
    if (!exportOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [exportOpen]);

  return (
    <header className="toolbar">
      <div className="toolbar-brand">Lattice</div>
      <div className="toolbar-divider" />
      <input
        ref={titleRef}
        className="toolbar-title-input"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        onKeyDown={handleTitleKeyDown}
        placeholder="Untitled Document"
        spellCheck={false}
      />
      <div className="mode-toggle">
        {(['text', 'markdown'] as EditorMode[]).map((m) => (
          <button key={m} className={`mode-btn ${mode === m ? 'mode-btn-active' : ''}`} onClick={() => onModeChange(m)}>
            {m === 'text' ? 'Text' : 'Markdown'}
          </button>
        ))}
      </div>
      <div className="toolbar-right">
        {cursors.length > 0 && (
          <div className="avatar-stack">
            {cursors.slice(0, 3).map((c) => (
              <div key={c.clientId} className="avatar" style={{ background: avatarColor(c.name) }} title={c.name}>
                {initials(c.name)}
              </div>
            ))}
          </div>
        )}
        <div className="export-menu" ref={exportRef}>
          <button className="btn btn-ghost btn-sm" onClick={() => setExportOpen((o) => !o)}>Export</button>
          {exportOpen && (
            <div className="export-dropdown" role="menu">
              <button className="export-item" role="menuitem" onClick={() => { setExportOpen(false); onExport('txt'); }}>Plain Text (.txt)</button>
              <button className="export-item" role="menuitem" onClick={() => { setExportOpen(false); onExport('md'); }}>Markdown (.md)</button>
              <button className="export-item" role="menuitem" onClick={() => { setExportOpen(false); onExport('clipboard'); }}>Copy to Clipboard</button>
            </div>
          )}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onClearDoc}>Clear</button>
        <button className="btn btn-secondary btn-sm" onClick={onNewRoom}>New</button>
        <button className="btn btn-primary btn-sm" onClick={onShare}>Share</button>
      </div>
    </header>
  );
}
