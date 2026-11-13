import { h, uniqueId } from './dom';
import {
  ACTIONS,
  COMMIT_TYPES,
  MAIN,
  ORIENTATIONS,
  blankStep,
  branchAfter,
  branchNames,
  commitIds,
  gitProblem,
  gitToMermaid,
  nextGitId,
  starterGit,
  type GitAction,
  type GitCommitType,
  type GitGraph,
  type GitOrientation,
  type GitStep,
} from './gitGraph';
import { History, type KindEditor, type KindHost, type KindMeta } from './kinds';
import { field, iconButton, selectControl } from './ui';

/**
 * A git graph as the list of things that happen, in order: commit, create a branch, switch branch, merge,
 * cherry-pick. Each row says which branch you are on after it, and the side panel flags a step Pele cannot follow,
 * such as merging a branch that does not exist yet.
 */
export class GitEditor implements KindEditor {
  readonly el: HTMLElement;
  private g: GitGraph;
  private readonly history: History<GitGraph>;
  private readonly initial: string;
  private readonly uid = uniqueId('volcanic-git');

  private list!: HTMLElement;
  private options!: HTMLElement;
  private warning!: HTMLElement;
  private summary!: HTMLElement;
  private ons = new Map<string, HTMLElement>();

  constructor(private readonly host: KindHost, graph: GitGraph, pristine = false) {
    this.g = JSON.parse(JSON.stringify(graph)) as GitGraph;
    this.history = new History(this.g);
    this.initial = pristine ? JSON.stringify(this.g) : '';
    this.el = this.build();
    this.renderAll();
  }

  // ───────────────────────────── KindEditor ─────────────────────────────

  source(meta: KindMeta): string {
    return gitToMermaid(this.g, meta);
  }

  isPristine(): boolean {
    return this.initial !== '' && JSON.stringify(this.g) === this.initial;
  }

  focus(): void {
    this.list.querySelector<HTMLElement>('select, input')?.focus();
  }

  undo(): void {
    this.apply(this.history.undo(), 'Undone.');
  }

  redo(): void {
    this.apply(this.history.redo(), 'Redone.');
  }

  canUndo(): boolean {
    return this.history.canUndo;
  }

  canRedo(): boolean {
    return this.history.canRedo;
  }

  destroy(): void {
    this.el.remove();
  }

  private apply(value: GitGraph | null, message: string): void {
    if (!value) return;
    this.g = value;
    this.renderAll();
    this.host.changed();
    this.host.announce(message);
  }

  // ───────────────────────────── Build ─────────────────────────────

  private build(): HTMLElement {
    const helpId = `${this.uid}-help`;
    const toolbar = h(
      'div',
      { class: 'volcanic-kind-toolbar', attrs: { role: 'toolbar', 'aria-label': 'Git graph tools' } },
      iconButton(this.host.setIcon, 'Add commit', 'plus', () => this.addStep('commit')),
      iconButton(this.host.setIcon, 'Add branch', 'git-branch', () => this.addStep('branch')),
      iconButton(this.host.setIcon, 'Add switch', 'arrow-left-right', () => this.addStep('checkout')),
      iconButton(this.host.setIcon, 'Add merge', 'git-merge', () => this.addStep('merge')),
      iconButton(this.host.setIcon, 'Add cherry-pick', 'git-pull-request', () => this.addStep('cherry-pick')),
    );
    this.list = h('div', { class: 'volcanic-st-list', attrs: { role: 'group', 'aria-label': 'Steps', 'aria-describedby': helpId } });
    const help = h('p', {
      class: 'volcanic-sr-only',
      attrs: { id: helpId },
      text: 'Each row is one step in the history, in order. Choose what happens, fill in its details, and read the branch you are on afterwards. A new branch is switched to as soon as it is created. Hold Alt with the up and down arrow keys in a row to move it, or use its Move buttons.',
    });
    const canvas = h('div', { class: 'volcanic-kind-canvas' }, h('div', { class: 'volcanic-st-scroll' }, h('h3', { class: 'volcanic-panel-title', text: 'History' }), this.list, help));
    this.options = h('div', { class: 'volcanic-st-options' });
    this.warning = h('p', { class: 'volcanic-radar-warning', attrs: { role: 'status' } });
    this.summary = h('p', { class: 'volcanic-hint' });
    const side = h(
      'section',
      { class: 'volcanic-card volcanic-kind-side', attrs: { 'aria-label': 'About this diagram' } },
      h('div', { class: 'volcanic-panel' }, h('h3', { class: 'volcanic-panel-title', text: 'Layout' }), this.options, this.warning, this.summary),
    );
    return h('div', { class: 'volcanic-kind volcanic-st volcanic-er volcanic-git' }, toolbar, h('div', { class: 'volcanic-kind-main' }, canvas, side));
  }

