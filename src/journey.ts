import { parse } from 'pele';
import { escapeText, headerLines, oneLine, readDescription, unescapeText, type KindMeta } from './kinds';
import { readTitle, readTitleAlign } from './mermaid';
import type { TitleAlign } from './model';

export interface JourneyStep {
  id: string;
  text: string;
  /** How the person felt at this step, 1 (very unhappy) to 5 (very happy). */
  score: number;
  /** Who is involved in the step. */
  actors: string[];
}

export interface JourneySection {
  id: string;
  name: string;
  steps: JourneyStep[];
}

export interface Journey {
  sections: JourneySection[];
}

export const SCORES: { score: number; name: string }[] = [
  { score: 5, name: 'Very happy' },
  { score: 4, name: 'Happy' },
  { score: 3, name: 'Neutral' },
  { score: 2, name: 'Unhappy' },
  { score: 1, name: 'Very unhappy' },
];

export const scoreName = (score: number): string => SCORES.find((s) => s.score === score)?.name ?? String(score);

// ───────────────────────────── Working with the journey ─────────────────────────────

export function allSteps(j: Journey): { step: JourneyStep; section: JourneySection; sectionIndex: number; index: number }[] {
  return j.sections.flatMap((section, sectionIndex) => section.steps.map((step, index) => ({ step, section, sectionIndex, index })));
}

export function findStep(j: Journey, id: string): { step: JourneyStep; section: JourneySection; sectionIndex: number; index: number } | null {
  return allSteps(j).find((x) => x.step.id === id) ?? null;
}

/**
 * Everyone who appears in the journey, in the order Pele gives them colours: sorted by name the plain way
 * (capitals before lower case), not the order they first appear. Using the same order keeps each person's colour
 * the same in the editor and in the finished diagram.
 */
export function actorsOf(j: Journey): string[] {
  const seen = new Set<string>();
  for (const { step } of allSteps(j)) for (const a of step.actors) seen.add(a);
  return Array.from(seen).sort();
}

export function nextJourneyId(j: Journey, prefix: 's' | 'j'): string {
  const used = new Set<string>();
  for (const section of j.sections) {
    used.add(section.id);
    for (const step of section.steps) used.add(step.id);
  }
  let n = used.size + 1;
  while (used.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

/** Move a step to sit at `index` in a section (counted before the step is lifted out). */
export function moveStep(j: Journey, id: string, sectionIndex: number, index: number): boolean {
  const from = findStep(j, id);
  const target = j.sections[sectionIndex];
  if (!from || !target) return false;
  from.section.steps.splice(from.index, 1);
  const at = from.section === target && from.index < index ? index - 1 : index;
  target.steps.splice(Math.max(0, Math.min(at, target.steps.length)), 0, from.step);
  return true;
}

export function starterJourney(): Journey {
  return {
    sections: [
      {
        id: 'j1',
        name: 'Getting started',
        steps: [
          { id: 's2', text: 'First step', score: 4, actors: ['Me'] },
          { id: 's3', text: 'A harder step', score: 2, actors: ['Me'] },
        ],
      },
      { id: 'j4', name: 'Getting it done', steps: [{ id: 's5', text: 'The result', score: 5, actors: ['Me'] }] },
    ],
  };
}

// ───────────────────────────── Writing Mermaid ─────────────────────────────

/** Text for a step or person: no colons or commas, which separate the parts of a line. */
function safe(text: string): string {
  return escapeText(oneLine(text), true).replace(/,/g, '#44;');
}

export function journeyToMermaid(j: Journey, meta: KindMeta): string {
  if (!allSteps(j).length) return '';
  const lines = headerLines('journey', meta);
  j.sections.forEach((section, index) => {
    const name = oneLine(section.name);
    if (name || index > 0) lines.push(`    section ${safe(name) || 'Section'}`);
    for (const step of section.steps) {
      const score = Math.min(5, Math.max(1, Math.round(step.score)));
      const people = step.actors.map(safe).filter(Boolean);
      lines.push(`      ${safe(step.text) || 'Step'}: ${score}${people.length ? `: ${people.join(', ')}` : ''}`);
    }
  });
  return lines.join('\n');
}

// ───────────────────────────── Reading Mermaid ─────────────────────────────

export type JourneyImport =
  | { ok: true; journey: Journey; title: string; description: string; titleAlign: TitleAlign }
  | { ok: false; reason: string };

const UNSUPPORTED = 'This journey has a step whose score is not a whole number from 1 to 5.';

export function journeyFromMermaid(source: string): JourneyImport {
  try {
    parse(source);
  } catch (error) {
    const line = (error as { line?: number } | null)?.line;
    return { ok: false, reason: line ? `There is a syntax error on line ${line}.` : 'The source could not be read as a diagram.' };
  }
  const body = source.replace(/^\s*---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '');
  const j: Journey = { sections: [] };
  let started = false;
  let inlineTitle = '';
  let section: JourneySection | null = null;
  let counter = 0;
  const next = (prefix: 's' | 'j'): string => {
    counter += 1;
    return `${prefix}${counter}`;
  };

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('%%') || /^acc(Title|Descr)\s*:/.test(line)) continue;
    if (!started) {
      if (line !== 'journey') return { ok: false, reason: 'Only user journeys can be edited here.' };
      started = true;
      continue;
    }
    if (/^title(\s|$)/.test(line)) {
      inlineTitle = unescapeText(line.replace(/^title\s*/, ''));
      continue;
    }
    if (/^section(\s|$)/.test(line)) {
      section = { id: next('j'), name: unescapeText(line.replace(/^section\s*/, '')), steps: [] };
      j.sections.push(section);
      continue;
    }
    const match = /^([^:]*):\s*([^:]*?)\s*(?::(.*))?$/.exec(line);
    if (!match || !/^\d+$/.test(match[2])) return { ok: false, reason: UNSUPPORTED };
    const score = Number(match[2]);
    if (score < 1 || score > 5) return { ok: false, reason: UNSUPPORTED };
    if (!section) {
      section = { id: next('j'), name: '', steps: [] };
      j.sections.push(section);
    }
    const actors: string[] = [];
    for (const part of (match[3] ?? '').split(',')) {
      const name = unescapeText(part);
      if (name && !actors.includes(name)) actors.push(name);
    }
    section.steps.push({ id: next('s'), text: unescapeText(match[1]) || 'Step', score, actors });
  }
  if (!started) return { ok: false, reason: 'Only user journeys can be edited here.' };
  const title = readTitle(source) || inlineTitle;
  return { ok: true, journey: j, title, description: readDescription(source), titleAlign: readTitleAlign(source) };
}
