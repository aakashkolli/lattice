'use client';

import { useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { EditorState, StateEffect, StateField, Annotation, RangeSetBuilder } from '@codemirror/state';
import {
  EditorView, Decoration, DecorationSet, WidgetType,
  ViewPlugin, ViewUpdate, keymap, placeholder,
} from '@codemirror/view';
import { defaultKeymap, historyKeymap, history } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { syntaxHighlighting, defaultHighlightStyle, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import katex from 'katex';
import type { LatticeProvider, PresenceState } from '@/lib/lattice-provider';

const LOCAL_ORIGIN   = Symbol('cm-local');
const syncAnnotation = Annotation.define<true>();

const mdHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontSize: '1.75em', fontWeight: '700', lineHeight: '1.3' },
  { tag: tags.heading2, fontSize: '1.4em',  fontWeight: '700', lineHeight: '1.3' },
  { tag: tags.heading3, fontSize: '1.2em',  fontWeight: '600' },
  { tag: tags.strong,   fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.monospace, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', background: 'rgba(0,0,0,0.06)', borderRadius: '3px', padding: '1px 4px' },
  { tag: tags.link,  color: '#2563eb', textDecoration: 'underline' },
  { tag: tags.quote, color: '#6b7280', fontStyle: 'italic' },
  { tag: tags.processingInstruction, color: '#9ca3af' },
]);

const setCursorsEffect = StateEffect.define<PresenceState[]>();

class CursorWidget extends WidgetType {
  constructor(readonly color: string, readonly name: string) { super(); }
  toDOM() {
    const el    = document.createElement('span');
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

// ── LaTeX math widget ────────────────────────────────────────────────────────

class MathWidget extends WidgetType {
  constructor(readonly latex: string, readonly display: boolean, readonly from: number) { super(); }

  eq(other: MathWidget) {
    return other.latex === this.latex && other.display === this.display && other.from === this.from;
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = this.display ? 'cm-math-widget cm-math-display' : 'cm-math-widget';
    span.dataset.mathFrom = String(this.from);
    span.innerHTML = katex.renderToString(this.latex, {
      throwOnError: false,
      displayMode: this.display,
    });
    return span;
  }

  ignoreEvent() { return false; }
}

interface MathRange { from: number; to: number; latex: string; display: boolean; }

// NOTE: using /gs here for multiline $$ blocks — will need to fix tsconfig target later
const MATH_RE = /\$\$(.+?)\$\$/gs;

function scanMathRanges(lineText: string, lineOffset: number): MathRange[] {
  const ranges: MathRange[] = [];
  MATH_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MATH_RE.exec(lineText)) !== null) {
    const latex = m[1].trim();
    if (!latex) continue;
    ranges.push({ from: lineOffset + m.index, to: lineOffset + m.index + m[0].length, latex, display: true });
  }
  return ranges;
}


const mathDecoEffect = StateEffect.define<MathRange[]>();

const mathDecoField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decos, tr) {
    decos = decos.map(tr.changes);
    for (const eff of tr.effects) {
      if (!eff.is(mathDecoEffect)) continue;
      const builder = new RangeSetBuilder<Decoration>();
      for (const r of eff.value) {
        builder.add(r.from, r.to, Decoration.replace({ widget: new MathWidget(r.latex, r.display, r.from) }));
      }
      decos = builder.finish();
    }
    return decos;
  },
  provide: f => EditorView.decorations.from(f),
});

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
        placeholder('Start writing here…'),
        EditorView.lineWrapping,
        mathDecoField,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const t = update.state.doc.toString();
            onWordCount?.(t.trim() ? t.trim().split(/\s+/).length : 0, t.length);
          }
          if (update.docChanged || update.viewportChanged) {
            const effects: StateEffect<MathRange[]>[] = [];
            for (let i = 1; i <= update.state.doc.lines; i++) {
              const line = update.state.doc.line(i);
              effects.push(mathDecoEffect.of(scanMathRanges(line.text, line.from)));
            }
            // batch deferred so we don't dispatch inside an update
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

    const yjsObserver = (delta: Y.YTextEvent) => {
      if (delta.transaction.origin === LOCAL_ORIGIN) return;
      let pos = 0;
      const changes: { from: number; to?: number; insert?: string }[] = [];
      delta.delta.forEach((op) => {
        if (op.retain)  { pos += op.retain; }
        else if (op.delete) { changes.push({ from: pos, to: pos + op.delete }); pos += op.delete; }
        else if (op.insert) { changes.push({ from: pos, insert: String(op.insert) }); }
      });
      if (changes.length > 0) view.dispatch({ changes, annotations: syncAnnotation.of(true) });
    };
    yText.observe(yjsObserver);

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

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setCursorsEffect.of(cursors) });
  }, [cursors]);

  return <div ref={containerRef} className="cm-editor-host" />;
}
