import { h, uniqueId } from './dom';
import { History, type KindEditor, type KindHost, type KindMeta } from './kinds';
import { findTreeNode, flattenTree, formatSize, indentNode, nextTreeId, outdentNode, shiftNode, sizeOf, starterTreemap, treemapToMermaid, type TreeNode, type Treemap } from './treemap';
import { iconButton } from './ui';

/**
 * A treemap as an outline: each row is a box, indented to show what it sits inside. A box with others inside it adds
 * them up; a box with nothing inside it has a size you type. Enter adds a box beside the current one, and Alt with the
 * arrow keys moves it (up and down) or changes how deep it sits (left and right).
 */
export class TreemapEditor implements KindEditor {
  readonly el: HTMLElement;
  private t: Treemap;
  private readonly history: History<Treemap>;
  private readonly initial: string;
  private readonly uid = uniqueId('volcanic-tm');

  private list!: HTMLElement;
  private summary!: HTMLElement;
  private warning!: HTMLElement;

  constructor(private readonly host: KindHost, treemap: Treemap, pristine = false) {
    this.t = JSON.parse(JSON.stringify(treemap)) as Treemap;
    this.history = new History(this.t);
    this.initial = pristine ? JSON.stringify(this.t) : '';
    this.el = this.build();
    this.renderAll();
  }

  // ───────────────────────────── KindEditor ─────────────────────────────

  source(meta: KindMeta): string {
    return treemapToMermaid(this.t, meta);
  }

  isPristine(): boolean {
    return this.initial !== '' && JSON.stringify(this.t) === this.initial;
  }

