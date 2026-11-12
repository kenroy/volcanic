import { parse } from 'pele';
import { headerLines, oneLine, readDescription, unescapeText, type KindMeta } from './kinds';
import { readTitle, readTitleAlign } from './mermaid';
import type { TitleAlign } from './model';

/** One field of the packet, which takes up the next `bits` bits after the field before it. */
export interface PacketField {
  id: string;
  label: string;
  bits: number;
}

export interface Packet {
  fields: PacketField[];
}

export const MAX_BITS = 4096;
/** Pele draws 32 bits to a row. */
export const BITS_PER_ROW = 32;

export interface PlacedField {
  field: PacketField;
  start: number;
  end: number;
}

/** Each field with the bits it covers: fields run one after another from bit 0. */
export function placeFields(p: Packet): PlacedField[] {
  let at = 0;
  return p.fields.map((field) => {
    const placed = { field, start: at, end: at + field.bits - 1 };
    at += field.bits;
    return placed;
  });
}

export const totalBits = (p: Packet): number => p.fields.reduce((sum, f) => sum + f.bits, 0);

/** "0–15", or just "64" for a single bit. */
export const rangeText = (start: number, end: number): string => (start === end ? String(start) : `${start}–${end}`);

export function nextFieldId(p: Packet): string {
  const used = new Set(p.fields.map((f) => f.id));
  let n = used.size + 1;
  while (used.has(`f${n}`)) n += 1;
  return `f${n}`;
}

export function starterPacket(): Packet {
  const rows: [string, number][] = [
    ['Source port', 16],
    ['Destination port', 16],
    ['Sequence number', 32],
    ['Acknowledgment number', 32],
  ];
  return { fields: rows.map(([label, bits], i) => ({ id: `f${i + 1}`, label, bits })) };
}

// ───────────────────────────── Writing Mermaid ─────────────────────────────

/** A label in quotes. Packet text has no way to hold a quote mark, so those become apostrophes. */
const quoted = (text: string, fallback: string): string => `"${oneLine(text).replace(/"/g, "'") || fallback}"`;

export function packetToMermaid(p: Packet, meta: KindMeta): string {
  if (!p.fields.length) return '';
  const lines = headerLines('packet-beta', meta);
  for (const { field, start } of placeFields(p)) {
    const bits = Math.min(MAX_BITS, Math.max(1, Math.round(field.bits)));
    lines.push(`    ${bits === 1 ? start : `${start}-${start + bits - 1}`}: ${quoted(field.label, 'Field')}`);
  }
  return lines.join('\n');
}

// ───────────────────────────── Reading Mermaid ─────────────────────────────

export type PacketImport =
  | { ok: true; packet: Packet; title: string; description: string; titleAlign: TitleAlign }
  | { ok: false; reason: string };

const UNSUPPORTED = 'This packet diagram has a line the visual editor does not cover.';
const LINE = /^(?:(\d+)(?:\s*-\s*(\d+))?|\+(\d+))\s*:\s*(?:"([^"]*)"|'([^']*)')$/;

export function packetFromMermaid(source: string): PacketImport {
  try {
    parse(source);
  } catch (error) {
    const line = (error as { line?: number } | null)?.line;
    return { ok: false, reason: line ? `There is a syntax error on line ${line}.` : 'The source could not be read as a diagram.' };
  }
  const body = source.replace(/^\s*---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '');
  const p: Packet = { fields: [] };
  let started = false;
  let at = 0;

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('%%') || /^acc(Title|Descr)\s*:/.test(line) || /^title(\s|$)/.test(line)) continue;
    if (!started) {
      if (!/^packet(-beta)?$/.test(line)) return { ok: false, reason: /^packet/.test(line) ? UNSUPPORTED : 'Only packet diagrams can be edited here.' };
      started = true;
      continue;
    }
    const m = LINE.exec(line);
    if (!m) return { ok: false, reason: UNSUPPORTED };
    let bits: number;
    if (m[3] !== undefined) bits = Number(m[3]);
    else {
      const start = Number(m[1]);
      const end = m[2] === undefined ? start : Number(m[2]);
      if (start !== at || end < start) return { ok: false, reason: UNSUPPORTED };
      bits = end - start + 1;
    }
    if (bits < 1 || bits > MAX_BITS) return { ok: false, reason: UNSUPPORTED };
    p.fields.push({ id: `f${p.fields.length + 1}`, label: unescapeText(m[4] ?? m[5]) || 'Field', bits });
    at += bits;
  }
  if (!started) return { ok: false, reason: 'Only packet diagrams can be edited here.' };
  return { ok: true, packet: p, title: readTitle(source), description: readDescription(source), titleAlign: readTitleAlign(source) };
}
