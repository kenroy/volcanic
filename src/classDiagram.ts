import { parse } from 'pele';
import { escapeText, headerLines, oneLine, readDescription, unescapeText, type KindMeta } from './kinds';
import { readTitle, readTitleAlign } from './mermaid';
import type { TitleAlign } from './model';
import type { Direction } from './state';

export type Stereotype = '' | 'interface' | 'abstract' | 'enumeration' | 'service';
export type Visibility = '' | '+' | '-' | '#' | '~';

/** An attribute or a method, as one line of text after its visibility mark. */
export interface Member {
  id: string;
  visibility: Visibility;
  text: string;
}

export interface ClassBox {
  id: string;
  name: string;
  stereotype: Stereotype;
  members: Member[];
}

/** How one class relates to another, read from the first class: Dog inherits from Animal. */
export type RelationKind = 'inherits' | 'implements' | 'composes' | 'aggregates' | 'uses' | 'depends' | 'links';

export interface Relation {
  id: string;
  from: string;
  to: string;
  kind: RelationKind;
  label: string;
  /** How many take part at each end, such as 1 or 0..*. Left empty, nothing is drawn. */
  fromCount: string;
  toCount: string;
}

export interface ClassDiagram {
  classes: ClassBox[];
  relations: Relation[];
  direction: Direction;
}

export const STEREOTYPES: { id: Stereotype; name: string }[] = [
  { id: '', name: 'Class' },
  { id: 'interface', name: 'Interface' },
  { id: 'abstract', name: 'Abstract' },
  { id: 'enumeration', name: 'Enumeration' },
  { id: 'service', name: 'Service' },
];

export const VISIBILITIES: { id: Visibility; name: string }[] = [
  { id: '+', name: '+ public' },
  { id: '-', name: '- private' },
  { id: '#', name: '# protected' },
  { id: '~', name: '~ package' },
  { id: '', name: 'none' },
];

/** How each kind reads and the operator Mermaid draws it with. `reversed` kinds are written starting from the `to` class. */
export const RELATIONS: { id: RelationKind; name: string; op: string; reversed: boolean }[] = [
  { id: 'inherits', name: 'inherits from', op: '<|--', reversed: true },
  { id: 'implements', name: 'implements', op: '<|..', reversed: true },
  { id: 'composes', name: 'is made of', op: '*--', reversed: false },
  { id: 'aggregates', name: 'has a shared', op: 'o--', reversed: false },
  { id: 'uses', name: 'uses', op: '-->', reversed: false },
  { id: 'depends', name: 'depends on', op: '..>', reversed: false },
  { id: 'links', name: 'is linked to', op: '--', reversed: false },
];

export const className = (text: string): string => oneLine(text);

let counter = 0;
/** An id no class, member or relation in the diagram has. */
export function nextClassId(d: ClassDiagram, prefix: 'c' | 'm' | 'r'): string {
  const used = new Set<string>();
  for (const c of d.classes) {
    used.add(c.id);
    for (const m of c.members) used.add(m.id);
  }
  for (const r of d.relations) used.add(r.id);
  let n = used.size + 1 + counter;
  while (used.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

/** Classes that share a name, which Pele draws as one. */
export function duplicateClasses(d: ClassDiagram): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const c of d.classes) {
    const name = className(c.name).toLowerCase();
    if (!name) continue;
    if (seen.has(name)) dupes.add(className(c.name));
    seen.add(name);
  }
  return [...dupes];
}

/** Classes no relationship touches. */
export function unrelated(d: ClassDiagram): ClassBox[] {
  return d.classes.filter((c) => !d.relations.some((r) => r.from === c.id || r.to === c.id));
}

export function starterClasses(): ClassDiagram {
  const member = (id: string, visibility: Visibility, text: string): Member => ({ id, visibility, text });
  return {
    direction: 'TB',
    classes: [
      { id: 'c1', name: 'Animal', stereotype: 'abstract', members: [member('m1', '+', 'String name'), member('m2', '+', 'speak() void')] },
      { id: 'c2', name: 'Dog', stereotype: '', members: [member('m3', '+', 'fetch() void')] },
      { id: 'c3', name: 'Cat', stereotype: '', members: [member('m4', '+', 'purr() void')] },
    ],
    relations: [
      { id: 'r1', from: 'c2', to: 'c1', kind: 'inherits', label: '', fromCount: '', toCount: '' },
      { id: 'r2', from: 'c3', to: 'c1', kind: 'inherits', label: '', fromCount: '', toCount: '' },
    ],
  };
}

// ───────────────────────────── Writing Mermaid ─────────────────────────────

