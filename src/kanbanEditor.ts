import { h, uniqueId } from './dom';
import { History, type KindEditor, type KindHost, type KindMeta } from './kinds';
import { PRIORITIES, allCards, findCard, kanbanToMermaid, moveCard, nextKanbanId, starterKanban, type Kanban, type KanbanCard, type KanbanColumn, type KanbanPriority } from './kanban';
import { field, iconButton, selectControl } from './ui';

const DRAG_START = 5;

/**
 * A kanban board as columns of cards. Drag a card by its grip to reorder it or move it to another column, or hold
 * Alt with the arrow keys in its field. Each card has optional details: who has it, a ticket reference and a priority.
 */
export class KanbanEditor implements KindEditor {
  readonly el: HTMLElement;
  private k: Kanban;
  private readonly history: History<Kanban>;
  private readonly initial: string;
  private readonly uid = uniqueId('volcanic-kb');

  private board!: HTMLElement;
  private indicator!: HTMLElement;
  private summary!: HTMLElement;
  private readonly open = new Set<string>();
  private readonly cardEls = new Map<string, HTMLElement>();
  private readonly columnEls = new Map<string, HTMLElement>();
  private cancelDrag: (() => void) | null = null;

  constructor(private readonly host: KindHost, kanban: Kanban, pristine = false) {
    this.k = JSON.parse(JSON.stringify(kanban)) as Kanban;
    this.history = new History(this.k);
    this.initial = pristine ? JSON.stringify(this.k) : '';
    this.el = this.build();
    this.renderAll();
  }

  // ───────────────────────────── KindEditor ─────────────────────────────

  source(meta: KindMeta): string {
    return kanbanToMermaid(this.k, meta);
  }

  isPristine(): boolean {
    return this.initial !== '' && JSON.stringify(this.k) === this.initial;
  }

  focus(): void {
    this.board.querySelector<HTMLElement>('input')?.focus();
  }

  cancelTransient(): boolean {
    if (!this.cancelDrag) return false;
    this.cancelDrag();
    return true;
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
    this.cancelDrag?.();
    this.el.remove();
  }

  private apply(value: Kanban | null, message: string): void {
    if (!value) return;
    this.k = value;
    this.renderAll();
    this.host.changed();
    this.host.announce(message);
  }

  // ───────────────────────────── Build ─────────────────────────────

  private build(): HTMLElement {
    const helpId = `${this.uid}-help`;
    const toolbar = h(
      'div',
      { class: 'volcanic-kind-toolbar', attrs: { role: 'toolbar', 'aria-label': 'Kanban board tools' } },
      iconButton(this.host.setIcon, 'Add column', 'plus', () => this.addColumn()),
    );
    this.indicator = h('div', { class: 'volcanic-kb-indicator', attrs: { 'aria-hidden': 'true', hidden: true } });
    this.board = h('div', { class: 'volcanic-kb-board', attrs: { 'aria-describedby': helpId } });
    const help = h('p', {
      class: 'volcanic-sr-only',
      attrs: { id: helpId },
      text: 'Each column holds cards. Drag a card by its grip to reorder it or move it to another column. In a card field, hold Alt with the up and down arrow keys to move it within its column, and with the left and right arrow keys to move it to the next column. Use Details to add an owner, ticket and priority.',
    });
    const canvas = h('div', { class: 'volcanic-kind-canvas' }, h('div', { class: 'volcanic-kb-scroll' }, h('div', { class: 'volcanic-kb-frame' }, this.board, this.indicator), help));
    this.summary = h('p', { class: 'volcanic-hint' });
    const side = h(
      'section',
      { class: 'volcanic-card volcanic-kind-side', attrs: { 'aria-label': 'About this board' } },
      h('div', { class: 'volcanic-panel' }, h('h3', { class: 'volcanic-panel-title', text: 'Board' }), this.summary, h('p', { class: 'volcanic-hint', text: 'Drag a card by its grip, or hold Alt with the arrow keys in its field, to move it.' })),
    );
    return h('div', { class: 'volcanic-kind volcanic-kb' }, toolbar, h('div', { class: 'volcanic-kind-main' }, canvas, side));
  }

  // ───────────────────────────── Changing the board ─────────────────────────────

  private commit(tag = ''): void {
    this.history.push(this.k, tag);
    this.host.changed();
    this.renderAll();
  }

  /** Typing: record it and refresh the preview, but leave the cards alone. */
  private update(tag: string): void {
    this.history.push(this.k, tag);
    this.host.changed();
    this.renderNotes();
  }

  private cardName(c: KanbanCard): string {
    return c.text.replace(/\s+/g, ' ').trim() || 'Untitled card';
  }

