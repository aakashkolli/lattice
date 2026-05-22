'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { CommentComposer } from './CommentComposer';
import { CommentThread } from './CommentThread';
import { genUuid } from '@/lib/utils';

interface Props {
  doc: Y.Doc;
  yText: Y.Text;
  selfId: string;
  selfName: string;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  /** Overrides DOM-based selection tracking (used when no textarea is active, e.g. markdown mode). */
  selectionOverride?: { from: number; to: number } | null;
  /** Currently active (selected) thread id */
  activeThreadId: string | null;
  onActiveThread: (id: string | null) => void;
  width?: number;
}

interface ThreadSummary {
  id: string;
  resolved: boolean;
  createdAt: number;
  threadMap: Y.Map<unknown>;
  anchorFrom: string;
  anchorTo: string;
}

function readThreads(yComments: Y.Map<unknown>): ThreadSummary[] {
  const result: ThreadSummary[] = [];
  yComments.forEach((value, key) => {
    const map = value as Y.Map<unknown>;
    result.push({
      id: key,
      resolved: (map.get('resolved') as boolean) ?? false,
      createdAt: (map.get('createdAt') as number) ?? 0,
      threadMap: map,
      anchorFrom: (map.get('anchorFrom') as string) ?? '',
      anchorTo: (map.get('anchorTo') as string) ?? '',
    });
  });
  return result.sort((a, b) => a.createdAt - b.createdAt);
}

export function CommentsPane({ doc, yText, selfId, selfName, textareaRef, selectionOverride, activeThreadId, onActiveThread, width }: Props) {
  const yComments = doc.getMap<unknown>('comments');
  const [threads, setThreads] = useState<ThreadSummary[]>(() => readThreads(yComments));
  const [composing, setComposing] = useState(false);
  const [selection, setSelection] = useState<{ from: number; to: number } | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  useEffect(() => {
    const observer = () => setThreads(readThreads(yComments));
    yComments.observeDeep(observer);
    return () => yComments.unobserveDeep(observer);
  }, [yComments]);

  // Track selection. When selectionOverride is provided (e.g. CodeMirror markdown mode),
  // use it directly instead of reading DOM events from the textarea.
  useEffect(() => {
    if (selectionOverride !== undefined) {
      setSelection(selectionOverride);
      return;
    }

    const ta = textareaRef.current;
    if (!ta) return;

    function onSelection() {
      const from = ta!.selectionStart ?? 0;
      const to = ta!.selectionEnd ?? 0;
      if (from !== to) {
        setSelection({ from, to });
      }
    }

    ta.addEventListener('select', onSelection);
    ta.addEventListener('mouseup', onSelection);
    ta.addEventListener('keyup', onSelection);
    return () => {
      ta.removeEventListener('select', onSelection);
      ta.removeEventListener('mouseup', onSelection);
      ta.removeEventListener('keyup', onSelection);
    };
  }, [textareaRef, selectionOverride]);

  const handleNewComment = useCallback((text: string) => {
    if (!selection && !composing) return;

    const from = selection?.from ?? 0;
    const to = selection?.to ?? 0;

    // Serialize Y.RelativePosition anchors so they survive edits.
    const relFrom = Y.createRelativePositionFromTypeIndex(yText, from);
    const relTo = Y.createRelativePositionFromTypeIndex(yText, to);
    const anchorFrom = JSON.stringify(Y.relativePositionToJSON(relFrom));
    const anchorTo = JSON.stringify(Y.relativePositionToJSON(relTo));

    const threadId = genUuid();
    const thread = new Y.Map<unknown>();
    thread.set('id', threadId);
    thread.set('authorId', selfId);
    thread.set('authorName', selfName);
    thread.set('createdAt', Date.now());
    thread.set('resolved', false);
    thread.set('anchorFrom', anchorFrom);
    thread.set('anchorTo', anchorTo);
    thread.set('text', text);
    const replies = new Y.Array<Y.Map<unknown>>();
    thread.set('replies', replies);
    thread.set('reactions', new Y.Map<unknown>());

    yComments.set(threadId, thread);
    setComposing(false);
    setSelection(null);
    onActiveThread(threadId);
  }, [selection, composing, yText, selfId, selfName, yComments, onActiveThread]);

  const handleResolve = useCallback((threadId: string) => {
    const map = yComments.get(threadId) as Y.Map<unknown> | undefined;
    if (!map) return;
    map.set('resolved', true);
    if (activeThreadId === threadId) onActiveThread(null);
  }, [yComments, activeThreadId, onActiveThread]);

  const visible = threads.filter((t) => showResolved || !t.resolved);
  const unresolvedCount = threads.filter((t) => !t.resolved).length;

  return (
    <div className="comments-pane" style={width !== undefined ? { width } : undefined}>
      <div className="comments-header">
        <span className="comments-title">
          Comments
          {unresolvedCount > 0 && (
            <span className="comments-badge">{unresolvedCount}</span>
          )}
        </span>
        <div className="comments-header-actions">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowResolved((s) => !s)}
            title={showResolved ? 'Hide resolved' : 'Show resolved'}
          >
            {showResolved ? 'Hide resolved' : 'Show resolved'}
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setComposing(true)}
            disabled={composing}
            title="New comment"
          >
            + Comment
          </button>
        </div>
      </div>

      {composing && (
        <div className="comment-new-form">
          {selection && selection.from !== selection.to && (
            <div className="comment-anchor-preview">
              Anchored to: "{yText.toString().slice(selection.from, Math.min(selection.to, selection.from + 60))}
              {selection.to - selection.from > 60 ? '…' : ''}"
            </div>
          )}
          <CommentComposer
            placeholder="Write a comment…"
            onSubmit={handleNewComment}
            onCancel={() => { setComposing(false); }}
            autoFocus
          />
        </div>
      )}

      <div className="comments-list">
        {visible.length === 0 && (
          <div className="comments-empty">
            {threads.length === 0
              ? 'No comments yet. Select text in the editor then click + Comment.'
              : 'No open comments.'}
          </div>
        )}
        {visible.map((t) => (
          <CommentThread
            key={t.id}
            threadMap={t.threadMap}
            selfId={selfId}
            selfName={selfName}
            active={activeThreadId === t.id}
            onActivate={() => onActiveThread(activeThreadId === t.id ? null : t.id)}
            onResolve={() => handleResolve(t.id)}
          />
        ))}
      </div>
    </div>
  );
}
