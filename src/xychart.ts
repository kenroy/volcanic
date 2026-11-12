import { parse } from 'pele';
import { headerLines, oneLine, readDescription, unescapeText, type KindMeta } from './kinds';
import { readTitle, readTitleAlign } from './mermaid';
import type { TitleAlign } from './model';

/** One position along the horizontal axis: a month, a team, a product. */
export interface XyCategory {
  id: string;
  label: string;
}

export type XySeriesKind = 'bar' | 'line';

/** One set of bars or one line, with a value for each category. */
export interface XySeries {
  id: string;
  kind: XySeriesKind;
  label: string;
  /** Value per category, by category id. A missing value counts as zero. */
  values: Record<string, number>;
}

export interface XyChart {
  /** Draw the bars sideways. */
  horizontal: boolean;
  xTitle: string;
  yTitle: string;
  /** The ends of the value axis, or null to fit the data. */
  yMin: number | null;
  yMax: number | null;
  categories: XyCategory[];
  series: XySeries[];
}

export const SERIES_KINDS: { id: XySeriesKind; name: string }[] = [
  { id: 'bar', name: 'Bars' },
  { id: 'line', name: 'Line' },
];

export const valueAt = (s: XySeries, c: XyCategory): number => s.values[c.id] ?? 0;

/** A number without trailing noise: 12.5, not 12.500000000001. */
export const formatNumber = (n: number): string => String(Math.round(n * 1e6) / 1e6);

export function nextXyId(chart: XyChart, prefix: 'x' | 's'): string {
  const used = new Set<string>([...chart.categories.map((c) => c.id), ...chart.series.map((s) => s.id)]);
  let n = used.size + 1;
  while (used.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

export function starterXyChart(): XyChart {
  const categories = ['Jan', 'Feb', 'Mar', 'Apr', 'May'].map((label, i) => ({ id: `x${i + 1}`, label }));
  const values = (list: number[]): Record<string, number> => Object.fromEntries(categories.map((c, i) => [c.id, list[i]]));
  return {
    horizontal: false,
    xTitle: '',
    yTitle: 'Revenue',
    yMin: 0,
    yMax: 100,
    categories,
    series: [
      { id: 's6', kind: 'bar', label: 'Revenue', values: values([30, 50, 80, 60, 90]) },
      { id: 's7', kind: 'line', label: 'Target', values: values([40, 50, 60, 70, 80]) },
    ],
  };
}

// ───────────────────────────── Writing Mermaid ─────────────────────────────

/** Text in quotes: no quote marks and no line breaks inside. */
const quoted = (text: string): string => `"${oneLine(text).replace(/"/g, "'")}"`;

/** A category: bare when it is a single plain word, in quotes otherwise. */
function categoryName(label: string, fallback: string): string {
  const text = oneLine(label).replace(/"/g, "'") || fallback;
  return /^[A-Za-z0-9_.-]+$/.test(text) ? text : `"${text}"`;
}

export function xyChartToMermaid(c: XyChart, meta: KindMeta): string {
  if (!c.categories.length || !c.series.length) return '';
  const lines = headerLines(c.horizontal ? 'xychart-beta horizontal' : 'xychart-beta', meta);
  const xTitle = oneLine(c.xTitle);
  lines.push(`    x-axis ${xTitle ? `${quoted(xTitle)} ` : ''}[${c.categories.map((x, i) => categoryName(x.label, `Item ${i + 1}`)).join(', ')}]`);
  const yTitle = oneLine(c.yTitle);
  const range = c.yMin !== null && c.yMax !== null && c.yMax > c.yMin ? `${formatNumber(c.yMin)} --> ${formatNumber(c.yMax)}` : '';
  if (yTitle || range) lines.push(`    y-axis ${[yTitle ? quoted(yTitle) : '', range].filter(Boolean).join(' ')}`);
  for (const s of c.series) {
    const name = oneLine(s.label);
    lines.push(`    ${s.kind} ${name ? `${quoted(name)} ` : ''}[${c.categories.map((x) => formatNumber(valueAt(s, x))).join(', ')}]`);
  }
  return lines.join('\n');
}

// ───────────────────────────── Reading Mermaid ─────────────────────────────

export type XyImport =
  | { ok: true; chart: XyChart; title: string; description: string; titleAlign: TitleAlign }
  | { ok: false; reason: string };

const UNSUPPORTED = 'This chart has a line the visual editor does not cover.';
const NUMBER = String.raw`-?(?:\d+(?:\.\d+)?|\.\d+)`;

/** Words and quoted text separated by commas: `a, "b c", d`. */
function readList(text: string): string[] | null {
  const part = /\s*(?:"([^"]*)"|([^,"]+?))\s*(,|$)/y;
  const out: string[] = [];
  let at = 0;
  const trimmed = text.trim();
  if (!trimmed) return null;
  while (at < trimmed.length) {
    part.lastIndex = at;
    const m = part.exec(trimmed);
    if (!m) return null;
    out.push(m[1] ?? m[2]);
    at = part.lastIndex;
    if (m[3] === '' && at < trimmed.length) return null;
  }
  return out;
}

