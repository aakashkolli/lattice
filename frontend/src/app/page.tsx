'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LatticeIcon } from '@/components/LatticeIcon';
import { genUuid } from '@/lib/utils';

export default function Home() {
  const router = useRouter();
  const [joinId, setJoinId] = useState('');

  const createRoom = () => router.push(`/room/${genUuid()}`);

  const joinRoom = () => {
    const id = joinId.trim();
    if (!id) return;
    const match = id.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (match) router.push(`/room/${match[0]}`);
  };

  return (
    <main className="landing">
      <div className="landing-hero">
        <div className="landing-logo">
          <LatticeIcon size={32} color="#ffffff" />
        </div>

        <h1 className="landing-title">Lattice</h1>

        <p className="landing-subtitle">
          Real-time collaborative documents, powered by CRDTs and a Rust backend.
          Open the same room in multiple tabs and watch changes sync instantly.
        </p>

        <div className="landing-actions">
          <button className="btn btn-primary" onClick={createRoom} style={{ fontSize: 14, padding: '10px 24px' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Create new room
          </button>
        </div>

        <div className="landing-join-row">
          <input
            className="landing-join-input"
            placeholder="Paste room URL or ID to join"
            value={joinId}
            onChange={(e) => setJoinId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
          />
          <button
            className="btn btn-secondary"
            onClick={joinRoom}
            disabled={!joinId.trim()}
            style={{ borderRadius: 'var(--r-full)' }}
          >
            Join
          </button>
        </div>
      </div>

      <div className="landing-features">
        <div className="feature-card">
          <div className="feature-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="13 2 13 9 20 9"/><polygon points="2 12 7 2 12 12 17 2 22 12"/>
            </svg>
          </div>
          <div className="feature-title">Real-time sync</div>
          <div className="feature-desc">Sub-millisecond updates via binary WebSocket frames</div>
        </div>
        <div className="feature-card">
          <div className="feature-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
              <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
            </svg>
          </div>
          <div className="feature-title">CRDT-first</div>
          <div className="feature-desc">Conflict-free merging — edits never lost</div>
        </div>
        <div className="feature-card">
          <div className="feature-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
          </div>
          <div className="feature-title">Rust backend</div>
          <div className="feature-desc">Tokio actor model, one actor per room</div>
        </div>
      </div>
    </main>
  );
}
