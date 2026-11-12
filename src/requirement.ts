import { parse } from 'pele';
import { escapeText, headerLines, oneLine, readDescription, unescapeText, type KindMeta } from './kinds';
import { readTitle, readTitleAlign } from './mermaid';
import type { TitleAlign } from './model';
import type { Direction } from './state';

export type ReqKind = 'requirement' | 'functionalRequirement' | 'interfaceRequirement' | 'performanceRequirement' | 'physicalRequirement' | 'designConstraint' | 'element';
export type ReqRisk = '' | 'low' | 'medium' | 'high';
export type ReqVerify = '' | 'analysis' | 'demonstration' | 'inspection' | 'test';
export type ReqRelationKind = 'contains' | 'copies' | 'derives' | 'satisfies' | 'verifies' | 'refines' | 'traces';

/** A requirement (with an id, text, risk and way to verify it) or an element that satisfies or verifies one. */
export interface ReqItem {
  id: string;
  kind: ReqKind;
  name: string;
  /** A requirement's own id, such as REQ-1. */
  reqId: string;
  text: string;
  risk: ReqRisk;
  verify: ReqVerify;
  /** An element's type, such as simulation or module. */
  elementType: string;
  docRef: string;
}

export interface ReqRelation {
  id: string;
  from: string;
  to: string;
  kind: ReqRelationKind;
}

export interface RequirementDiagram {
  items: ReqItem[];
  relations: ReqRelation[];
  direction: Direction;
}

export const REQ_KINDS: { id: ReqKind; name: string }[] = [
  { id: 'requirement', name: 'Requirement' },
  { id: 'functionalRequirement', name: 'Functional requirement' },
  { id: 'interfaceRequirement', name: 'Interface requirement' },
  { id: 'performanceRequirement', name: 'Performance requirement' },
  { id: 'physicalRequirement', name: 'Physical requirement' },
  { id: 'designConstraint', name: 'Design constraint' },
  { id: 'element', name: 'Element' },
];

export const RISKS: { id: ReqRisk; name: string }[] = [
  { id: '', name: 'Risk not set' },
  { id: 'low', name: 'Low risk' },
  { id: 'medium', name: 'Medium risk' },
  { id: 'high', name: 'High risk' },
];

export const VERIFY_METHODS: { id: ReqVerify; name: string }[] = [
  { id: '', name: 'Verification not set' },
  { id: 'analysis', name: 'Verify by analysis' },
  { id: 'demonstration', name: 'Verify by demonstration' },
  { id: 'inspection', name: 'Verify by inspection' },
  { id: 'test', name: 'Verify by test' },
];

export const REQ_RELATIONS: { id: ReqRelationKind; name: string }[] = [
  { id: 'satisfies', name: 'satisfies' },
  { id: 'verifies', name: 'verifies' },
  { id: 'contains', name: 'contains' },
  { id: 'derives', name: 'derives from' },
  { id: 'refines', name: 'refines' },
  { id: 'copies', name: 'copies' },
  { id: 'traces', name: 'traces to' },
];

export const reqName = (i: ReqItem): string => oneLine(i.name);

export function nextReqId(d: RequirementDiagram, prefix: 'q' | 'r'): string {
  const used = new Set([...d.items.map((i) => i.id), ...d.relations.map((r) => r.id)]);
  let n = used.size + 1;
  while (used.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

export function blankItem(id: string, kind: ReqKind): ReqItem {
  return { id, kind, name: '', reqId: '', text: '', risk: kind === 'element' ? '' : 'medium', verify: kind === 'element' ? '' : 'test', elementType: '', docRef: '' };
}

/** Items that share a name, which Pele draws as one. */
export function duplicateItems(d: RequirementDiagram): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const i of d.items) {
    const name = reqName(i).toLowerCase();
    if (!name) continue;
    if (seen.has(name)) dupes.add(reqName(i));
    seen.add(name);
  }
  return [...dupes];
}

/** Requirements no element satisfies, verifies or otherwise connects to. */
export function untraced(d: RequirementDiagram): ReqItem[] {
  return d.items.filter((i) => i.kind !== 'element' && !d.relations.some((r) => r.from === i.id || r.to === i.id));
}

