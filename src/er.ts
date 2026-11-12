import { parse } from 'pele';
import { escapeText, headerLines, oneLine, readDescription, unescapeText, type KindMeta } from './kinds';
import { readTitle, readTitleAlign } from './mermaid';
import type { TitleAlign } from './model';
import type { Direction } from './state';

export type Key = '' | 'PK' | 'FK' | 'UK';
export type Cardinality = 'one' | 'zeroOne' | 'oneMany' | 'zeroMany';

export interface Attribute {
  id: string;
  type: string;
  name: string;
  key: Key;
  comment: string;
}

export interface Entity {
  id: string;
  name: string;
  attributes: Attribute[];
}

export interface Relationship {
  id: string;
  /** Entity ids. */
  a: string;
  b: string;
  /** How many of each side take part: cardA is the count at entity a's end of the line. */
  cardA: Cardinality;
  cardB: Cardinality;
  /** A solid line instead of a dotted one: the child cannot exist without the parent. */
  identifying: boolean;
  label: string;
}

export interface ErDiagram {
  entities: Entity[];
  relationships: Relationship[];
  direction: Direction;
}

export const KEYS: { id: Key; name: string }[] = [
  { id: '', name: 'No key' },
  { id: 'PK', name: 'Primary key' },
  { id: 'FK', name: 'Foreign key' },
  { id: 'UK', name: 'Unique key' },
];

export const CARDINALITIES: { id: Cardinality; name: string }[] = [
  { id: 'one', name: 'exactly one' },
  { id: 'zeroOne', name: 'zero or one' },
  { id: 'oneMany', name: 'one or more' },
  { id: 'zeroMany', name: 'zero or more' },
];

/** The marks drawn at the left and right ends of a line. */
const LEFT: Record<Cardinality, string> = { one: '||', zeroOne: '|o', oneMany: '}|', zeroMany: '}o' };
const RIGHT: Record<Cardinality, string> = { one: '||', zeroOne: 'o|', oneMany: '|{', zeroMany: 'o{' };

export const entityName = (text: string): string => oneLine(text);

let counter = 0;
/** An id no entity, attribute or relationship in the diagram has. */
export function nextErId(d: ErDiagram, prefix: 'e' | 'a' | 'r'): string {
  const used = new Set<string>();
  for (const e of d.entities) {
    used.add(e.id);
    for (const a of e.attributes) used.add(a.id);
  }
  for (const r of d.relationships) used.add(r.id);
  let n = used.size + 1 + counter;
  while (used.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

/** Entities that share a name, which Pele draws as one. */
export function duplicateEntities(d: ErDiagram): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const e of d.entities) {
    const name = entityName(e.name).toLowerCase();
    if (!name) continue;
    if (seen.has(name)) dupes.add(entityName(e.name));
    seen.add(name);
  }
  return [...dupes];
}

/** Entities no relationship touches. */
export function unconnected(d: ErDiagram): Entity[] {
  return d.entities.filter((e) => !d.relationships.some((r) => r.a === e.id || r.b === e.id));
}

export function starterEr(): ErDiagram {
  const attr = (id: string, type: string, name: string, key: Key = '', comment = ''): Attribute => ({ id, type, name, key, comment });
  return {
    direction: 'TB',
    entities: [
      { id: 'e1', name: 'CUSTOMER', attributes: [attr('a1', 'int', 'id', 'PK'), attr('a2', 'string', 'name'), attr('a3', 'string', 'email', 'UK')] },
      { id: 'e2', name: 'ORDER', attributes: [attr('a4', 'int', 'id', 'PK'), attr('a5', 'int', 'customer_id', 'FK'), attr('a6', 'date', 'placed')] },
      { id: 'e3', name: 'PRODUCT', attributes: [attr('a7', 'int', 'id', 'PK'), attr('a8', 'string', 'title'), attr('a9', 'float', 'price')] },
    ],
    relationships: [
      { id: 'r1', a: 'e1', b: 'e2', cardA: 'one', cardB: 'zeroMany', identifying: true, label: 'places' },
      { id: 'r2', a: 'e2', b: 'e3', cardA: 'zeroMany', cardB: 'oneMany', identifying: true, label: 'contains' },
    ],
  };
}

// ───────────────────────────── Writing Mermaid ─────────────────────────────

const PLAIN = /^[A-Za-z_]\w*$/;
const RESERVED = new Set(['direction', 'classdef', 'class', 'style', 'subgraph', 'end', 'accdescr', 'acctitle', 'title']);

/** An entity name as Mermaid wants it: bare when it is one plain word, otherwise in quotes. */
function nameText(text: string): string {
  const name = entityName(text) || 'Entity';
  if (PLAIN.test(name) && !RESERVED.has(name.toLowerCase())) return name;
  return `"${escapeText(name).replace(/"/g, "'")}"`;
}

