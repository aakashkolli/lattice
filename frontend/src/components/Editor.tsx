'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as Y from 'yjs';
import { LatticeProvider, ConnectionState, PresenceState } from '@/lib/lattice-provider';
import { Toolbar, ExportFormat, EditorMode } from './Toolbar';
import dynamic from 'next/dynamic';
import { genUuid, hashColor } from '@/lib/utils';
import { StatusBar } from './StatusBar';
import { ShareModal } from './ShareModal';

const TextEditor = dynamic(
  () => import('./TextEditor').then((m) => m.TextEditor),
  { ssr: false, loading: () => <div className="editor-loading">Loading editor…</div> },
);
const MarkdownEditor = dynamic(
  () => import('./MarkdownEditor').then((m) => m.MarkdownEditor),
  { ssr: false, loading: () => <div className="editor-loading">Loading editor…</div> },
);

interface Props { roomId: string; serverUrl: string; }

export function Editor({ roomId, serverUrl }: Props) {
  const router = useRouter();
  const providerRef = useRef<LatticeProvider | null>(null);
  const yTextRef    = useRef<Y.Text | null>(null);
  const yTitleRef   = useRef<Y.Text | null>(null);
  const docRef      = useRef<Y.Doc | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const userNameRef = useRef(`user-${Math.random().toString(36).slice(2, 6)}`);
  const userIdRef   = useRef(genUuid());

  const [initialized, setInitialized] = useState(false);
  const [connState, setConnState] = useState<ConnectionState>('connecting');
  const [cursors,   setCursors]   = useState<PresenceState[]>([]);
  const [title,     setTitle]     = useState('');
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [shareOpen,     setShareOpen]     = useState(false);
  const [clearConfirm,  setClearConfirm]  = useState(false);
  const [mode,          setMode]          = useState<EditorMode>('text');

  useEffect(() => {
    const doc    = new Y.Doc();
    const yText  = doc.getText('content');
    const yTitle = doc.getText('title');
    const yMeta  = doc.getMap<string>('meta');
    yTextRef.current  = yText;
    yTitleRef.current = yTitle;
    docRef.current    = doc;

    const provider = new LatticeProvider(serverUrl, roomId, doc);
    providerRef.current = provider;

    provider.onStateChange = setConnState;
    provider.onPresence    = setCursors;
    yTitle.observe(() => setTitle(yTitle.toString()));
    yMeta.observe(() => {
      const m = yMeta.get('mode') as EditorMode | undefined;
      if (m) setMode(m);
    });
    setInitialized(true);

    return () => { provider.destroy(); doc.destroy(); };
  }, [roomId, serverUrl]);

  const handleWordCount = useCallback((words: number, chars: number) => {
    setWordCount(words); setCharCount(chars);
  }, []);

  const handleCursorMove = useCallback((from: number, to: number) => {
    providerRef.current?.sendPresence({
      cursorFrom: from, cursorTo: to,
      name: userNameRef.current, color: hashColor(userIdRef.current),
    });
  }, []);

  const handleTitleChange = useCallback((t: string) => {
    const yTitle = yTitleRef.current;
    if (!yTitle) return;
    const old = yTitle.toString();
    if (t === old) return;
    yTitle.delete(0, old.length);
    yTitle.insert(0, t);
  }, []);

  const handleNewRoom = useCallback(() => router.push(`/room/${genUuid()}`), [router]);

  const handleExport = useCallback((format: ExportFormat) => {
    const content = yTextRef.current?.toString() ?? '';
    if (format === 'clipboard') { navigator.clipboard.writeText(content); return; }
    const ext  = format === 'md' ? 'md' : 'txt';
    const blob = new Blob([content], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `${title || 'document'}.${ext}`; a.click();
    URL.revokeObjectURL(url);
  }, [title]);

  const handleClearDoc = useCallback(() => {
    if (!clearConfirm) { setClearConfirm(true); return; }
    const yText = yTextRef.current;
    if (yText) yText.delete(0, yText.length);
    setClearConfirm(false);
  }, [clearConfirm]);

  const handleModeChange = useCallback((newMode: EditorMode) => {
    setMode(newMode);
    docRef.current?.getMap<string>('meta').set('mode', newMode);
  }, []);

  if (!initialized) return null;

  const yText    = yTextRef.current!;
  const provider = providerRef.current!;

  return (
    <div className="app-root">
      <Toolbar
        roomId={roomId} title={title} cursors={cursors} mode={mode}
        onTitleChange={handleTitleChange}
        onShare={() => setShareOpen(true)}
        onNewRoom={handleNewRoom}
        onExport={handleExport}
        onClearDoc={handleClearDoc}
        onModeChange={handleModeChange}
      />
      <main className="editor-main">
        <div className="document-card">
          {mode === 'markdown' ? (
            <MarkdownEditor yText={yText} provider={provider} cursors={cursors} onWordCount={handleWordCount} onCursorMove={handleCursorMove} />
          ) : (
            <TextEditor yText={yText} provider={provider} cursors={cursors} onWordCount={handleWordCount} onCursorMove={handleCursorMove} textareaRef={textareaRef} />
          )}
        </div>
      </main>
      <StatusBar connState={connState} wordCount={wordCount} charCount={charCount} />
      {shareOpen && <ShareModal roomId={roomId} cursors={cursors} selfName={userNameRef.current} onClose={() => setShareOpen(false)} />}
    </div>
  );
}
