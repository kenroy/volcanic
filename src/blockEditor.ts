import { h, uniqueId } from './dom';
import {
  BLK_SHAPES,
  MAX_COLUMNS,
  MAX_SPAN,
  blkLabel,
  blockToMermaid,
  nextBlkId,
  placeBlocks,
  starterBlocks,
  tooWide,
  whereText,
  type Blk,
  type BlkLink,
  type BlkShape,
  type BlockDiagram,
} from './block';
import { History, type KindEditor, type KindHost, type KindMeta } from './kinds';
import { field, iconButton, selectControl } from './ui';

const LINE_STYLES = [
  { id: 'arrow', name: 'arrow' },
  { id: 'line', name: 'line' },
];

/**
 * A block diagram as a grid you fill in order: each block has a label, a shape and how many columns it spans, and
 * the row and column it lands in are worked out for you. Links join one block to another.
 */
export class BlockEditor implements KindEditor {
  readonly el: HTMLElement;
  private d: BlockDiagram;
  private readonly history: History<BlockDiagram>;
  private readonly initial: string;
  private readonly uid = uniqueId('volcanic-blk');

  private blockList!: HTMLElement;
  private linkList!: HTMLElement;
  private options!: HTMLElement;
  private warning!: HTMLElement;
  private summary!: HTMLElement;
  private wheres = new Map<string, HTMLElement>();

  constructor(private readonly host: KindHost, diagram: BlockDiagram, pristine = false) {
    this.d = JSON.parse(JSON.stringify(diagram)) as BlockDiagram;
    this.history = new History(this.d);
    this.initial = pristine ? JSON.stringify(this.d) : '';
    this.el = this.build();
    this.renderAll();
  }

  // ───────────────────────────── KindEditor ─────────────────────────────

  source(meta: KindMeta): string {
    return blockToMermaid(this.d, meta);
  }

  isPristine(): boolean {
    return this.initial !== '' && JSON.stringify(this.d) === this.initial;
  }