export function starterRequirements(): RequirementDiagram {
  const item = (id: string, kind: ReqKind, extra: Partial<ReqItem>): ReqItem => ({ ...blankItem(id, kind), ...extra });
  return {
    direction: 'TB',
    items: [
      item('q1', 'requirement', { name: 'test_req', reqId: '1', text: 'the test text.', risk: 'high', verify: 'test' }),
      item('q2', 'functionalRequirement', { name: 'test_req2', reqId: '1.1', text: 'the second test text.', risk: 'low', verify: 'inspection' }),
      item('q3', 'element', { name: 'test_entity', elementType: 'simulation' }),
    ],
    relations: [
      { id: 'r1', from: 'q1', to: 'q2', kind: 'contains' },
      { id: 'r2', from: 'q3', to: 'q1', kind: 'satisfies' },
    ],
  };
}

// ───────────────────────────── Writing Mermaid ─────────────────────────────

const PLAIN = /^[A-Za-z_]\w*$/;
const RESERVED = new Set(['requirement', 'element', 'direction', 'style', 'classdef', 'class', 'title', 'acctitle', 'accdescr', 'functionalrequirement', 'interfacerequirement', 'performancerequirement', 'physicalrequirement', 'designconstraint']);
const quoted = (text: string): string => `"${escapeText(oneLine(text)).replace(/"/g, "'")}"`;
/** Bare when it is one plain word or number, otherwise in quotes. */
const value = (text: string): string => (/^\w+$/.test(oneLine(text)) ? oneLine(text) : quoted(text));

/** The word each item goes by: its name when that is one plain word, otherwise in quotes. */
const nameText = (i: ReqItem): string => {
  const n = reqName(i) || (i.kind === 'element' ? 'element' : 'requirement');
  return PLAIN.test(n) && !RESERVED.has(n.toLowerCase()) ? n : quoted(n);
};

export function requirementToMermaid(d: RequirementDiagram, meta: KindMeta): string {
  if (!d.items.length) return '';
  const lines = headerLines('requirementDiagram', meta);
  if (d.direction !== 'TB') lines.push(`    direction ${d.direction}`);
  for (const i of d.items) {
    lines.push(`    ${i.kind} ${nameText(i)} {`);
    if (i.kind === 'element') {
      if (oneLine(i.elementType)) lines.push(`        type: ${value(i.elementType)}`);
      if (oneLine(i.docRef)) lines.push(`        docref: ${value(i.docRef)}`);
    } else {
      if (oneLine(i.reqId)) lines.push(`        id: ${value(i.reqId)}`);
      if (oneLine(i.text)) lines.push(`        text: ${quoted(i.text)}`);
      if (i.risk) lines.push(`        risk: ${i.risk}`);
      if (i.verify) lines.push(`        verifymethod: ${i.verify}`);
    }
    lines.push('    }');
  }
  const names = new Map(d.items.map((i) => [i.id, nameText(i)]));
  for (const r of d.relations) {
    const a = names.get(r.from);
    const b = names.get(r.to);
    if (a && b) lines.push(`    ${a} - ${r.kind} -> ${b}`);
  }
  return lines.join('\n');
}

// ───────────────────────────── Reading Mermaid ─────────────────────────────

export type RequirementImport =
  | { ok: true; diagram: RequirementDiagram; title: string; description: string; titleAlign: TitleAlign }
  | { ok: false; reason: string };

const UNSUPPORTED = 'This requirement diagram uses something the visual editor does not cover, such as styling or relationships to things that are not declared.';
const NAME = '(?:"[^"]+"|\\w+)';
const BLOCK = new RegExp(`^(requirement|functionalRequirement|interfaceRequirement|performanceRequirement|physicalRequirement|designConstraint|element)\\s+(${NAME})\\s*\\{$`);
const FIELD = /^(id|text|risk|verifymethod|type|docref)\s*:\s*(?:"([^"]*)"|(.*))$/;
const KINDS = 'contains|copies|derives|satisfies|verifies|refines|traces';
const FORWARD = new RegExp(`^(${NAME})\\s+-\\s+(${KINDS})\\s+->\\s+(${NAME})$`);
const BACKWARD = new RegExp(`^(${NAME})\\s+<-\\s+(${KINDS})\\s+-\\s+(${NAME})$`);
const unquote = (text: string): string => unescapeText(text.startsWith('"') ? text.slice(1, -1) : text);

