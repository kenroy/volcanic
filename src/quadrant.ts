import { parse } from 'pele';
import { headerLines, oneLine, readDescription, unescapeText, type KindMeta } from './kinds';
import { readTitle, readTitleAlign } from './mermaid';
import type { TitleAlign } from './model';

export interface QuadrantPoint {
  id: string;
  label: string;
  /** Across the grid, 0 (left) to 1 (right). */
  x: number;
  /** Up the grid, 0 (bottom) to 1 (top). */
  y: number;
}

export interface Quadrant {
  xLeft: string;
  xRight: string;
  yBottom: string;
  yTop: string;
  /** Names of the four quadrants in Mermaid's order: top right, top left, bottom left, bottom right. */
  names: [string, string, string, string];
  points: QuadrantPoint[];
}

/** Where each name sits, in the same order as `Quadrant.names`. */
export const QUADRANT_PLACES = ['Top right', 'Top left', 'Bottom left', 'Bottom right'] as const;

export const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** A position as Mermaid wants it: between 0 and 1, to two places. */
export const formatPosition = (n: number): string => String(Math.round(clamp01(n) * 100) / 100);

export function nextPointId(q: Quadrant): string {
  const used = new Set(q.points.map((p) => p.id));
  let n = used.size + 1;
  while (used.has(`p${n}`)) n += 1;
  return `p${n}`;
}

export function starterQuadrant(): Quadrant {
  return {
    xLeft: 'Low effort',
    xRight: 'High effort',
    yBottom: 'Low value',
    yTop: 'High value',
    names: ['Plan', 'Do first', 'Drop', 'Delegate'],
    points: [
      { id: 'p1', label: 'Idea A', x: 0.3, y: 0.7 },
      { id: 'p2', label: 'Idea B', x: 0.7, y: 0.8 },
      { id: 'p3', label: 'Idea C', x: 0.2, y: 0.25 },
      { id: 'p4', label: 'Idea D', x: 0.75, y: 0.3 },
    ],
  };
}

// ───────────────────────────── Writing Mermaid ─────────────────────────────

/** Axis and quadrant text: one line, and nothing that Mermaid reads as syntax. */
const text = (value: string): string => oneLine(value).replace(/-->/g, '→').replace(/#/g, '');

function pointName(label: string): string {
  const name = oneLine(label).replace(/"/g, "'") || 'Point';
  return /[:[\]#]|^\s|\s$/.test(name) ? `"${name}"` : name;
}

function axisLine(key: 'x-axis' | 'y-axis', first: string, second: string): string | null {
  const a = text(first);
  const b = text(second);
  if (!a) return null;
  return `    ${key} ${a}${b ? ` --> ${b}` : ''}`;
}

export function quadrantToMermaid(q: Quadrant, meta: KindMeta): string {
  if (!q.points.length) return '';
  const lines = headerLines('quadrantChart', meta);
  const x = axisLine('x-axis', q.xLeft, q.xRight);
  const y = axisLine('y-axis', q.yBottom, q.yTop);
  if (x) lines.push(x);
  if (y) lines.push(y);
  q.names.forEach((name, index) => {
    if (text(name)) lines.push(`    quadrant-${index + 1} ${text(name)}`);
  });
  for (const p of q.points) lines.push(`    ${pointName(p.label)}: [${formatPosition(p.x)}, ${formatPosition(p.y)}]`);
  return lines.join('\n');
}

// ───────────────────────────── Reading Mermaid ─────────────────────────────

export type QuadrantImport =
  | { ok: true; quadrant: Quadrant; title: string; description: string; titleAlign: TitleAlign }
  | { ok: false; reason: string };

const UNSUPPORTED = 'This quadrant chart has a line the visual editor does not cover.';

export function quadrantFromMermaid(source: string): QuadrantImport {
  try {
    parse(source);
  } catch (error) {
    const line = (error as { line?: number } | null)?.line;
    return { ok: false, reason: line ? `There is a syntax error on line ${line}.` : 'The source could not be read as a diagram.' };
  }
  const body = source.replace(/^\s*---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '');
  const q: Quadrant = { xLeft: '', xRight: '', yBottom: '', yTop: '', names: ['', '', '', ''], points: [] };
  let started = false;
  let inlineTitle = '';
  let counter = 0;

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('%%') || /^acc(Title|Descr)\s*:/.test(line)) continue;
    if (!started) {
      if (line !== 'quadrantChart') return { ok: false, reason: /^quadrant/.test(line) ? UNSUPPORTED : 'Only quadrant charts can be edited here.' };
      started = true;
      continue;
    }
    if (/^title(\s|$)/.test(line)) {
      inlineTitle = unescapeText(line.replace(/^title\s*/, ''));
      continue;
    }
    const axis = /^(x|y)-axis\s+(.*?)(?:\s*-->\s*(.*))?$/.exec(line);
    if (axis) {
      const [, which, first, second = ''] = axis;
      if (which === 'x') [q.xLeft, q.xRight] = [unescapeText(first), unescapeText(second)];
      else [q.yBottom, q.yTop] = [unescapeText(first), unescapeText(second)];
      continue;
    }
    const quadrant = /^quadrant-([1-4])\s+(.+)$/.exec(line);
    if (quadrant) {
      q.names[Number(quadrant[1]) - 1] = unescapeText(quadrant[2]);
      continue;
    }
    const point = /^(?:"([^"]*)"|([^:"[\]]+?))\s*:\s*\[\s*(\d+(?:\.\d+)?|\.\d+)\s*,\s*(\d+(?:\.\d+)?|\.\d+)\s*\]\s*$/.exec(line);
    if (!point) return { ok: false, reason: UNSUPPORTED };
    const x = Number(point[3]);
    const y = Number(point[4]);
    if (x > 1 || y > 1) return { ok: false, reason: UNSUPPORTED };
    counter += 1;
    q.points.push({ id: `p${counter}`, label: unescapeText(point[1] ?? point[2]) || 'Point', x, y });
  }
  if (!started) return { ok: false, reason: 'Only quadrant charts can be edited here.' };
  return { ok: true, quadrant: q, title: readTitle(source) || inlineTitle, description: readDescription(source), titleAlign: readTitleAlign(source) };
}
