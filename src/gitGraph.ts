import { parse } from 'pele';
import { escapeText, headerLines, oneLine, readDescription, unescapeText, type KindMeta } from './kinds';
import { readTitle, readTitleAlign } from './mermaid';
import type { TitleAlign } from './model';

export type GitAction = 'commit' | 'branch' | 'checkout' | 'merge' | 'cherry-pick';
export type GitCommitType = '' | 'NORMAL' | 'REVERSE' | 'HIGHLIGHT';
export type GitOrientation = 'LR' | 'TB' | 'BT';

/** One line of the history, in the order things happen. Which fields matter depends on `action`. */
export interface GitStep {
  id: string;
  action: GitAction;
  /** A branch's name: the one `branch` creates, or the one `checkout` or `merge` names. */
  name: string;
  /** The id of the commit this makes (commit, merge) or picks (cherry-pick). */
  commitId: string;
  tag: string;
  type: GitCommitType;
  /** The parent to pick from, for a cherry-pick of a merge commit. */
  parent: string;
  /** Where a new branch sits among the others, from 1. Left empty, it is placed for you. */
  order: string;
}

export interface GitGraph {
  steps: GitStep[];
  orientation: GitOrientation;
}

export const MAIN = 'main';

export const ACTIONS: { id: GitAction; name: string }[] = [
  { id: 'commit', name: 'Commit' },
  { id: 'branch', name: 'Create branch' },
  { id: 'checkout', name: 'Switch to branch' },
  { id: 'merge', name: 'Merge branch' },
  { id: 'cherry-pick', name: 'Cherry-pick commit' },
];

export const COMMIT_TYPES: { id: GitCommitType; name: string }[] = [
  { id: '', name: 'Normal' },
  { id: 'HIGHLIGHT', name: 'Highlighted' },
  { id: 'REVERSE', name: 'Reverted' },
];

export const ORIENTATIONS: { id: GitOrientation; name: string }[] = [
  { id: 'LR', name: 'Left to right' },
  { id: 'TB', name: 'Top to bottom' },
  { id: 'BT', name: 'Bottom to top' },
];

export function nextGitId(g: GitGraph): string {
  const used = new Set(g.steps.map((s) => s.id));
  let n = used.size + 1;
  while (used.has(`g${n}`)) n += 1;
  return `g${n}`;
}

export function blankStep(id: string, action: GitAction): GitStep {
  return { id, action, name: '', commitId: '', tag: '', type: '', parent: '', order: '' };
}

/** Every branch there will be, in the order they are created, starting with main. */
export function branchNames(g: GitGraph): string[] {
  const names = [MAIN];
  for (const s of g.steps) if (s.action === 'branch' && s.name.trim() && !names.includes(s.name.trim())) names.push(s.name.trim());
  return names;
}

/** The branch you are on after each step. */
export function branchAfter(g: GitGraph): string[] {
  let on = MAIN;
  return g.steps.map((s) => {
    if ((s.action === 'branch' || s.action === 'checkout') && s.name.trim()) on = s.name.trim();
    return on;
  });
}

/** The ids given to commits, which a cherry-pick can name. */
export function commitIds(g: GitGraph): string[] {
  const ids: string[] = [];
  for (const s of g.steps) if ((s.action === 'commit' || s.action === 'merge') && s.commitId.trim() && !ids.includes(s.commitId.trim())) ids.push(s.commitId.trim());
  return ids;
}

export function starterGit(): GitGraph {
  const step = (id: string, action: GitAction, extra: Partial<GitStep> = {}): GitStep => ({ ...blankStep(id, action), ...extra });
  return {
    orientation: 'LR',
    steps: [
      step('g1', 'commit', { commitId: 'Start' }),
      step('g2', 'commit'),
      step('g3', 'branch', { name: 'develop' }),
      step('g4', 'commit', { commitId: 'Feature' }),
      step('g5', 'checkout', { name: MAIN }),
      step('g6', 'merge', { name: 'develop', tag: 'v1.0' }),
      step('g7', 'commit'),
    ],
  };
}

// ───────────────────────────── Writing Mermaid ─────────────────────────────

const PLAIN = /^[A-Za-z_][\w./-]*$/;
const quoted = (text: string): string => `"${escapeText(oneLine(text)).replace(/"/g, "'")}"`;
const branchText = (name: string): string => {
  const n = oneLine(name);
  return PLAIN.test(n) ? n : quoted(n || MAIN);
};

export function gitToMermaid(g: GitGraph, meta: KindMeta): string {
  if (!g.steps.length) return '';
  const lines = headerLines(g.orientation === 'LR' ? 'gitGraph' : `gitGraph ${g.orientation}:`, meta);
  for (const s of g.steps) {
    const attrs = (...pairs: [string, string][]): string => pairs.filter(([, v]) => oneLine(v)).map(([k, v]) => ` ${k}: ${k === 'type' ? oneLine(v) : quoted(v)}`).join('');
    if (s.action === 'commit') lines.push(`    commit${attrs(['id', s.commitId], ['tag', s.tag], ['type', s.type])}`);
    else if (s.action === 'branch') lines.push(`    branch ${branchText(s.name)}${oneLine(s.order) ? ` order: ${Math.max(0, Math.round(Number(s.order)) || 0)}` : ''}`);
    else if (s.action === 'checkout') lines.push(`    checkout ${branchText(s.name)}`);
    else if (s.action === 'merge') lines.push(`    merge ${branchText(s.name)}${attrs(['id', s.commitId], ['tag', s.tag], ['type', s.type])}`);
    else lines.push(`    cherry-pick${attrs(['id', s.commitId], ['parent', s.parent], ['tag', s.tag])}`);
  }
  return lines.join('\n');
}

