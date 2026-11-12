import { parse } from 'pele';
import { escapeText, oneLine, readDescription, unescapeText, type KindMeta } from './kinds';
import { readTitle, readTitleAlign, setMetaDescription } from './mermaid';
import type { TitleAlign } from './model';

export type KanbanPriority = '' | 'Very High' | 'High' | 'Low' | 'Very Low';

export interface KanbanCard {
  id: string;
  text: string;
  /** Who has the card. */
  assigned: string;
  /** A reference such as ABC-123. */
  ticket: string;
  priority: KanbanPriority;
}

export interface KanbanColumn {
  id: string;
  name: string;
  cards: KanbanCard[];
}

export interface Kanban {
  columns: KanbanColumn[];
}

export const PRIORITIES: { id: KanbanPriority; name: string }[] = [
  { id: '', name: 'No priority' },
  { id: 'Very High', name: 'Very high' },
  { id: 'High', name: 'High' },
  { id: 'Low', name: 'Low' },
  { id: 'Very Low', name: 'Very low' },
];

export const allCards = (k: Kanban): { card: KanbanCard; column: KanbanColumn; columnIndex: number; index: number }[] =>
  k.columns.flatMap((column, columnIndex) => column.cards.map((card, index) => ({ card, column, columnIndex, index })));

export function findCard(k: Kanban, id: string): { card: KanbanCard; column: KanbanColumn; columnIndex: number; index: number } | null {
  return allCards(k).find((x) => x.card.id === id) ?? null;
}

