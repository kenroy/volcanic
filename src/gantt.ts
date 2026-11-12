import { parse } from 'pele';
import { escapeText, headerLines, oneLine, readDescription, unescapeText, type KindMeta } from './kinds';
import type { HolidayChoice } from './holidays';
import { readHolidayPlaces, readTaskDetails, readTitle, readTitleAlign, setHolidayPlaces, setTaskDetails } from './mermaid';
import type { TitleAlign } from './model';

export type TaskStatus = 'planned' | 'active' | 'done';

export type TaskStart = { type: 'date'; day: number } | { type: 'after'; id: string };

export interface GanttTask {
  id: string;
  name: string;
  status: TaskStatus;
  critical: boolean;
  milestone: boolean;
  start: TaskStart;
  /** Length in days. Zero for milestones. */
  duration: number;
  /** Who the task is assigned to. Empty for nobody. */
  assignee: string;
  /** Percent complete, 0 to 100. */
  progress: number;
}

export interface GanttSection {
  id: string;
  name: string;
  tasks: GanttTask[];
}

export interface GanttDiagram {
  sections: GanttSection[];
  /** Mermaid axis format, kept as written so hand-made charts survive. Empty for the default. */
  axisFormat: string;
  /** Whose holidays to mark on the timeline: one entry per country (or region). Empty for none. */
  holidays: HolidayChoice[];
}

export const TASK_STATUSES: { id: TaskStatus; name: string }[] = [
  { id: 'planned', name: 'Planned' },
  { id: 'active', name: 'In progress' },
  { id: 'done', name: 'Done' },
];

const DAY = 86400000;

/** Days since 1970-01-01 for an ISO date, or null if it is not a real date. */
export function toDay(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const time = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const date = new Date(time);
  if (date.getUTCFullYear() !== Number(m[1]) || date.getUTCMonth() !== Number(m[2]) - 1 || date.getUTCDate() !== Number(m[3])) return null;
  return Math.round(time / DAY);
}

export function toIso(day: number): string {
  return new Date(day * DAY).toISOString().slice(0, 10);
}

export function today(): number {
  const now = new Date();
  return Math.round(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY);
}

/** A date in the reader's own format, e.g. "5 Jan 2026". */
export function formatDay(day: number, withYear = true): string {
  return new Date(day * DAY).toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });
}

export function allTasks(d: GanttDiagram): GanttTask[] {
  return d.sections.flatMap((s) => s.tasks);
}

export interface Span {
  start: number;
  /** The day after the last day of the task. */
  end: number;
}

/** Real start and end days for every task, following "after" links. */
export function resolveSpans(d: GanttDiagram): Map<string, Span> {
  const byId = new Map(allTasks(d).map((t) => [t.id, t]));
  const spans = new Map<string, Span>();
  const busy = new Set<string>();
  const calc = (task: GanttTask): Span => {
    const done = spans.get(task.id);
    if (done) return done;
    let start = today();
    if (task.start.type === 'date') start = task.start.day;
    else {
      const dependency = byId.get(task.start.id);
      if (dependency && !busy.has(task.id)) {
        busy.add(task.id);
        start = calc(dependency).end;
        busy.delete(task.id);
      }
    }
    const span = { start, end: start + (task.milestone ? 0 : task.duration) };
    spans.set(task.id, span);
    return span;
  };
  for (const task of byId.values()) calc(task);
  return spans;
}

/** True if `task` depends, directly or not, on `onId`. */
export function dependsOn(d: GanttDiagram, task: GanttTask, onId: string): boolean {
  const byId = new Map(allTasks(d).map((t) => [t.id, t]));
  const seen = new Set<string>();
  let current: GanttTask | undefined = task;
  while (current && current.start.type === 'after' && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.start.id === onId) return true;
    current = byId.get(current.start.id);
  }
  return false;
}

