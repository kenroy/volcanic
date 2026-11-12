import { parse } from 'pele';
import { escapeText, headerLines, oneLine, readDescription, unescapeText, type KindMeta } from './kinds';
import { readTitle, readTitleAlign } from './mermaid';
import type { TitleAlign } from './model';

export interface TimelineEvent {
  id: string;
  text: string;
}

/** A moment or span (a year, "Bronze Age", "Q3") and what happened in it. */
export interface TimelinePeriod {
  id: string;
  label: string;
  events: TimelineEvent[];
}

/** An optional group of periods, drawn in its own colour. */
export interface TimelineSection {
  id: string;
  name: string;
  periods: TimelinePeriod[];
}

export interface Timeline {
  sections: TimelineSection[];
}

export const allPeriods = (t: Timeline): { period: TimelinePeriod; section: TimelineSection; sectionIndex: number; index: number }[] =>
  t.sections.flatMap((section, sectionIndex) => section.periods.map((period, index) => ({ period, section, sectionIndex, index })));

export function findPeriod(t: Timeline, id: string): { period: TimelinePeriod; section: TimelineSection; sectionIndex: number; index: number } | null {
  return allPeriods(t).find((x) => x.period.id === id) ?? null;
}

export function nextTimelineId(t: Timeline, prefix: 's' | 'p' | 'e'): string {
  const used = new Set<string>();
  for (const s of t.sections) {
    used.add(s.id);
    for (const p of s.periods) {
      used.add(p.id);
      for (const e of p.events) used.add(e.id);
    }
  }
  let n = used.size + 1;
  while (used.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

/**
 * Move a period one place earlier or later. At the edge of a section it crosses into the neighbouring one, so
 * the periods keep a single running order.
 */
export function shiftPeriod(t: Timeline, id: string, by: -1 | 1): boolean {
  const from = findPeriod(t, id);
  if (!from) return false;
  const { sectionIndex, index, period, section } = from;
  const target = index + by;
  if (target >= 0 && target < section.periods.length) {
    section.periods.splice(index, 1);
    section.periods.splice(target, 0, period);
    return true;
  }
  const next = t.sections[sectionIndex + by];
  if (!next) return false;
  section.periods.splice(index, 1);
  next.periods.splice(by < 0 ? next.periods.length : 0, 0, period);
  return true;
}

export function starterTimeline(): Timeline {
  return {
    sections: [
      {
        id: 's1',
        name: '',
        periods: [
          { id: 'p2', label: '2022', events: [{ id: 'e3', text: 'First idea' }] },
          { id: 'p4', label: '2024', events: [{ id: 'e5', text: 'Prototype' }, { id: 'e6', text: 'First users' }] },
          { id: 'p7', label: '2026', events: [{ id: 'e8', text: 'Release' }] },
        ],
      },
    ],
  };
}

// ───────────────────────────── Writing Mermaid ─────────────────────────────

/** Text for a period or event: no colons, which separate the parts of a line. */
const safe = (text: string): string => escapeText(oneLine(text), true);

export function timelineToMermaid(t: Timeline, meta: KindMeta): string {
  if (!allPeriods(t).length) return '';
  const lines = headerLines('timeline', meta);
  t.sections.forEach((section, index) => {
    const name = oneLine(section.name);
    if (name || index > 0) lines.push(`    section ${safe(name) || 'Section'}`);
    for (const period of section.periods) {
      const events = period.events.map((e) => safe(e.text)).filter(Boolean);
      lines.push(`      ${[safe(period.label) || 'Period', ...events].join(' : ')}`);
    }
  });
  return lines.join('\n');
}

// ───────────────────────────── Reading Mermaid ─────────────────────────────

export type TimelineImport =
  | { ok: true; timeline: Timeline; title: string; description: string; titleAlign: TitleAlign }
  | { ok: false; reason: string };

export function timelineFromMermaid(source: string): TimelineImport {
  try {
    parse(source);
  } catch (error) {
    const line = (error as { line?: number } | null)?.line;
    return { ok: false, reason: line ? `There is a syntax error on line ${line}.` : 'The source could not be read as a diagram.' };
  }
  const body = source.replace(/^\s*---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '');
  const t: Timeline = { sections: [] };
  let started = false;
  let inlineTitle = '';
  let section: TimelineSection | null = null;
  let period: TimelinePeriod | null = null;
  let counter = 0;
  const next = (prefix: 's' | 'p' | 'e'): string => {
    counter += 1;
    return `${prefix}${counter}`;
  };

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('%%') || /^acc(Title|Descr)\s*:/.test(line)) continue;
    if (!started) {
      if (line !== 'timeline') return { ok: false, reason: 'Only timelines can be edited here.' };
      started = true;
      continue;
    }
    if (/^title(\s|$)/.test(line)) {
      inlineTitle = unescapeText(line.replace(/^title\s*/, ''));
      continue;
    }
    if (/^direction\b/.test(line)) return { ok: false, reason: 'This timeline sets its direction, which the visual editor does not cover.' };
    if (/^section(\s|$)/.test(line)) {
      section = { id: next('s'), name: unescapeText(line.replace(/^section\s*/, '')), periods: [] };
      t.sections.push(section);
      period = null;
      continue;
    }
    const parts = line.split(':').map((p) => unescapeText(p));
    if (line.startsWith(':')) {
      // A line that begins with a colon adds more events to the period above it.
      if (!period) return { ok: false, reason: 'This timeline has an event with no period before it.' };
      for (const text of parts.slice(1)) if (text) period.events.push({ id: next('e'), text });
      continue;
    }
    if (!section) {
      section = { id: next('s'), name: '', periods: [] };
      t.sections.push(section);
    }
    period = { id: next('p'), label: parts[0] || 'Period', events: [] };
    for (const text of parts.slice(1)) if (text) period.events.push({ id: next('e'), text });
    section.periods.push(period);
  }
  if (!started) return { ok: false, reason: 'Only timelines can be edited here.' };
  return { ok: true, timeline: t, title: readTitle(source) || inlineTitle, description: readDescription(source), titleAlign: readTitleAlign(source) };
}
