'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LatticeIcon } from '@/components/LatticeIcon';
import { genUuid } from '@/lib/utils';

interface RecentRoom {
  id: string;
  title: string;
  visitedAt: number;
}

function saveRecentRoom(id: string, title: string = '') {
  try {
    const raw = localStorage.getItem('lattice_recent_rooms');
    const rooms: RecentRoom[] = raw ? JSON.parse(raw) : [];
    const filtered = rooms.filter((r) => r.id !== id);
    filtered.unshift({ id, title, visitedAt: Date.now() });
    localStorage.setItem('lattice_recent_rooms', JSON.stringify(filtered.slice(0, 5)));
  } catch {}
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return 'yesterday';
}

export default function Home() {
  const router = useRouter();
  const [joinId, setJoinId] = useState('');
  const [recentRooms, setRecentRooms] = useState<RecentRoom[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('lattice_recent_rooms');
      if (raw) setRecentRooms(JSON.parse(raw));
    } catch {}
  }, []);

  const createRoom = () => {
    const id = genUuid();
    saveRecentRoom(id, '');
    router.push(`/room/${id}`);
  };

  const joinRoom = () => {
    const id = joinId.trim();
    if (!id) return;
    const match = id.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (match) {
      saveRecentRoom(match[0], '');
      router.push(`/room/${match[0]}`);
    }
  };

  return (
    <main className="landing">
      <div className="landing-hero">
        <div className="landing-logo">
          <LatticeIcon size={40} color="#ffffff" />
        </div>

        <h1 className="landing-title">Lattice</h1>

        <p className="landing-subtitle">
          Write together without conflicts. CRDTs guarantee every edit merges correctly, and a Rust actor backend keeps every collaborator in sync.
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
            style={{ borderRadius: 'var(--r-full)', padding: '10px 20px', fontSize: 13 }}
          >
            Join
          </button>
        </div>

        {recentRooms.length > 0 && (
          <div className="landing-recent">
            <div className="landing-recent-label">Recent rooms</div>
            {recentRooms.map((r) => (
              <button key={r.id} className="landing-recent-row" onClick={() => router.push(`/room/${r.id}`)}>
                <span className="landing-recent-title">{r.title || 'Untitled'}</span>
                <span className="landing-recent-meta">
                  <span className="room-id-chip">{r.id.slice(0, 8)}</span>
                  <span>{relativeTime(r.visitedAt)}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="landing-features">
        <div className="feature-card">
          <div className="feature-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
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
          <div className="feature-desc">Concurrent edits always merge correctly</div>
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
