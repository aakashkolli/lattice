'use client';

import { useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { EditorState, StateEffect, StateField, Annotation, RangeSetBuilder } from '@codemirror/state';
import {
  EditorView,
  Decoration,
  DecorationSet,
  WidgetType,
  ViewPlugin,
  ViewUpdate,
  keymap,
  placeholder,
} from '@codemirror/view';
import { defaultKeymap, historyKeymap, history } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { syntaxHighlighting, defaultHighlightStyle, HighlightStyle, syntaxTree } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import katex from 'katex';
import type { LatticeProvider, PresenceState } from '@/lib/lattice-provider';

const LOCAL_ORIGIN = Symbol('cm-local');
const syncAnnotation = Annotation.define<true>();

// ── Highlight style: visual markdown rendering ──────────────────────────────
const mdHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontSize: '1.75em', fontWeight: '700', lineHeight: '1.3' },
  { tag: tags.heading2, fontSize: '1.4em', fontWeight: '700', lineHeight: '1.3' },
  { tag: tags.heading3, fontSize: '1.2em', fontWeight: '600' },
  { tag: tags.heading4, fontWeight: '600' },
  { tag: tags.heading5, fontWeight: '600' },
  { tag: tags.heading6, fontWeight: '600' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.monospace, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', background: 'rgba(0,0,0,0.06)', borderRadius: '3px', padding: '1px 4px' },
  { tag: tags.link, color: '#2563eb', textDecoration: 'underline' },
  { tag: tags.url, color: '#6b7280' },
  { tag: tags.quote, color: '#6b7280', fontStyle: 'italic' },
  { tag: tags.processingInstruction, color: '#9ca3af' },
  { tag: tags.meta, color: '#9ca3af' },
  { tag: tags.contentSeparator, color: '#d1d5db' },
]);

// ── Remote cursor decorations ───────────────────────────────────────────────
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

// ── LaTeX math widgets ──────────────────────────────────────────────────────

class MathWidget extends WidgetType {
  constructor(readonly latex: string, readonly display: boolean) { super(); }

  eq(other: MathWidget) {
    return other.latex === this.latex && other.display === this.display;
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = this.display ? 'cm-math-widget cm-math-display' : 'cm-math-widget';
    span.innerHTML = katex.renderToString(this.latex, {
      throwOnError: false,
      displayMode: this.display,
    });
    return span;
  }

  ignoreEvent() { return false; }
}

interface MathRange { from: number; to: number; latex: string; display: boolean; }

// Matches $$display$$ first, then $inline$ with Obsidian's rules:
//   - opening $ not followed by whitespace or another $
//   - closing $ not preceded by whitespace or another $
//   - content is non-empty
const MATH_RE = /\$\$(.+?)\$\$|\$(?!\$)(?!\s)(.+?)(?<!\s)\$(?!\$)/g;

function scanMathRanges(lineText: string, lineOffset: number): MathRange[] {
  const ranges: MathRange[] = [];
  MATH_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MATH_RE.exec(lineText)) !== null) {
    ranges.push({
      from: lineOffset + m.index,
      to: lineOffset + m.index + m[0].length,
      latex: m[1] !== undefined ? m[1] : m[2],
      display: m[1] !== undefined,
    });
  }
  return ranges;
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
        const head = Math.min(Math.max(c.cursorTo, 0), docLen);
        const anchor = Math.min(Math.max(c.cursorFrom, 0), docLen);
        if (anchor !== head) {
          const from = Math.min(anchor, head);
          const to = Math.max(anchor, head);
          items.push(
            Decoration.mark({ attributes: { style: `background:${c.color}33` } }).range(from, to),
          );
        }
        items.push(
          Decoration.widget({ widget: new CursorWidget(c.color, c.name), side: 1 }).range(head),
        );
      }
      items.sort((a, b) => a.from - b.from || a.to - b.to);
      decos = Decoration.set(items, true);
    }
    return decos;
  },
  provide: f => EditorView.decorations.from(f),
});

// ── WYSIWYG: hide markdown syntax on non-cursor lines (Obsidian-style) ─────
//
// Verified node names from lezer-markdown by inspecting the actual syntax tree:
//   HeaderMark  = just "#" chars (NOT the space) → extend by 1 space
//   QuoteMark   = just ">" char (NOT the space)  → extend by 1 space
//   ListMark    = just "-"/"*"/"1." (NOT space)  → extend by 1 space
//   EmphasisMark, StrikethroughMark              → exact range
//   CodeMark    = backtick(s), parent=InlineCode → exact range (skip FencedCode)
//   LinkMark    = "[", "]", "(", ")"  (all four) → exact range
//   URL (parent=Link|Image)                      → exact range (hides the href)
//   Image node                                   → hide leading "!" (from, from+1)

