import { parse } from 'pele';
import { escapeText, oneLine, readDescription, unescapeText, type KindMeta } from './kinds';
import { readTitle, readTitleAlign, setMetaDescription } from './mermaid';
import type { TitleAlign } from './model';

export type BlkShape =
  | 'space'
  | 'rect'
  | 'round'
  | 'stadium'
  | 'subroutine'
  | 'cylinder'
  | 'circle'
  | 'doubleCircle'
  | 'asymmetric'
  | 'diamond'
  | 'hexagon'
  | 'parallelogram'
  | 'parallelogramAlt'
  | 'trapezoid'
  | 'trapezoidAlt';

export interface Blk {
  id: string;
  shape: BlkShape;
  /** The text inside (an empty space has none). */
  label: string;
  /** How many columns it takes up. */
  span: number;
  /** The word Mermaid knows it by. Kept so saving does not rename what you wrote. */
  code: string;
}

export interface BlkLink {
  id: string;
  from: string;
  to: string;
  arrow: boolean;
  label: string;
}

export interface BlockDiagram {
  /** How many blocks go across; 0 lets Mermaid decide. */
  columns: number;
  blocks: Blk[];
  links: BlkLink[];
}

export const MAX_COLUMNS = 12;
export const MAX_SPAN = 12;

/** Each shape: its name, and the text either side of the quoted label. */
export const BLK_SHAPES: { id: BlkShape; name: string; open: string; close: string }[] = [
  { id: 'rect', name: 'Rectangle', open: '[', close: ']' },
  { id: 'round', name: 'Rounded', open: '(', close: ')' },
  { id: 'stadium', name: 'Pill', open: '([', close: '])' },
  { id: 'subroutine', name: 'Subroutine', open: '[[', close: ']]' },
  { id: 'cylinder', name: 'Database', open: '[(', close: ')]' },
  { id: 'circle', name: 'Circle', open: '((', close: '))' },
  { id: 'doubleCircle', name: 'Double circle', open: '(((', close: ')))' },
  { id: 'asymmetric', name: 'Flag', open: '>', close: ']' },
  { id: 'diamond', name: 'Diamond', open: '{', close: '}' },
  { id: 'hexagon', name: 'Hexagon', open: '{{', close: '}}' },
  { id: 'parallelogram', name: 'Parallelogram', open: '[/', close: '/]' },
  { id: 'parallelogramAlt', name: 'Parallelogram (leaning back)', open: '[\\', close: '\\]' },
  { id: 'trapezoid', name: 'Trapezoid', open: '[/', close: '\\]' },
  { id: 'trapezoidAlt', name: 'Trapezoid (upside down)', open: '[\\', close: '/]' },
  { id: 'space', name: 'Empty space', open: '', close: '' },
];

export const blkLabel = (b: Blk): string => (b.shape === 'space' ? 'Empty space' : oneLine(b.label));

