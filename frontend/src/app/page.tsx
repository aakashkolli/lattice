'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
      <h1>Lattice</h1>
      <p>Real-time collaborative documents</p>
      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <button className="btn btn-primary" onClick={createRoom}>Create new room</button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input
          placeholder="Paste room URL or ID to join"
          value={joinId}
          onChange={(e) => setJoinId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
        />
        <button className="btn btn-secondary" onClick={joinRoom} disabled={!joinId.trim()}>Join</button>
      </div>
    </main>
  );
}
