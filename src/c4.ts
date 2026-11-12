import { parse } from 'pele';
import { escapeText, headerLines, oneLine, readDescription, unescapeText, type KindMeta } from './kinds';
import { readTitle, readTitleAlign } from './mermaid';
import type { TitleAlign } from './model';

export type C4ElementKind = 'Person' | 'Person_Ext' | 'System' | 'System_Ext' | 'SystemDb' | 'SystemDb_Ext' | 'SystemQueue' | 'SystemQueue_Ext';
export type C4BoundaryKind = 'Enterprise_Boundary' | 'System_Boundary';
export type C4Line = 'Rel' | 'BiRel' | 'Rel_U' | 'Rel_D' | 'Rel_L' | 'Rel_R' | 'Rel_Back';

export interface C4Element {
  id: string;
  kind: C4ElementKind;
  label: string;
  description: string;
  /** The id of the boundary it sits in, or '' for none. */
  boundary: string;
  /** The word Mermaid knows it by. Kept so saving does not rename what you wrote. */
  code: string;
}

export interface C4Boundary {
  id: string;
  kind: C4BoundaryKind;
  label: string;
  code: string;
}

export interface C4Relation {
  id: string;
  from: string;
  to: string;
  line: C4Line;
  label: string;
  technology: string;
}

export interface C4Diagram {
  elements: C4Element[];
  boundaries: C4Boundary[];
  relations: C4Relation[];
}

export const C4_ELEMENTS: { id: C4ElementKind; name: string }[] = [
  { id: 'Person', name: 'Person' },
  { id: 'Person_Ext', name: 'Person (external)' },
  { id: 'System', name: 'System' },
  { id: 'System_Ext', name: 'System (external)' },
  { id: 'SystemDb', name: 'Database' },
  { id: 'SystemDb_Ext', name: 'Database (external)' },
  { id: 'SystemQueue', name: 'Queue' },
  { id: 'SystemQueue_Ext', name: 'Queue (external)' },
];

export const C4_BOUNDARIES: { id: C4BoundaryKind; name: string }[] = [
  { id: 'Enterprise_Boundary', name: 'Enterprise boundary' },
  { id: 'System_Boundary', name: 'System boundary' },
];

export const C4_LINES: { id: C4Line; name: string }[] = [
  { id: 'Rel', name: 'to' },
  { id: 'BiRel', name: 'both ways with' },
  { id: 'Rel_U', name: 'up to' },
  { id: 'Rel_D', name: 'down to' },
  { id: 'Rel_L', name: 'left to' },
  { id: 'Rel_R', name: 'right to' },
  { id: 'Rel_Back', name: 'back from' },
];

export const c4Label = (e: { label: string }): string => oneLine(e.label);

