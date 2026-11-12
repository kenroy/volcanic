import { parse } from 'pele';
import { oneLine, readDescription, type KindMeta } from './kinds';
import { readTitle, readTitleAlign, setMetaDescription } from './mermaid';
import type { TitleAlign } from './model';

/** Some amount moving from one place to another. */
export interface SankeyFlow {
  id: string;
  source: string;
  target: string;
  value: number;
}

export interface Sankey {
  flows: SankeyFlow[];
}

/** A number without trailing noise: 12.5, not 12.500000000001. */
export const formatAmount = (n: number): string => String(Math.round(Math.max(0, n) * 1e6) / 1e6);

export const nameOf = (text: string): string => oneLine(text);

/** Every place that appears in the diagram, in the order it first does. */
export function nodesOf(s: Sankey): string[] {
  const seen: string[] = [];
  for (const f of s.flows) for (const n of [nameOf(f.source), nameOf(f.target)]) if (n && !seen.includes(n)) seen.push(n);
  return seen;
}

/** How much goes into and out of each place. */
export function totalsOf(s: Sankey): { name: string; into: number; out: number }[] {
  const totals = new Map<string, { name: string; into: number; out: number }>();
  for (const name of nodesOf(s)) totals.set(name, { name, into: 0, out: 0 });
  for (const f of s.flows) {
    const from = totals.get(nameOf(f.source));
    const to = totals.get(nameOf(f.target));
    if (from) from.out += f.value;
    if (to) to.into += f.value;
  }
  return [...totals.values()];
}

/** The places that flow back into themselves, which a Sankey diagram cannot draw. */
export function loopsIn(s: Sankey): string[] {
  const next = new Map<string, string[]>();
  for (const f of s.flows) {
    const a = nameOf(f.source);
    const b = nameOf(f.target);
    if (a && b) next.set(a, [...(next.get(a) ?? []), b]);
  }
  const state = new Map<string, 1 | 2>();
  const loops = new Set<string>();
  const visit = (node: string): void => {
    state.set(node, 1);
    for (const to of next.get(node) ?? []) {
      if (state.get(to) === 1) loops.add(to);
      else if (!state.has(to)) visit(to);
    }
    state.set(node, 2);
  };
  for (const node of next.keys()) if (!state.has(node)) visit(node);
  return [...loops];
}

export function nextFlowId(s: Sankey): string {
  const used = new Set(s.flows.map((f) => f.id));
  let n = used.size + 1;
  while (used.has(`f${n}`)) n += 1;
  return `f${n}`;
}

export function starterSankey(): Sankey {
  const rows: [string, string, number][] = [
    ['Energy', 'Home', 40],
    ['Energy', 'Industry', 60],
    ['Home', 'Heating', 25],
    ['Home', 'Lighting', 15],
    ['Industry', 'Machines', 45],
    ['Industry', 'Transport', 15],
  ];
  return { flows: rows.map(([source, target, value], i) => ({ id: `f${i + 1}`, source, target, value })) };
}

// ───────────────────────────── Writing Mermaid ─────────────────────────────

/** One CSV field: in quotes, with quote marks doubled, when it holds anything that could be read as structure. */
function field(text: string): string {
  const value = nameOf(text);
  return /[",]|^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function sankeyToMermaid(s: Sankey, meta: KindMeta): string {
  const flows = s.flows.filter((f) => nameOf(f.source) && nameOf(f.target));
  if (!flows.length) return '';
  const title = oneLine(meta.title);
  const lines: string[] = [];
  // Pele's Sankey reads every line under the header as a row of data, so there are no accTitle or accDescr lines.
  if (title) lines.push('---', `title: ${JSON.stringify(title)}`, '---');
  lines.push('sankey-beta', '');
  for (const f of flows) lines.push(`${field(f.source)},${field(f.target)},${formatAmount(f.value)}`);
  return setMetaDescription(lines.join('\n'), meta.description);
}

// ───────────────────────────── Reading Mermaid ─────────────────────────────

export type SankeyImport =
  | { ok: true; sankey: Sankey; title: string; description: string; titleAlign: TitleAlign }
  | { ok: false; reason: string };

const UNSUPPORTED = 'This Sankey diagram has a line the visual editor does not cover.';

/** Split one CSV line into its fields, or null if a quote is left open. */
function splitCsv(line: string): string[] | null {
  const out: string[] = [];
  let at = 0;
  while (at <= line.length) {
    while (line[at] === ' ' || line[at] === '\t') at += 1;
    let value = '';
    if (line[at] === '"') {
      at += 1;
      for (;;) {
        if (at >= line.length) return null;
        if (line[at] === '"') {
          if (line[at + 1] === '"') {
            value += '"';
            at += 2;
            continue;
          }
          at += 1;
          break;
        }
        value += line[at];
        at += 1;
      }
      while (line[at] === ' ' || line[at] === '\t') at += 1;
      if (at < line.length && line[at] !== ',') return null;
    } else {
      const end = line.indexOf(',', at);
      const stop = end < 0 ? line.length : end;
      value = line.slice(at, stop).trim();
      at = stop;
    }
    out.push(value);
    if (at >= line.length) break;
    at += 1; // the comma
    if (at >= line.length) out.push('');
  }
  return out;
}

export function sankeyFromMermaid(source: string): SankeyImport {
  try {
    parse(source);
  } catch (error) {
    const line = (error as { line?: number } | null)?.line;
    return { ok: false, reason: line ? `There is a syntax error on line ${line}.` : 'The source could not be read as a diagram.' };
  }
  const body = source.replace(/^\s*---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '');
  const sankey: Sankey = { flows: [] };
  let started = false;

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('%%')) continue;
    if (!started) {
      if (!/^sankey(-beta)?$/.test(line)) return { ok: false, reason: /^sankey/.test(line) ? UNSUPPORTED : 'Only Sankey diagrams can be edited here.' };
      started = true;
      continue;
    }
    const fields = splitCsv(line);
    if (!fields || fields.length !== 3 || !fields[0] || !fields[1] || !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(fields[2])) return { ok: false, reason: UNSUPPORTED };
    sankey.flows.push({ id: `f${sankey.flows.length + 1}`, source: fields[0], target: fields[1], value: Number(fields[2]) });
  }
  if (!started) return { ok: false, reason: 'Only Sankey diagrams can be edited here.' };
  return { ok: true, sankey, title: readTitle(source), description: readDescription(source), titleAlign: readTitleAlign(source) };
}