export function requirementFromMermaid(source: string): RequirementImport {
  try {
    parse(source);
  } catch (error) {
    const line = (error as { line?: number } | null)?.line;
    return { ok: false, reason: line ? `There is a syntax error on line ${line}.` : 'The source could not be read as a diagram.' };
  }
  const body = source.replace(/^\s*---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '');
  const d: RequirementDiagram = { items: [], relations: [], direction: 'TB' };
  const byName = new Map<string, ReqItem>();
  const links: { from: string; to: string; kind: ReqRelationKind }[] = [];
  let started = false;
  let open: ReqItem | null = null;

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('%%') || /^acc(Title|Descr)\s*:/.test(line)) continue;
    if (!started) {
      if (!/^requirementDiagram$/.test(line)) return { ok: false, reason: /^requirementDiagram/.test(line) ? UNSUPPORTED : 'Only requirement diagrams can be edited here.' };
      started = true;
      continue;
    }
    if (open) {
      if (line === '}') {
        open = null;
        continue;
      }
      const f = FIELD.exec(line);
      if (!f) return { ok: false, reason: UNSUPPORTED };
      const v = f[2] !== undefined ? unescapeText(f[2]) : unescapeText((f[3] ?? '').trim());
      const isElement = open.kind === 'element';
      if (f[1] === 'id' && !isElement) open.reqId = v;
      else if (f[1] === 'text' && !isElement) open.text = v;
      else if (f[1] === 'risk' && !isElement) {
        const r = v.toLowerCase();
        if (!['low', 'medium', 'high'].includes(r)) return { ok: false, reason: UNSUPPORTED };
        open.risk = r as ReqRisk;
      } else if (f[1] === 'verifymethod' && !isElement) {
        const m = v.toLowerCase();
        if (!['analysis', 'demonstration', 'inspection', 'test'].includes(m)) return { ok: false, reason: UNSUPPORTED };
        open.verify = m as ReqVerify;
      } else if (f[1] === 'type' && isElement) open.elementType = v;
      else if (f[1] === 'docref' && isElement) open.docRef = v;
      else return { ok: false, reason: UNSUPPORTED };
      continue;
    }
    const direction = /^direction\s+(TB|BT|LR|RL)$/.exec(line);
    if (direction) {
      d.direction = direction[1] as Direction;
      continue;
    }
    const block = BLOCK.exec(line);
    if (block) {
      const name = unquote(block[2]);
      if (byName.has(name)) return { ok: false, reason: UNSUPPORTED };
      const item = { ...blankItem(`q${d.items.length + 1}`, block[1] as ReqKind), name, risk: '' as ReqRisk, verify: '' as ReqVerify };
      byName.set(name, item);
      d.items.push(item);
      open = item;
      continue;
    }
    const fwd = FORWARD.exec(line);
    const back = fwd ? null : BACKWARD.exec(line);
    if (fwd) links.push({ from: unquote(fwd[1]), kind: fwd[2] as ReqRelationKind, to: unquote(fwd[3]) });
    else if (back) links.push({ from: unquote(back[3]), kind: back[2] as ReqRelationKind, to: unquote(back[1]) });
    else return { ok: false, reason: UNSUPPORTED };
  }
  if (open || !started) return { ok: false, reason: started ? UNSUPPORTED : 'Only requirement diagrams can be edited here.' };
  for (const l of links) {
    const from = byName.get(l.from);
    const to = byName.get(l.to);
    if (!from || !to) return { ok: false, reason: UNSUPPORTED };
    d.relations.push({ id: `r${d.relations.length + 1}`, from: from.id, to: to.id, kind: l.kind });
  }
  return { ok: true, diagram: d, title: readTitle(source), description: readDescription(source), titleAlign: readTitleAlign(source) };
}