  // ───────────────────────────── Changing the diagram ─────────────────────────────

  private commit(tag = ''): void {
    this.history.push(this.g, tag);
    this.host.changed();
    this.renderAll();
  }

  /** Typing: record it and refresh the preview and notes, but leave the field being typed in alone. */
  private update(tag: string): void {
    this.history.push(this.g, tag);
    this.host.changed();
    this.renderOns();
    this.renderNotes();
  }

  private describe(s: GitStep): string {
    const name = s.name.trim() || 'a branch';
    if (s.action === 'commit') return s.commitId.trim() ? `commit ${s.commitId.trim()}` : 'commit';
    if (s.action === 'branch') return `create branch ${name}`;
    if (s.action === 'checkout') return `switch to ${name}`;
    if (s.action === 'merge') return `merge ${name}`;
    return `cherry-pick ${s.commitId.trim() || 'a commit'}`;
  }

  private focusKey(key: string, select = false): boolean {
    const el = this.el.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-key="${key}"]`);
    if (!el) return false;
    el.focus();
    if (select && el?.instanceOf(HTMLInputElement)) el.select();
    return true;
  }

  private addStep(action: GitAction): void {
    const s = blankStep(nextGitId(this.g), action);
    // A new switch or merge starts on a branch other than the one you are on, since that is what makes sense.
    const names = branchNames(this.g);
    const on = this.g.steps.length ? (branchAfter(this.g).pop() ?? MAIN) : MAIN;
    if (action === 'checkout') s.name = names.find((n) => n !== on) ?? MAIN;
    if (action === 'merge') s.name = names.find((n) => n !== on) ?? MAIN;
    this.g.steps.push(s);
    this.commit();
    this.host.announce(`Step added: ${this.describe(s)}.`);
    this.focusKey(action === 'commit' ? `cid:${s.id}` : action === 'branch' ? `name:${s.id}` : `action:${s.id}`);
  }

  private removeStep(id: string): void {
    const at = this.g.steps.findIndex((s) => s.id === id);
    if (at < 0) return;
    const [gone] = this.g.steps.splice(at, 1);
    this.commit();
    this.host.announce(`Step removed: ${this.describe(gone)}.`);
    const near = this.g.steps[Math.min(at, this.g.steps.length - 1)];
    if (!near || !this.focusKey(`action:${near.id}`)) this.el.querySelector<HTMLElement>('button')?.focus();
  }

  private moveStep(id: string, by: -1 | 1, key?: string): boolean {
    const from = this.g.steps.findIndex((s) => s.id === id);
    const to = from + by;
    if (from < 0) return false;
    if (to < 0 || to >= this.g.steps.length) {
      this.host.announce(by < 0 ? 'Already the first step.' : 'Already the last step.');
      return false;
    }
    const [step] = this.g.steps.splice(from, 1);
    this.g.steps.splice(to, 0, step);
    this.commit();
    this.host.announce(`Step ${this.describe(step)} moved to position ${to + 1} of ${this.g.steps.length}.`);
    if (key) this.focusKey(key);
    return true;
  }

  // ───────────────────────────── Drawing ─────────────────────────────

  private renderAll(): void {
    const active = document.activeElement;
    const inside = active?.instanceOf(HTMLElement) && this.el.contains(active);
    const keep = inside ? active.dataset.key : undefined;
    const keepAct = inside && !keep ? active.dataset.act : undefined;
    this.renderSteps();
    this.renderOptions();
    this.renderNotes();
    if (keep) this.focusKey(keep);
    else if (keepAct) this.el.querySelector<HTMLElement>(`[data-act="${keepAct}"]`)?.focus();
  }

  private small(label: string, icon: string, act: string, onClick: () => void, disabled = false): HTMLButtonElement {
    const button = iconButton(this.host.setIcon, label, icon, onClick, 'volcanic-radar-small');
    button.setAttribute('aria-label', label);
    button.title = label;
    button.dataset.act = act;
    if (disabled) button.setAttribute('aria-disabled', 'true');
    return button;
  }

  private text(value: string, key: string, label: string, placeholder: string, onInput: (v: string) => void, narrow = false): HTMLInputElement {
    const input = h('input', { class: `volcanic-input${narrow ? ' volcanic-git-narrow' : ''}`, attrs: { type: 'text', autocomplete: 'off', 'aria-label': label, 'data-key': key, placeholder } });
    input.value = value;
    input.addEventListener('input', () => onInput(input.value));
    return input;
  }

  private select<T extends string>(options: { id: T; name: string }[], value: T, key: string, label: string, set: (v: T) => void): HTMLSelectElement {
    const select = selectControl(options, value, (v) => {
      set(v);
      this.commit();
    });
    select.setAttribute('aria-label', label);
    select.dataset.key = key;
    return select;
  }

  /** A picker of branch names, which also offers whatever the step already says even if it is not a branch yet. */
  private branchSelect(s: GitStep, label: string): HTMLSelectElement {
    const names = branchNames(this.g);
    if (s.name.trim() && !names.includes(s.name.trim())) names.push(s.name.trim());
    const value = s.name.trim() || names[0];
    if (!s.name.trim()) s.name = value;
    return this.select(
      names.map((n) => ({ id: n, name: n })),
      value,
      `name:${s.id}`,
      label,
      (v) => (s.name = v),
    );
  }

  private fields(s: GitStep, n: string): HTMLElement[] {
    const typeSelect = (): HTMLSelectElement => this.select(COMMIT_TYPES, s.type, `type:${s.id}`, `Kind of ${n}`, (v: GitCommitType) => (s.type = v));
    if (s.action === 'commit') {
      return [
        this.text(s.commitId, `cid:${s.id}`, `Commit id of ${n}`, 'Commit id (optional)', (v) => {
          s.commitId = v;
          this.update(`cid:${s.id}`);
        }),
        this.text(s.tag, `tag:${s.id}`, `Tag of ${n}`, 'Tag (optional)', (v) => {
          s.tag = v;
          this.update(`tag:${s.id}`);
        }, true),
        typeSelect(),
      ];
    }
    if (s.action === 'branch') {
      return [
        this.text(s.name, `name:${s.id}`, `Name of the new branch in ${n}`, 'Branch name', (v) => {
          s.name = v;
          this.update(`name:${s.id}`);
        }),
        this.text(s.order, `order:${s.id}`, `Position of the new branch in ${n}`, 'Position (optional)', (v) => {
          s.order = v.replace(/[^\d]/g, '');
          this.update(`order:${s.id}`);
        }, true),
      ];
    }
    if (s.action === 'checkout') return [this.branchSelect(s, `Branch to switch to in ${n}`)];
    if (s.action === 'merge') {
      return [
        this.branchSelect(s, `Branch to merge in ${n}`),
        this.text(s.commitId, `cid:${s.id}`, `Merge commit id of ${n}`, 'Commit id (optional)', (v) => {
          s.commitId = v;
          this.update(`cid:${s.id}`);
        }),
        this.text(s.tag, `tag:${s.id}`, `Tag of ${n}`, 'Tag (optional)', (v) => {
          s.tag = v;
          this.update(`tag:${s.id}`);
        }, true),
        typeSelect(),
      ];
    }
    const ids = commitIds(this.g);
    if (s.commitId.trim() && !ids.includes(s.commitId.trim())) ids.push(s.commitId.trim());
    return [
      ids.length
        ? this.select([{ id: '', name: 'Choose a commit' }, ...ids.map((i) => ({ id: i, name: i }))], s.commitId.trim(), `cid:${s.id}`, `Commit to pick in ${n}`, (v) => (s.commitId = v))
        : this.text(s.commitId, `cid:${s.id}`, `Commit to pick in ${n}`, 'Commit id', (v) => {
            s.commitId = v;
            this.update(`cid:${s.id}`);
          }),
      this.text(s.parent, `parent:${s.id}`, `Parent of ${n}`, 'Parent (optional)', (v) => {
        s.parent = v;
        this.update(`parent:${s.id}`);
      }, true),
    ];
  }

  private renderSteps(): void {
    const { steps } = this.g;
    this.ons = new Map();
    const rows = steps.map((s, index) => {
      const n = `step ${index + 1}`;
      const action = this.select(ACTIONS, s.action, `action:${s.id}`, `What happens in ${n}`, (v: GitAction) => {
        s.action = v;
        // A switch or merge needs a branch to name, and a pick needs a commit.
        if ((v === 'checkout' || v === 'merge') && !s.name.trim()) s.name = branchNames(this.g)[0];
      });
      const on = h('span', { class: 'volcanic-hint volcanic-git-on' });
      this.ons.set(s.id, on);
      const row = h(
        'div',
        { class: 'volcanic-git-row' },
        h(
          'span',
          { class: 'volcanic-radar-move' },
          this.small(`Move ${n} up`, 'arrow-up', `up:${s.id}`, () => this.moveStep(s.id, -1), index === 0),
          this.small(`Move ${n} down`, 'arrow-down', `down:${s.id}`, () => this.moveStep(s.id, 1), index === steps.length - 1),
        ),
        action,
        h('div', { class: 'volcanic-git-fields' }, ...this.fields(s, n)),
        on,
        this.small(`Remove ${n}`, 'x', `rm:${s.id}`, () => this.removeStep(s.id)),
      );
      row.addEventListener('keydown', (event) => {
        if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
        event.preventDefault();
        event.stopPropagation();
        this.moveStep(s.id, event.key === 'ArrowUp' ? -1 : 1, (event.target as HTMLElement).dataset.key);
      });
      return row;
    });
    this.list.replaceChildren(...rows);
    if (!rows.length) this.list.append(h('p', { class: 'volcanic-hint', text: 'No steps yet. Add a commit with the Add commit button.' }));
    this.renderOns();
  }

  /** The branch you are on after each step, which changes whenever a branch is created or switched to. */
  private renderOns(): void {
    const after = branchAfter(this.g);
    this.g.steps.forEach((s, i) => {
      const el = this.ons.get(s.id);
      if (!el) return;
      el.textContent = `On ${after[i]}`;
      el.setAttribute('aria-label', `On branch ${after[i]} afterwards`);
    });
  }

  private renderOptions(): void {
    this.options.replaceChildren(
      field(
        'Direction',
        selectControl(ORIENTATIONS, this.g.orientation, (value: GitOrientation) => {
          this.g.orientation = value;
          this.commit();
          this.host.announce(`${ORIENTATIONS.find((o) => o.id === value)?.name ?? value}.`);
        }),
        'Which way time runs.',
      ),
    );
  }

  private renderNotes(): void {
    const problem = gitProblem(this.g, { title: '', description: '' });
    this.warning.hidden = !problem;
    this.warning.textContent = problem ? `⚠ ${problem}` : '';
    const count = (a: GitAction): number => this.g.steps.filter((s) => s.action === a).length;
    const commits = count('commit') + count('merge') + count('cherry-pick');
    const branches = branchNames(this.g).length;
    this.summary.textContent = `${commits} ${commits === 1 ? 'commit' : 'commits'} on ${branches} ${branches === 1 ? 'branch' : 'branches'}.`;
  }
}

export { starterGit };