  private columnName(c: KanbanColumn): string {
    return c.name.replace(/\s+/g, ' ').trim() || 'Untitled column';
  }

  private focusKey(key: string, select = false): boolean {
    const el = this.board.querySelector<HTMLInputElement>(`[data-key="${key}"]`);
    if (!el) return false;
    el.focus();
    if (select) el.select();
    return true;
  }

  private addColumn(): void {
    const column: KanbanColumn = { id: nextKanbanId(this.k, 'c'), name: 'New column', cards: [] };
    this.k.columns.push(column);
    this.commit();
    this.host.announce('Column added. Type its name.');
    this.focusKey(`col:${column.id}`, true);
    this.columnEls.get(column.id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  private addCard(columnId: string): void {
    const column = this.k.columns.find((c) => c.id === columnId);
    if (!column) return;
    const c: KanbanCard = { id: nextKanbanId(this.k, 'k'), text: 'New card', assigned: '', ticket: '', priority: '' };
    column.cards.push(c);
    this.commit();
    this.host.announce(`Card added to ${this.columnName(column)}. Type what it is.`);
    this.focusKey(`card:${c.id}`, true);
  }

  private removeCard(id: string): void {
    const found = findCard(this.k, id);
    if (!found) return;
    found.column.cards.splice(found.index, 1);
    this.open.delete(id);
    this.commit();
    this.host.announce(`${this.cardName(found.card)} removed.`);
    const near = found.column.cards[Math.min(found.index, found.column.cards.length - 1)];
    if (!near || !this.focusKey(`card:${near.id}`)) this.focusKey(`col:${found.column.id}`);
  }

  private removeColumn(id: string): void {
    const at = this.k.columns.findIndex((c) => c.id === id);
    if (at < 0) return;
    const [gone] = this.k.columns.splice(at, 1);
    this.commit();
    const lost = gone.cards.length;
    this.host.announce(`${this.columnName(gone)} removed${lost ? ` with its ${lost} ${lost === 1 ? 'card' : 'cards'}. Undo brings it back` : ''}.`);
    const near = this.k.columns[Math.min(at, this.k.columns.length - 1)];
    if (!near || !this.focusKey(`col:${near.id}`)) this.el.querySelector<HTMLElement>('button')?.focus();
  }

  private moveColumn(id: string, by: -1 | 1): void {
    const from = this.k.columns.findIndex((c) => c.id === id);
    const to = from + by;
    if (from < 0) return;
    if (to < 0 || to >= this.k.columns.length) return void this.host.announce(by < 0 ? 'Already the first column.' : 'Already the last column.');
    const [column] = this.k.columns.splice(from, 1);
    this.k.columns.splice(to, 0, column);
    this.commit();
    this.host.announce(`${this.columnName(column)} moved to position ${to + 1} of ${this.k.columns.length}.`);
  }

  /** Move a card with the keyboard: up or down within its column, left or right into the neighbouring column. */
  private nudge(id: string, dx: -1 | 0 | 1, dy: -1 | 0 | 1): boolean {
    const found = findCard(this.k, id);
    if (!found) return false;
    const { column, columnIndex, index } = found;
    if (dy) {
      const to = index + dy;
      if (to < 0 || to >= column.cards.length) {
        this.host.announce(dy < 0 ? 'Already the first card in the column.' : 'Already the last card in the column.');
        return false;
      }
      moveCard(this.k, id, columnIndex, dy < 0 ? to : to + 1);
    } else {
      const target = this.k.columns[columnIndex + dx];
      if (!target) {
        this.host.announce(dx < 0 ? 'Already in the first column.' : 'Already in the last column.');
        return false;
      }
      moveCard(this.k, id, columnIndex + dx, Math.min(index, target.cards.length));
    }
    this.commit();
    const now = findCard(this.k, id)!;
    this.host.announce(`${this.cardName(found.card)} moved to position ${now.index + 1} of ${now.column.cards.length} in ${this.columnName(now.column)}.`);
    return true;
  }

  // ───────────────────────────── Drawing ─────────────────────────────

  private renderAll(): void {
    const active = document.activeElement;
    const inside = active instanceof HTMLElement && this.board.contains(active);
    const keep = inside ? active.dataset.key : undefined;
    const keepAct = inside && !keep ? active.dataset.act : undefined;
    this.renderBoard();
    this.renderNotes();
    if (keep) this.focusKey(keep);
    else if (keepAct) this.board.querySelector<HTMLElement>(`[data-act="${keepAct}"]`)?.focus();
  }

  private small(label: string, icon: string, act: string, onClick: () => void, disabled = false): HTMLButtonElement {
    const button = iconButton(this.host.setIcon, label, icon, onClick, 'volcanic-kb-small');
    button.setAttribute('aria-label', label);
    button.title = label;
    button.dataset.act = act;
    if (disabled) button.setAttribute('aria-disabled', 'true');
    return button;
  }

  private textInput(value: string, key: string, label: string, onInput: (value: string) => void, extra = ''): HTMLInputElement {
    const input = h('input', { class: `volcanic-input ${extra}`.trim(), attrs: { type: 'text', autocomplete: 'off', 'aria-label': label, 'data-key': key } });
    input.value = value;
    input.addEventListener('input', () => {
      onInput(input.value);
      this.update(key);
    });
    return input;
  }

  private renderBoard(): void {
    this.cardEls.clear();
    this.columnEls.clear();
    const columns = this.k.columns.map((column, ci) => {
      const name = this.textInput(column.name, `col:${column.id}`, `Name of column ${ci + 1}`, (v) => (column.name = v), 'volcanic-kb-column-name');
      const head = h(
        'div',
        { class: 'volcanic-kb-column-head' },
        name,
        this.small(`Move ${this.columnName(column)} left`, 'arrow-left', `col-left:${column.id}`, () => this.moveColumn(column.id, -1), ci === 0),
        this.small(`Move ${this.columnName(column)} right`, 'arrow-right', `col-right:${column.id}`, () => this.moveColumn(column.id, 1), ci === this.k.columns.length - 1),
        this.small(`Remove ${this.columnName(column)} and its cards`, 'x', `col-rm:${column.id}`, () => this.removeColumn(column.id)),
      );
      const cards = column.cards.map((card, i) => this.renderCard(card, column, i));
      const list = h('ul', { class: 'volcanic-kb-cards', attrs: { 'aria-label': `Cards in ${this.columnName(column)}` } }, ...cards);
      const el = h(
        'section',
        { class: 'volcanic-kb-column', attrs: { 'aria-label': `Column ${ci + 1}: ${this.columnName(column)}` } },
        head,
        list,
        iconButton(this.host.setIcon, 'Add card', 'plus', () => this.addCard(column.id), 'volcanic-kb-add'),
      );
      this.columnEls.set(column.id, el);
      return el;
    });
    this.board.replaceChildren(...columns);
    if (!columns.length) this.board.append(h('p', { class: 'volcanic-hint', text: 'No columns yet. Add one with the Add column button.' }));
  }

  private renderCard(card: KanbanCard, column: KanbanColumn, index: number): HTMLElement {
    const key = `card:${card.id}`;
    const grip = h('button', {
      class: 'volcanic-kb-grip',
      attrs: { type: 'button', 'aria-label': `Move ${this.cardName(card)}. Drag, or use Alt with the arrow keys.` },
      text: '⠿',
      on: { pointerdown: (event) => this.onPointerDown(event as PointerEvent, card.id) },
    });
    const text = this.textInput(card.text, key, `Card ${index + 1} in ${this.columnName(column)}`, (v) => (card.text = v), 'volcanic-kb-card-text');
    const expanded = this.open.has(card.id);
    const details = iconButton(this.host.setIcon, 'Details', expanded ? 'chevron-up' : 'chevron-down', () => {
      if (this.open.has(card.id)) this.open.delete(card.id);
      else this.open.add(card.id);
      this.renderAll();
    }, 'volcanic-kb-small');
    details.setAttribute('aria-expanded', String(expanded));
    details.setAttribute('aria-label', `Details of ${this.cardName(card)}`);
    details.title = 'Details';
    details.dataset.act = `details:${card.id}`;
    const remove = this.small(`Remove ${this.cardName(card)}`, 'x', `card-rm:${card.id}`, () => this.removeCard(card.id));

    const chips: HTMLElement[] = [];
    if (card.priority) chips.push(h('span', { class: `volcanic-kb-chip is-priority`, text: card.priority }));
    if (card.assigned.trim()) chips.push(h('span', { class: 'volcanic-kb-chip', text: card.assigned.trim() }));
    if (card.ticket.trim()) chips.push(h('span', { class: 'volcanic-kb-chip', text: card.ticket.trim() }));

    const extra: HTMLElement[] = [];
    if (expanded) {
      const priority = selectControl(PRIORITIES, card.priority, (value: KanbanPriority) => {
        card.priority = value;
        this.commit();
      });
      extra.push(
        h(
          'div',
          { class: 'volcanic-kb-details' },
          field('Owner', this.textInput(card.assigned, `assigned:${card.id}`, 'Owner', (v) => (card.assigned = v))),
          field('Ticket', this.textInput(card.ticket, `ticket:${card.id}`, 'Ticket', (v) => (card.ticket = v))),
          field('Priority', priority),
        ),
      );
    }
    const el = h(
      'li',
      { class: 'volcanic-kb-card', attrs: { 'data-id': card.id } },
      h('div', { class: 'volcanic-kb-card-row' }, grip, text, details, remove),
      ...(chips.length && !expanded ? [h('div', { class: 'volcanic-kb-chips' }, ...chips)] : []),
      ...extra,
    );
    el.addEventListener('keydown', (event) => {
      if (!event.altKey || !event.key.startsWith('Arrow')) return;
      event.preventDefault();
      const key2 = (event.target as HTMLElement).dataset.key;
      const moved = event.key === 'ArrowUp' ? this.nudge(card.id, 0, -1) : event.key === 'ArrowDown' ? this.nudge(card.id, 0, 1) : event.key === 'ArrowLeft' ? this.nudge(card.id, -1, 0) : event.key === 'ArrowRight' ? this.nudge(card.id, 1, 0) : false;
      if (moved && key2) this.focusKey(key2);
    });
    this.cardEls.set(card.id, el);
    return el;
  }

  private renderNotes(): void {
    const cards = allCards(this.k).length;
    const columns = this.k.columns.length;
    this.summary.textContent = `${columns} ${columns === 1 ? 'column' : 'columns'}, ${cards} ${cards === 1 ? 'card' : 'cards'}.`;
  }

  // ───────────────────────────── Dragging ─────────────────────────────

  private onPointerDown(event: PointerEvent, id: string): void {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const source = this.cardEls.get(id)!;
    let dragging = false;
    let target: { column: number; index: number } | null = null;

    const finish = (apply: boolean): void => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onCancel, true);
      window.removeEventListener('keydown', onKey, true);
      this.cancelDrag = null;
      this.indicator.hidden = true;
      source.classList.remove('is-dragging');
      document.body.classList.remove('volcanic-is-dragging');
      if (dragging && apply && target) {
        const from = findCard(this.k, id);
        const sameSpot = from && from.columnIndex === target.column && (target.index === from.index || target.index === from.index + 1);
        if (from && !sameSpot && moveCard(this.k, id, target.column, target.index)) {
          this.commit();
          const now = findCard(this.k, id)!;
          this.host.announce(`${this.cardName(now.card)} moved to position ${now.index + 1} of ${now.column.cards.length} in ${this.columnName(now.column)}.`);
        }
      }
    };
    const onMove = (move: PointerEvent): void => {
      if (!dragging) {
        if (Math.hypot(move.clientX - startX, move.clientY - startY) < DRAG_START) return;
        dragging = true;
        source.classList.add('is-dragging');
        document.body.classList.add('volcanic-is-dragging');
      }
      move.preventDefault();
      // The column under the pointer (the nearest one if it is between them), then the gap in it nearest the pointer.
      let column = 0;
      let best = Infinity;
      this.k.columns.forEach((c, i) => {
        const box = this.columnEls.get(c.id)!.getBoundingClientRect();
        const d = move.clientX < box.left ? box.left - move.clientX : move.clientX > box.right ? move.clientX - box.right : 0;
        if (d < best) {
          best = d;
          column = i;
        }
      });
      const col = this.k.columns[column];
      if (!col) return;
      let index = col.cards.length;
      for (let i = 0; i < col.cards.length; i++) {
        const box = this.cardEls.get(col.cards[i].id)!.getBoundingClientRect();
        if (move.clientY < box.top + box.height / 2) {
          index = i;
          break;
        }
      }
      target = { column, index };
      const frame = this.indicator.parentElement!.getBoundingClientRect();
      const colBox = this.columnEls.get(col.id)!.getBoundingClientRect();
      const ref = col.cards[Math.min(index, col.cards.length - 1)];
      let y: number;
      if (!ref) y = this.columnEls.get(col.id)!.querySelector<HTMLElement>('.volcanic-kb-cards')!.getBoundingClientRect().top + 2;
      else {
        const box = this.cardEls.get(ref.id)!.getBoundingClientRect();
        y = index < col.cards.length ? box.top - 3 : box.bottom + 1;
      }
      this.indicator.hidden = false;
      this.indicator.style.left = `${colBox.left - frame.left + 6}px`;
      this.indicator.style.width = `${colBox.width - 12}px`;
      this.indicator.style.top = `${y - frame.top}px`;
    };
    const onUp = (): void => finish(true);
    const onCancel = (): void => finish(false);
    const onKey = (key: KeyboardEvent): void => {
      if (key.key !== 'Escape') return;
      key.preventDefault();
      key.stopPropagation();
      finish(false);
      this.host.announce('Move cancelled.');
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onCancel, true);
    window.addEventListener('keydown', onKey, true);
    this.cancelDrag = () => {
      finish(false);
      this.host.announce('Move cancelled.');
    };
  }
}

export { starterKanban };
