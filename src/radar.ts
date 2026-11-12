import { parse } from 'pele';
import { headerLines, oneLine, readDescription, unescapeText, type KindMeta } from './kinds';
import { readTitle, readTitleAlign } from './mermaid';
import type { TitleAlign } from './model';

/** One spoke of the web: something each series is scored on. */
export interface RadarAxis {
  id: string;
  label: string;
}

/** One shape on the web (a person, a product, a year...) with a score for each axis. */
export interface RadarSeries {
  id: string;
  label: string;
  /** Score per axis, by axis id. A missing score counts as zero. */
  values: Record<string, number>;
}

export interface RadarOptions {
  showLegend: boolean;
  /** Rings drawn between the centre and the edge. */
  ticks: number;
  /** The score at the edge, or null to fit the biggest score. */
  max: number | null;
  /** The score at the centre. */
  min: number;
  graticule: 'circle' | 'polygon';
}

export interface Radar {
  axes: RadarAxis[];
  series: RadarSeries[];
  options: RadarOptions;
}

export const DEFAULT_OPTIONS: RadarOptions = { showLegend: true, ticks: 5, max: null, min: 0, graticule: 'circle' };
export const MAX_TICKS = 10;

export function valueOf(series: RadarSeries, axis: RadarAxis): number {
  return series.values[axis.id] ?? 0;
}

/** A number without trailing noise: 12.5, not 12.500000000001. */
export function formatScore(value: number): string {
  return String(Math.round(Math.max(0, value) * 1e6) / 1e6);
}

/** The edge of the web as Pele will draw it, and whether the chart sets it itself. */
export function effectiveMax(r: Radar): number {
  const { max, min } = r.options;
  if (max !== null && max > min) return max;
  let peak = min;
  for (const s of r.series) for (const a of r.axes) peak = Math.max(peak, valueOf(s, a));
  return peak;
}

/** Scores that go past the edge of the web, which is where Pele stops drawing them. */
export function overMax(r: Radar): number {
  const { max, min } = r.options;
  if (max === null || max <= min) return 0;
  let count = 0;
  for (const s of r.series) for (const a of r.axes) if (valueOf(s, a) > max) count += 1;
  return count;
}

