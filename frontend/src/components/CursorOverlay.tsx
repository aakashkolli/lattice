'use client';

import { useEffect, useRef } from 'react';
import type { PresenceState } from '@/lib/lattice-provider';

interface Props {
  cursors: PresenceState[];
  textareaRef: React.RefObject<HTMLTextAreaElement>;
}

/**
 * Renders remote user cursors as DOM overlays via requestAnimationFrame.
 * Bypasses React's render cycle entirely — per CLAUDE.md § Cursor Rendering.
 */
export function CursorOverlay({ cursors, textareaRef }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const cursorsRef = useRef<PresenceState[]>(cursors);
  const runningRef = useRef(false);
  const dirtyRef = useRef(true);
  const mirrorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const textarea = textareaRef.current;
    if (!container || !textarea) return;

    // Create a single hidden mirror element reused for caret measurement.
    const mirror = document.createElement('div');
    mirror.style.position = 'fixed';
    mirror.style.visibility = 'hidden';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.wordWrap = 'break-word';
    mirror.style.overflow = 'hidden';
    document.body.appendChild(mirror);
    mirrorRef.current = mirror;

    function getCaretCoords(el: HTMLTextAreaElement, pos: number) {
      try {
        const style = getComputedStyle(el);
        Object.assign(mirror.style, {
          width: `${el.offsetWidth}px`,
          font: style.font,
          padding: style.padding,
          border: style.border,
          boxSizing: style.boxSizing,
          lineHeight: style.lineHeight,
          letterSpacing: style.letterSpacing,
        });

        mirror.textContent = el.value.slice(0, pos);
        let caret = mirror.querySelector('span.caret-anchor') as HTMLSpanElement | null;
        if (!caret) {
          caret = document.createElement('span');
          caret.className = 'caret-anchor';
          caret.textContent = '​';
          mirror.appendChild(caret);
        }

        const caretRect = caret.getBoundingClientRect();
        const taRect = el.getBoundingClientRect();

        return {
          top: caretRect.top - taRect.top + el.scrollTop,
          left: caretRect.left - taRect.left,
        };
      } catch {
        return null;
      }
    }

    function renderFrame() {
      if (!container || !textarea) return;

      const activeCursors = cursorsRef.current;
      // Stop the loop if there are no active cursors.
      if (activeCursors.length === 0) {
        runningRef.current = false;
        return;
      }

      if (!dirtyRef.current) {
        rafRef.current = requestAnimationFrame(renderFrame);
        return;
      }

      dirtyRef.current = false;
      container.innerHTML = '';

      const lineHeight = parseInt(getComputedStyle(textarea).lineHeight, 10) || 22;

      for (const cursor of activeCursors) {
        const coords = getCaretCoords(textarea, cursor.cursorFrom);
        if (!coords) continue;

        const marker = document.createElement('div');
        marker.className = 'cursor-marker';
        Object.assign(marker.style, {
          left: `${coords.left}px`,
          top: `${coords.top}px`,
          height: `${lineHeight}px`,
          background: cursor.color,
          opacity: '0.85',
          position: 'absolute',
        });

        const label = document.createElement('span');
        label.className = 'cursor-label';
        label.textContent = cursor.name;
        Object.assign(label.style, {
          background: cursor.color,
          left: `${coords.left}px`,
          top: `${coords.top - 20}px`,
          position: 'absolute',
        });

        container.appendChild(label);
        container.appendChild(marker);
      }

      rafRef.current = requestAnimationFrame(renderFrame);
    }

    function startLoopIfNeeded() {
      if (runningRef.current) return;
      if (cursorsRef.current.length === 0) return;
      runningRef.current = true;
      rafRef.current = requestAnimationFrame(renderFrame);
    }

    function onDirty() {
      dirtyRef.current = true;
      startLoopIfNeeded();
    }

    // React to textarea interactions that can change layout.
    textarea.addEventListener('input', onDirty);
    textarea.addEventListener('scroll', onDirty);
    window.addEventListener('resize', onDirty);

    // Start the loop only if there are active cursors now.
    startLoopIfNeeded();

    return () => {
      textarea.removeEventListener('input', onDirty);
      textarea.removeEventListener('scroll', onDirty);
      window.removeEventListener('resize', onDirty);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (mirrorRef.current && mirrorRef.current.parentElement) {
        mirrorRef.current.parentElement.removeChild(mirrorRef.current);
      }
      mirrorRef.current = null;
      runningRef.current = false;
    };
  }, [textareaRef]);

  // Keep the latest cursors array in a ref without triggering rerenders.
  cursorsRef.current = cursors;

  return <div ref={containerRef} className="cursor-overlay" aria-hidden />;
}
