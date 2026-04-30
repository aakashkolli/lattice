'use client';

import { useEffect, useRef, useState } from 'react';
import type { PresenceState } from '@/lib/lattice-provider';

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
  return name.split(/[-_ ]/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

interface Props {
  roomId: string;
  cursors: PresenceState[];
  selfName: string;
  onClose: () => void;
}

export function ShareModal({ roomId, cursors, selfName, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [roomUrl, setRoomUrl] = useState('');

  useEffect(() => {
    setRoomUrl(window.location.href);
    inputRef.current?.select();
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(roomUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Close on backdrop click or Escape
  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const everyone = [
    { clientId: 'self', name: selfName, cursorFrom: 0, cursorTo: 0, color: avatarColor(selfName) },
    ...cursors,
  ];

  return (
    <div className="modal-backdrop" onClick={handleBackdrop}>
      <div className="modal" role="dialog" aria-modal aria-label="Share document">
        <div className="modal-header">
          <div className="modal-title">
            <div className="modal-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </div>
            Share Document
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* URL share */}
        <p className="modal-section-label">Invite collaborators</p>
        <div className="url-row">
          <input
            ref={inputRef}
            className="url-input"
            readOnly
            value={roomUrl}
            onFocus={(e) => e.target.select()}
          />
          <button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={handleCopy}>
            {copied ? (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                Copy link
              </>
            )}
          </button>
        </div>

        <p className="modal-hint">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          Anyone with this link can view and edit the document in real time.
        </p>

        {/* People in room */}
        {everyone.length > 0 && (
          <>
            <div style={{ marginTop: 20, marginBottom: 10 }}>
              <p className="modal-section-label">{everyone.length} in this room</p>
            </div>
            <div className="collab-list">
              {everyone.map((c) => (
                <div key={c.clientId} className="collab-item">
                  <div className="avatar" style={{ background: avatarColor(c.name), width: 28, height: 28, fontSize: 10 }}>
                    {initials(c.name)}
                  </div>
                  <div className="collab-info">
                    <span className="collab-name">{c.name}</span>
                    <span className="collab-tag">{c.clientId === 'self' ? 'You' : 'Collaborator'}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
