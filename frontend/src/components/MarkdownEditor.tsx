'use client';

import { useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { EditorState, StateEffect, StateField, Annotation } from '@codemirror/state';
import {
  EditorView, Decoration, DecorationSet, WidgetType,
  ViewPlugin, ViewUpdate, keymap, placeholder,
} from '@codemirror/view';
import { defaultKeymap, historyKeymap, history } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { syntaxHighlighting, defaultHighlightStyle, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import type { LatticeProvider, PresenceState } from '@/lib/lattice-provider';

const LOCAL_ORIGIN  = Symbol('cm-local');
const syncAnnotation = Annotation.define<true>();

const mdHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontSize: '1.75em', fontWeight: '700', lineHeight: '1.3' },
  { tag: tags.heading2, fontSize: '1.4em',  fontWeight: '700', lineHeight: '1.3' },
  { tag: tags.heading3, fontSize: '1.2em',  fontWeight: '600' },
  { tag: tags.strong,   fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.monospace, fontFamily: 'ui-monospace, monospace', background: 'rgba(0,0,0,0.06)', borderRadius: '3px', padding: '1px 4px' },
  { tag: tags.link,     color: '#2563eb', textDecoration: 'underline' },
  { tag: tags.quote,    color: '#6b7280', fontStyle: 'italic' },
]);

const setCursorsEffect = StateEffect.define<PresenceState[]>();

class CursorWidget extends WidgetType {
  constructor(readonly color: string, readonly name: string) { super(); }
  toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-collab-cursor';
    el.style.setProperty('--cc', this.color);
    const label = document.createElement('span');
    label.className = 'cm-collab-label';
    label.textContent = this.name;
    el.appendChild(label);
    return el;
  }
  ignoreEvent() { return false; }
}

const remoteCursorsField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decos, tr) {
    decos = decos.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setCursorsEffect)) continue;
      const docLen = tr.state.doc.length;
      const items: ReturnType<Decoration['range']>[] = [];
      for (const c of effect.value) {
        const head   = Math.min(Math.max(c.cursorTo,   0), docLen);
        const anchor = Math.min(Math.max(c.cursorFrom, 0), docLen);
        if (anchor !== head) {
          const from = Math.min(anchor, head), to = Math.max(anchor, head);
          items.push(Decoration.mark({ attributes: { style: `background:${c.color}33` } }).range(from, to));
        }
        items.push(Decoration.widget({ widget: new CursorWidget(c.color, c.name), side: 1 }).range(head));
      }
      items.sort((a, b) => a.from - b.from || a.to - b.to);
      decos = Decoration.set(items, true);
    }
    return decos;
  },
  provide: f => EditorView.decorations.from(f),
});

interface Props {
  yText: Y.Text;
  provider: LatticeProvider;
  cursors: PresenceState[];
  onWordCount?: (words: number, chars: number) => void;
  onCursorMove?: (from: number, to: number) => void;
}

export function MarkdownEditor({ yText, provider, cursors, onWordCount, onCursorMove }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef      = useRef<EditorView | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const startState = EditorState.create({
      doc: yText.toString(),
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        syntaxHighlighting(mdHighlight),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        remoteCursorsField,
        placeholder('Start writing here…\n\nShare the URL to collaborate in real time.'),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newText = update.state.doc.toString();
            const w = newText.trim() ? newText.trim().split(/\s+/).length : 0;
            onWordCount?.(w, newText.length);
          }
          if (update.selectionSet) {
            const sel = update.state.selection.main;
            onCursorMove?.(sel.anchor, sel.head);
          }
        }),
      ],
    });

    const view = new EditorView({ state: startState, parent: container });
    viewRef.current = view;

    // Yjs → CodeMirror sync
    const yjsObserver = (delta: Y.YTextEvent) => {
      if (delta.transaction.origin === LOCAL_ORIGIN) return;
      let pos = 0;
      const changes: { from: number; to?: number; insert?: string }[] = [];
      delta.delta.forEach((op) => {
        if (op.retain) { pos += op.retain; }
        else if (op.delete) { changes.push({ from: pos, to: pos + op.delete }); pos += op.delete; }
        else if (op.insert) { changes.push({ from: pos, insert: String(op.insert) }); }
      });
      if (changes.length > 0) {
        view.dispatch({ changes, annotations: syncAnnotation.of(true) });
      }
    };
    yText.observe(yjsObserver);

    // CodeMirror → Yjs sync
    const cmPlugin = ViewPlugin.define(() => ({
      update(u: ViewUpdate) {
        if (!u.docChanged || u.transactions.some((t) => t.annotation(syncAnnotation))) return;
        yText.doc!.transact(() => {
          u.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
            if (toA > fromA) yText.delete(fromA, toA - fromA);
            if (inserted.length > 0) yText.insert(fromA, inserted.toString());
          });
        }, LOCAL_ORIGIN);
      },
    }));
    view.dispatch({ effects: StateEffect.appendConfig.of(cmPlugin.extension) });

    return () => {
      yText.unobserve(yjsObserver);
      view.destroy();
      viewRef.current = null;
    };
  }, [yText, onWordCount, onCursorMove]);

  // Sync remote cursors
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setCursorsEffect.of(cursors) });
  }, [cursors]);

  return (
    <div ref={containerRef} className="cm-editor-host" />
  );
}
