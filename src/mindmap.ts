import { parse } from 'pele';
import { oneLine, readDescription, unescapeText, type KindMeta } from './kinds';
import { readTitle, readTitleAlign, setMetaDescription } from './mermaid';
import type { TitleAlign } from './model';

export type MindShape = 'default' | 'rounded' | 'square' | 'circle' | 'bang' | 'cloud' | 'hexagon';

export interface MindNode {
  id: string;
  text: string;
  shape: MindShape;
  children: MindNode[];
}

export interface MindMap {
  root: MindNode;
}

export const MIND_SHAPES: { id: MindShape; name: string }[] = [
  { id: 'default', name: 'Plain' },
  { id: 'rounded', name: 'Rounded' },
  { id: 'square', name: 'Square' },
  { id: 'circle', name: 'Circle' },
  { id: 'bang', name: 'Bang (jagged)' },
  { id: 'cloud', name: 'Cloud' },
  { id: 'hexagon', name: 'Hexagon' },
];

/** The brackets that mark each shape in Mermaid. */
const WRAP: Record<Exclude<MindShape, 'default'>, [string, string]> = {
  circle: ['((', '))'],
  bang: ['))', '(('],
  rounded: ['(', ')'],
  cloud: [')', '('],
  square: ['[', ']'],
  hexagon: ['{{', '}}'],
};

// ───────────────────────────── Working with the tree ─────────────────────────────

export function nextMindId(map: MindMap): string {
  const used = new Set<string>();
  walk(map.root, (node) => used.add(node.id));
  let n = used.size + 1;
  while (used.has(`m${n}`)) n += 1;
  return `m${n}`;
}

export function walk(node: MindNode, visit: (node: MindNode, parent: MindNode | null, depth: number) => void, parent: MindNode | null = null, depth = 0): void {
  visit(node, parent, depth);
  for (const child of node.children) walk(child, visit, node, depth + 1);
}

export function findNode(map: MindMap, id: string): MindNode | null {
  let found: MindNode | null = null;
  walk(map.root, (node) => {
    if (node.id === id) found = node;
  });
  return found;
}

export function parentOf(map: MindMap, id: string): MindNode | null {
  let found: MindNode | null = null;
  walk(map.root, (node, parent) => {
    if (node.id === id) found = parent;
  });
  return found;
}

export function countNodes(node: MindNode): number {
  return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
}

/** True if `id` is `ancestor` itself or sits anywhere below it. */
export function isWithin(ancestor: MindNode, id: string): boolean {
  let hit = false;
  walk(ancestor, (node) => {
    if (node.id === id) hit = true;
  });
  return hit;
}

/** Every node in reading order, with how deep it sits. */
export function flatten(map: MindMap): { node: MindNode; parent: MindNode | null; depth: number }[] {
  const out: { node: MindNode; parent: MindNode | null; depth: number }[] = [];
  walk(map.root, (node, parent, depth) => out.push({ node, parent, depth }));
  return out;
}

/** Move a node (and everything under it) to sit at `index` among `target`'s children. False if that is not allowed. */
export function moveNode(map: MindMap, id: string, target: MindNode, index: number): boolean {
  const node = findNode(map, id);
  const parent = parentOf(map, id);
  if (!node || !parent || isWithin(node, target.id)) return false;
  const from = parent.children.indexOf(node);
  parent.children.splice(from, 1);
  // Removing it first shifts later positions in the same list by one.
  const at = parent === target && from < index ? index - 1 : index;
  target.children.splice(Math.max(0, Math.min(at, target.children.length)), 0, node);
  return true;
}

export function starterMindMap(): MindMap {
  return {
    root: {
      id: 'm1',
      text: 'Main idea',
      shape: 'circle',
      children: [
        { id: 'm2', text: 'First branch', shape: 'default', children: [] },
        { id: 'm3', text: 'Second branch', shape: 'default', children: [] },
        { id: 'm4', text: 'Third branch', shape: 'default', children: [] },
      ],
    },
  };
}

// ───────────────────────────── Writing Mermaid ─────────────────────────────

