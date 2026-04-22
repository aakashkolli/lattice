'use client';

import { useCallback, useEffect, useRef } from 'react';
import * as Y from 'yjs';
import type { LatticeProvider, PresenceState } from '@/lib/lattice-provider';

interface Props {
  yText: Y.Text;
  provider: LatticeProvider;
  cursors: PresenceState[];
  onWordCount?: (words: number, chars: number) => void;
  onCursorMove?: (from: number, to: number) => void;
}

export function TextEditor({ yText, provider, cursors, onWordCount, onCursorMove }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevValueRef = useRef('');

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const initial = yText.toString();
    ta.value = initial;
    prevValueRef.current = initial;
    const w = initial.trim() ? initial.trim().split(/\s+/).length : 0;
    onWordCount?.(w, initial.length);

    const observer = () => {
      const newVal = yText.toString();
      if (ta.value !== newVal) {
        const start = ta.selectionStart ?? 0;
        const end   = ta.selectionEnd   ?? 0;
        ta.value = newVal;
        prevValueRef.current = newVal;
        ta.setSelectionRange(Math.min(start, newVal.length), Math.min(end, newVal.length));
        const w2 = newVal.trim() ? newVal.trim().split(/\s+/).length : 0;
        onWordCount?.(w2, newVal.length);
      }
    };

    yText.observe(observer);
    return () => yText.unobserve(observer);
  }, [yText, onWordCount]);

  const handleInput = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const newValue = ta.value;
    const oldValue = prevValueRef.current;
    if (newValue === oldValue) return;

    const minLen = Math.min(oldValue.length, newValue.length);
    let i = 0;
    while (i < minLen && oldValue[i] === newValue[i]) i++;
    let oldEnd = oldValue.length, newEnd = newValue.length;
    while (oldEnd > i && newEnd > i && oldValue[oldEnd-1] === newValue[newEnd-1]) { oldEnd--; newEnd--; }

    // BUG: passing provider as origin — causes update loop (fixed later)
    yText.doc!.transact(() => {
      if (oldEnd > i) yText.delete(i, oldEnd - i);
      if (newEnd > i) yText.insert(i, newValue.slice(i, newEnd));
    }, provider);

    prevValueRef.current = newValue;
    const w = newValue.trim() ? newValue.trim().split(/\s+/).length : 0;
    onWordCount?.(w, newValue.length);
  }, [yText, provider, onWordCount]);

  const handleSelectionChange = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    onCursorMove?.(ta.selectionStart ?? 0, ta.selectionEnd ?? 0);
  }, [onCursorMove]);

  return (
    <div className="document-body">
      <textarea
        ref={textareaRef}
        className="editor-textarea"
        placeholder="Start writing here…"
        onInput={handleInput}
        onSelect={handleSelectionChange}
        onKeyUp={handleSelectionChange}
        onClick={handleSelectionChange}
        spellCheck={false}
      />
    </div>
  );
}
