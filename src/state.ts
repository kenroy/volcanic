import { parse } from 'pele';
import { escapeText, headerLines, oneLine, readDescription, unescapeText, type KindMeta } from './kinds';
import { readTitle, readTitleAlign } from './mermaid';
import type { TitleAlign } from './model';

/** The black dot a state machine starts from. Only a transition can leave it. */
export const START = '*start';
/** The ringed dot it finishes in. Only a transition can arrive at it. */
export const END = '*end';

export interface StateBox {
  id: string;
  /** What the diagram shows inside the box. */
  name: string;
}

export interface Transition {
  id: string;
  /** A state's id, or START. */
  from: string;
  /** A state's id, or END. */
  to: string;
  label: string;
}

export type Direction = 'TB' | 'BT' | 'LR' | 'RL';

export interface StateDiagram {
  states: StateBox[];
  transitions: Transition[];
  direction: Direction;
}

export const DIRECTIONS: { id: Direction; name: string }[] = [
  { id: 'TB', name: 'Top to bottom' },
  { id: 'LR', name: 'Left to right' },
  { id: 'BT', name: 'Bottom to top' },
  { id: 'RL', name: 'Right to left' },
];

export const stateName = (text: string): string => oneLine(text);

export function nextStateId(d: StateDiagram): string {
  const used = new Set(d.states.map((s) => s.id));
  let n = used.size + 1;
  while (used.has(`s${n}`)) n += 1;
  return `s${n}`;
}

export function nextTransitionId(d: StateDiagram): string {
  const used = new Set(d.transitions.map((t) => t.id));
  let n = used.size + 1;
  while (used.has(`t${n}`)) n += 1;
  return `t${n}`;
}

/** What each state does: how many transitions arrive and leave. */
export function usesOf(d: StateDiagram, id: string): { into: number; out: number } {
  return {
    into: d.transitions.filter((t) => t.to === id).length,
    out: d.transitions.filter((t) => t.from === id).length,
  };
}

/** States nothing leads to and states with nowhere to go, which usually means a transition is missing. */
export function loose(d: StateDiagram): { unreachable: StateBox[]; stuck: StateBox[]; alone: StateBox[] } {
  const unreachable: StateBox[] = [];
  const stuck: StateBox[] = [];
  const alone: StateBox[] = [];
  for (const s of d.states) {
    const { into, out } = usesOf(d, s.id);
    if (!into && !out) alone.push(s);
    else if (!into) unreachable.push(s);
    else if (!out) stuck.push(s);
  }
  return { unreachable, stuck, alone };
}

/** States with the same name, which look like one state in the picture. */
export function duplicateNames(d: StateDiagram): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const s of d.states) {
    const name = stateName(s.name).toLowerCase();
    if (!name) continue;
    if (seen.has(name)) dupes.add(stateName(s.name));
    seen.add(name);
  }
  return [...dupes];
}

export function starterState(): StateDiagram {
  return {
    direction: 'TB',
    states: [
      { id: 's1', name: 'Idle' },
      { id: 's2', name: 'Running' },
      { id: 's3', name: 'Paused' },
    ],
    transitions: [
      { id: 't1', from: START, to: 's1', label: '' },
      { id: 't2', from: 's1', to: 's2', label: 'start' },
      { id: 't3', from: 's2', to: 's3', label: 'pause' },
      { id: 't4', from: 's3', to: 's2', label: 'resume' },
      { id: 't5', from: 's2', to: 's1', label: 'stop' },
      { id: 't6', from: 's2', to: END, label: 'crash' },
    ],
  };
}

// ───────────────────────────── Writing Mermaid ─────────────────────────────

/** Words Mermaid reads as part of its own syntax, which a state cannot be called. */
const RESERVED = new Set(['state', 'note', 'end', 'direction', 'classdef', 'class', 'style', 'click', 'hide', 'scale', 'title', 'acctitle', 'accdescr', 'as', 'default', 'fork', 'join', 'choice', 'left', 'right', 'of']);
const PLAIN = /^[A-Za-z_]\w*$/;

/** A label in quotes. State text has no way to hold a quote mark, so those become apostrophes. */
const quoted = (text: string): string => `"${text.replace(/"/g, "'")}"`;

/** The names Mermaid will know each state by: the label itself when that is a plain word, otherwise a short code. */
function idsFor(d: StateDiagram): Map<string, { code: string; declare: boolean; label: string }> {
  const out = new Map<string, { code: string; declare: boolean; label: string }>();
  const taken = new Set<string>();
  let counter = 0;
  for (const s of d.states) {
    const label = stateName(s.name) || 'State';
    let code = label;
    let declare = false;
    if (!PLAIN.test(label) || RESERVED.has(label.toLowerCase()) || taken.has(label)) {
      do {
        counter += 1;
        code = `s${counter}`;
      } while (taken.has(code) || d.states.some((o) => stateName(o.name) === code));
      declare = true;
    }
    taken.add(code);
    out.set(s.id, { code, declare, label });
  }
  return out;
}

