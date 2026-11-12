import { parse } from 'pele';
import { headerLines, oneLine, readDescription, type KindMeta } from './kinds';
import { readTitle, readTitleAlign } from './mermaid';
import type { TitleAlign } from './model';

export type ArchElementKind = 'service' | 'group' | 'junction';
export type ArchIcon = '' | 'internet' | 'cloud' | 'database' | 'disk' | 'server';
export type ArchSide = 'T' | 'R' | 'B' | 'L';
/** `line` is plain; `to` has an arrowhead at the second end, `from` at the first. */
export type ArchArrows = 'line' | 'to' | 'from' | 'both';

export interface ArchElement {
  id: string;
  kind: ArchElementKind;
  /** The name shown (a junction has none). */
  label: string;
  icon: ArchIcon;
  /** The id of the group it sits in, or '' for none. */
  parent: string;
  /** The word Mermaid knows it by. Kept so saving does not rename what you wrote. */
  code: string;
}

export interface ArchConnection {
  id: string;
  from: string;
  fromSide: ArchSide;
  to: string;
  toSide: ArchSide;
  arrows: ArchArrows;
}

export interface Architecture {
  elements: ArchElement[];
  connections: ArchConnection[];
}

export const ELEMENT_KINDS: { id: ArchElementKind; name: string }[] = [
  { id: 'service', name: 'Service' },
  { id: 'group', name: 'Group' },
  { id: 'junction', name: 'Junction' },
];

export const ARCH_ICONS: { id: ArchIcon; name: string }[] = [
  { id: '', name: 'No icon' },
  { id: 'server', name: 'Server' },
  { id: 'database', name: 'Database' },
  { id: 'disk', name: 'Disk' },
  { id: 'cloud', name: 'Cloud' },
  { id: 'internet', name: 'Internet' },
];

export const ARCH_SIDES: { id: ArchSide; name: string }[] = [
  { id: 'T', name: 'Top' },
  { id: 'R', name: 'Right' },
  { id: 'B', name: 'Bottom' },
  { id: 'L', name: 'Left' },
];

export const ARCH_ARROWS: { id: ArchArrows; name: string }[] = [
  { id: 'line', name: 'line' },
  { id: 'to', name: 'arrow to' },
  { id: 'from', name: 'arrow from' },
  { id: 'both', name: 'both ways' },
];

export const elementLabel = (e: ArchElement): string => (e.kind === 'junction' ? 'Junction' : oneLine(e.label));

export function nextElementId(a: Architecture, prefix: 'e' | 'k'): string {
  const used = new Set([...a.elements.map((e) => e.id), ...a.connections.map((c) => c.id)]);
  let n = used.size + 1;
  while (used.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

/** The ids of a group and everything inside it, so it cannot be put inside itself. */
export function insideOf(a: Architecture, id: string): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of a.elements) if (e.parent && out.has(e.parent) && !out.has(e.id)) out.add(e.id), (grew = true);
  }
  return out;
}

/** Services and junctions: the things a connection can join. */
export const joinable = (a: Architecture): ArchElement[] => a.elements.filter((e) => e.kind !== 'group');

/** Elements nothing connects to. */
export function unconnectedElements(a: Architecture): ArchElement[] {
  return joinable(a).filter((e) => !a.connections.some((c) => c.from === e.id || c.to === e.id));
}

export function starterArchitecture(): Architecture {
  const el = (id: string, kind: ArchElementKind, label: string, icon: ArchIcon, parent = '', code = id): ArchElement => ({ id, kind, label, icon, parent, code });
  return {
    elements: [
      el('e1', 'group', 'API', 'cloud', '', 'api'),
      el('e2', 'service', 'Database', 'database', 'e1', 'db'),
      el('e3', 'service', 'Disk', 'disk', 'e1', 'disk'),
      el('e4', 'service', 'Server', 'server', 'e1', 'server'),
    ],
    connections: [
      { id: 'k1', from: 'e2', fromSide: 'L', to: 'e4', toSide: 'R', arrows: 'line' },
      { id: 'k2', from: 'e3', fromSide: 'T', to: 'e2', toSide: 'B', arrows: 'line' },
    ],
  };
}

// ───────────────────────────── Writing Mermaid ─────────────────────────────

const RESERVED = new Set(['service', 'group', 'junction', 'in', 'title', 'acctitle', 'accdescr', 'architecture', 'beta']);
const AUTO = /^(?:e|k)\d+$/;

/** The word each element goes by: what was read, or one made from its label when it is new. */
function codesFor(a: Architecture): Map<string, string> {
  const out = new Map<string, string>();
  const taken = new Set<string>();
  const claim = (code: string): string => {
    let c = code;
    let n = 1;
    while (taken.has(c) || RESERVED.has(c.toLowerCase())) {
      n += 1;
      c = `${code}_${n}`;
    }
    taken.add(c);
    return c;
  };
  // Words that came from the source keep their place first.
  for (const e of a.elements) if (e.code && !AUTO.test(e.code)) out.set(e.id, claim(e.code));
  for (const e of a.elements) {
    if (out.has(e.id)) continue;
    const slug = oneLine(e.label).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const base = slug ? (/^\d/.test(slug) ? `n_${slug}` : slug) : e.kind;
    out.set(e.id, claim(base));
  }
  return out;
}

/** Text that can sit inside [ ] on a line of its own. */
const label = (text: string): string => oneLine(text).replace(/[[\]]/g, (c) => (c === '[' ? '(' : ')'));

