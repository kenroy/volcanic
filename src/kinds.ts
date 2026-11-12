import { FRONT_MATTER, readMetaDescription } from './mermaid';

/** Diagram types that have a visual editor. Everything else is edited as text. */
export type Kind = 'flowchart' | 'sequence' | 'gantt' | 'mindmap' | 'journey' | 'pie' | 'radar' | 'quadrant' | 'timeline' | 'xychart' | 'kanban' | 'sankey' | 'treemap' | 'packet' | 'state' | 'er' | 'class';

export interface KindMeta {
  title: string;
  description: string;
}

export type SetIcon = (el: HTMLElement, icon: string) => void;

/** What the shared editor gives each visual editor. */
export interface KindHost {
  setIcon: SetIcon;
  /** Say something through the live status line. */
  announce(message: string): void;
  /** The diagram changed: refresh the preview, source and undo buttons. */
  changed(): void;
}

/** A visual editor for one diagram type. The shared editor owns title, preview and buttons. */
export interface KindEditor {
  readonly el: HTMLElement;
  /** Complete Mermaid source, or '' when there is nothing to draw yet. */
  source(meta: KindMeta): string;
  /** True while the diagram is still the untouched starter. */
  isPristine(): boolean;
  focus(): void;
  /** Cancel an in-progress inline edit. True if there was one. */
  cancelTransient?(): boolean;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  destroy(): void;
}

const ENTITIES: Record<string, string> = { quot: '"', amp: '&', lt: '<', gt: '>' };

/** Make text safe to put on one Mermaid line. */
export function escapeText(text: string, colons = false): string {
  // One pass, so the ";" inside an entity such as "#35;" is never escaped again.
  const pattern = colons ? /[#;:]/g : /[#;]/g;
  return text
    .replace(/\r/g, '')
    .replace(pattern, (c) => `#${c.charCodeAt(0)};`)
    .replace(/\n/g, '<br/>');
}

export function unescapeText(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/#(quot|amp|lt|gt);/g, (_, name: string) => ENTITIES[name])
    .trim();
}

export function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Front matter title, the type's first line, and the accessible name and description. */
export function headerLines(type: string, meta: KindMeta): string[] {
  const title = oneLine(meta.title);
  const description = oneLine(meta.description);
  const lines: string[] = [];
  if (title) lines.push('---', `title: ${JSON.stringify(title)}`, '---');
  lines.push(type);
  if (title) lines.push(`    accTitle: ${title}`);
  if (description) lines.push(`    accDescr: ${description}`);
  return lines;
}

/** The source without its front matter. */
export function withoutFrontMatter(source: string): string {
  const front = FRONT_MATTER.exec(source);
  return front ? source.slice(front[0].length) : source;
}

export function readDescription(source: string): string {
  return /^[ \t]*accDescr[ \t]*:[ \t]*(.+)$/m.exec(source)?.[1].trim() ?? readMetaDescription(source);
}

/** The first meaningful line of a diagram's body, to tell types apart. */
export function bodyLines(source: string): string[] {
  return withoutFrontMatter(source).split(/\r?\n/);
}

/** Linear undo history of JSON snapshots. Rapid edits with the same tag merge into one step. */
export class History<T> {
  private stack: string[] = [];
  private index = -1;
  private lastTag = '';
  private lastTime = 0;

  constructor(initial: T) {
    this.push(initial);
  }

  push(value: T, tag = ''): void {
    const snapshot = JSON.stringify(value);
    if (snapshot === this.stack[this.index]) return;
    const now = Date.now();
    const merge = tag !== '' && tag === this.lastTag && now - this.lastTime < 1200 && this.index > 0;
    this.stack.length = this.index + 1;
    if (merge) this.stack[this.index] = snapshot;
    else this.stack.push(snapshot);
    this.index = this.stack.length - 1;
    this.lastTag = tag;
    this.lastTime = now;
  }

  undo(): T | null {
    if (this.index <= 0) return null;
    this.index -= 1;
    this.lastTag = '';
    return JSON.parse(this.stack[this.index]) as T;
  }

  redo(): T | null {
    if (this.index >= this.stack.length - 1) return null;
    this.index += 1;
    this.lastTag = '';
    return JSON.parse(this.stack[this.index]) as T;
  }

  get canUndo(): boolean {
    return this.index > 0;
  }

  get canRedo(): boolean {
    return this.index < this.stack.length - 1;
  }
}