export function nextRadarId(r: Radar, prefix: 'a' | 'c'): string {
  const used = new Set<string>([...r.axes.map((a) => a.id), ...r.series.map((s) => s.id)]);
  let n = used.size + 1;
  while (used.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

export function starterRadar(): Radar {
  return {
    axes: [
      { id: 'a1', label: 'Design' },
      { id: 'a2', label: 'Code' },
      { id: 'a3', label: 'Test' },
      { id: 'a4', label: 'Docs' },
      { id: 'a5', label: 'Ops' },
    ],
    series: [
      { id: 'c6', label: 'Alice', values: { a1: 4, a2: 3, a3: 2, a4: 5, a5: 1 } },
      { id: 'c7', label: 'Bob', values: { a1: 2, a2: 5, a3: 4, a4: 1, a5: 3 } },
    ],
    options: { ...DEFAULT_OPTIONS, max: 5 },
  };
}

// ───────────────────────────── Writing Mermaid ─────────────────────────────

const label = (text: string, fallback: string): string => oneLine(text).replace(/"/g, '#34;') || fallback;

export function radarToMermaid(r: Radar, meta: KindMeta): string {
  if (!r.axes.length || !r.series.length) return '';
  const lines = headerLines('radar-beta', meta);
  lines.push(`    axis ${r.axes.map((a) => `${a.id}["${label(a.label, 'Axis')}"]`).join(', ')}`);
  for (const s of r.series) {
    lines.push(`    curve ${s.id}["${label(s.label, 'Series')}"]{${r.axes.map((a) => formatScore(valueOf(s, a))).join(', ')}}`);
  }
  const o = r.options;
  if (o.max !== null && o.max > o.min) lines.push(`    max ${formatScore(o.max)}`);
  if (o.min > 0) lines.push(`    min ${formatScore(o.min)}`);
  if (o.ticks !== DEFAULT_OPTIONS.ticks) lines.push(`    ticks ${Math.min(MAX_TICKS, Math.max(1, Math.round(o.ticks)))}`);
  if (o.graticule !== DEFAULT_OPTIONS.graticule) lines.push(`    graticule ${o.graticule}`);
  if (!o.showLegend) lines.push('    showLegend false');
  return lines.join('\n');
}

// ───────────────────────────── Reading Mermaid ─────────────────────────────

export type RadarImport =
  | { ok: true; radar: Radar; title: string; description: string; titleAlign: TitleAlign }
  | { ok: false; reason: string };

const UNSUPPORTED = 'This radar chart has a line the visual editor does not cover.';
const NUMBER = String.raw`(?:\d+(?:\.\d+)?|\.\d+)`;
const ID = String.raw`[A-Za-z_][\w-]*`;

/** "a["Label"], b" into id and label pairs, or null if anything else is in the way. */
function readAxes(text: string): RadarAxis[] | null {
  const part = new RegExp(String.raw`\s*(${ID})(?:\s*\[\s*(?:"([^"]*)"|'([^']*)'|([^\]"']*))\s*\])?\s*(,|$)`, 'y');
  const axes: RadarAxis[] = [];
  let at = 0;
  while (at < text.length) {
    part.lastIndex = at;
    const m = part.exec(text);
    if (!m) return null;
    const raw = m[2] ?? m[3] ?? m[4];
    axes.push({ id: m[1], label: raw === undefined ? m[1] : unescapeText(raw) || m[1] });
    at = part.lastIndex;
    if (m[5] === '' && at < text.length) return null;
  }
  return axes.length ? axes : null;
}

export function radarFromMermaid(source: string): RadarImport {
  try {
    parse(source);
  } catch (error) {
    const line = (error as { line?: number } | null)?.line;
    return { ok: false, reason: line ? `There is a syntax error on line ${line}.` : 'The source could not be read as a diagram.' };
  }
  const body = source.replace(/^\s*---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '');
  const r: Radar = { axes: [], series: [], options: { ...DEFAULT_OPTIONS } };
  let started = false;
  let inlineTitle = '';
  const pending: { id: string; label: string; entries: { key?: string; value: number }[] }[] = [];

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('%%') || /^acc(Title|Descr)\s*:/.test(line)) continue;
    if (!started) {
      const header = /^radar-beta(?:\s+title\s+(.+))?$/.exec(line);
      if (!header) return { ok: false, reason: /^radar/.test(line) ? UNSUPPORTED : 'Only radar charts can be edited here.' };
      if (header[1]) inlineTitle = unescapeText(header[1]);
      started = true;
      continue;
    }
    if (/^title(\s|$)/.test(line)) {
      inlineTitle = unescapeText(line.replace(/^title\s*/, ''));
      continue;
    }
    const axis = /^axis\s+(.+)$/.exec(line);
    if (axis) {
      const found = readAxes(axis[1]);
      if (!found) return { ok: false, reason: UNSUPPORTED };
      r.axes.push(...found);
      continue;
    }
    const curve = new RegExp(String.raw`^curve\s+(${ID})(?:\s*\[\s*(?:"([^"]*)"|'([^']*)'|([^\]"']*))\s*\])?\s*\{([^}]*)\}$`).exec(line);
    if (curve) {
      const entries: { key?: string; value: number }[] = [];
      for (const piece of curve[5].split(',')) {
        const entry = new RegExp(String.raw`^\s*(?:(${ID})\s*:\s*)?(${NUMBER})\s*$`).exec(piece);
        if (!entry) return { ok: false, reason: UNSUPPORTED };
        entries.push({ key: entry[1], value: Number(entry[2]) });
      }
      const name = curve[2] ?? curve[3] ?? curve[4];
      pending.push({ id: curve[1], label: name === undefined ? curve[1] : unescapeText(name) || curve[1], entries });
      continue;
    }
    const option = /^(showLegend|ticks|max|min|graticule)\s+(\S+)$/.exec(line);
    if (!option) return { ok: false, reason: UNSUPPORTED };
    const [, name, value] = option;
    if (name === 'showLegend' && (value === 'true' || value === 'false')) r.options.showLegend = value === 'true';
    else if (name === 'graticule' && (value === 'circle' || value === 'polygon')) r.options.graticule = value;
    else if (name === 'ticks' && /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= MAX_TICKS) r.options.ticks = Number(value);
    else if ((name === 'max' || name === 'min') && new RegExp(`^${NUMBER}$`).test(value)) r.options[name] = Number(value);
    else return { ok: false, reason: UNSUPPORTED };
  }
  if (!started) return { ok: false, reason: 'Only radar charts can be edited here.' };
  if (new Set(r.axes.map((a) => a.id)).size !== r.axes.length) return { ok: false, reason: UNSUPPORTED };
  if (new Set([...r.axes, ...pending].map((x) => x.id)).size !== r.axes.length + pending.length) return { ok: false, reason: UNSUPPORTED };

  for (const p of pending) {
    const values: Record<string, number> = {};
    if (p.entries.every((e) => e.key === undefined)) {
      if (p.entries.length > r.axes.length) return { ok: false, reason: UNSUPPORTED };
      p.entries.forEach((e, i) => (values[r.axes[i].id] = e.value));
    } else if (p.entries.every((e) => e.key !== undefined)) {
      for (const e of p.entries) {
        if (!r.axes.some((a) => a.id === e.key)) return { ok: false, reason: UNSUPPORTED };
        values[e.key!] = e.value;
      }
    } else return { ok: false, reason: UNSUPPORTED };
    r.series.push({ id: p.id, label: p.label, values });
  }
  return { ok: true, radar: r, title: readTitle(source) || inlineTitle, description: readDescription(source), titleAlign: readTitleAlign(source) };
}