export function starterGantt(): GanttDiagram {
  const start = today();
  return {
    axisFormat: '',
    holidays: [],
    sections: [
      {
        id: 'g1',
        name: 'Phase 1',
        tasks: [
          { id: 't1', name: 'Plan', status: 'planned', critical: false, milestone: false, start: { type: 'date', day: start }, duration: 5, assignee: '', progress: 0 },
          { id: 't2', name: 'Build', status: 'planned', critical: false, milestone: false, start: { type: 'after', id: 't1' }, duration: 10, assignee: '', progress: 0 },
        ],
      },
    ],
  };
}

export function ganttToMermaid(d: GanttDiagram, meta: KindMeta): string {
  if (!allTasks(d).length) return '';
  const lines = headerLines('gantt', meta);
  lines.push('    dateFormat YYYY-MM-DD');
  if (d.axisFormat) lines.push(`    axisFormat ${d.axisFormat}`);
  d.sections.forEach((section, index) => {
    const name = oneLine(section.name);
    if (name || index > 0) lines.push(`    section ${escapeText(name) || 'Section'}`);
    for (const task of section.tasks) {
      const parts: string[] = [];
      if (task.status !== 'planned') parts.push(task.status);
      if (task.critical) parts.push('crit');
      if (task.milestone) parts.push('milestone');
      parts.push(task.id);
      parts.push(task.start.type === 'date' ? toIso(task.start.day) : `after ${task.start.id}`);
      parts.push(`${task.milestone ? 0 : Math.max(1, Math.round(task.duration))}d`);
      lines.push(`    ${escapeText(oneLine(task.name), true) || 'Task'} :${parts.join(', ')}`);
    }
  });
  const details: Record<string, { assignee: string; progress: number }> = {};
  for (const task of allTasks(d)) details[task.id] = { assignee: task.assignee ?? '', progress: task.progress ?? 0 };
  return setHolidayPlaces(setTaskDetails(lines.join('\n'), details), d.holidays ?? []);
}

export type GanttImport =
  | { ok: true; diagram: GanttDiagram; title: string; description: string; titleAlign: TitleAlign }
  | { ok: false; reason: string };

const UNSUPPORTED = 'This Gantt chart uses dates, exclusions or other options the visual editor does not cover.';
const TAGS = ['done', 'active', 'crit', 'milestone'];