  focus(): void {
    this.list.querySelector<HTMLElement>('input')?.focus();
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

  private apply(value: Treemap | null, message: string): void {
    if (!value) return;
    this.t = value;
    this.renderAll();
    this.host.changed();
    this.host.announce(message);
  }

  // ───────────────────────────── Build ─────────────────────────────

  private build(): HTMLElement {
    const helpId = `${this.uid}-help`;
    const toolbar = h(
      'div',
      { class: 'volcanic-kind-toolbar', attrs: { role: 'toolbar', 'aria-label': 'Treemap tools' } },
      iconButton(this.host.setIcon, 'Add box', 'plus', () => this.addRoot()),
    );
    this.list = h('ul', { class: 'volcanic-tm-list', attrs: { 'aria-label': 'Boxes', 'aria-describedby': helpId } });
    const help = h('p', {
      class: 'volcanic-sr-only',
      attrs: { id: helpId },
      text: 'Each row is a box, indented to show what it sits inside. Press Enter in a name to add a box beside it. Hold Alt with the up and down arrow keys to move a box, and with the right and left arrow keys to put it inside the box above or take it out. A box with others inside it adds them up.',
    });
    const canvas = h('div', { class: 'volcanic-kind-canvas' }, h('div', { class: 'volcanic-tm-scroll' }, this.list, help));
    this.warning = h('p', { class: 'volcanic-radar-warning', attrs: { role: 'status' } });
    this.summary = h('p', { class: 'volcanic-hint' });
    const side = h(
      'section',
      { class: 'volcanic-card volcanic-kind-side', attrs: { 'aria-label': 'About this treemap' } },
      h(
        'div',
        { class: 'volcanic-panel' },
        h('h3', { class: 'volcanic-panel-title', text: 'Treemap' }),
        this.summary,
        this.warning,
        h('p', { class: 'volcanic-hint', text: 'Enter adds a box beside this one. Alt with the arrow keys moves it, and puts it inside or outside the box above.' }),
      ),
    );
    return h('div', { class: 'volcanic-kind volcanic-tm' }, toolbar, h('div', { class: 'volcanic-kind-main' }, canvas, side));
  }

  // ───────────────────────────── Changing the treemap ─────────────────────────────

  private commit(tag = ''): void {
    this.history.push(this.t, tag);
    this.host.changed();
    this.renderAll();
  }

  /** Typing: record it and refresh the preview and totals, but leave the rows alone. */
  private update(tag: string): void {
    this.history.push(this.t, tag);
    this.host.changed();
    this.renderTotals();
    this.renderNotes();
  }

  private name(node: TreeNode): string {
    return node.name.replace(/\s+/g, ' ').trim() || 'Untitled box';
  }

  private focusKey(key: string, select = false): boolean {
    const el = this.list.querySelector<HTMLInputElement>(`[data-key="${key}"]`);
    if (!el) return false;
    el.focus();
    if (select) el.select();
    return true;
  }

  private addRoot(): void {
    const node: TreeNode = { id: nextTreeId(this.t), name: 'New box', value: 10, children: [] };
    this.t.roots.push(node);
    this.commit();
    this.host.announce('Box added. Type its name.');
    this.focusKey(`name:${node.id}`, true);
  }

  private addSibling(id: string): void {
    const at = findTreeNode(this.t, id);
    if (!at) return;
    const node: TreeNode = { id: nextTreeId(this.t), name: 'New box', value: at.node.children.length ? 10 : at.node.value || 10, children: [] };
    at.siblings.splice(at.index + 1, 0, node);
    this.commit();
    this.host.announce('Box added beside it. Type its name.');
    this.focusKey(`name:${node.id}`, true);
  }

  private addChild(id: string): void {
    const at = findTreeNode(this.t, id);
    if (!at) return;
    const node: TreeNode = { id: nextTreeId(this.t), name: 'New box', value: 10, children: [] };
    at.node.children.push(node);
    this.commit();
    this.host.announce(`Box added inside ${this.name(at.node)}. Type its name.`);
    this.focusKey(`name:${node.id}`, true);
  }

  private remove(id: string): void {
    const at = findTreeNode(this.t, id);
    if (!at) return;
    at.siblings.splice(at.index, 1);
    this.commit();
    const lost = flattenTree({ roots: [at.node] }).length - 1;
    this.host.announce(`${this.name(at.node)} removed${lost ? ` with the ${lost} ${lost === 1 ? 'box' : 'boxes'} inside it. Undo brings it back` : ''}.`);
    const near = at.siblings[Math.min(at.index, at.siblings.length - 1)] ?? at.parent;
    if (!near || !this.focusKey(`name:${near.id}`)) this.el.querySelector<HTMLElement>('button')?.focus();
  }

  /** Move or re-nest a box, keeping focus on the same field. */
  private change(id: string, how: 'up' | 'down' | 'in' | 'out', key?: string): boolean {
    const ok = how === 'up' ? shiftNode(this.t, id, -1) : how === 'down' ? shiftNode(this.t, id, 1) : how === 'in' ? indentNode(this.t, id) : outdentNode(this.t, id);
    const node = findTreeNode(this.t, id)?.node;
    if (!ok) {
      const reason = { up: 'Already the first box here.', down: 'Already the last box here.', in: 'There is no box above to put it inside.', out: 'It is already at the top level.' }[how];
      this.host.announce(reason);
      return false;
    }
    this.commit();
    const now = findTreeNode(this.t, id)!;
    this.host.announce(`${this.name(node!)} is now ${now.parent ? `inside ${this.name(now.parent)}, number ${now.index + 1} of ${now.siblings.length}` : `at the top level, number ${now.index + 1} of ${now.siblings.length}`}.`);
    if (key) this.focusKey(key);
    return true;
  }

  // ───────────────────────────── Drawing ─────────────────────────────

  private renderAll(): void {
    const active = document.activeElement;
    const inside = active?.instanceOf(HTMLElement) && this.list.contains(active);
    const keep = inside ? active.dataset.key : undefined;
    const keepAct = inside && !keep ? active.dataset.act : undefined;
    this.renderList();
    this.renderNotes();
    if (keep) this.focusKey(keep);
    else if (keepAct) this.list.querySelector<HTMLElement>(`[data-act="${keepAct}"]`)?.focus();
  }

  private small(label: string, icon: string, act: string, onClick: () => void, disabled = false): HTMLButtonElement {
    const button = iconButton(this.host.setIcon, label, icon, onClick, 'volcanic-radar-small');
    button.setAttribute('aria-label', label);
    button.title = label;
    button.dataset.act = act;
    if (disabled) button.setAttribute('aria-disabled', 'true');
    return button;
  }

  private renderList(): void {
    const rows = flattenTree(this.t).map(({ node, parent, index, depth, siblings }) => {
      const nameKey = `name:${node.id}`;
      const name = h('input', { class: 'volcanic-input volcanic-tm-name', attrs: { type: 'text', autocomplete: 'off', 'aria-label': `Name of box${depth ? `, level ${depth + 1}` : ''}`, 'data-key': nameKey } });
      name.value = node.name;
      name.addEventListener('input', () => {
        node.name = name.value;
        this.update(nameKey);
      });
      name.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.altKey && !event.isComposing) {
          event.preventDefault();
          this.addSibling(node.id);
        }
      });

      const branch = node.children.length > 0;
      const size = branch
        ? h('span', { class: 'volcanic-tm-total', attrs: { 'data-total': node.id, 'aria-label': `Total ${formatSize(sizeOf(node))}` }, text: formatSize(sizeOf(node)) })
        : h('input', { class: 'volcanic-input volcanic-tm-value', attrs: { type: 'number', min: '0', step: 'any', inputmode: 'decimal', 'aria-label': `Size of ${this.name(node)}`, 'data-key': `value:${node.id}` } });
      if (size?.instanceOf(HTMLInputElement)) {
        size.value = formatSize(node.value);
        size.addEventListener('input', () => {
          const n = Number(size.value);
          if (size.value === '' || !Number.isFinite(n) || n < 0) return;
          node.value = n;
          this.update(`value:${node.id}`);
        });
        size.addEventListener('blur', () => (size.value = formatSize(node.value)));
      }

      const row = h(
        'li',
        { class: 'volcanic-tm-row', attrs: { 'data-id': node.id } },
        h('div', { class: 'volcanic-tm-main' }, name, size),
        h(
          'div',
          { class: 'volcanic-tm-actions' },
          this.small(`Take ${this.name(node)} out of ${parent ? this.name(parent) : 'its box'}`, 'arrow-left', `out:${node.id}`, () => this.change(node.id, 'out'), !parent),
          this.small(`Put ${this.name(node)} inside the box above`, 'arrow-right', `in:${node.id}`, () => this.change(node.id, 'in'), index === 0),
          this.small(`Move ${this.name(node)} up`, 'arrow-up', `up:${node.id}`, () => this.change(node.id, 'up'), index === 0),
          this.small(`Move ${this.name(node)} down`, 'arrow-down', `down:${node.id}`, () => this.change(node.id, 'down'), index === siblings.length - 1),
          this.small(`Add a box inside ${this.name(node)}`, 'plus', `add:${node.id}`, () => this.addChild(node.id)),
          this.small(`Remove ${this.name(node)}${branch ? ' and what is inside it' : ''}`, 'x', `rm:${node.id}`, () => this.remove(node.id)),
        ),
      );
      row.style.setProperty('--depth', String(depth));
      row.addEventListener('keydown', (event) => {
        if (!event.altKey || !event.key.startsWith('Arrow')) return;
        event.preventDefault();
        const how = { ArrowUp: 'up', ArrowDown: 'down', ArrowRight: 'in', ArrowLeft: 'out' }[event.key] as 'up' | 'down' | 'in' | 'out' | undefined;
        if (how) this.change(node.id, how, (event.target as HTMLElement).dataset.key);
      });
      return row;
    });
    this.list.replaceChildren(...rows);
    if (!rows.length) this.list.append(h('li', { class: 'volcanic-hint', text: 'Nothing here yet. Add a box with the Add box button.' }));
  }

  /** The totals of boxes that hold others change as their contents do. */
  private renderTotals(): void {
    for (const { node } of flattenTree(this.t)) {
      const cell = this.list.querySelector<HTMLElement>(`[data-total="${node.id}"]`);
      if (cell && node.children.length) {
        cell.textContent = formatSize(sizeOf(node));
        cell.setAttribute('aria-label', `Total ${cell.textContent}`);
      }
    }
  }

  private renderNotes(): void {
    const all = flattenTree(this.t);
    const leaves = all.filter((p) => !p.node.children.length);
    const total = this.t.roots.reduce((sum, r) => sum + sizeOf(r), 0);
    this.summary.textContent = `${all.length} ${all.length === 1 ? 'box' : 'boxes'}, ${leaves.length} with a size of their own. Everything adds up to ${formatSize(total)}.`;
    const empty = leaves.filter((p) => p.node.value <= 0).length;
    const messages: string[] = [];
    if (empty) messages.push(`${empty} ${empty === 1 ? 'box has' : 'boxes have'} a size of 0, so ${empty === 1 ? 'it is' : 'they are'} too small to see.`);
    this.warning.hidden = !messages.length;
    this.warning.textContent = messages.length ? `⚠ ${messages.join(' ')}` : '';
  }
}

export { starterTreemap };
