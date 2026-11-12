import { parse } from 'pele';
import { escapeText, headerLines, oneLine, readDescription, unescapeText, type KindMeta } from './kinds';
import { readTitle, readTitleAlign } from './mermaid';
import type { TitleAlign } from './model';

export type SeqStyle = 'solid' | 'dotted' | 'async' | 'lost';
export type NotePlace = 'left' | 'right' | 'over';

export interface SeqParticipant {
  id: string;
  label: string;
  actor: boolean;
}

export interface SeqMessage {
  kind: 'message';
  id: string;
  from: string;
  to: string;
  text: string;
  style: SeqStyle;
}

export interface SeqNote {
  kind: 'note';
  id: string;
  place: NotePlace;
  /** One participant, or two for a note spanning both (over only). */
  targets: string[];
  text: string;
}

export type SeqStep = SeqMessage | SeqNote;

export interface SeqDiagram {
  participants: SeqParticipant[];
  steps: SeqStep[];
  autonumber: boolean;
}

export const SEQ_STYLES: { id: SeqStyle; name: string }[] = [
  { id: 'solid', name: 'Solid arrow (a call)' },
  { id: 'dotted', name: 'Dotted arrow (a reply)' },
  { id: 'async', name: 'Open arrow (no wait)' },
  { id: 'lost', name: 'Cross (message lost)' },
];

export const NOTE_PLACES: { id: NotePlace; name: string }[] = [
  { id: 'right', name: 'Right of' },
  { id: 'left', name: 'Left of' },
  { id: 'over', name: 'Over' },
];

const ARROW: Record<SeqStyle, string> = { solid: '->>', dotted: '-->>', async: '-)', lost: '-x' };
const ID = '[A-Za-z_]\\w*';
const MESSAGE = new RegExp(`^(${ID})\\s*(-->>|->>|-\\)|-x)\\s*(${ID})\\s*:\\s?(.*)$`);
const PARTICIPANT = new RegExp(`^(participant|actor)\\s+(${ID})(?:\\s+as\\s+(.+))?$`);
const NOTE = new RegExp(`^note\\s+(left of|right of|over)\\s+(${ID})(?:\\s*,\\s*(${ID}))?\\s*:\\s?(.*)$`, 'i');

export function starterSequence(): SeqDiagram {
  return {
    participants: [
      { id: 'p1', label: 'Alice', actor: false },
      { id: 'p2', label: 'Bob', actor: false },
    ],
    steps: [
      { kind: 'message', id: 's1', from: 'p1', to: 'p2', text: 'Hello Bob', style: 'solid' },
      { kind: 'message', id: 's2', from: 'p2', to: 'p1', text: 'Hi Alice', style: 'dotted' },
    ],
    autonumber: false,
  };
}

export function seqLabel(d: SeqDiagram, id: string): string {
  return oneLine(d.participants.find((p) => p.id === id)?.label ?? id) || id;
}

/** A step in words, for screen readers and the outline. */
export function describeStep(d: SeqDiagram, step: SeqStep): string {
  const text = oneLine(step.text) || 'no text';
  if (step.kind === 'message') {
    const how = { solid: 'calls', dotted: 'replies to', async: 'sends to', lost: 'sends a lost message to' }[step.style];
    return `${seqLabel(d, step.from)} ${how} ${seqLabel(d, step.to)}: ${text}`;
  }
  const where = step.place === 'over' ? 'over' : step.place === 'left' ? 'left of' : 'right of';
  return `Note ${where} ${step.targets.map((t) => seqLabel(d, t)).join(' and ')}: ${text}`;
}

export function seqToMermaid(d: SeqDiagram, meta: KindMeta): string {
  if (!d.participants.length) return '';
  const lines = headerLines('sequenceDiagram', meta);
  if (d.autonumber) lines.push('    autonumber');
  for (const p of d.participants) lines.push(`    ${p.actor ? 'actor' : 'participant'} ${p.id} as ${escapeText(oneLine(p.label)) || p.id}`);
  for (const step of d.steps) {
    const text = escapeText(step.text).trim() || '...';
    if (step.kind === 'message') lines.push(`    ${step.from}${ARROW[step.style]}${step.to}: ${text}`);
    else {
      const where = step.place === 'over' ? 'over' : step.place === 'left' ? 'left of' : 'right of';
      lines.push(`    Note ${where} ${step.targets.join(',')}: ${text}`);
    }
  }
  return lines.join('\n');
}

export type SeqImport =
  | { ok: true; diagram: SeqDiagram; title: string; description: string; titleAlign: TitleAlign }
  | { ok: false; reason: string };

const UNSUPPORTED = 'This sequence diagram uses groups, activations or other features the visual editor does not cover.';

export function seqFromMermaid(source: string): SeqImport {
  try {
    parse(source);
  } catch (error) {
    const line = (error as { line?: number } | null)?.line;
    return { ok: false, reason: line ? `There is a syntax error on line ${line}.` : 'The source could not be read as a diagram.' };
  }
  const body = source.replace(/^\s*---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '');
  const d: SeqDiagram = { participants: [], steps: [], autonumber: false };
  const known = (id: string): void => {
    if (!d.participants.some((p) => p.id === id)) d.participants.push({ id, label: id, actor: false });
  };
  let started = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('%%') || /^acc(Title|Descr)\s*:/.test(line)) continue;
    if (!started) {
      if (line !== 'sequenceDiagram') return { ok: false, reason: 'Only sequence diagrams can be edited here.' };
      started = true;
      continue;
    }
    if (line === 'autonumber') {
      d.autonumber = true;
      continue;
    }
    let m = PARTICIPANT.exec(line);
    if (m) {
      const existing = d.participants.find((p) => p.id === m![2]);
      const label = m[3] ? unescapeText(m[3].replace(/^"(.*)"$/, '$1')) : m[2];
      if (existing) Object.assign(existing, { label, actor: m[1] === 'actor' });
      else d.participants.push({ id: m[2], label, actor: m[1] === 'actor' });
      continue;
    }
    m = MESSAGE.exec(line);
    if (m) {
      known(m[1]);
      known(m[3]);
      const style = (Object.keys(ARROW) as SeqStyle[]).find((k) => ARROW[k] === m![2])!;
      d.steps.push({ kind: 'message', id: `s${d.steps.length + 1}`, from: m[1], to: m[3], text: unescapeText(m[4]), style });
      continue;
    }
    m = NOTE.exec(line);
    if (m) {
      const place: NotePlace = m[1].toLowerCase() === 'over' ? 'over' : m[1].toLowerCase() === 'left of' ? 'left' : 'right';
      if (m[3] && place !== 'over') return { ok: false, reason: UNSUPPORTED };
      known(m[2]);
      if (m[3]) known(m[3]);
      d.steps.push({ kind: 'note', id: `s${d.steps.length + 1}`, place, targets: m[3] ? [m[2], m[3]] : [m[2]], text: unescapeText(m[4]) });
      continue;
    }
    return { ok: false, reason: UNSUPPORTED };
  }
  if (!started) return { ok: false, reason: 'Only sequence diagrams can be edited here.' };
  return { ok: true, diagram: d, title: readTitle(source), description: readDescription(source), titleAlign: readTitleAlign(source) };
}
