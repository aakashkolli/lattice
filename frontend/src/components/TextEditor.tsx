'use client';

import { useCallback, useEffect, useRef } from 'react';
import * as Y from 'yjs';
import type { PresenceState } from '@/lib/lattice-provider';
import { CursorOverlay } from './CursorOverlay';

interface Props {
  yText: Y.Text;
  cursors: PresenceState[];
  onWordCount?: (words: number, chars: number) => void;
  onCursorMove?: (from: number, to: number) => void;
  /** Optional external ref so parent components (e.g. CommentsPane) can measure selection. */
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
}

// Minimal-diff: compute common prefix/suffix to find changed region and apply only delete+insert.
function applyDiff(yText: Y.Text, oldStr: string, newStr: string) {
  const minLen = Math.min(oldStr.length, newStr.length);

  let prefixEnd = 0;
  while (prefixEnd < minLen && oldStr[prefixEnd] === newStr[prefixEnd]) {
    prefixEnd++;
  }

  let oldEnd = oldStr.length;
  let newEnd = newStr.length;
  while (oldEnd > prefixEnd && newEnd > prefixEnd && oldStr[oldEnd - 1] === newStr[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }

  const deleteCount = oldEnd - prefixEnd;
  const insertStr = newStr.slice(prefixEnd, newEnd);

  if (deleteCount > 0) yText.delete(prefixEnd, deleteCount);
  if (insertStr.length > 0) yText.insert(prefixEnd, insertStr);
}

export function TextEditor({ yText, cursors, onWordCount, onCursorMove, textareaRef: externalRef }: Props) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalRef ?? internalRef;
  const prevValueRef = useRef('');

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;

    const initial = yText.toString();
    ta.value = initial;
    prevValueRef.current = initial;
    const words = initial.trim() ? initial.trim().split(/\s+/).length : 0;
    onWordCount?.(words, initial.length);

    const observer = () => {
      const newVal = yText.toString();
      if (ta.value === newVal) return;

      const start = ta.selectionStart ?? 0;
      const end = ta.selectionEnd ?? 0;
      ta.value = newVal;
      prevValueRef.current = newVal;
      ta.setSelectionRange(Math.min(start, newVal.length), Math.min(end, newVal.length));

      const w = newVal.trim() ? newVal.trim().split(/\s+/).length : 0;
      onWordCount?.(w, newVal.length);
    };

    yText.observe(observer);
    return () => yText.unobserve(observer);
  }, [yText, onWordCount, textareaRef]);

  const handleInput = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;

    const newValue = ta.value;
    const oldValue = prevValueRef.current;
    if (newValue === oldValue) return;

    yText.doc!.transact(() => {
      applyDiff(yText, oldValue, newValue);
    });

    prevValueRef.current = newValue;

    const w = newValue.trim() ? newValue.trim().split(/\s+/).length : 0;
    onWordCount?.(w, newValue.length);
  }, [yText, onWordCount, textareaRef]);

  const handleSelectionChange = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    onCursorMove?.(ta.selectionStart ?? 0, ta.selectionEnd ?? 0);
  }, [onCursorMove, textareaRef]);

  return (
    <div className="document-body">
      <textarea
        ref={textareaRef}
        className="editor-textarea"
        placeholder="Start writing here…&#10;&#10;Share the URL from the Share button to collaborate in real time."
        onInput={handleInput}
        onSelect={handleSelectionChange}
        onKeyUp={handleSelectionChange}
        onClick={handleSelectionChange}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
      />
      <CursorOverlay cursors={cursors} textareaRef={textareaRef} />
    </div>
  );
}
