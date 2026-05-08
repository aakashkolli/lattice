'use client';

import { useCallback, useEffect, useState } from 'react';
import * as Y from 'yjs';
import { CommentComposer } from './CommentComposer';
import { genUuid } from '@/lib/utils';

export interface ReplyData {
  id: string;
  authorId: string;
  authorName: string;
  createdAt: number;
  text: string;
}

interface Props {
  threadMap: Y.Map<unknown>;
  selfId: string;
  selfName: string;
  active: boolean;
  onActivate: () => void;
  onResolve: () => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function avatarColor(name: string): string {
  const COLORS = ['#f97316','#8b5cf6','#06b6d4','#ec4899','#10b981','#f59e0b'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

function initials(name: string): string {
  return name.split(/[-_ ]/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

function readReplies(replies: Y.Array<Y.Map<unknown>>): ReplyData[] {
  return replies.toArray().map((r) => ({
    id: r.get('id') as string,
    authorId: r.get('authorId') as string,
    authorName: r.get('authorName') as string,
    createdAt: r.get('createdAt') as number,
    text: r.get('text') as string,
  }));
}

export function CommentThread({ threadMap, selfId, selfName, active, onActivate, onResolve }: Props) {
  const [replyOpen, setReplyOpen] = useState(false);

  const authorName = (threadMap.get('authorName') as string) ?? 'Unknown';
  const createdAt = (threadMap.get('createdAt') as number) ?? 0;
  const resolved = (threadMap.get('resolved') as boolean) ?? false;
  const text = (threadMap.get('text') as string) ?? '';
  const replies = threadMap.get('replies') as Y.Array<Y.Map<unknown>> | undefined;

  const [replyList, setReplyList] = useState<ReplyData[]>(() =>
    replies ? readReplies(replies) : [],
  );

  useEffect(() => {
    if (!replies) return;
    setReplyList(readReplies(replies));
    const observer = () => setReplyList(readReplies(replies));
    replies.observe(observer);
    return () => replies.unobserve(observer);
  }, [replies]);

  const handleReply = useCallback((replyText: string) => {
    if (!replies) return;
    const reply = new Y.Map<unknown>();
    reply.set('id', genUuid());
    reply.set('authorId', selfId);
    reply.set('authorName', selfName);
    reply.set('createdAt', Date.now());
    reply.set('text', replyText);
    replies.push([reply]);
    setReplyOpen(false);
  }, [replies, selfId, selfName]);

  return (
    <div
      className={`comment-thread ${active ? 'comment-thread-active' : ''} ${resolved ? 'comment-thread-resolved' : ''}`}
      onClick={onActivate}
    >
      <div className="comment-item">
        <div
          className="comment-avatar"
          style={{ background: avatarColor(authorName) }}
          title={authorName}
        >
          {initials(authorName)}
        </div>
        <div className="comment-content">
          <div className="comment-meta">
            <span className="comment-author">{authorName}</span>
            <span className="comment-time">{formatTime(createdAt)}</span>
          </div>
          <p className="comment-text">{text}</p>
        </div>
      </div>

      {replyList.map((reply) => (
        <div key={reply.id} className="comment-item comment-reply">
          <div
            className="comment-avatar comment-avatar-sm"
            style={{ background: avatarColor(reply.authorName) }}
            title={reply.authorName}
          >
            {initials(reply.authorName)}
          </div>
          <div className="comment-content">
            <div className="comment-meta">
              <span className="comment-author">{reply.authorName}</span>
              <span className="comment-time">{formatTime(reply.createdAt)}</span>
            </div>
            <p className="comment-text">{reply.text}</p>
          </div>
        </div>
      ))}

      {active && (
        <div className="comment-thread-footer">
          {replyOpen ? (
            <CommentComposer
              placeholder="Reply…"
              onSubmit={handleReply}
              onCancel={() => setReplyOpen(false)}
              autoFocus
            />
          ) : (
            <div className="comment-thread-actions">
              <button
                className="btn btn-ghost btn-sm"
                onClick={(e) => { e.stopPropagation(); setReplyOpen(true); }}
              >
                Reply
              </button>
              {!resolved && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={(e) => { e.stopPropagation(); onResolve(); }}
                >
                  Resolve
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {resolved && (
        <div className="comment-resolved-badge">Resolved</div>
      )}
    </div>
  );
}