  focus(): void {
    this.blockList.querySelector<HTMLElement>('input')?.focus();
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

  private apply(value: BlockDiagram | null, message: string): void {
    if (!value) return;
    this.d = value;
    this.renderAll();
    this.host.changed();
    this.host.announce(message);
  }

  // ───────────────────────────── Build ─────────────────────────────

  private build(): HTMLElement {
    const helpId = `${this.uid}-help`;
    const toolbar = h(
      'div',
      { class: 'volcanic-kind-toolbar', attrs: { role: 'toolbar', 'aria-label': 'Block diagram tools' } },
      iconButton(this.host.setIcon, 'Add block', 'plus', () => this.addBlock('rect')),
      iconButton(this.host.setIcon, 'Add empty space', 'square-dashed', () => this.addBlock('space')),
      iconButton(this.host.setIcon, 'Add link', 'arrow-left-right', () => this.addLink()),
    );
    this.blockList = h('div', { class: 'volcanic-st-list', attrs: { role: 'group', 'aria-label': 'Blocks', 'aria-describedby': helpId } });
    this.linkList = h('div', { class: 'volcanic-st-list', attrs: { role: 'group', 'aria-label': 'Links', 'aria-describedby': helpId } });
    const help = h('p', {
      class: 'volcanic-sr-only',
      attrs: { id: helpId },
      text: 'Blocks fill a grid from left to right, starting a new row when one will not fit. Each row of the list says which row and columns the block lands in. Set how many columns a block spans, or add an empty space to leave a gap. Hold Alt with the up and down arrow keys in a row to move it, or use its Move buttons.',
    });
    const canvas = h(
      'div',
      { class: 'volcanic-kind-canvas' },
      h('div', { class: 'volcanic-st-scroll' }, h('h3', { class: 'volcanic-panel-title', text: 'Blocks' }), this.blockList, h('h3', { class: 'volcanic-panel-title', text: 'Links' }), this.linkList, help),
    );
    this.options = h('div', { class: 'volcanic-st-options' });
    this.warning = h('p', { class: 'volcanic-radar-warning', attrs: { role: 'status' } });
    this.summary = h('p', { class: 'volcanic-hint' });
    const side = h(
      'section',
      { class: 'volcanic-card volcanic-kind-side', attrs: { 'aria-label': 'About this diagram' } },
      h('div', { class: 'volcanic-panel' }, h('h3', { class: 'volcanic-panel-title', text: 'Grid' }), this.options, this.warning, this.summary),
    );
    return h('div', { class: 'volcanic-kind volcanic-st volcanic-er volcanic-blk' }, toolbar, h('div', { class: 'volcanic-kind-main' }, canvas, side));
  }

  // ───────────────────────────── Changing the diagram ─────────────────────────────

  private commit(tag = ''): void {
    this.history.push(this.d, tag);
    this.host.changed();
    this.renderAll();
  }

  /** Typing: record it and refresh the preview, pickers and notes, but leave the field being typed in alone. */
  private update(tag: string): void {
    this.history.push(this.d, tag);
    this.host.changed();
    this.renderLinks();
    this.renderNotes();
  }

  private name(id: string): string {
    const b = this.d.blocks.find((x) => x.id === id);
    return (b && blkLabel(b)) || 'an unnamed block';
  }

  private describe(l: BlkLink): string {
    return `${this.name(l.from)} to ${this.name(l.to)}`;
  }

  private focusKey(key: string, select = false): boolean {
    const el = this.el.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-key="${key}"]`);
    if (!el) return false;
    el.focus();
    if (select && el instanceof HTMLInputElement) el.select();
    return true;
  }

  private addBlock(shape: BlkShape): void {
    const b: Blk = { id: nextBlkId(this.d, 'b'), shape, label: '', span: 1, code: '' };
    this.d.blocks.push(b);
    this.commit();
    this.host.announce(shape === 'space' ? 'Empty space added.' : 'Block added. Type its label.');
    if (!this.focusKey(`label:${b.id}`)) this.focusKey(`shape:${b.id}`);
  }

  private removeBlock(id: string): void {
    const at = this.d.blocks.findIndex((b) => b.id === id);
    if (at < 0) return;
    const name = this.name(id);
    const before = this.d.links.length;
    this.d.blocks.splice(at, 1);
    this.d.links = this.d.links.filter((l) => l.from !== id && l.to !== id);
    const dropped = before - this.d.links.length;
    this.commit();
    this.host.announce(`${name} removed${dropped ? `, with ${dropped} ${dropped === 1 ? 'link' : 'links'}` : ''}.`);
    const near = this.d.blocks[Math.min(at, this.d.blocks.length - 1)];
    if (!near || !(this.focusKey(`label:${near.id}`) || this.focusKey(`shape:${near.id}`))) this.el.querySelector<HTMLElement>('button')?.focus();
  }

  private moveIn<T>(list: T[], at: number, by: -1 | 1, what: string, name: string, key?: string): boolean {
    const to = at + by;
    if (at < 0) return false;
    if (to < 0 || to >= list.length) {
      this.host.announce(by < 0 ? `Already the first ${what}.` : `Already the last ${what}.`);
      return false;
    }
    const [item] = list.splice(at, 1);
    list.splice(to, 0, item);
    this.commit();
    this.host.announce(`${name} moved to position ${to + 1} of ${list.length}.`);
    if (key) this.focusKey(key);
    return true;
  }

  private addLink(): void {
    const nodes = this.d.blocks.filter((b) => b.shape !== 'space');
    if (nodes.length < 1) {
      this.host.announce('Add a block first.');
      return;
    }
    const last = this.d.links[this.d.links.length - 1];
    const from = last && nodes.some((n) => n.id === last.to) ? last.to : nodes[0].id;
    const other = nodes.find((n) => n.id !== from);
    const l: BlkLink = { id: nextBlkId(this.d, 'l'), from, to: other ? other.id : from, arrow: true, label: '' };
    this.d.links.push(l);
    this.commit();
    this.host.announce(`Link added, ${this.describe(l)}. Choose its ends.`);
    this.focusKey(`from:${l.id}`);
  }

  private removeLink(id: string): void {
    const at = this.d.links.findIndex((l) => l.id === id);
    if (at < 0) return;
    const [gone] = this.d.links.splice(at, 1);
    this.commit();
    this.host.announce(`Link ${this.describe(gone)} removed.`);
    const near = this.d.links[Math.min(at, this.d.links.length - 1)];
    if (!near || !this.focusKey(`from:${near.id}`)) this.el.querySelector<HTMLElement>('button')?.focus();
  }

  // ───────────────────────────── Drawing ─────────────────────────────

  private renderAll(): void {
    const active = document.activeElement;
    const inside = active instanceof HTMLElement && this.el.contains(active);
    const keep = inside ? active.dataset.key : undefined;
    const keepAct = inside && !keep ? active.dataset.act : undefined;
    this.renderBlocks();
    this.renderLinks();
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

  private moveButtons(kind: string, id: string, index: number, count: number, move: (by: -1 | 1) => void): HTMLElement {
    return h(
      'span',
      { class: 'volcanic-radar-move' },
      this.small(`Move ${kind} ${index + 1} up`, 'arrow-up', `up:${id}`, () => move(-1), index === 0),
      this.small(`Move ${kind} ${index + 1} down`, 'arrow-down', `down:${id}`, () => move(1), index === count - 1),
    );
  }

  private altMove(row: HTMLElement, move: (by: -1 | 1, key?: string) => void): void {
    row.addEventListener('keydown', (event) => {
      if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
      event.preventDefault();
      event.stopPropagation();
      move(event.key === 'ArrowUp' ? -1 : 1, (event.target as HTMLElement).dataset.key);
    });
  }

  private pick<T extends string>(options: { id: T; name: string }[], value: T, key: string, label: string, set: (v: T) => void): HTMLSelectElement {
    const select = selectControl(options, value, (v) => {
      set(v);
      this.commit();
    });
    select.setAttribute('aria-label', label);
    select.dataset.key = key;
    return select;
  }

  private renderBlocks(): void {
    const { blocks } = this.d;
    this.wheres = new Map();
    const rows = blocks.map((b, index) => {
      const n = `block ${index + 1}`;
      const text = h('input', { class: 'volcanic-input', attrs: { type: 'text', autocomplete: 'off', 'aria-label': `Label of ${n}`, 'data-key': `label:${b.id}`, placeholder: 'Label' } });
      text.value = b.label;
      text.addEventListener('input', () => {
        b.label = text.value;
        this.update(`label:${b.id}`);
      });
      if (b.shape === 'space') {
        text.disabled = true;
        text.value = '';
        text.placeholder = 'Empty space';
      }
      const shape = this.pick(BLK_SHAPES, b.shape, `shape:${b.id}`, `Shape of ${n}`, (v) => (b.shape = v));
      const span = h('input', { class: 'volcanic-input', attrs: { type: 'number', min: '1', max: String(MAX_SPAN), step: '1', inputmode: 'numeric', 'aria-label': `Columns spanned by ${n}`, 'data-key': `span:${b.id}`, title: 'How many columns it spans' } });
      span.value = String(b.span);
      span.addEventListener('input', () => {
        const v = Math.round(Number(span.value));
        if (span.value === '' || !Number.isFinite(v) || v < 1) return;
        b.span = Math.min(MAX_SPAN, v);
        this.history.push(this.d, `span:${b.id}`);
        this.host.changed();
        this.renderWheres();
        this.renderNotes();
      });
      span.addEventListener('blur', () => (span.value = String(b.span)));
      const where = h('span', { class: 'volcanic-hint volcanic-blk-where' });
      this.wheres.set(b.id, where);
      const row = h(
        'div',
        { class: 'volcanic-blk-row' },
        this.moveButtons('block', b.id, index, blocks.length, (by) => this.moveIn(blocks, index, by, 'block', `Block ${this.name(b.id)}`)),
        text,
        shape,
        span,
        where,
        this.small(`Remove ${n}`, 'x', `rm:${b.id}`, () => this.removeBlock(b.id)),
      );
      this.altMove(row, (by, k) => this.moveIn(blocks, index, by, 'block', `Block ${this.name(b.id)}`, k));
      return row;
    });
    const head = h(
      'div',
      { class: 'volcanic-blk-row volcanic-st-head', attrs: { 'aria-hidden': 'true' } },
      h('span'),
      h('span', { text: 'Label' }),
      h('span', { text: 'Shape' }),
      h('span', { text: 'Span' }),
      h('span', { text: 'Lands in' }),
      h('span'),
    );
    this.blockList.replaceChildren(...(rows.length ? [head, ...rows] : []));
    if (!rows.length) this.blockList.append(h('p', { class: 'volcanic-hint', text: 'No blocks yet. Add one with the Add block button.' }));
    this.renderWheres();
  }

  /** Which row and columns each block lands in, which changes whenever spans or the order do. */
  private renderWheres(): void {
    for (const p of placeBlocks(this.d)) {
      const el = this.wheres.get(p.block.id);
      if (!el) continue;
      el.textContent = p.from === p.to ? `Row ${p.row}, col ${p.from}` : `Row ${p.row}, cols ${p.from}–${p.to}`;
      el.setAttribute('aria-label', whereText(p));
    }
  }

  /** The blocks a link can join. Blocks that share a label are told apart by number. */
  private choices(): { id: string; name: string }[] {
    const nodes = this.d.blocks.filter((b) => b.shape !== 'space');
    const totals = new Map<string, number>();
    const seen = new Map<string, number>();
    const base = (b: Blk): string => blkLabel(b) || 'Unnamed block';
    for (const b of nodes) totals.set(base(b).toLowerCase(), (totals.get(base(b).toLowerCase()) ?? 0) + 1);
    return nodes.map((b) => {
      const k = base(b).toLowerCase();
      const n = (seen.get(k) ?? 0) + 1;
      seen.set(k, n);
      return { id: b.id, name: (totals.get(k) ?? 0) > 1 ? `${base(b)} (${n})` : base(b) };
    });
  }

  private renderLinks(): void {
    const { links } = this.d;
    const choices = this.choices();
    const active = document.activeElement;
    const keep = active instanceof HTMLElement && this.linkList.contains(active) ? active.dataset.key : undefined;
    const rows = links.map((l, index) => {
      const n = `link ${index + 1}`;
      const end = (id: string): string => (choices.some((o) => o.id === id) ? id : (choices[0]?.id ?? ''));
      const label = h('input', { class: 'volcanic-input', attrs: { type: 'text', autocomplete: 'off', 'aria-label': `Label of ${n}`, 'data-key': `llabel:${l.id}`, placeholder: 'Label' } });
      label.value = l.label;
      label.addEventListener('input', () => {
        l.label = label.value;
        this.history.push(this.d, `llabel:${l.id}`);
        this.host.changed();
      });
      const row = h(
        'div',
        { class: 'volcanic-blk-link' },
        this.moveButtons('link', l.id, index, links.length, (by) => this.moveIn(links, index, by, 'link', `Link ${this.describe(l)}`)),
        this.pick(choices, end(l.from), `from:${l.id}`, `From of ${n}`, (v) => (l.from = v)),
        this.pick(LINE_STYLES, l.arrow ? 'arrow' : 'line', `style:${l.id}`, `Line style of ${n}`, (v) => (l.arrow = v === 'arrow')),
        this.pick(choices, end(l.to), `to:${l.id}`, `To of ${n}`, (v) => (l.to = v)),
        label,
        this.small(`Remove ${n}`, 'x', `rml:${l.id}`, () => this.removeLink(l.id)),
      );
      this.altMove(row, (by, k) => this.moveIn(links, index, by, 'link', `Link ${this.describe(l)}`, k));
      return row;
    });
    this.linkList.replaceChildren(...rows);
    if (!rows.length) this.linkList.append(h('p', { class: 'volcanic-hint', text: 'No links yet. Add one with the Add link button.' }));
    if (keep) this.linkList.querySelector<HTMLElement>(`[data-key="${keep}"]`)?.focus();
  }

  private renderOptions(): void {
    const columns = h('input', { class: 'volcanic-input', attrs: { type: 'number', min: '0', max: String(MAX_COLUMNS), step: '1', inputmode: 'numeric' } });
    columns.value = String(this.d.columns);
    columns.addEventListener('input', () => {
      const v = Math.round(Number(columns.value));
      if (columns.value === '' || !Number.isFinite(v) || v < 0) return;
      this.d.columns = Math.min(MAX_COLUMNS, v);
      this.history.push(this.d, 'columns');
      this.host.changed();
      this.renderWheres();
      this.renderNotes();
    });
    columns.addEventListener('blur', () => (columns.value = String(this.d.columns)));
    this.options.replaceChildren(field('Columns', columns, `How many blocks go across, 1 to ${MAX_COLUMNS}. Leave at 0 to let the diagram decide.`));
  }

  private renderNotes(): void {
    const messages: string[] = [];
    const wide = tooWide(this.d);
    if (wide.length) messages.push(`${wide.map((b) => blkLabel(b) || 'a block').join(', ')} ${wide.length === 1 ? 'spans' : 'span'} more columns than the grid has, so ${wide.length === 1 ? 'it is' : 'they are'} squeezed to fit.`);
    const blank = this.d.blocks.filter((b) => b.shape !== 'space' && !blkLabel(b)).length;
    if (blank) messages.push(`${blank} ${blank === 1 ? 'block has' : 'blocks have'} no label and will show its short code.`);
    this.warning.hidden = !messages.length;
    this.warning.textContent = messages.join(' ');
    const rows = new Set(placeBlocks(this.d).map((p) => p.row)).size;
    const { blocks, links } = this.d;
    this.summary.textContent = `${blocks.length} ${blocks.length === 1 ? 'block' : 'blocks'} in ${rows} ${rows === 1 ? 'row' : 'rows'}, ${links.length} ${links.length === 1 ? 'link' : 'links'}.`;
  }
}

export { starterBlocks };