/** Make text safe to put on one line of a mind map. */
function escapeNode(text: string, quoted: boolean): string {
  let out = text.replace(/\r/g, '').trim();
  out = out.replace(/"/g, '#34;');
  if (!quoted) {
    // Bare text must not look like a shape, a comment, an icon or a class.
    out = out.replace(/[()[\]{}]/g, (c) => `#${c.charCodeAt(0)};`).replace(/^%/, '#37;').replace(/::/g, '#58;#58;');
  }
  return out.replace(/\n/g, '<br/>') || 'Idea';
}

export function mindToMermaid(map: MindMap, meta: KindMeta): string {
  const title = oneLine(meta.title);
  const lines: string[] = [];
  // Pele's mind map has no accTitle or accDescr lines, so only the title goes in the front matter.
  if (title) lines.push('---', `title: ${JSON.stringify(title)}`, '---');
  lines.push('mindmap');
  let counter = 0;
  const emit = (node: MindNode, depth: number): void => {
    counter += 1;
    const indent = '  '.repeat(depth + 1);
    if (node.shape === 'default') lines.push(`${indent}${escapeNode(node.text, false)}`);
    else {
      const [open, close] = WRAP[node.shape];
      lines.push(`${indent}n${counter}${open}"${escapeNode(node.text, true)}"${close}`);
    }
    for (const child of node.children) emit(child, depth + 1);
  };
  emit(map.root, 0);
  return setMetaDescription(lines.join('\n'), meta.description);
}

// ───────────────────────────── Reading Mermaid ─────────────────────────────

export type MindImport =
  | { ok: true; map: MindMap; title: string; description: string; titleAlign: TitleAlign }
  | { ok: false; reason: string };

const UNSUPPORTED = 'This mind map uses icons, classes or other features the visual editor does not cover.';

/** Shapes in the order they must be tried: the two-character brackets before the one-character ones. */
const SHAPE_ORDER: Exclude<MindShape, 'default'>[] = ['circle', 'bang', 'hexagon', 'rounded', 'cloud', 'square'];

const quoteRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function parseNode(content: string): { text: string; shape: MindShape } | null {
  if (/::icon\(|:::/.test(content)) return null;
  for (const shape of SHAPE_ORDER) {
    const [open, close] = WRAP[shape];
    const match = new RegExp(`^[^\\s()\\[\\]{}]*${quoteRegex(open)}(.*)${quoteRegex(close)}$`).exec(content);
    if (!match) continue;
    let text = match[1].trim();
    if (text.startsWith('`')) return null; // markdown strings
    if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1);
    // Anything left that looks like a bracket means the line was not what it seemed.
    return { text: unescapeText(text) || 'Idea', shape };
  }
  if (/[()[\]{}]/.test(content) || content.startsWith('`')) return null;
  return { text: unescapeText(content) || 'Idea', shape: 'default' };
}

export function mindFromMermaid(source: string): MindImport {
  try {
    parse(source);
  } catch (error) {
    const line = (error as { line?: number } | null)?.line;
    return { ok: false, reason: line ? `There is a syntax error on line ${line}.` : 'The source could not be read as a diagram.' };
  }
  const body = source.replace(/^\s*---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '');
  let started = false;
  let root: MindNode | null = null;
  const stack: { indent: number; node: MindNode }[] = [];
  let counter = 0;

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    const content = line.trim();
    if (!content || content.startsWith('%%')) continue;
    if (!started) {
      if (content !== 'mindmap') return { ok: false, reason: 'Only mind maps can be edited here.' };
      started = true;
      continue;
    }
    const parsed = parseNode(content);
    if (!parsed) return { ok: false, reason: UNSUPPORTED };
    counter += 1;
    const node: MindNode = { id: `m${counter}`, text: parsed.text, shape: parsed.shape, children: [] };
    const indent = line.length - line.trimStart().length;
    if (!root) {
      root = node;
      stack.push({ indent, node });
      continue;
    }
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1]?.node;
    if (!parent) return { ok: false, reason: 'This mind map has more than one top-level idea.' };
    parent.children.push(node);
    stack.push({ indent, node });
  }
  if (!started || !root) return { ok: false, reason: 'Only mind maps can be edited here.' };
  return { ok: true, map: { root }, title: readTitle(source), description: readDescription(source), titleAlign: readTitleAlign(source) };
}