export function ganttFromMermaid(source: string): GanttImport {
  try {
    parse(source);
  } catch (error) {
    const line = (error as { line?: number } | null)?.line;
    return { ok: false, reason: line ? `There is a syntax error on line ${line}.` : 'The source could not be read as a diagram.' };
  }
  const body = source.replace(/^\s*---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '');
  const d: GanttDiagram = { sections: [], axisFormat: '', holidays: readHolidayPlaces(source) };
  let started = false;
  let inlineTitle = '';
  let section: GanttSection | null = null;

  interface Raw {
    task: GanttTask;
    explicitId: boolean;
    start: string | null;
    end: string;
  }
  const raws: Raw[] = [];

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('%%') || /^acc(Title|Descr)\s*:/.test(line)) continue;
    if (!started) {
      if (line !== 'gantt') return { ok: false, reason: 'Only Gantt charts can be edited here.' };
      started = true;
      continue;
    }
    if (/^dateFormat\s/.test(line)) {
      if (line.replace(/\s+/g, ' ') !== 'dateFormat YYYY-MM-DD') return { ok: false, reason: UNSUPPORTED };
      continue;
    }
    if (/^axisFormat\s/.test(line)) {
      d.axisFormat = line.replace(/^axisFormat\s+/, '');
      continue;
    }
    if (/^title\s/.test(line)) {
      inlineTitle = unescapeText(line.replace(/^title\s+/, ''));
      continue;
    }
    if (/^section\s/.test(line) || line === 'section') {
      section = { id: `g${d.sections.length + 1}`, name: unescapeText(line.replace(/^section\s*/, '')), tasks: [] };
      d.sections.push(section);
      continue;
    }
    const colon = line.indexOf(':');
    if (colon < 1 || /^(excludes|includes|todayMarker|tickInterval|weekday|weekend|click|vert|topAxis|inclusiveEndDates)\b/.test(line)) return { ok: false, reason: UNSUPPORTED };

    if (!section) {
      section = { id: 'g1', name: '', tasks: [] };
      d.sections.push(section);
    }
    const tokens = line.slice(colon + 1).split(',').map((t) => t.trim()).filter(Boolean);
    const tags: string[] = [];
    while (tokens.length && TAGS.includes(tokens[0])) tags.push(tokens.shift()!);
    let id = '';
    if (tokens.length >= 2 && /^[A-Za-z_][\w-]*$/.test(tokens[0]) && !/^after$/.test(tokens[0])) id = tokens.shift()!;
    // "Task :b3" names the task and nothing else: it follows the previous task and lasts a day.
    let idOnly = false;
    if (!id && tokens.length === 1 && /^[A-Za-z_][\w-]*$/.test(tokens[0]) && tokens[0] !== 'after') {
      id = tokens.shift()!;
      idOnly = true;
    }
    if (tokens.length > 2 || (tokens.length < 1 && !idOnly)) return { ok: false, reason: UNSUPPORTED };
    const end = idOnly ? '1d' : tokens[tokens.length - 1];
    const start = tokens.length === 2 ? tokens[0] : null;
    const milestone = tags.includes('milestone');
    const task: GanttTask = {
      id,
      name: unescapeText(line.slice(0, colon)),
      status: tags.includes('done') ? 'done' : tags.includes('active') ? 'active' : 'planned',
      critical: tags.includes('crit'),
      milestone,
      start: { type: 'date', day: 0 },
      duration: milestone ? 0 : 1,
      assignee: '',
      progress: 0,
    };
    section.tasks.push(task);
    raws.push({ task, explicitId: !!id, start, end });
  }
  if (!started) return { ok: false, reason: 'Only Gantt charts can be edited here.' };

  // Give every task an id, then work out starts and lengths.
  const used = new Set(raws.filter((r) => r.explicitId).map((r) => r.task.id));
  if (used.size !== raws.filter((r) => r.explicitId).length) return { ok: false, reason: UNSUPPORTED };
  let counter = 0;
  for (const r of raws) {
    if (r.task.id) continue;
    do counter += 1;
    while (used.has(`t${counter}`));
    r.task.id = `t${counter}`;
    used.add(r.task.id);
  }

  let previous: GanttTask | null = null;
  const days = new Map<string, number>();
  for (const r of raws) {
    const task = r.task;
    if (r.start === null) {
      if (!previous) return { ok: false, reason: UNSUPPORTED };
      task.start = { type: 'after', id: previous.id };
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(r.start)) {
      const day = toDay(r.start);
      if (day === null) return { ok: false, reason: UNSUPPORTED };
      task.start = { type: 'date', day };
    } else {
      const m = /^after\s+([A-Za-z_][\w-]*)$/.exec(r.start);
      if (!m || !raws.some((x) => x.task.id === m[1] && x.task !== task)) return { ok: false, reason: UNSUPPORTED };
      task.start = { type: 'after', id: m[1] };
    }
    const length = /^(\d+)([dw])$/.exec(r.end);
    if (length) {
      if (!task.milestone) task.duration = Math.max(1, Number(length[1]) * (length[2] === 'w' ? 7 : 1));
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(r.end) && task.start.type === 'date') {
      const endDay = toDay(r.end);
      if (endDay === null || endDay < task.start.day) return { ok: false, reason: UNSUPPORTED };
      if (!task.milestone) task.duration = Math.max(1, endDay - task.start.day);
    } else return { ok: false, reason: UNSUPPORTED };
    days.set(task.id, task.duration);
    previous = task;
  }

  const details = readTaskDetails(source);
  for (const raw of raws) {
    const found = details[raw.task.id];
    if (found) {
      raw.task.assignee = found.assignee;
      raw.task.progress = found.progress;
    }
  }
  const meta = { title: readTitle(source), description: readDescription(source) };
  if (!meta.title && inlineTitle) meta.title = inlineTitle;
  return { ok: true, diagram: d, ...meta, titleAlign: readTitleAlign(source) };
}