function buildHideDecos(view: EditorView): DecorationSet {
  const { state } = view;
  const hide = Decoration.replace({});
  const docLen = state.doc.length;

  // Every line that intersects any cursor or selection range stays revealed.
  const cursorLines = new Set<number>();
  for (const range of state.selection.ranges) {
    const fromLine = state.doc.lineAt(range.from).number;
    const toLine   = state.doc.lineAt(range.to).number;
    for (let l = fromLine; l <= toLine; l++) cursorLines.add(l);
  }

  const pending: { from: number; to: number }[] = [];

  syntaxTree(state).iterate({
    from: view.viewport.from,
    to: view.viewport.to,
    enter(node) {
      const line = state.doc.lineAt(node.from).number;
      if (cursorLines.has(line)) return;

      switch (node.name) {
        // Block marks: must also swallow the trailing space separator so the
        // heading/quote/list text is not indented after the mark disappears.
        case 'HeaderMark':
        case 'QuoteMark':
        case 'ListMark': {
          let to = node.to;
          if (to < docLen && state.doc.sliceString(to, to + 1) === ' ') to++;
          pending.push({ from: node.from, to });
          break;
        }

        // Inline emphasis / strikethrough — hide exact mark range.
        case 'EmphasisMark':
        case 'StrikethroughMark':
          pending.push({ from: node.from, to: node.to });
          break;

        // Backtick(s) — only for inline code; keep fenced-code fences visible.
        case 'CodeMark':
          if (node.node.parent?.name === 'InlineCode') {
            pending.push({ from: node.from, to: node.to });
          }
          break;

        // Link / image punctuation — LinkMark covers all four chars [ ] ( )
        case 'LinkMark':
          pending.push({ from: node.from, to: node.to });
          break;

        // The href text between the parens — hide it for links and images.
        case 'URL':
          if (node.node.parent?.name === 'Link' || node.node.parent?.name === 'Image') {
            pending.push({ from: node.from, to: node.to });
          }
          break;

        // Image: the leading "!" is not a named child node — hide it here.
        case 'Image':
          pending.push({ from: node.from, to: node.from + 1 });
          break;
      }
    },
  });

  // RangeSetBuilder requires strictly ascending, non-overlapping ranges.
  pending.sort((a, b) => a.from - b.from || a.to - b.to);

  const builder = new RangeSetBuilder<Decoration>();
  let prevTo = -1;
  for (const { from, to } of pending) {
    if (from >= prevTo) {
      builder.add(from, to, hide);
      prevTo = to;
    }
  }
  return builder.finish();
}

const hideMarksPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = buildHideDecos(view); }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged) {
        this.decorations = buildHideDecos(u.view);
      }
    }
  },
  { decorations: v => v.decorations },
);

// ── Math decorations plugin ─────────────────────────────────────────────────

function buildMathDecos(view: EditorView): DecorationSet {
  const { state } = view;

  const cursorLines = new Set<number>();
  for (const range of state.selection.ranges) {
    const fromLine = state.doc.lineAt(range.from).number;
    const toLine   = state.doc.lineAt(range.to).number;
    for (let l = fromLine; l <= toLine; l++) cursorLines.add(l);
  }

  type MathEntry = { from: number; to: number; latex: string; display: boolean; block: boolean };
  const collected: MathEntry[] = [];
  const blockLines = new Set<number>(); // lines consumed by multi-line $$ fences

  // ── Pass 1: multi-line display blocks ($$\n...\n$$) ─────────────────────
  // Scan the whole doc so blocks that open before the viewport are still found.
  let openFence: { num: number; from: number } | null = null;

  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i);
    if (line.text.trim() !== '$$') continue;

    if (openFence === null) {
      openFence = { num: i, from: line.from };
    } else {
      const nums: number[] = [];
      for (let l = openFence.num; l <= i; l++) nums.push(l);
      nums.forEach(l => blockLines.add(l));

      if (!nums.some(l => cursorLines.has(l))) {
        const contentLines: string[] = [];
        for (let l = openFence.num + 1; l < i; l++) {
          contentLines.push(state.doc.line(l).text);
        }
        const latex = contentLines.join('\n').trim();
        if (latex) {
          collected.push({ from: openFence.from, to: line.to, latex, display: true, block: true });
        }
      }
      openFence = null;
    }
  }

  // ── Pass 2: single-line math on visible non-block lines ──────────────────
  const startLine = state.doc.lineAt(view.viewport.from).number;
  const endLine   = state.doc.lineAt(view.viewport.to).number;

  for (let i = startLine; i <= endLine; i++) {
    if (blockLines.has(i) || cursorLines.has(i)) continue;
    const line = state.doc.line(i);
    if (!line.text.includes('$')) continue;
    for (const r of scanMathRanges(line.text, line.from)) {
      collected.push({ ...r, block: false });
    }
  }

  // ── Build decoration set (must be ascending, non-overlapping) ────────────
  collected.sort((a, b) => a.from - b.from);

  const builder = new RangeSetBuilder<Decoration>();
  let prevTo = -1;
  for (const { from, to, latex, display, block } of collected) {
    if (from >= prevTo) {
      builder.add(from, to, Decoration.replace({ widget: new MathWidget(latex, display), block }));
      prevTo = to;
    }
  }

  return builder.finish();
}

const mathPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = buildMathDecos(view); }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged) {
        this.decorations = buildMathDecos(u.view);
      }
    }
  },
  { decorations: v => v.decorations },
);

// ── Minimal-diff yjs update (same algorithm as TextEditor) ──────────────────
function applyDiff(yText: Y.Text, oldStr: string, newStr: string) {
  const min = Math.min(oldStr.length, newStr.length);
  let pre = 0;
  while (pre < min && oldStr[pre] === newStr[pre]) pre++;
  let oldEnd = oldStr.length;
  let newEnd = newStr.length;
  while (oldEnd > pre && newEnd > pre && oldStr[oldEnd - 1] === newStr[newEnd - 1]) { oldEnd--; newEnd--; }
  if (oldEnd - pre > 0) yText.delete(pre, oldEnd - pre);
  const ins = newStr.slice(pre, newEnd);
  if (ins.length > 0) yText.insert(pre, ins);
}

interface Props {
  yText: Y.Text;
  provider: LatticeProvider;
  cursors: PresenceState[];
  onWordCount?: (words: number, chars: number) => void;
  onCursorMove?: (from: number, to: number) => void;
}

export function MarkdownEditor({ yText, cursors, onWordCount, onCursorMove }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const prevRef = useRef('');
  const onWordCountRef = useRef(onWordCount);
  const onCursorMoveRef = useRef(onCursorMove);

  useEffect(() => { onWordCountRef.current = onWordCount; }, [onWordCount]);
  useEffect(() => { onCursorMoveRef.current = onCursorMove; }, [onCursorMove]);

  // Initialize editor once per yText instance
  useEffect(() => {
    if (!containerRef.current) return;

    const initial = yText.toString();
    prevRef.current = initial;

    const view = new EditorView({
      state: EditorState.create({
        doc: initial,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          syntaxHighlighting(mdHighlight),
          remoteCursorsField,
          hideMarksPlugin,
          mathPlugin,
          EditorView.lineWrapping,
          placeholder('Start writing here… Share the URL to collaborate in real time.'),
          EditorView.theme({
            '.cm-content': {
              fontFamily: 'var(--font)',
              fontSize: '15px',
              lineHeight: '1.75',
              padding: '40px 48px',
              maxWidth: '680px',
              margin: '0 auto',
              caretColor: '#0a0a0a',
            },
            '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
              background: 'rgba(0,0,0,0.1)',
            },
            '.cm-cursor, .cm-dropCursor': {
              borderLeftColor: '#0a0a0a',
              borderLeftWidth: '2px',
            },
            '.cm-activeLine': { background: 'rgba(0,0,0,0.025)' },
            '.cm-line': { padding: '0' },
            '.cm-placeholder': { color: '#a3a3a3' },
          }),
          EditorView.updateListener.of((update) => {
            const isSync = update.transactions.some(tr => tr.annotation(syncAnnotation));

            if (update.docChanged && !isSync) {
              const next = update.state.doc.toString();
              const prev = prevRef.current;
              if (next !== prev) {
                yText.doc!.transact(() => applyDiff(yText, prev, next), LOCAL_ORIGIN);
                prevRef.current = next;
                const w = next.trim() ? next.trim().split(/\s+/).length : 0;
                onWordCountRef.current?.(w, next.length);
              }
            }

            if (update.selectionSet || update.docChanged) {
              const sel = update.state.selection.main;
              onCursorMoveRef.current?.(sel.anchor, sel.head);
            }
          }),
        ],
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;

    const w = initial.trim() ? initial.trim().split(/\s+/).length : 0;
    onWordCountRef.current?.(w, initial.length);

    // yText → CM: apply remote deltas as CM transactions
    const yObserver = (event: Y.YTextEvent) => {
      if (event.transaction.origin === LOCAL_ORIGIN) return;
      const v = viewRef.current;
      if (!v) return;

      let pos = 0;
      const changes: { from: number; to: number; insert: string }[] = [];

      for (const op of event.changes.delta as Array<{ retain?: number; insert?: string; delete?: number }>) {
        if (op.retain) {
          pos += op.retain;
        } else if (op.insert) {
          changes.push({ from: pos, to: pos, insert: op.insert });
          pos += op.insert.length;
        } else if (op.delete) {
          changes.push({ from: pos, to: pos + op.delete, insert: '' });
        }
      }

      if (changes.length > 0) {
        v.dispatch({ changes, annotations: [syncAnnotation.of(true)] });
        prevRef.current = v.state.doc.toString();
        const content = prevRef.current;
        const w = content.trim() ? content.trim().split(/\s+/).length : 0;
        onWordCountRef.current?.(w, content.length);
      }
    };

    yText.observe(yObserver);

    return () => {
      yText.unobserve(yObserver);
      view.destroy();
      viewRef.current = null;
    };
  }, [yText]);

  // Push remote cursor updates into CM without remounting
  useEffect(() => {
    viewRef.current?.dispatch({ effects: setCursorsEffect.of(cursors) });
  }, [cursors]);

  return <div ref={containerRef} className="document-body cm-md-host" />;
}