export function nextKanbanId(k: Kanban, prefix: 'c' | 'k'): string {
  const used = new Set<string>();
  for (const column of k.columns) {
    used.add(column.id);
    for (const card of column.cards) used.add(card.id);
  }
  let n = used.size + 1;
  while (used.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

/** Move a card to sit at `index` in a column (counted before the card is lifted out). */
export function moveCard(k: Kanban, id: string, columnIndex: number, index: number): boolean {
  const from = findCard(k, id);
  const target = k.columns[columnIndex];
  if (!from || !target) return false;
  from.column.cards.splice(from.index, 1);
  const at = from.column === target && from.index < index ? index - 1 : index;
  target.cards.splice(Math.max(0, Math.min(at, target.cards.length)), 0, from.card);
  return true;
}

const card = (id: string, text: string): KanbanCard => ({ id, text, assigned: '', ticket: '', priority: '' });

export function starterKanban(): Kanban {
  return {
    columns: [
      { id: 'c1', name: 'To do', cards: [card('k2', 'Write the spec'), card('k3', 'Draw the screens')] },
      { id: 'c4', name: 'In progress', cards: [card('k5', 'Build the editor')] },
      { id: 'c6', name: 'Done', cards: [card('k7', 'Set up the project')] },
    ],
  };
}

// ───────────────────────────── Writing Mermaid ─────────────────────────────

/** Text inside the brackets: nothing Mermaid could read as part of the line's structure. */
function safe(text: string, fallback: string): string {
  const out = escapeText(oneLine(text)).replace(/[[\](){}"]/g, (c) => `#${c.charCodeAt(0)};`);
  return out || fallback;
}

/** A value inside the card's `@{ }` block. */
const value = (text: string): string => `'${oneLine(text).replace(/["']/g, '’').replace(/[{},]/g, ' ')}'`;

export function kanbanToMermaid(k: Kanban, meta: KindMeta): string {
  if (!k.columns.length) return '';
  const title = oneLine(meta.title);
  const lines: string[] = [];
  // Pele's kanban reads every line under the header as a column, so there are no accTitle or accDescr lines.
  if (title) lines.push('---', `title: ${JSON.stringify(title)}`, '---');
  lines.push('kanban');
  k.columns.forEach((column, ci) => {
    lines.push(`  c${ci + 1}[${safe(column.name, 'Column')}]`);
    column.cards.forEach((c, i) => {
      const extras: string[] = [];
      if (oneLine(c.assigned)) extras.push(`assigned: ${value(c.assigned)}`);
      if (oneLine(c.ticket)) extras.push(`ticket: ${value(c.ticket)}`);
      if (c.priority) extras.push(`priority: '${c.priority}'`);
      lines.push(`    c${ci + 1}k${i + 1}[${safe(c.text, 'Card')}]${extras.length ? `@{ ${extras.join(', ')} }` : ''}`);
    });
  });
  return setMetaDescription(lines.join('\n'), meta.description);
}

// ───────────────────────────── Reading Mermaid ─────────────────────────────

export type KanbanImport =
  | { ok: true; kanban: Kanban; title: string; description: string; titleAlign: TitleAlign }
  | { ok: false; reason: string };

const UNSUPPORTED = 'This board uses card details the visual editor does not cover.';

/** `id[Text]@{ key: 'value' }`, where each part after the id is optional. */
const LINE = /^([^\s[\]@]+)\s*(?:\[(.*?)\])?\s*(?:@\{(.*)\})?$/;

function readExtras(text: string): Pick<KanbanCard, 'assigned' | 'ticket' | 'priority'> | null {
  const out: Pick<KanbanCard, 'assigned' | 'ticket' | 'priority'> = { assigned: '', ticket: '', priority: '' };
  const pair = /\s*(\w+)\s*:\s*(?:'([^']*)'|"([^"]*)"|([^,}'"\s][^,}]*?))\s*(,|$)/y;
  let at = 0;
  const body = text.trim();
  while (at < body.length) {
    pair.lastIndex = at;
    const m = pair.exec(body);
    if (!m) return null;
    const val = unescapeText(m[2] ?? m[3] ?? m[4]);
    if (m[1] === 'assigned' || m[1] === 'ticket') out[m[1]] = val;
    else if (m[1] === 'priority' && PRIORITIES.some((p) => p.id === val && val)) out.priority = val as KanbanPriority;
    else return null;
    at = pair.lastIndex;
    if (m[5] === '' && at < body.length) return null;
  }
  return out;
}

export function kanbanFromMermaid(source: string): KanbanImport {
  try {
    parse(source);
  } catch (error) {
    const line = (error as { line?: number } | null)?.line;
    return { ok: false, reason: line ? `There is a syntax error on line ${line}.` : 'The source could not be read as a diagram.' };
  }
  const body = source.replace(/^\s*---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '');
  const k: Kanban = { columns: [] };
  let started = false;
  let columnIndent = -1;
  let counter = 0;

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('%%')) continue;
    if (!started) {
      if (line !== 'kanban') return { ok: false, reason: /^kanban/.test(line) ? UNSUPPORTED : 'Only kanban boards can be edited here.' };
      started = true;
      continue;
    }
    const indent = raw.length - raw.trimStart().length;
    const m = LINE.exec(line);
    if (!m) return { ok: false, reason: UNSUPPORTED };
    const text = unescapeText(m[2] ?? m[1]);
    if (columnIndent < 0) columnIndent = indent;
    if (indent <= columnIndent) {
      if (m[3] !== undefined) return { ok: false, reason: UNSUPPORTED };
      counter += 1;
      k.columns.push({ id: `c${counter}`, name: text || 'Column', cards: [] });
      continue;
    }
    const column = k.columns[k.columns.length - 1];
    if (!column) return { ok: false, reason: UNSUPPORTED };
    const extras = m[3] === undefined ? { assigned: '', ticket: '', priority: '' as KanbanPriority } : readExtras(m[3]);
    if (!extras) return { ok: false, reason: UNSUPPORTED };
    counter += 1;
    column.cards.push({ id: `k${counter}`, text: text || 'Card', ...extras });
  }
  if (!started) return { ok: false, reason: 'Only kanban boards can be edited here.' };
  return { ok: true, kanban: k, title: readTitle(source), description: readDescription(source), titleAlign: readTitleAlign(source) };
}