export function nextC4Id(d: C4Diagram, prefix: 'e' | 'b' | 'r'): string {
  const used = new Set([...d.elements.map((e) => e.id), ...d.boundaries.map((b) => b.id), ...d.relations.map((r) => r.id)]);
  let n = used.size + 1;
  while (used.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

/** Elements nothing relates to. */
export function unrelatedC4(d: C4Diagram): C4Element[] {
  return d.elements.filter((e) => !d.relations.some((r) => r.from === e.id || r.to === e.id));
}

export function starterC4(): C4Diagram {
  const el = (id: string, kind: C4ElementKind, label: string, description: string, code: string, boundary = ''): C4Element => ({ id, kind, label, description, boundary, code });
  return {
    elements: [
      el('e1', 'Person', 'User', 'Uses the app', 'user'),
      el('e2', 'System', 'Web app', 'Does the work', 'app', 'b1'),
      el('e3', 'System_Ext', 'Email', 'Sends messages', 'mail'),
    ],
    boundaries: [{ id: 'b1', kind: 'Enterprise_Boundary', label: 'Our company', code: 'company' }],
    relations: [
      { id: 'r1', from: 'e1', to: 'e2', line: 'Rel', label: 'Uses', technology: '' },
      { id: 'r2', from: 'e2', to: 'e3', line: 'Rel', label: 'Sends email', technology: 'SMTP' },
    ],
  };
}

// ───────────────────────────── Writing Mermaid ─────────────────────────────

const AUTO = /^[ebr]\d+$/;

/** The word each element or boundary goes by: what was read, or one made from its label when it is new. */
function codesFor(d: C4Diagram): Map<string, string> {
  const out = new Map<string, string>();
  const taken = new Set<string>();
  const claim = (code: string): string => {
    let c = code;
    let n = 1;
    while (taken.has(c)) {
      n += 1;
      c = `${code}_${n}`;
    }
    taken.add(c);
    return c;
  };
  const all = [...d.boundaries.map((b) => ({ ...b, fallback: 'boundary' })), ...d.elements.map((e) => ({ ...e, fallback: 'element' }))];
  for (const x of all) if (x.code && !AUTO.test(x.code)) out.set(x.id, claim(x.code));
  for (const x of all) {
    if (out.has(x.id)) continue;
    const slug = oneLine(x.label).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    out.set(x.id, claim(slug ? (/^\d/.test(slug) ? `n_${slug}` : slug) : x.fallback));
  }
  return out;
}

const text = (s: string): string => `"${escapeText(oneLine(s)).replace(/"/g, '#quot;')}"`;

export function c4ToMermaid(d: C4Diagram, meta: KindMeta): string {
  if (!d.elements.length) return '';
  const codes = codesFor(d);
  const lines = headerLines('C4Context', meta);
  const element = (e: C4Element, indent: string): string => {
    const desc = oneLine(e.description);
    return `${indent}${e.kind}(${codes.get(e.id)}, ${text(e.label || codes.get(e.id)!)}${desc ? `, ${text(desc)}` : ''})`;
  };
  const known = new Set(d.boundaries.map((b) => b.id));
  for (const e of d.elements) if (!e.boundary || !known.has(e.boundary)) lines.push(element(e, '    '));
  for (const b of d.boundaries) {
    // Pele rejects a boundary with nothing in it, so it appears once it holds something.
    if (!d.elements.some((e) => e.boundary === b.id)) continue;
    lines.push(`    ${b.kind}(${codes.get(b.id)}, ${text(b.label || codes.get(b.id)!)}) {`);
    for (const e of d.elements) if (e.boundary === b.id) lines.push(element(e, '        '));
    lines.push('    }');
  }
  for (const r of d.relations) {
    const from = codes.get(r.from);
    const to = codes.get(r.to);
    if (!from || !to) continue;
    const tech = oneLine(r.technology);
    lines.push(`    ${r.line}(${from}, ${to}, ${text(r.label)}${tech ? `, ${text(tech)}` : ''})`);
  }
  return lines.join('\n');
}

// ───────────────────────────── Reading Mermaid ─────────────────────────────

export type C4Import =
  | { ok: true; diagram: C4Diagram; title: string; description: string; titleAlign: TitleAlign }
  | { ok: false; reason: string };

const UNSUPPORTED = 'This C4 diagram uses something the visual editor does not cover, such as nested boundaries, styling, icons or layout settings.';
const CALL = /^(\w+)\(\s*(.*?)\s*\)(\s*\{)?$/;
const ELEMENT_KINDS = new Set<string>(C4_ELEMENTS.map((e) => e.id));
const BOUNDARY_KINDS = new Set<string>(C4_BOUNDARIES.map((b) => b.id));
const LINE_KINDS = new Set<string>(C4_LINES.map((l) => l.id));

/** Splits the inside of a call into its arguments, or null if one is named ($tag=...) or a quote is left open. */
function readArgs(inside: string): string[] | null {
  const out: string[] = [];
  let at = 0;
  while (at <= inside.length) {
    while (inside[at] === ' ') at += 1;
    if (inside[at] === '"') {
      const end = inside.indexOf('"', at + 1);
      if (end < 0) return null;
      out.push(unescapeText(inside.slice(at + 1, end)));
      at = end + 1;
    } else {
      const m = /^[^,"\s]+/.exec(inside.slice(at));
      if (!m || m[0].startsWith('$')) return null;
      out.push(m[0]);
      at += m[0].length;
    }
    while (inside[at] === ' ') at += 1;
    if (at >= inside.length) break;
    if (inside[at] !== ',') return null;
    at += 1;
  }
  return out;
}

export function c4FromMermaid(source: string): C4Import {
  try {
    parse(source);
  } catch (error) {
    const line = (error as { line?: number } | null)?.line;
    return { ok: false, reason: line ? `There is a syntax error on line ${line}.` : 'The source could not be read as a diagram.' };
  }
  const body = source.replace(/^\s*---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '');
  const d: C4Diagram = { elements: [], boundaries: [], relations: [] };
  const byCode = new Map<string, { kind: 'element' | 'boundary'; id: string }>();
  const links: { from: string; to: string; line: C4Line; label: string; technology: string }[] = [];
  let started = false;
  let open: C4Boundary | null = null;

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('%%') || /^acc(Title|Descr)\s*:/.test(line) || /^title(\s|$)/.test(line)) continue;
    if (!started) {
      if (!/^C4Context$/.test(line)) return { ok: false, reason: /^C4/.test(line) ? UNSUPPORTED : 'Only C4 context diagrams can be edited here.' };
      started = true;
      continue;
    }
    if (line === '}') {
      if (!open) return { ok: false, reason: UNSUPPORTED };
      open = null;
      continue;
    }
    const call = CALL.exec(line);
    if (!call) return { ok: false, reason: UNSUPPORTED };
    const [, name, inside, brace] = call;
    const args = readArgs(inside);
    if (!args) return { ok: false, reason: UNSUPPORTED };
    if (BOUNDARY_KINDS.has(name)) {
      // Boundaries inside boundaries are not covered.
      if (open || !brace || args.length < 1 || args.length > 2 || byCode.has(args[0])) return { ok: false, reason: UNSUPPORTED };
      const b: C4Boundary = { id: `b${d.boundaries.length + 1}`, kind: name as C4BoundaryKind, label: args[1] ?? args[0], code: args[0] };
      byCode.set(args[0], { kind: 'boundary', id: b.id });
      d.boundaries.push(b);
      open = b;
    } else if (ELEMENT_KINDS.has(name)) {
      if (brace || args.length < 2 || args.length > 3 || byCode.has(args[0])) return { ok: false, reason: UNSUPPORTED };
      const e: C4Element = { id: `e${d.elements.length + 1}`, kind: name as C4ElementKind, label: args[1], description: args[2] ?? '', boundary: open?.id ?? '', code: args[0] };
      byCode.set(args[0], { kind: 'element', id: e.id });
      d.elements.push(e);
    } else if (LINE_KINDS.has(name)) {
      if (brace || open || args.length < 3 || args.length > 4) return { ok: false, reason: UNSUPPORTED };
      links.push({ from: args[0], to: args[1], line: name as C4Line, label: args[2], technology: args[3] ?? '' });
    } else return { ok: false, reason: UNSUPPORTED };
  }
  if (open || !started) return { ok: false, reason: started ? UNSUPPORTED : 'Only C4 context diagrams can be edited here.' };
  for (const l of links) {
    const from = byCode.get(l.from);
    const to = byCode.get(l.to);
    if (!from || !to || from.kind !== 'element' || to.kind !== 'element') return { ok: false, reason: UNSUPPORTED };
    d.relations.push({ id: `r${d.relations.length + 1}`, from: from.id, to: to.id, line: l.line, label: l.label, technology: l.technology });
  }
  return { ok: true, diagram: d, title: readTitle(source), description: readDescription(source), titleAlign: readTitleAlign(source) };
}
