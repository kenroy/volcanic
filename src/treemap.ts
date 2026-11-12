import { parse } from 'pele';
import { headerLines, oneLine, readDescription, type KindMeta } from './kinds';
import { readTitle, readTitleAlign } from './mermaid';
import type { TitleAlign } from './model';

/**
 * One box in the treemap. A box with others inside it takes its size from them; a box with nothing inside it
 * has a size of its own. (A box keeps its own size while it holds others, so emptying it brings the size back.)
 */
export interface TreeNode {
  id: string;
  name: string;
  value: number;
  children: TreeNode[];
}

export interface Treemap {
  /** The outermost boxes. Most treemaps have just one. */
  roots: TreeNode[];
}

/** A number without trailing noise: 12.5, not 12.500000000001. */
export const formatSize = (n: number): string => String(Math.round(Math.max(0, n) * 1e6) / 1e6);

/** The size a box ends up with: its own if it is empty, otherwise the sum of what is inside. */
export function sizeOf(node: TreeNode): number {
  return node.children.length ? node.children.reduce((sum, c) => sum + sizeOf(c), 0) : node.value;
}

export interface Placed {
  node: TreeNode;
  parent: TreeNode | null;
  /** Where it sits among its siblings. */
  index: number;
  depth: number;
  siblings: TreeNode[];
}

/** Every box in reading order, with where it sits. */
export function flattenTree(t: Treemap): Placed[] {
  const out: Placed[] = [];
  const walk = (nodes: TreeNode[], parent: TreeNode | null, depth: number): void => {
    nodes.forEach((node, index) => {
      out.push({ node, parent, index, depth, siblings: nodes });
      walk(node.children, node, depth + 1);
    });
  };
  walk(t.roots, null, 0);
  return out;
}

export function findTreeNode(t: Treemap, id: string): Placed | null {
  return flattenTree(t).find((p) => p.node.id === id) ?? null;
}

export function nextTreeId(t: Treemap): string {
  const used = new Set(flattenTree(t).map((p) => p.node.id));
  let n = used.size + 1;
  while (used.has(`n${n}`)) n += 1;
  return `n${n}`;
}

/** Move a box earlier or later among its siblings. */
export function shiftNode(t: Treemap, id: string, by: -1 | 1): boolean {
  const at = findTreeNode(t, id);
  if (!at) return false;
  const to = at.index + by;
  if (to < 0 || to >= at.siblings.length) return false;
  const [node] = at.siblings.splice(at.index, 1);
  at.siblings.splice(to, 0, node);
  return true;
}

/** Put a box inside the one above it (its previous sibling), as that box's last child. */
export function indentNode(t: Treemap, id: string): boolean {
  const at = findTreeNode(t, id);
  if (!at || at.index === 0) return false;
  const above = at.siblings[at.index - 1];
  at.siblings.splice(at.index, 1);
  above.children.push(at.node);
  return true;
}

/** Take a box out of its parent, to sit just after it. */
export function outdentNode(t: Treemap, id: string): boolean {
  const at = findTreeNode(t, id);
  if (!at || !at.parent) return false;
  const up = findTreeNode(t, at.parent.id)!;
  at.siblings.splice(at.index, 1);
  up.siblings.splice(up.index + 1, 0, at.node);
  return true;
}

const leaf = (id: string, name: string, value: number): TreeNode => ({ id, name, value, children: [] });

export function starterTreemap(): Treemap {
  return {
    roots: [
      {
        id: 'n1',
        name: 'Company',
        value: 0,
        children: [
          leaf('n2', 'Engineering', 40),
          { id: 'n3', name: 'Sales', value: 0, children: [leaf('n4', 'Europe', 10), leaf('n5', 'Americas', 15)] },
          leaf('n6', 'Support', 15),
          leaf('n7', 'Design', 12),
        ],
      },
    ],
  };
}

// ───────────────────────────── Writing Mermaid ─────────────────────────────

/** A name in quotes. Treemap text has no way to hold a quote mark, so those become apostrophes. */
const quoted = (text: string, fallback: string): string => `"${oneLine(text).replace(/"/g, "'") || fallback}"`;

export function treemapToMermaid(t: Treemap, meta: KindMeta): string {
  if (!t.roots.length) return '';
  const lines = headerLines('treemap-beta', meta);
  for (const { node, depth } of flattenTree(t)) {
    const indent = '  '.repeat(depth);
    lines.push(node.children.length ? `${indent}${quoted(node.name, 'Group')}` : `${indent}${quoted(node.name, 'Item')}: ${formatSize(node.value)}`);
  }
  return lines.join('\n');
}

// ───────────────────────────── Reading Mermaid ─────────────────────────────

export type TreemapImport =
  | { ok: true; treemap: Treemap; title: string; description: string; titleAlign: TitleAlign }
  | { ok: false; reason: string };

const UNSUPPORTED = 'This treemap has a line the visual editor does not cover.';
const LINE = /^(?:"([^"]*)"|'([^']*)')(?:\s*:\s*(\d+(?:\.\d+)?|\.\d+))?$/;

export function treemapFromMermaid(source: string): TreemapImport {
  try {
    parse(source);
  } catch (error) {
    const line = (error as { line?: number } | null)?.line;
    return { ok: false, reason: line ? `There is a syntax error on line ${line}.` : 'The source could not be read as a diagram.' };
  }
  const body = source.replace(/^\s*---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '');
  const t: Treemap = { roots: [] };
  let started = false;
  let counter = 0;
  // The open boxes from the outermost in, each with the indent its children must go past.
  const stack: { node: TreeNode; indent: number; hasValue: boolean }[] = [];

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('%%') || /^acc(Title|Descr)\s*:/.test(line)) continue;
    if (!started) {
      if (!/^treemap(-beta)?$/.test(line)) return { ok: false, reason: /^treemap/.test(line) ? UNSUPPORTED : 'Only treemaps can be edited here.' };
      started = true;
      continue;
    }
    const m = LINE.exec(line);
    if (!m) return { ok: false, reason: UNSUPPORTED };
    const indent = raw.length - raw.trimStart().length;
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    counter += 1;
    const hasValue = m[3] !== undefined;
    const node = leaf(`n${counter}`, m[1] ?? m[2], hasValue ? Number(m[3]) : 0);
    const parent = stack[stack.length - 1];
    if (parent) {
      // A box with a size of its own cannot hold others.
      if (parent.hasValue) return { ok: false, reason: UNSUPPORTED };
      parent.node.children.push(node);
    } else t.roots.push(node);
    stack.push({ node, indent, hasValue });
  }
  if (!started) return { ok: false, reason: 'Only treemaps can be edited here.' };
  return { ok: true, treemap: t, title: readTitle(source), description: readDescription(source), titleAlign: readTitleAlign(source) };
}
