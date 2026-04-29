'use client';

import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { renderMarkdown } from '@/lib/markdown';

interface Props {
  yText: Y.Text;
}

export function MarkdownPreview({ yText }: Props) {
  const [html, setHtml] = useState('');
  const pendingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function update() {
      if (pendingRef.current) return;
      pendingRef.current = true;
      try {
        const rendered = await renderMarkdown(yText.toString());
        if (!cancelled) setHtml(rendered);
      } finally {
        pendingRef.current = false;
      }
    }

    const observer = () => { void update(); };
    yText.observe(observer);
    void update();

    return () => {
      cancelled = true;
      yText.unobserve(observer);
    };
  }, [yText]);

  return (
    <div
      className="md-preview"
      dangerouslySetInnerHTML={{ __html: html }}
      aria-label="Markdown preview"
    />
  );
}