const unquote = (token: string | undefined): string => (token === undefined ? '' : unescapeText(token.replace(/^"([\s\S]*)"$/, '$1')));

export function xyChartFromMermaid(source: string): XyImport {
  try {
    parse(source);
  } catch (error) {
    const line = (error as { line?: number } | null)?.line;
    return { ok: false, reason: line ? `There is a syntax error on line ${line}.` : 'The source could not be read as a diagram.' };
  }
  const body = source.replace(/^\s*---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '');
  const chart: XyChart = { horizontal: false, xTitle: '', yTitle: '', yMin: null, yMax: null, categories: [], series: [] };
  let started = false;
  let inlineTitle = '';
  let counter = 0;
  let sawX = false;
  const pending: { kind: XySeriesKind; label: string; values: number[] }[] = [];

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('%%') || /^acc(Title|Descr)\s*:/.test(line)) continue;
    if (!started) {
      const header = /^xychart-beta(?:\s+(horizontal))?(?:\s+title\s+(.+))?$/.exec(line);
      if (!header) return { ok: false, reason: /^xychart/.test(line) ? UNSUPPORTED : 'Only XY charts can be edited here.' };
      chart.horizontal = !!header[1];
      if (header[2]) inlineTitle = unescapeText(header[2]);
      started = true;
      continue;
    }
    if (/^title(\s|$)/.test(line)) {
      inlineTitle = unescapeText(line.replace(/^title\s*/, ''));
      continue;
    }
    const x = /^x-axis(?:\s+("[^"]*"|[^\s[]+))?\s*\[(.*)\]$/.exec(line);
    if (x) {
      const names = readList(x[2]);
      if (!names || sawX) return { ok: false, reason: UNSUPPORTED };
      sawX = true;
      chart.xTitle = unquote(x[1]);
      chart.categories = names.map((label) => ({ id: `x${++counter}`, label: unescapeText(label) }));
      continue;
    }
    if (/^x-axis\b/.test(line)) return { ok: false, reason: 'This chart has a numeric horizontal axis, which the visual editor does not cover.' };
    const y = new RegExp(String.raw`^y-axis(?:\s+("[^"]*"|[^\s\d-][^\s]*))?(?:\s+(${NUMBER})\s*-->\s*(${NUMBER}))?$`).exec(line);
    if (y) {
      chart.yTitle = unquote(y[1]);
      if (y[2] !== undefined) {
        chart.yMin = Number(y[2]);
        chart.yMax = Number(y[3]);
      }
      continue;
    }
    const series = /^(bar|line)(?:\s+("[^"]*"|[^\s[]+))?\s*\[(.*)\]$/.exec(line);
    if (!series) return { ok: false, reason: UNSUPPORTED };
    const nums = series[3].split(',').map((n) => n.trim());
    if (nums.some((n) => !new RegExp(`^${NUMBER}$`).test(n))) return { ok: false, reason: UNSUPPORTED };
    pending.push({ kind: series[1] as XySeriesKind, label: unquote(series[2]), values: nums.map(Number) });
  }
  if (!started) return { ok: false, reason: 'Only XY charts can be edited here.' };
  if (!sawX) return { ok: false, reason: UNSUPPORTED };
  for (const p of pending) {
    if (p.values.length !== chart.categories.length) return { ok: false, reason: 'A series in this chart does not have one value for each item on the horizontal axis.' };
    chart.series.push({ id: `s${++counter}`, kind: p.kind, label: p.label, values: Object.fromEntries(chart.categories.map((c, i) => [c.id, p.values[i]])) });
  }
  return { ok: true, chart, title: readTitle(source) || inlineTitle, description: readDescription(source), titleAlign: readTitleAlign(source) };
}
