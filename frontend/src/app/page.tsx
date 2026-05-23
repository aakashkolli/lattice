'use client';

import { useRef, useState, useEffect } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Clock3,
  Hash,
  LayoutPanelLeft,
  Plus,
  Repeat2,
  Sparkles,
} from 'lucide-react';
import { LatticeIcon } from '@/components/LatticeIcon';
import { genUuid } from '@/lib/utils';
import { RecentRoom, saveRecentRoom, loadRecentRooms, removeRecentRoom } from '@/lib/recent-rooms';
import { useTheme } from '@/lib/use-theme';

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return 'yesterday';
}

type RecentRoomRowProps = {
  room: RecentRoom;
  onOpen: (roomId: string) => void;
  onRemove: (roomId: string) => void;
};

function RecentRoomRow({ room, onOpen, onRemove }: RecentRoomRowProps) {
  const actionWidth = 96;
  const swipeThreshold = 42;
  const startXRef = useRef(0);
  const currentXRef = useRef(0);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);

  const closeSwipe = () => {
    setIsRevealed(false);
    setDragOffset(0);
  };

  const openSwipe = () => {
    setIsRevealed(true);
    setDragOffset(-actionWidth);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') return;
    draggingRef.current = true;
    movedRef.current = false;
    startXRef.current = event.clientX;
    currentXRef.current = event.clientX;
    setIsRevealed(false);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    currentXRef.current = event.clientX;
    const delta = currentXRef.current - startXRef.current;
    if (Math.abs(delta) > 6) movedRef.current = true;
    const clamped = Math.max(-actionWidth, Math.min(0, delta));
    setDragOffset(clamped);
  };

  const finishPointer = () => {
    if (!draggingRef.current) return;
    const delta = currentXRef.current - startXRef.current;
    draggingRef.current = false;
    if (delta < -swipeThreshold) {
      openSwipe();
      return;
    }
    closeSwipe();
  };

  const handleRowOpen = () => {
    if (movedRef.current) {
      movedRef.current = false;
      return;
    }
    onOpen(room.id);
  };

  return (
    <div className="group relative overflow-hidden rounded-lg">
      <div
        role="button"
        tabIndex={0}
        className="relative flex w-full items-center justify-between gap-4 rounded-lg bg-transparent px-3 py-3 text-left transition duration-200 ease-out hover:bg-white focus-visible:bg-white focus-visible:outline-none dark:hover:bg-[#18181b] dark:focus-visible:bg-[#18181b]"
        onClick={handleRowOpen}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpen(room.id);
          }
        }}
      >
        <div className="min-w-0 space-y-1">
          <div className="truncate text-base font-medium text-zinc-950 dark:text-zinc-50">
            {room.title || <span className="text-zinc-400 dark:text-zinc-500">Untitled</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <span className="inline-flex items-center gap-1 rounded-md border border-zinc-200/60 bg-white px-2 py-1 text-[11px] font-medium tabular-nums text-zinc-600 dark:border-[#1f1f23] dark:bg-[#18181b] dark:text-zinc-300">
              <Hash size={12} strokeWidth={2} />
              {room.id.slice(0, 8)}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] tabular-nums text-zinc-500 dark:text-zinc-500">
              <Clock3 size={12} strokeWidth={2} />
              {relativeTime(room.visitedAt)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-400 opacity-0 transition hover:bg-zinc-200 hover:text-zinc-950 group-hover:opacity-100 dark:hover:bg-[#1f1f23] dark:hover:text-white md:inline-flex"
            onClick={(event) => {
              event.stopPropagation();
              onRemove(room.id);
            }}
            aria-label={`Remove recent room ${room.title || room.id.slice(0, 8)}`}
            title="Remove recent room"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <ArrowRight size={16} className="shrink-0 text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-zinc-700 dark:text-zinc-500 dark:group-hover:text-zinc-200" />
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [joinId, setJoinId] = useState('');
  const [recentRooms, setRecentRooms] = useState<RecentRoom[]>([]);

  useEffect(() => {
    setRecentRooms(loadRecentRooms());
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

  const removeRoom = (roomId: string) => {
    removeRecentRoom(roomId);
    setRecentRooms((rooms) => rooms.filter((room) => room.id !== roomId));
  };

  return (
    <main className="h-screen overflow-y-auto bg-white text-zinc-950 antialiased dark:bg-[#0b0b0c] dark:text-zinc-50">
      <div className="relative mx-auto flex min-h-full max-w-7xl flex-col px-6 py-6 sm:px-8 lg:px-10">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute left-[-8rem] top-[-8rem] h-80 w-80 rounded-full bg-zinc-100 blur-3xl dark:bg-white/5" />
          <div className="absolute bottom-[-8rem] right-[-6rem] h-96 w-96 rounded-full bg-zinc-200/60 blur-3xl dark:bg-white/5" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.025)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.025)_1px,transparent_1px)] bg-[size:72px_72px] opacity-40 dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)]" />
        </div>

        <div className="flex flex-col items-center gap-10 pb-4 pt-4 lg:pt-8">
          <section className="flex w-full max-w-4xl flex-col items-center space-y-8 text-center">
            <div className="inline-flex items-center gap-3 rounded-xl border border-zinc-200/60 bg-[#f9f9fb] px-4 py-3 shadow-sm dark:border-[#1f1f23] dark:bg-[#121214]">
              <button
                className="flex h-11 w-11 items-center justify-center rounded-lg bg-zinc-950 text-white transition hover:opacity-80 dark:bg-white dark:text-zinc-950"
                onClick={toggleTheme}
                title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
                aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              >
                <LatticeIcon size={20} />
              </button>
              <div className="min-w-0">
                <div className="text-3xl font-semibold tracking-[-0.04em] text-zinc-950 dark:text-zinc-50 sm:text-4xl">
                  Lattice
                </div>
              </div>
            </div>

            <div className="max-w-3xl space-y-6">
              <h1 className="max-w-2xl text-5xl font-semibold tracking-[-0.05em] text-zinc-950 sm:text-6xl lg:text-6xl dark:text-zinc-50">
                Write together<br />without conflicts.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-zinc-600 sm:text-lg dark:text-zinc-400">
                CRDTs guarantee every edit merges correctly,<br />and a Rust actor backend keeps every collaborator in sync.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                className="inline-flex items-center gap-2 rounded-lg bg-zinc-950 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
                onClick={createRoom}
              >
                <Plus size={16} strokeWidth={2.2} />
                Create new room
              </button>
            </div>

            <div className="mx-auto w-full max-w-2xl space-y-3">
              <div className="flex w-full items-stretch overflow-hidden rounded-xl border border-zinc-200/60 bg-zinc-100 shadow-sm dark:border-[#1f1f23] dark:bg-[#121214]">
                <input
                  className="min-w-0 flex-1 bg-transparent px-4 py-3.5 text-sm text-zinc-950 outline-none placeholder:text-zinc-400 dark:text-zinc-50 dark:placeholder:text-zinc-500"
                  placeholder="Paste room URL or ID to join"
                  value={joinId}
                  onChange={(e) => setJoinId(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
                />
                <button
                  className="m-1 inline-flex shrink-0 items-center gap-2 rounded-lg border border-zinc-200/80 bg-white px-4 py-2.5 text-sm font-medium text-zinc-950 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#1f1f23] dark:bg-[#18181b] dark:text-zinc-50 dark:hover:bg-[#202024]"
                  onClick={joinRoom}
                  disabled={!joinId.trim()}
                >
                  Join
                  <ArrowRight size={15} strokeWidth={2} />
                </button>
              </div>
            </div>

            {recentRooms.length > 0 && (
              <div className="mx-auto w-full max-w-2xl rounded-xl border border-zinc-200/60 bg-[#f9f9fb] p-4 text-left shadow-sm dark:border-[#1f1f23] dark:bg-[#121214]">
                <div className="mb-3 text-sm font-medium text-zinc-500 dark:text-zinc-400">Recent rooms</div>
                <div className="space-y-2">
                  {recentRooms.map((room) => (
                    <RecentRoomRow
                      key={room.id}
                      room={room}
                      onOpen={router.push}
                      onRemove={removeRoom}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        <section className="mt-8 w-full pb-6">
          <div className="mx-auto grid w-full max-w-5xl gap-4 md:grid-cols-3">
            <div className="flex flex-col items-center rounded-xl border border-zinc-200/60 bg-[#f9f9fb] p-5 text-center shadow-sm dark:border-[#1f1f23] dark:bg-[#121214]">
              <Sparkles size={20} className="mb-4 text-zinc-700 dark:text-zinc-300" strokeWidth={1.9} />
              <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">Real-time sync</div>
              <div className="mt-1 text-sm leading-6 text-zinc-500 dark:text-zinc-400">Sub-millisecond updates via binary WebSocket frames.</div>
            </div>
            <div className="flex flex-col items-center rounded-xl border border-zinc-200/60 bg-[#f9f9fb] p-5 text-center shadow-sm dark:border-[#1f1f23] dark:bg-[#121214]">
              <Repeat2 size={20} className="mb-4 text-zinc-700 dark:text-zinc-300" strokeWidth={1.9} />
              <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">CRDT-first</div>
              <div className="mt-1 text-sm leading-6 text-zinc-500 dark:text-zinc-400">Concurrent edits always merge correctly.</div>
            </div>
            <div className="flex flex-col items-center rounded-xl border border-zinc-200/60 bg-[#f9f9fb] p-5 text-center shadow-sm dark:border-[#1f1f23] dark:bg-[#121214]">
              <LayoutPanelLeft size={20} className="mb-4 text-zinc-700 dark:text-zinc-300" strokeWidth={1.9} />
              <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">Rust backend</div>
              <div className="mt-1 text-sm leading-6 text-zinc-500 dark:text-zinc-400">Tokio actor model, one actor per room.</div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