export function stateToMermaid(d: StateDiagram, meta: KindMeta): string {
  if (!d.states.length && !d.transitions.length) return '';
  const ids = idsFor(d);
  const lines = headerLines('stateDiagram-v2', meta);
  if (d.direction !== 'TB') lines.push(`    direction ${d.direction}`);
  // Mermaid lists states in the order they first appear, so say so up front when the transitions alone would shuffle them.
  const appearing: string[] = [];
  for (const s of d.states) if (ids.get(s.id)!.declare) appearing.push(s.id);
  for (const t of d.transitions) for (const id of [t.from, t.to]) if (ids.has(id) && !appearing.includes(id)) appearing.push(id);
  for (const s of d.states) if (!appearing.includes(s.id)) appearing.push(s.id);
  const inOrder = appearing.every((id, i) => id === d.states[i].id);
  for (const s of d.states) {
    const info = ids.get(s.id)!;
    if (info.declare) lines.push(`    state ${quoted(escapeText(info.label))} as ${info.code}`);
    else if (!inOrder) lines.push(`    ${info.code}`);
  }
  const used = new Set<string>();
  const end = (id: string): string | null => {
    if (id === START || id === END) return '[*]';
    const info = ids.get(id);
    if (!info) return null;
    used.add(id);
    return info.code;
  };
  for (const t of d.transitions) {
    const from = end(t.from);
    const to = end(t.to);
    if (!from || !to) continue;
    const label = escapeText(oneLine(t.label));
    lines.push(`    ${from} --> ${to}${label ? `: ${label}` : ''}`);
  }
  // A state with no transition still needs a line of its own to appear.
  if (inOrder) {
    for (const s of d.states) {
      const info = ids.get(s.id)!;
      if (!used.has(s.id) && !info.declare) lines.push(`    ${info.code}`);
    }
  }
  return lines.join('\n');
}

// ───────────────────────────── Reading Mermaid ─────────────────────────────

export type StateImport =
  | { ok: true; diagram: StateDiagram; title: string; description: string; titleAlign: TitleAlign }
  | { ok: false; reason: string };

const UNSUPPORTED = 'This state diagram uses something the visual editor does not cover, such as nested states, notes or styling.';
const NAME = '(?:\\[\\*\\]|\\w+)';
const RELATION = new RegExp(`^(${NAME})\\s*-->\\s*(${NAME})(?:\\s*:\\s*(.+))?$`);
const DECLARE = /^state\s+(?:"([^"]*)"|'([^']*)')\s+as\s+(\w+)$/;
const DESCRIBE = /^(\w+)\s*:\s*(.+)$/;
const BARE = /^\w+$/;

export function stateFromMermaid(source: string): StateImport {
  try {
    parse(source);
  } catch (error) {
    const line = (error as { line?: number } | null)?.line;
    return { ok: false, reason: line ? `There is a syntax error on line ${line}.` : 'The source could not be read as a diagram.' };
  }
  const body = source.replace(/^\s*---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '');
  const d: StateDiagram = { states: [], transitions: [], direction: 'TB' };
  let started = false;
  // What each name in the text stands for.
  const byCode = new Map<string, StateBox>();
  const named = new Set<string>();

  const stateFor = (code: string): StateBox => {
    let box = byCode.get(code);
    if (!box) {
      box = { id: `s${d.states.length + 1}`, name: code };
      byCode.set(code, box);
      d.states.push(box);
    }
    return box;
  };
  const endpoint = (code: string, side: 'from' | 'to'): string => (code === '[*]' ? (side === 'from' ? START : END) : stateFor(code).id);

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('%%') || /^acc(Title|Descr)\s*:/.test(line)) continue;
    if (!started) {
      if (!/^stateDiagram(-v2)?$/.test(line)) return { ok: false, reason: /^stateDiagram/.test(line) ? UNSUPPORTED : 'Only state diagrams can be edited here.' };
      started = true;
      continue;
    }
    const direction = /^direction\s+(TB|BT|LR|RL)$/.exec(line);
    if (direction) {
      d.direction = direction[1] as Direction;
      continue;
    }
    const declared = DECLARE.exec(line);
    if (declared) {
      const code = declared[3];
      if (named.has(code)) return { ok: false, reason: UNSUPPORTED };
      named.add(code);
      stateFor(code).name = unescapeText(declared[1] ?? declared[2]) || code;
      continue;
    }
    const relation = RELATION.exec(line);
    if (relation) {
      d.transitions.push({
        id: `t${d.transitions.length + 1}`,
        from: endpoint(relation[1], 'from'),
        to: endpoint(relation[2], 'to'),
        label: relation[3] === undefined ? '' : unescapeText(relation[3]),
      });
      continue;
    }
    const described = DESCRIBE.exec(line);
    if (described && !RESERVED.has(described[1].toLowerCase())) {
      // Two descriptions on one state stack up as lines inside it, which the editor has no place for.
      if (named.has(described[1])) return { ok: false, reason: UNSUPPORTED };
      named.add(described[1]);
      stateFor(described[1]).name = unescapeText(described[2]) || described[1];
      continue;
    }
    if (BARE.test(line) && !RESERVED.has(line.toLowerCase())) {
      stateFor(line);
      continue;
    }
    return { ok: false, reason: UNSUPPORTED };
  }
  if (!started) return { ok: false, reason: 'Only state diagrams can be edited here.' };
  return { ok: true, diagram: d, title: readTitle(source), description: readDescription(source), titleAlign: readTitleAlign(source) };
}