export function architectureToMermaid(a: Architecture, meta: KindMeta): string {
  if (!a.elements.length) return '';
  const codes = codesFor(a);
  const lines = headerLines('architecture-beta', meta);
  const line = (e: ArchElement): string => {
    const code = codes.get(e.id)!;
    const where = e.parent && codes.has(e.parent) ? ` in ${codes.get(e.parent)}` : '';
    if (e.kind === 'junction') return `    junction ${code}${where}`;
    const text = label(e.label);
    return `    ${e.kind} ${code}${e.icon ? `(${e.icon})` : ''}${text ? `[${text}]` : ''}${where}`;
  };
  // A group has to be declared before whatever sits in it.
  const done = new Set<string>();
  const emit = (e: ArchElement, depth = 0): void => {
    if (done.has(e.id) || depth > a.elements.length) return;
    const parent = a.elements.find((p) => p.id === e.parent && p.kind === 'group');
    if (parent) emit(parent, depth + 1);
    done.add(e.id);
    lines.push(line(parent ? e : { ...e, parent: '' }));
  };
  for (const e of a.elements.filter((x) => x.kind === 'group')) emit(e);
  for (const e of a.elements.filter((x) => x.kind !== 'group')) emit(e);
  for (const c of a.connections) {
    const from = codes.get(c.from);
    const to = codes.get(c.to);
    if (!from || !to) continue;
    const left = c.arrows === 'from' || c.arrows === 'both' ? '<' : '';
    const right = c.arrows === 'to' || c.arrows === 'both' ? '>' : '';
    lines.push(`    ${from}:${c.fromSide} ${left}--${right} ${c.toSide}:${to}`);
  }
  return lines.join('\n');
}

// ───────────────────────────── Reading Mermaid ─────────────────────────────

export type ArchitectureImport =
  | { ok: true; architecture: Architecture; title: string; description: string; titleAlign: TitleAlign }
  | { ok: false; reason: string };

const UNSUPPORTED = 'This architecture diagram uses something the visual editor does not cover, such as custom icons, group borders or labelled edges.';
const ID = '[\\w-]+';
const NODE = new RegExp(`^(service|group)\\s+(${ID})(?:\\(([\\w:-]+)\\))?(?:\\[([^\\]]*)\\])?(?:\\s+in\\s+(${ID}))?$`);
const JUNCTION = new RegExp(`^junction\\s+(${ID})(?:\\s+in\\s+(${ID}))?$`);
const EDGE = new RegExp(`^(${ID}):([TBLR])\\s*(<)?--(>)?\\s*([TBLR]):(${ID})$`);
const KNOWN_ICONS = new Set<string>(ARCH_ICONS.map((i) => i.id).filter(Boolean));

export function architectureFromMermaid(source: string): ArchitectureImport {
  try {
    parse(source);
  } catch (error) {
    const line = (error as { line?: number } | null)?.line;
    return { ok: false, reason: line ? `There is a syntax error on line ${line}.` : 'The source could not be read as a diagram.' };
  }
  const body = source.replace(/^\s*---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '');
  const a: Architecture = { elements: [], connections: [] };
  const byCode = new Map<string, ArchElement>();
  const parents: [ArchElement, string][] = [];
  let started = false;

  const declare = (kind: ArchElementKind, code: string, text: string, icon: string, parent: string): boolean => {
    if (byCode.has(code) || (icon && !KNOWN_ICONS.has(icon))) return false;
    const e: ArchElement = { id: `e${a.elements.length + 1}`, kind, label: text, icon: icon as ArchIcon, parent: '', code };
    byCode.set(code, e);
    a.elements.push(e);
    if (parent) parents.push([e, parent]);
    return true;
  };

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('%%') || /^acc(Title|Descr)\s*:/.test(line) || /^title(\s|$)/.test(line)) continue;
    if (!started) {
      if (!/^architecture-beta$/.test(line)) return { ok: false, reason: /^architecture/.test(line) ? UNSUPPORTED : 'Only architecture diagrams can be edited here.' };
      started = true;
      continue;
    }
    const node = NODE.exec(line);
    if (node) {
      if (!declare(node[1] as ArchElementKind, node[2], (node[4] ?? '').trim(), node[3] ?? '', node[5] ?? '')) return { ok: false, reason: UNSUPPORTED };
      continue;
    }
    const junction = JUNCTION.exec(line);
    if (junction) {
      if (!declare('junction', junction[1], '', '', junction[2] ?? '')) return { ok: false, reason: UNSUPPORTED };
      continue;
    }
    const edge = EDGE.exec(line);
    if (edge) {
      // Connections may come before what they join is declared, so look them up at the end.
      a.connections.push({ id: `k${a.connections.length + 1}`, from: edge[1], fromSide: edge[2] as ArchSide, to: edge[6], toSide: edge[5] as ArchSide, arrows: edge[3] && edge[4] ? 'both' : edge[3] ? 'from' : edge[4] ? 'to' : 'line' });
      continue;
    }
    return { ok: false, reason: UNSUPPORTED };
  }
  if (!started) return { ok: false, reason: 'Only architecture diagrams can be edited here.' };
  for (const [e, parent] of parents) {
    const group = byCode.get(parent);
    if (!group || group.kind !== 'group') return { ok: false, reason: UNSUPPORTED };
    e.parent = group.id;
  }
  for (const c of a.connections) {
    const from = byCode.get(c.from);
    const to = byCode.get(c.to);
    if (!from || !to || from.kind === 'group' || to.kind === 'group') return { ok: false, reason: UNSUPPORTED };
    c.from = from.id;
    c.to = to.id;
  }
  return { ok: true, architecture: a, title: readTitle(source), description: readDescription(source), titleAlign: readTitleAlign(source) };
}
