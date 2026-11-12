import { parse } from 'pele';
import { headerLines, oneLine, readDescription, unescapeText, type KindMeta } from './kinds';
import { readTitle, readTitleAlign } from './mermaid';
import type { TitleAlign } from './model';

export interface PieSlice {
  id: string;
  label: string;
  /** Zero or more. Pele works out the percentages. */
  value: number;
}

export interface Pie {
  slices: PieSlice[];
  /** Print each slice's value in the legend. */
  showData: boolean;
}

/** Pele's default series colours, so the editor's swatches match its slices before any theme is chosen. */
export const SERIES_DEFAULTS = ['#4c78a8', '#f58518', '#54a24b', '#e45756', '#72b7b2', '#eeca3b', '#b279a2', '#9d755d'];

export const sliceColour = (index: number): string => `var(--pele-series-${(index % 8) + 1}, ${SERIES_DEFAULTS[index % 8]})`;

export function totalOf(pie: Pie): number {
  return pie.slices.reduce((sum, s) => sum + s.value, 0);
}

/** A share as text: "27.5%". */
export function percentOf(value: number, total: number): string {
  if (total <= 0) return '0%';
  const share = (value / total) * 100;
  return `${share >= 10 || Number.isInteger(share) ? Math.round(share * 10) / 10 : Math.round(share * 100) / 100}%`;
}

export function nextSliceId(pie: Pie): string {
  const used = new Set(pie.slices.map((s) => s.id));
  let n = used.size + 1;
  while (used.has(`p${n}`)) n += 1;
  return `p${n}`;
}

export function starterPie(): Pie {
  return {
    showData: false,
    slices: [
      { id: 'p1', label: 'Meetings', value: 30 },
      { id: 'p2', label: 'Design', value: 25 },
      { id: 'p3', label: 'Build', value: 35 },
      { id: 'p4', label: 'Review', value: 10 },
    ],
  };
}

// ───────────────────────────── Writing Mermaid ─────────────────────────────

/** A number without trailing noise: 12.5, not 12.500000000001. */
export function formatValue(value: number): string {
  return String(Math.round(Math.max(0, value) * 1e6) / 1e6);
}

export function pieToMermaid(pie: Pie, meta: KindMeta): string {
  if (!pie.slices.length) return '';
  const lines = headerLines(pie.showData ? 'pie showData' : 'pie', meta);
  for (const slice of pie.slices) {
    const label = oneLine(slice.label).replace(/"/g, '#34;') || 'Slice';
    lines.push(`    "${label}" : ${formatValue(slice.value)}`);
  }
  return lines.join('\n');
}

// ───────────────────────────── Reading Mermaid ─────────────────────────────

export type PieImport =
  | { ok: true; pie: Pie; title: string; description: string; titleAlign: TitleAlign }
  | { ok: false; reason: string };

const UNSUPPORTED = 'This pie chart has a line the visual editor does not cover.';

export function pieFromMermaid(source: string): PieImport {
  try {
    parse(source);
  } catch (error) {
    const line = (error as { line?: number } | null)?.line;
    return { ok: false, reason: line ? `There is a syntax error on line ${line}.` : 'The source could not be read as a diagram.' };
  }
  const body = source.replace(/^\s*---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '');
  const pie: Pie = { slices: [], showData: false };
  let started = false;
  let inlineTitle = '';
  let counter = 0;

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('%%') || /^acc(Title|Descr)\s*:/.test(line)) continue;
    if (!started) {
      const header = /^pie(?:\s+(showData))?(?:\s+title\s+(.+))?$/.exec(line);
      if (!header) return { ok: false, reason: /^pie\b/.test(line) ? UNSUPPORTED : 'Only pie charts can be edited here.' };
      pie.showData = !!header[1];
      if (header[2]) inlineTitle = unescapeText(header[2]);
      started = true;
      continue;
    }
    if (line === 'showData') {
      pie.showData = true;
      continue;
    }
    if (/^title(\s|$)/.test(line)) {
      inlineTitle = unescapeText(line.replace(/^title\s*/, ''));
      continue;
    }
    const slice = /^(["'])(.*)\1\s*:\s*(\d+(?:\.\d+)?|\.\d+)\s*$/.exec(line);
    if (!slice) return { ok: false, reason: UNSUPPORTED };
    counter += 1;
    pie.slices.push({ id: `p${counter}`, label: unescapeText(slice[2]) || 'Slice', value: Number(slice[3]) });
  }
  if (!started) return { ok: false, reason: 'Only pie charts can be edited here.' };
  return { ok: true, pie, title: readTitle(source) || inlineTitle, description: readDescription(source), titleAlign: readTitleAlign(source) };
}