export function nextBlkId(d: BlockDiagram, prefix: 'b' | 'l'): string {
  const used = new Set([...d.blocks.map((b) => b.id), ...d.links.map((l) => l.id)]);
  let n = used.size + 1;
  while (used.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

export interface Placement {
  block: Blk;
  row: number;
  /** First and last column it covers, from 1. */
  from: number;
  to: number;
}

/** Where each block lands: left to right, wrapping to a new row when the next one will not fit. */
export function placeBlocks(d: BlockDiagram): Placement[] {
  const width = d.columns > 0 ? d.columns : Math.max(1, d.blocks.length);
  let row = 1;
  let at = 0;
  return d.blocks.map((block) => {
    const span = Math.min(Math.max(1, block.span), width);
    if (at + span > width) {
      row += 1;
      at = 0;
    }
    const placed = { block, row, from: at + 1, to: at + span };
    at += span;
    return placed;
  });
}

/** "Row 2, column 3" or "Row 1, columns 1 to 2". */
export function whereText(p: Placement): string {
  return p.from === p.to ? `Row ${p.row}, column ${p.from}` : `Row ${p.row}, columns ${p.from} to ${p.to}`;
}

/** Blocks wider than the grid, which Mermaid squeezes to fit. */
export function tooWide(d: BlockDiagram): Blk[] {
  return d.columns > 0 ? d.blocks.filter((b) => b.span > d.columns) : [];
}

export function starterBlocks(): BlockDiagram {
  const b = (id: string, label: string, shape: BlkShape = 'rect', span = 1, code = id): Blk => ({ id, shape, label, span, code });
  return {
    columns: 3,
    blocks: [b('b1', 'Browser', 'rect', 1, 'browser'), b('b2', '', 'space', 1, 'space1'), b('b3', 'Server', 'rect', 1, 'server'), b('b4', 'Database', 'cylinder', 3, 'db')],
    links: [{ id: 'l1', from: 'b1', to: 'b3', arrow: true, label: 'request' }],
  };
}

// ───────────────────────────── Writing Mermaid ─────────────────────────────

const RESERVED = new Set(['block', 'end', 'columns', 'space', 'style', 'classdef', 'class', 'title', 'acctitle', 'accdescr']);
const AUTO = /^[bl]\d+$/;

/** The word each block goes by: what was read, or one made from its label when it is new. */
function codesFor(d: BlockDiagram): Map<string, string> {
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
  for (const b of d.blocks) if (b.shape !== 'space' && b.code && !AUTO.test(b.code)) out.set(b.id, claim(b.code));
  for (const b of d.blocks) {
    if (b.shape === 'space' || out.has(b.id)) continue;
    const slug = oneLine(b.label).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    out.set(b.id, claim(slug ? (/^\d/.test(slug) ? `n_${slug}` : slug) : 'block'));
  }
  return out;
}

const text = (s: string): string => escapeText(oneLine(s)).replace(/"/g, '#quot;');

export function blockToMermaid(d: BlockDiagram, meta: KindMeta): string {
  if (!d.blocks.length) return '';
  const codes = codesFor(d);
  const title = oneLine(meta.title);
  // Pele's block diagrams take no accTitle or accDescr lines, so the description rides in Volcanic's comment.
  const lines: string[] = [];
  if (title) lines.push('---', `title: ${JSON.stringify(title)}`, '---');
  lines.push('block-beta');
  if (d.columns > 0) lines.push(`    columns ${Math.min(MAX_COLUMNS, d.columns)}`);
  const piece = (b: Blk): string => {
    const span = b.span > 1 ? `:${Math.min(MAX_SPAN, b.span)}` : '';
    if (b.shape === 'space') return `space${span}`;
    const code = codes.get(b.id)!;
    const label = oneLine(b.label);
    const shape = BLK_SHAPES.find((s) => s.id === b.shape)!;
    if (b.shape === 'rect' && (!label || label === code)) return `${code}${span}`;
    return `${code}${shape.open}"${text(label || code)}"${shape.close}${span}`;
  };
  // One row of the grid to a line, so the text reads like the picture.
  const placed = placeBlocks(d);
  const rows = new Map<number, string[]>();
  for (const p of placed) rows.set(p.row, [...(rows.get(p.row) ?? []), piece(p.block)]);
  for (const row of rows.values()) lines.push(`    ${row.join(' ')}`);
  for (const l of d.links) {
    const from = codes.get(l.from);
    const to = codes.get(l.to);
    if (!from || !to) continue;
    const label = oneLine(l.label);
    lines.push(`    ${from} ${label ? `-- "${text(label)}" ` : ''}${l.arrow ? '-->' : '---'} ${to}`);
  }
  return setMetaDescription(lines.join('\n'), meta.description);
}

// ───────────────────────────── Reading Mermaid ─────────────────────────────

export type BlockImport =
  | { ok: true; diagram: BlockDiagram; title: string; description: string; titleAlign: TitleAlign }
  | { ok: false; reason: string };

const UNSUPPORTED = 'This block diagram uses something the visual editor does not cover, such as nested blocks, block arrows, colours or styled lines.';
const ID = '[A-Za-z_][\\w-]*';
const Q = '"([^"]*)"';
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
// Longest openers first, so ((( is not read as ((.
const SHAPE_PATTERNS = [...BLK_SHAPES]
  .filter((s) => s.id !== 'space')
  .sort((a, b) => b.open.length - a.open.length || b.close.length - a.close.length)
  .map((s) => ({ shape: s.id, re: new RegExp(`^${esc(s.open)}${Q}${esc(s.close)}`) }));
const EDGE = new RegExp(`^(${ID})\\s+(?:--\\s+${Q}\\s+)?(-->|---)\\s+(${ID})$`);
const SPAN = /^:(\d+)/;

export function blockFromMermaid(source: string): BlockImport {
  try {
    parse(source);
  } catch (error) {
    const line = (error as { line?: number } | null)?.line;
    return { ok: false, reason: line ? `There is a syntax error on line ${line}.` : 'The source could not be read as a diagram.' };
  }
  const body = source.replace(/^\s*---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '');
  const d: BlockDiagram = { columns: 0, blocks: [], links: [] };
  const byCode = new Map<string, Blk>();
  const edges: { from: string; to: string; arrow: boolean; label: string }[] = [];
  let started = false;

  // Reads the blocks along one line. False if anything on it is not understood.
  const readBlocks = (line: string): boolean => {
    let rest = line.trim();
    while (rest) {
      const space = /^space(?=[\s:]|$)/.exec(rest);
      let block: Blk;
      if (space) {
        rest = rest.slice(space[0].length);
        block = { id: `b${d.blocks.length + 1}`, shape: 'space', label: '', span: 1, code: `space${d.blocks.length + 1}` };
      } else {
        const id = new RegExp(`^(${ID})`).exec(rest);
        if (!id || RESERVED.has(id[1].toLowerCase())) return false;
        rest = rest.slice(id[0].length);
        let shape: BlkShape = 'rect';
        let label = id[1];
        for (const p of SHAPE_PATTERNS) {
          const m = p.re.exec(rest);
          if (m) {
            shape = p.shape;
            label = unescapeText(m[1]) || id[1];
            rest = rest.slice(m[0].length);
            break;
          }
        }
        if (byCode.has(id[1])) return false;
        block = { id: `b${d.blocks.length + 1}`, shape, label, span: 1, code: id[1] };
        byCode.set(id[1], block);
      }
      const span = SPAN.exec(rest);
      if (span) {
        block.span = Number(span[1]);
        if (block.span < 1 || block.span > MAX_SPAN) return false;
        rest = rest.slice(span[0].length);
      }
      if (rest && !/^\s/.test(rest)) return false;
      rest = rest.trim();
      d.blocks.push(block);
    }
    return true;
  };

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('%%')) continue;
    if (!started) {
      if (!/^block(-beta)?$/.test(line)) return { ok: false, reason: /^block/.test(line) ? UNSUPPORTED : 'Only block diagrams can be edited here.' };
      started = true;
      continue;
    }
    const columns = /^columns\s+(\d+|auto)$/.exec(line);
    if (columns) {
      d.columns = columns[1] === 'auto' ? 0 : Math.min(MAX_COLUMNS, Number(columns[1]));
      if (columns[1] !== 'auto' && (Number(columns[1]) < 1 || Number(columns[1]) > MAX_COLUMNS)) return { ok: false, reason: UNSUPPORTED };
      continue;
    }
    const edge = EDGE.exec(line);
    if (edge) {
      edges.push({ from: edge[1], to: edge[4], arrow: edge[3] === '-->', label: edge[2] === undefined ? '' : unescapeText(edge[2]) });
      continue;
    }
    if (!readBlocks(line)) return { ok: false, reason: UNSUPPORTED };
  }
  if (!started) return { ok: false, reason: 'Only block diagrams can be edited here.' };
  for (const e of edges) {
    const from = byCode.get(e.from);
    const to = byCode.get(e.to);
    if (!from || !to) return { ok: false, reason: UNSUPPORTED };
    d.links.push({ id: `l${d.links.length + 1}`, from: from.id, to: to.id, arrow: e.arrow, label: e.label });
  }
  return { ok: true, diagram: d, title: readTitle(source), description: readDescription(source), titleAlign: readTitleAlign(source) };
}