/** What Pele says is wrong with the history, if anything: a branch that does not exist yet, say. */
export function gitProblem(g: GitGraph, meta: KindMeta): string {
  const source = gitToMermaid(g, meta);
  if (!source) return '';
  try {
    parse(source);
    return '';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(/\s*\(Help:[\s\S]*$/, '').replace(/\s+/g, ' ').trim();
  }
}

// ───────────────────────────── Reading Mermaid ─────────────────────────────

export type GitImport =
  | { ok: true; graph: GitGraph; title: string; description: string; titleAlign: TitleAlign }
  | { ok: false; reason: string };

const UNSUPPORTED = 'This git graph uses something the visual editor does not cover, such as commit messages or configuration.';
const NAME = '(?:"[^"]+"|[\\w./-]+)';
const ATTR = /^\s+(id|tag|type|parent|order):\s*(?:"([^"]*)"|(\w+))/;
const unquote = (text: string): string => unescapeText(text.startsWith('"') ? text.slice(1, -1) : text);

/** Reads `key: value` pairs off the end of a line. Null if anything is left over or a key is not allowed. */
function readAttrs(rest: string, allowed: string[]): Record<string, string> | null {
  const out: Record<string, string> = {};
  let left = rest;
  while (left.trim()) {
    const m = ATTR.exec(left);
    if (!m || !allowed.includes(m[1]) || m[1] in out) return null;
    out[m[1]] = m[2] !== undefined ? unescapeText(m[2]) : m[3];
    left = left.slice(m[0].length);
  }
  return out;
}

export function gitFromMermaid(source: string): GitImport {
  try {
    parse(source);
  } catch (error) {
    const line = (error as { line?: number } | null)?.line;
    return { ok: false, reason: line ? `There is a syntax error on line ${line}.` : 'The source could not be read as a diagram.' };
  }
  const body = source.replace(/^\s*---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '');
  const g: GitGraph = { steps: [], orientation: 'LR' };
  let started = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('%%{')) return { ok: false, reason: UNSUPPORTED };
    if (line.startsWith('%%') || /^acc(Title|Descr)\s*:/.test(line)) continue;
    if (!started) {
      const header = /^gitGraph(?:\s+(LR|TB|BT))?\s*:?$/.exec(line);
      if (!header) return { ok: false, reason: /^gitGraph/.test(line) ? UNSUPPORTED : 'Only git graphs can be edited here.' };
      if (header[1]) g.orientation = header[1] as GitOrientation;
      started = true;
      continue;
    }
    const step = blankStep(`g${g.steps.length + 1}`, 'commit');
    const word = /^(commit|branch|checkout|switch|merge|cherry-pick)(?=\s|$)/.exec(line);
    if (!word) return { ok: false, reason: UNSUPPORTED };
    const rest = line.slice(word[0].length);
    if (word[1] === 'commit') {
      const a = readAttrs(rest, ['id', 'tag', 'type']);
      if (!a || (a.type && !['NORMAL', 'REVERSE', 'HIGHLIGHT'].includes(a.type))) return { ok: false, reason: UNSUPPORTED };
      Object.assign(step, { action: 'commit', commitId: a.id ?? '', tag: a.tag ?? '', type: a.type === 'NORMAL' ? '' : (a.type ?? '') });
    } else if (word[1] === 'branch' || word[1] === 'checkout' || word[1] === 'switch' || word[1] === 'merge') {
      const m = new RegExp(`^\\s+(${NAME})(.*)$`).exec(rest);
      if (!m) return { ok: false, reason: UNSUPPORTED };
      const a = readAttrs(m[2], word[1] === 'branch' ? ['order'] : word[1] === 'merge' ? ['id', 'tag', 'type'] : []);
      if (!a || (a.type && !['NORMAL', 'REVERSE', 'HIGHLIGHT'].includes(a.type)) || (a.order && !/^\d+$/.test(a.order))) return { ok: false, reason: UNSUPPORTED };
      Object.assign(step, {
        action: word[1] === 'switch' ? 'checkout' : word[1],
        name: unquote(m[1]),
        commitId: a.id ?? '',
        tag: a.tag ?? '',
        type: a.type === 'NORMAL' ? '' : (a.type ?? ''),
        order: a.order ?? '',
      });
    } else {
      const a = readAttrs(rest, ['id', 'parent', 'tag']);
      if (!a || !a.id) return { ok: false, reason: UNSUPPORTED };
      Object.assign(step, { action: 'cherry-pick', commitId: a.id, parent: a.parent ?? '', tag: a.tag ?? '' });
    }
    g.steps.push(step);
  }
  if (!started) return { ok: false, reason: 'Only git graphs can be edited here.' };
  return { ok: true, graph: g, title: readTitle(source), description: readDescription(source), titleAlign: readTitleAlign(source) };
}
