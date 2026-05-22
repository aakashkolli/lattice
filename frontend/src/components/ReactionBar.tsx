'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { EmojiPicker } from './EmojiPicker';

interface Props {
  parentMap: Y.Map<unknown>;
  selfId: string;
  selfName: string;
}

interface ReactionSummary {
  emoji: string;
  count: number;
  names: string[];
  self: boolean;
}

function readReactions(map: Y.Map<unknown>, selfId: string): ReactionSummary[] {
  const result: ReactionSummary[] = [];
  map.forEach((value, emoji) => {
    const users = value as Y.Map<string>;
    const names: string[] = [];
    users.forEach((name) => names.push(name));
    if (names.length > 0) {
      result.push({ emoji, count: names.length, names, self: users.has(selfId) });
    }
  });
  return result;
}

export function ReactionBar({ parentMap, selfId, selfName }: Props) {
  const [reactionsMap, setReactionsMap] = useState<Y.Map<unknown> | null>(
    () => (parentMap.get('reactions') as Y.Map<unknown>) ?? null,
  );
  const [reactions, setReactions] = useState<ReactionSummary[]>(() =>
    reactionsMap ? readReactions(reactionsMap, selfId) : [],
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerAnchor, setPickerAnchor] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const observer = () => {
      const r = parentMap.get('reactions') as Y.Map<unknown> | undefined;
      if (r) setReactionsMap(r);
    };
    parentMap.observe(observer);
    return () => parentMap.unobserve(observer);
  }, [parentMap]);

  useEffect(() => {
    if (!reactionsMap) return;
    const observer = () => setReactions(readReactions(reactionsMap, selfId));
    reactionsMap.observeDeep(observer);
    return () => reactionsMap.unobserveDeep(observer);
  }, [reactionsMap, selfId]);

  const toggleReaction = useCallback((emoji: string) => {
    const doc = parentMap.doc;
    if (!doc) return;
    doc.transact(() => {
      let rm = parentMap.get('reactions') as Y.Map<unknown> | undefined;
      if (!rm) {
        rm = new Y.Map<unknown>();
        parentMap.set('reactions', rm);
      }
      let users = rm.get(emoji) as Y.Map<string> | undefined;
      if (!users) {
        users = new Y.Map<string>();
        rm.set(emoji, users);
      }
      if (users.has(selfId)) {
        users.delete(selfId);
      } else {
        users.set(selfId, selfName);
      }
    });
  }, [parentMap, selfId, selfName]);

  return (
    <div className="reaction-bar" onClick={(e) => e.stopPropagation()}>
      {reactions.map((r) => (
        <button
          key={r.emoji}
          className={`reaction-pill${r.self ? ' reaction-pill-self' : ''}`}
          onClick={() => toggleReaction(r.emoji)}
          title={r.names.join(', ')}
        >
          {r.emoji} <span className="reaction-count">{r.count}</span>
        </button>
      ))}
      <div className="reaction-add-wrapper">
        <button
          ref={triggerRef}
          className="reaction-add-btn"
          onClick={() => {
            const rect = triggerRef.current?.getBoundingClientRect() ?? null;
            setPickerAnchor(rect);
            setPickerOpen((o) => !o);
          }}
          title="Add reaction"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M8 13s1.5 2 4 2 4-2 4-2"/>
            <line x1="9" y1="9" x2="9.01" y2="9"/>
            <line x1="15" y1="9" x2="15.01" y2="9"/>
          </svg>
        </button>
        {pickerOpen && pickerAnchor && (
          <EmojiPicker
            anchor={pickerAnchor}
            onSelect={toggleReaction}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