/** One word, for an attribute's type or name. */
const word = (text: string, fallback: string): string => oneLine(text).replace(/["\s]+/g, '_') || fallback;

const quoted = (text: string): string => `"${escapeText(oneLine(text)).replace(/"/g, "'")}"`;

export function erToMermaid(d: ErDiagram, meta: KindMeta): string {
  if (!d.entities.length) return '';
  const lines = headerLines('erDiagram', meta);
  if (d.direction !== 'TB') lines.push(`    direction ${d.direction}`);
  const names = new Map(d.entities.map((e) => [e.id, nameText(e.name)]));
  for (const e of d.entities) {
    if (!e.attributes.length) {
      lines.push(`    ${names.get(e.id)}`);
      continue;
    }
    lines.push(`    ${names.get(e.id)} {`);
    for (const a of e.attributes) {
      const comment = oneLine(a.comment);
      lines.push(`        ${word(a.type, 'string')} ${word(a.name, 'attribute')}${a.key ? ` ${a.key}` : ''}${comment ? ` ${quoted(comment)}` : ''}`);
    }
    lines.push('    }');
  }
  for (const r of d.relationships) {
    const a = names.get(r.a);
    const b = names.get(r.b);
    if (!a || !b) continue;
    lines.push(`    ${a} ${LEFT[r.cardA]}${r.identifying ? '--' : '..'}${RIGHT[r.cardB]} ${b} : ${quoted(r.label)}`);
  }
  return lines.join('\n');
}

// ───────────────────────────── Reading Mermaid ─────────────────────────────

export type ErImport =
  | { ok: true; diagram: ErDiagram; title: string; description: string; titleAlign: TitleAlign }
  | { ok: false; reason: string };

const UNSUPPORTED = 'This entity relationship diagram uses something the visual editor does not cover, such as aliases, several keys on one attribute, or styling.';
const NAME = '(?:"[^"]*"|\\w+)';
const LEFT_TOKENS = '\\|\\||\\|o|\\}\\||\\}o';
const RIGHT_TOKENS = '\\|\\||o\\||\\|\\{|o\\{';
const RELATION = new RegExp(`^(${NAME})\\s*(${LEFT_TOKENS})(--|\\.\\.)(${RIGHT_TOKENS})\\s*(${NAME})\\s*:\\s*(.*)$`);
const BLOCK = new RegExp(`^(${NAME})\\s*\\{$`);
const ATTRIBUTE = /^(\S+)\s+(\S+)(?:\s+(PK|FK|UK))?(?:\s+"([^"]*)")?$/;

const fromLeft = (token: string): Cardinality => (Object.keys(LEFT) as Cardinality[]).find((k) => LEFT[k] === token)!;
const fromRight = (token: string): Cardinality => (Object.keys(RIGHT) as Cardinality[]).find((k) => RIGHT[k] === token)!;
const unquote = (text: string): string => unescapeText(text.startsWith('"') ? text.slice(1, -1) : text);

export function erFromMermaid(source: string): ErImport {
  try {
    parse(source);
  } catch (error) {
    const line = (error as { line?: number } | null)?.line;
    return { ok: false, reason: line ? `There is a syntax error on line ${line}.` : 'The source could not be read as a diagram.' };
  }
  const body = source.replace(/^\s*---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '');
  const d: ErDiagram = { entities: [], relationships: [], direction: 'TB' };
  const byName = new Map<string, Entity>();
  let started = false;
  let open: Entity | null = null;
  let nextAttr = 0;

  const entityFor = (name: string): Entity => {
    let e = byName.get(name);
    if (!e) {
      e = { id: `e${d.entities.length + 1}`, name, attributes: [] };
      byName.set(name, e);
      d.entities.push(e);
    }
    return e;
  };

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('%%') || /^acc(Title|Descr)\s*:/.test(line)) continue;
    if (!started) {
      if (!/^erDiagram$/.test(line)) return { ok: false, reason: /^erDiagram/.test(line) ? UNSUPPORTED : 'Only entity relationship diagrams can be edited here.' };
      started = true;
      continue;
    }
    if (open) {
      if (line === '}') {
        open = null;
        continue;
      }
      const m = ATTRIBUTE.exec(line);
      if (!m) return { ok: false, reason: UNSUPPORTED };
      nextAttr += 1;
      open.attributes.push({ id: `a${nextAttr}`, type: m[1], name: m[2], key: (m[3] ?? '') as Key, comment: m[4] === undefined ? '' : unescapeText(m[4]) });
      continue;
    }
    const direction = /^direction\s+(TB|BT|LR|RL)$/.exec(line);
    if (direction) {
      d.direction = direction[1] as Direction;
      continue;
    }
    const block = BLOCK.exec(line);
    if (block) {
      const e = entityFor(unquote(block[1]));
      // A second block for one entity would stack its attributes, which the editor has no place for.
      if (e.attributes.length) return { ok: false, reason: UNSUPPORTED };
      open = e;
      continue;
    }
    const rel = RELATION.exec(line);
    if (rel) {
      const a = entityFor(unquote(rel[1]));
      const b = entityFor(unquote(rel[5]));
      const label = rel[6].trim();
      d.relationships.push({ id: `r${d.relationships.length + 1}`, a: a.id, b: b.id, cardA: fromLeft(rel[2]), cardB: fromRight(rel[4]), identifying: rel[3] === '--', label: unquote(label) });
      continue;
    }
    if (new RegExp(`^${NAME}$`).test(line)) {
      entityFor(unquote(line));
      continue;
    }
    return { ok: false, reason: UNSUPPORTED };
  }
  if (open || !started) return { ok: false, reason: started ? UNSUPPORTED : 'Only entity relationship diagrams can be edited here.' };
  return { ok: true, diagram: d, title: readTitle(source), description: readDescription(source), titleAlign: readTitleAlign(source) };
}
