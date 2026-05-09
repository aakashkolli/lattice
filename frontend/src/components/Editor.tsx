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
import { CommentsPane } from './CommentsPane';

const TextEditor = dynamic(
  () => import('./TextEditor').then((m) => m.TextEditor),
  { ssr: false, loading: () => <div className="editor-loading">Loading editor…</div> },
);

const MarkdownEditor = dynamic(
  () => import('./MarkdownEditor').then((m) => m.MarkdownEditor),
  { ssr: false, loading: () => <div className="editor-loading">Loading editor…</div> },
);

interface Props {
  roomId: string;
  serverUrl: string;
}

export function Editor({ roomId, serverUrl }: Props) {
  const router = useRouter();

  const providerRef = useRef<LatticeProvider | null>(null);
  const yTextRef = useRef<Y.Text | null>(null);
  const yTitleRef = useRef<Y.Text | null>(null);
  const docRef = useRef<Y.Doc | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const userNameRef = useRef(`user-${Math.random().toString(36).slice(2, 6)}`);
  const userIdRef = useRef(genUuid());

  const [initialized, setInitialized] = useState(false);
  const [connState, setConnState] = useState<ConnectionState>('connecting');
  const [cursors, setCursors] = useState<PresenceState[]>([]);
  const [title, setTitle] = useState('');
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [mode, setMode] = useState<EditorMode>('text');
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [mdSelection, setMdSelection] = useState<{ from: number; to: number } | null>(null);

  useEffect(() => {
    const doc = new Y.Doc();
    const yText = doc.getText('content');
    const yTitle = doc.getText('title');
    const yMeta = doc.getMap<string>('meta');

    yTextRef.current = yText;
    yTitleRef.current = yTitle;
    docRef.current = doc;

    const provider = new LatticeProvider(serverUrl, roomId, doc);
    providerRef.current = provider;

    provider.onStateChange = setConnState;
    provider.onPresence = setCursors;

    yTitle.observe(() => { setTitle(yTitle.toString()); });

    // Sync editor mode from CRDT so all collaborators share the same mode.
    yMeta.observe(() => {
      const m = yMeta.get('mode') as EditorMode | undefined;
      if (m) setMode(m);
    });

    setInitialized(true);

    return () => {
      provider.destroy();
      providerRef.current = null;
      doc.destroy();
      yTextRef.current = null;
      yTitleRef.current = null;
      docRef.current = null;
      setInitialized(false);
    };
  }, [roomId, serverUrl]);

  const handleTitleChange = useCallback((newTitle: string) => {
    const yTitle = yTitleRef.current;
    if (!yTitle) return;
    const old = yTitle.toString();
    yTitle.doc!.transact(() => {
      if (old.length > 0) yTitle.delete(0, old.length);
      if (newTitle.length > 0) yTitle.insert(0, newTitle);
    });
  }, []);

  const handleWordCount = useCallback((w: number, c: number) => {
    setWordCount(w);
    setCharCount(c);
  }, []);

  const handleCursorMove = useCallback((from: number, to: number) => {
    providerRef.current?.sendPresence({
      cursorFrom: from,
      cursorTo: to,
      name: userNameRef.current,
      color: hashColor(userNameRef.current),
    });
    setMdSelection(from !== to ? { from, to } : null);
  }, []);

  const handleNewRoom = useCallback(() => {
    router.push(`/room/${genUuid()}`);
  }, [router]);

  const handleExport = useCallback((format: ExportFormat) => {
    const content = yTextRef.current?.toString() ?? '';
    const rawTitle = yTitleRef.current?.toString() || 'Untitled Document';
    const safeTitle = rawTitle.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'Untitled Document';

    if (format === 'clipboard') {
      navigator.clipboard.writeText(content);
      return;
    }

    const ext = format === 'md' ? 'md' : 'txt';
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeTitle}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleClearDoc = useCallback(() => {
    if (!clearConfirm) {
      setClearConfirm(true);
      setTimeout(() => setClearConfirm(false), 3000);
      return;
    }
    const yText = yTextRef.current;
    if (!yText) return;
    yText.doc!.transact(() => {
      if (yText.length > 0) yText.delete(0, yText.length);
    });
    setClearConfirm(false);
  }, [clearConfirm]);

  const handleModeChange = useCallback((newMode: EditorMode) => {
    setMode(newMode);
    // Persist in CRDT so all collaborators see the same mode.
    const doc = docRef.current;
    if (doc) {
      const yMeta = doc.getMap<string>('meta');
      yMeta.set('mode', newMode);
    }
  }, []);

  if (!initialized || !yTextRef.current || !providerRef.current || !docRef.current) {
    return (
      <div className="app-root">
        <div className="loading-screen">
          <div className="spinner" />
          <span>Connecting to room…</span>
        </div>
      </div>
    );
  }

  const doc = docRef.current;
  const yText = yTextRef.current;
  const provider = providerRef.current;

  const mainContent = (
    <main className={`editor-main ${commentsOpen ? 'editor-main-with-comments' : ''}`}>
      <div className="document-card">
        {mode === 'markdown' ? (
          <MarkdownEditor
            yText={yText}
            provider={provider}
            cursors={cursors}
            onWordCount={handleWordCount}
            onCursorMove={handleCursorMove}
          />
        ) : (
          <TextEditor
            yText={yText}
            provider={provider}
            cursors={cursors}
            onWordCount={handleWordCount}
            onCursorMove={handleCursorMove}
            textareaRef={textareaRef}
          />
        )}
      </div>
    </main>
  );

  return (
    <div className="app-root">
      <Toolbar
        roomId={roomId}
        title={title}
        cursors={cursors}
        mode={mode}
        commentsOpen={commentsOpen}
        onTitleChange={handleTitleChange}
        onShare={() => setShareOpen(true)}
        onNewRoom={handleNewRoom}
        onExport={handleExport}
        onClearDoc={handleClearDoc}
        onModeChange={handleModeChange}
        onToggleComments={() => setCommentsOpen((o) => !o)}
      />

      {clearConfirm && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
          padding: '10px 20px', background: '#fef2f2', borderBottom: '1px solid #fecaca',
          fontSize: 13, color: '#dc2626',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          Click Clear again to permanently delete all content. This affects all collaborators.
          <button className="btn btn-danger btn-sm" onClick={handleClearDoc}>Confirm Clear</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setClearConfirm(false)}>Cancel</button>
        </div>
      )}

      <div className="editor-body">
        {mainContent}

        {commentsOpen && (
          <CommentsPane
            doc={doc}
            yText={yText}
            selfId={userIdRef.current}
            selfName={userNameRef.current}
            textareaRef={textareaRef}
            selectionOverride={mode === 'markdown' ? mdSelection : undefined}
            activeThreadId={activeThreadId}
            onActiveThread={setActiveThreadId}
          />
        )}
      </div>

      <StatusBar
        connState={connState}
        wordCount={wordCount}
        charCount={charCount}
      />

      {shareOpen && (
        <ShareModal
          roomId={roomId}
          cursors={cursors}
          selfName={userNameRef.current}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
}

