'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import 'emoji-picker-element';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'emoji-picker': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}

interface Props {
  anchor: DOMRect;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

const PICKER_WIDTH = 360;
const PICKER_HEIGHT = 450;
const GAP = 8;

export function EmojiPicker({ anchor, onSelect, onClose }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Position: prefer above the trigger, fall back to below if not enough room
  const top = anchor.top - PICKER_HEIGHT - GAP > 0
    ? anchor.top - PICKER_HEIGHT - GAP
    : anchor.bottom + GAP;

  // Align left edge with trigger, but clamp so picker stays in viewport
  const left = Math.min(anchor.left, window.innerWidth - PICKER_WIDTH - 8);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [onClose]);

  useEffect(() => {
    const picker = wrapperRef.current?.querySelector('emoji-picker');
    if (!picker) return;
    function handleEmojiClick(e: Event) {
      const detail = (e as CustomEvent).detail;
      const emoji: string = detail?.emoji?.unicode ?? detail?.unicode ?? '';
      if (emoji) {
        onSelect(emoji);
        onClose();
      }
    }
    picker.addEventListener('emoji-click', handleEmojiClick);
    return () => picker.removeEventListener('emoji-click', handleEmojiClick);
  }, [onSelect, onClose]);

  return createPortal(
    <div
      ref={wrapperRef}
      style={{ position: 'fixed', top, left, zIndex: 9999 }}
      onClick={(e) => e.stopPropagation()}
    >
      <emoji-picker />
    </div>,
    document.body,
  );
}