const PLAIN = /^[A-Za-z_]\w*(?:~\w+~)?$/;
const RESERVED = new Set(['class', 'direction', 'namespace', 'note', 'style', 'classdef', 'click', 'link', 'callback', 'cssclass', 'title', 'acctitle', 'accdescr']);

/** The code each class goes by: its name when that is one plain word, otherwise a short code with the name as its label. */
function codesFor(d: ClassDiagram): Map<string, { code: string; label: string | null }> {
  const out = new Map<string, { code: string; label: string | null }>();
  const taken = new Set<string>();
  let n = 0;
  for (const c of d.classes) {
    const name = className(c.name) || 'Class';
    if (PLAIN.test(name) && !RESERVED.has(name.toLowerCase()) && !taken.has(name)) {
      taken.add(name);
      out.set(c.id, { code: name, label: null });
      continue;
    }
    let code: string;
    do {
      n += 1;
      code = `C${n}`;
    } while (taken.has(code) || d.classes.some((o) => className(o.name) === code));
    taken.add(code);
    out.set(c.id, { code, label: name.replace(/"/g, "'") });
  }
  return out;
}

const quoted = (text: string): string => `"${text.replace(/"/g, "'")}"`;

export function classToMermaid(d: ClassDiagram, meta: KindMeta): string {
  if (!d.classes.length) return '';
  const codes = codesFor(d);
  const lines = headerLines('classDiagram', meta);
  if (d.direction !== 'TB') lines.push(`    direction ${d.direction}`);
  for (const c of d.classes) {
    const { code, label } = codes.get(c.id)!;
    const members = c.members.filter((m) => oneLine(m.text));
    const head = label ? `class ${code}[${quoted(escapeText(label))}]` : `class ${code}`;
    if (!members.length && !c.stereotype) {
      lines.push(`    ${head}`);
      continue;
    }
    lines.push(`    ${head} {`);
    if (c.stereotype) lines.push(`        <<${c.stereotype}>>`);
    for (const m of members) lines.push(`        ${m.visibility}${escapeText(oneLine(m.text))}`);
    lines.push('    }');
  }
  for (const r of d.relations) {
    const a = codes.get(r.from);
    const b = codes.get(r.to);
    if (!a || !b) continue;
    const kind = RELATIONS.find((k) => k.id === r.kind)!;
    const [left, right] = kind.reversed ? [b, a] : [a, b];
    const [leftCount, rightCount] = kind.reversed ? [r.toCount, r.fromCount] : [r.fromCount, r.toCount];
    const count = (text: string): string => (oneLine(text) ? ` ${quoted(escapeText(oneLine(text)))}` : '');
    const label = escapeText(oneLine(r.label));
    lines.push(`    ${left.code}${count(leftCount)} ${kind.op}${count(rightCount)} ${right.code}${label ? ` : ${label}` : ''}`);
  }
  return lines.join('\n');
}

// ───────────────────────────── Reading Mermaid ─────────────────────────────

export type ClassImport =
  | { ok: true; diagram: ClassDiagram; title: string; description: string; titleAlign: TitleAlign }
  | { ok: false; reason: string };

const UNSUPPORTED = 'This class diagram uses something the visual editor does not cover, such as notes, namespaces, generics in members, or styling.';
const ID = '[A-Za-z_]\\w*(?:~\\w+~)?';
const COUNT = '(?:"([^"]*)")?';
const OPS = ['<\\|--', '--\\|>', '<\\|\\.\\.', '\\.\\.\\|>', '\\*--', '--\\*', 'o--', '--o', '<--', '-->', '<\\.\\.', '\\.\\.>', '--'];
const RELATION = new RegExp(`^(${ID})\\s*${COUNT}\\s*(${OPS.join('|')})\\s*${COUNT}\\s*(${ID})(?:\\s*:\\s*(.*))?$`);
const OPEN = new RegExp(`^class\\s+(${ID})(?:\\s*\\[\\s*"([^"]*)"\\s*\\])?\\s*\\{$`);
const DECLARE = new RegExp(`^class\\s+(${ID})(?:\\s*\\[\\s*"([^"]*)"\\s*\\])?$`);
const INLINE = new RegExp(`^(${ID})\\s*:\\s*(.+)$`);
const STEREO = /^<<\s*(interface|abstract|enumeration|service)\s*>>$/;

/** What each operator means: the kind, and whether the first class is the `from` of the relation. */
const OPERATORS: Record<string, { kind: RelationKind; fromFirst: boolean }> = {
  '<|--': { kind: 'inherits', fromFirst: false },
  '--|>': { kind: 'inherits', fromFirst: true },
  '<|..': { kind: 'implements', fromFirst: false },
  '..|>': { kind: 'implements', fromFirst: true },
  '*--': { kind: 'composes', fromFirst: true },
  '--*': { kind: 'composes', fromFirst: false },
  'o--': { kind: 'aggregates', fromFirst: true },
  '--o': { kind: 'aggregates', fromFirst: false },
  '<--': { kind: 'uses', fromFirst: false },
  '-->': { kind: 'uses', fromFirst: true },
  '<..': { kind: 'depends', fromFirst: false },
  '..>': { kind: 'depends', fromFirst: true },
  '--': { kind: 'links', fromFirst: true },
};

function readMember(line: string, id: string): Member | null {
  const text = line.trim();
  if (!text) return null;
  const visibility = /^[+\-#~]/.test(text) ? (text[0] as Visibility) : '';
  const rest = unescapeText(visibility ? text.slice(1).trim() : text);
  return rest ? { id, visibility, text: rest } : null;
}

export function classFromMermaid(source: string): ClassImport {
  try {
    parse(source);
  } catch (error) {
    const line = (error as { line?: number } | null)?.line;
    return { ok: false, reason: line ? `There is a syntax error on line ${line}.` : 'The source could not be read as a diagram.' };
  }
  const body = source.replace(/^\s*---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '');
  const d: ClassDiagram = { classes: [], relations: [], direction: 'TB' };
  const byCode = new Map<string, ClassBox>();
  let started = false;
  let open: ClassBox | null = null;
  let members = 0;

  const classFor = (code: string): ClassBox => {
    let c = byCode.get(code);
    if (!c) {
      c = { id: `c${d.classes.length + 1}`, name: code, stereotype: '', members: [] };
      byCode.set(code, c);
      d.classes.push(c);
    }
    return c;
  };
  const add = (c: ClassBox, line: string): boolean => {
    members += 1;
    const m = readMember(line, `m${members}`);
    if (m) c.members.push(m);
    return !!m;
  };

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('%%') || /^acc(Title|Descr)\s*:/.test(line)) continue;
    if (!started) {
      if (!/^classDiagram(-v2)?$/.test(line)) return { ok: false, reason: /^classDiagram/.test(line) ? UNSUPPORTED : 'Only class diagrams can be edited here.' };
      started = true;
      continue;
    }
    if (open) {
      if (line === '}') {
        open = null;
        continue;
      }
      const stereo = STEREO.exec(line);
      if (stereo) {
        open.stereotype = stereo[1] as Stereotype;
        continue;
      }
      if (/^<<|[{}]/.test(line) || !add(open, line)) return { ok: false, reason: UNSUPPORTED };
      continue;
    }
    const direction = /^direction\s+(TB|BT|LR|RL)$/.exec(line);
    if (direction) {
      d.direction = direction[1] as Direction;
      continue;
    }
    const opened = OPEN.exec(line);
    if (opened) {
      const c = classFor(opened[1]);
      if (c.members.length) return { ok: false, reason: UNSUPPORTED };
      if (opened[2] !== undefined) c.name = unescapeText(opened[2]) || opened[1];
      open = c;
      continue;
    }
    const declared = DECLARE.exec(line);
    if (declared) {
      const c = classFor(declared[1]);
      if (declared[2] !== undefined) c.name = unescapeText(declared[2]) || declared[1];
      continue;
    }
    const rel = RELATION.exec(line);
    if (rel) {
      const first = classFor(rel[1]);
      const second = classFor(rel[5]);
      const op = OPERATORS[rel[3]];
      const counts = [rel[2] === undefined ? '' : unescapeText(rel[2]), rel[4] === undefined ? '' : unescapeText(rel[4])];
      const label = rel[6] === undefined ? '' : unescapeText(rel[6]);
      d.relations.push({
        id: `r${d.relations.length + 1}`,
        from: op.fromFirst ? first.id : second.id,
        to: op.fromFirst ? second.id : first.id,
        kind: op.kind,
        label,
        fromCount: op.fromFirst ? counts[0] : counts[1],
        toCount: op.fromFirst ? counts[1] : counts[0],
      });
      continue;
    }
    const stereoOutside = /^<<\s*(interface|abstract|enumeration|service)\s*>>\s+(\S+)$/.exec(line);
    if (stereoOutside && new RegExp(`^${ID}$`).test(stereoOutside[2])) {
      classFor(stereoOutside[2]).stereotype = stereoOutside[1] as Stereotype;
      continue;
    }
    const inline = INLINE.exec(line);
    if (inline) {
      if (!add(classFor(inline[1]), inline[2])) return { ok: false, reason: UNSUPPORTED };
      continue;
    }
    return { ok: false, reason: UNSUPPORTED };
  }
  if (open || !started) return { ok: false, reason: started ? UNSUPPORTED : 'Only class diagrams can be edited here.' };
  return { ok: true, diagram: d, title: readTitle(source), description: readDescription(source), titleAlign: readTitleAlign(source) };
}
