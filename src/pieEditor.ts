import { h, uniqueId } from './dom';
import { History, type KindEditor, type KindHost, type KindMeta } from './kinds';
import { formatValue, nextSliceId, percentOf, pieToMermaid, sliceColour, starterPie, totalOf, type Pie, type PieSlice } from './pie';
import { checkbox, iconButton } from './ui';

const DRAG_START = 6;

/**
 * A pie chart as a table of slices: a name, a value you can type or slide, and the share it works out to.
 * Drag a row by its grip (or use Alt with the arrow keys) to reorder the slices.
 */
export class PieEditor implements KindEditor {
  readonly el: HTMLElement;
  private p: Pie;
  private readonly history: History<Pie>;
  private readonly initial: string;
  private readonly uid = uniqueId('volcanic-pie');

  private list!: HTMLElement;
  private indicator!: HTMLElement;
  private summary!: HTMLElement;
  private meter!: HTMLElement;
  private meterFill!: HTMLElement;
  private meterText!: HTMLElement;
  private banner!: HTMLElement;
  private wasOver = false;
  private shares!: HTMLElement;
  private cancelDrag: (() => void) | null = null;
  private readonly rows = new Map<string, HTMLElement>();

  constructor(private readonly host: KindHost, pie: Pie, pristine = false) {
    this.p = JSON.parse(JSON.stringify(pie)) as Pie;
    this.history = new History(this.p);
    this.initial = pristine ? JSON.stringify(this.p) : '';
    this.el = this.build();
    this.renderAll();
  }

  // ───────────────────────────── KindEditor ─────────────────────────────

  source(meta: KindMeta): string {
    return pieToMermaid(this.p, meta);
  }

  isPristine(): boolean {
    return this.initial !== '' && JSON.stringify(this.p) === this.initial;
  }

  focus(): void {
    this.list.querySelector<HTMLElement>('input')?.focus();
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

  private apply(value: Pie | null, message: string): void {
    if (!value) return;
    this.p = value;
    this.renderAll();
    this.host.changed();
    this.host.announce(message);
  }

  // ───────────────────────────── Build ─────────────────────────────

  private build(): HTMLElement {
    const { setIcon } = this.host;
    const helpId = `${this.uid}-help`;
    const toolbar = h(
      'div',
      { class: 'volcanic-kind-toolbar', attrs: { role: 'toolbar', 'aria-label': 'Pie chart tools' } },
      iconButton(setIcon, 'Add slice', 'plus', () => this.addSlice()),
      iconButton(setIcon, 'Sort by size', 'arrow-down-wide-narrow', () => this.sortBySize()),
    );
    this.indicator = h('div', { class: 'volcanic-pie-indicator', attrs: { 'aria-hidden': 'true', hidden: true } });
    this.list = h('ul', { class: 'volcanic-pie-list', attrs: { 'aria-label': 'Slices', 'aria-describedby': helpId } });
    const help = h('p', {
      class: 'volcanic-sr-only',
      attrs: { id: helpId },
      text: 'Each row is a slice: type its name and value, or move the slider. Hold Alt with the up and down arrow keys to move a row, or drag it by its grip. Use Remove to delete a slice.',
    });
    const table = h(
      'div',
      { class: 'volcanic-pie-table' },
      h('div', { class: 'volcanic-pie-head', attrs: { 'aria-hidden': 'true' } }, h('span'), h('span'), h('span', { text: 'Name' }), h('span', { text: 'Value' }), h('span', { text: 'Amount' }), h('span', { text: 'Share' }), h('span')),
      this.list,
      this.indicator,
    );
    this.banner = h('div', { class: 'volcanic-pie-banner', attrs: { hidden: true } });
    const canvas = h('div', { class: 'volcanic-kind-canvas' }, h('div', { class: 'volcanic-pie-scroll' }, this.banner, table, help));

    this.meterFill = h('div', { class: 'volcanic-pie-meter-fill' });
    this.meterText = h('p', { class: 'volcanic-pie-meter-text' });
    this.meter = h('div', { class: 'volcanic-pie-meter' }, h('div', { class: 'volcanic-pie-meter-bar', attrs: { 'aria-hidden': 'true' } }, this.meterFill), this.meterText);
    this.summary = h('p', { class: 'volcanic-hint' });
    this.shares = h('ul', { class: 'volcanic-list volcanic-pie-shares', attrs: { 'aria-label': 'Shares of the total' } });
    const side = h(
      'section',
      { class: 'volcanic-card volcanic-kind-side', attrs: { 'aria-label': 'Chart options' } },
      h(
        'div',
        { class: 'volcanic-panel' },
        h('h3', { class: 'volcanic-panel-title', text: 'Chart' }),
        checkbox('Show each value beside its name', this.p.showData, (on) => {
          this.p.showData = on;
          this.commit();
          this.host.announce(on ? 'Values are shown.' : 'Values are hidden.');
        }),
        this.meter,
        this.summary,
        h('h3', { class: 'volcanic-panel-title', text: 'Shares' }),
        this.shares,
      ),
    );
    return h('div', { class: 'volcanic-kind volcanic-pie' }, toolbar, h('div', { class: 'volcanic-kind-main' }, canvas, side));
  }

  // ───────────────────────────── Changing the chart ─────────────────────────────

  private commit(tag = ''): void {
    this.history.push(this.p, tag);
    this.host.changed();
    this.renderAll();
  }

  /** Record a change made while typing or sliding: update the numbers, not the rows. */
  private update(tag: string): void {
    this.history.push(this.p, tag);
    this.host.changed();
    this.renderShares();
  }

  private name(slice: PieSlice): string {
    return slice.label.replace(/\s+/g, ' ').trim() || 'Untitled slice';
  }

  private addSlice(): void {
    const slice: PieSlice = { id: nextSliceId(this.p), label: 'New slice', value: this.p.slices.length ? Math.max(1, Math.round(totalOf(this.p) / this.p.slices.length)) : 10 };
    this.p.slices.push(slice);
    this.commit();
    this.host.announce('Slice added. Type its name.');
    const input = this.rows.get(slice.id)?.querySelector<HTMLInputElement>('.volcanic-pie-name');
    input?.focus();
    input?.select();
  }

  private removeSlice(id: string): void {
    const at = this.p.slices.findIndex((s) => s.id === id);
    if (at < 0) return;
    const [gone] = this.p.slices.splice(at, 1);
    this.commit();
    this.host.announce(`${this.name(gone)} removed.`);
    const near = this.p.slices[Math.min(at, this.p.slices.length - 1)];
    (near ? this.rows.get(near.id)?.querySelector<HTMLElement>('.volcanic-pie-name') : this.el.querySelector<HTMLElement>('button'))?.focus();
  }

  private sortBySize(): void {
    const before = this.p.slices.map((s) => s.id).join();
    this.p.slices.sort((a, b) => b.value - a.value);
    if (this.p.slices.map((s) => s.id).join() === before) {
      this.host.announce('Already sorted from largest to smallest.');
      return;
    }
    this.commit();
    this.host.announce('Slices sorted from largest to smallest.');
  }

  /** Move a slice to sit at `index` (counted before it is lifted out of the list). */
  private move(id: string, index: number, message?: string): boolean {
    const from = this.p.slices.findIndex((s) => s.id === id);
    if (from < 0) return false;
    const [slice] = this.p.slices.splice(from, 1);
    const at = from < index ? index - 1 : index;
    this.p.slices.splice(Math.max(0, Math.min(at, this.p.slices.length)), 0, slice);
    this.commit();
    this.host.announce(message ?? `${this.name(slice)} moved to position ${this.p.slices.indexOf(slice) + 1} of ${this.p.slices.length}.`);
    return true;
  }

  // ───────────────────────────── Drawing ─────────────────────────────

  private renderAll(): void {
    this.renderRows();
    this.renderShares();
  }

  private renderRows(): void {
    const active = document.activeElement;
    const keep = active instanceof HTMLElement && this.list.contains(active) ? { id: active.closest<HTMLElement>('li')?.dataset.id, cls: active.className } : null;
    this.list.replaceChildren();
    this.rows.clear();
    // The slider's range follows the biggest value, with room above it.
    const peak = Math.max(10, ...this.p.slices.map((s) => s.value));
    const max = Math.pow(10, Math.floor(Math.log10(peak))) * Math.ceil(peak / Math.pow(10, Math.floor(Math.log10(peak))) * 1.25);

    this.p.slices.forEach((slice, index) => {
      const n = index + 1;
      const swatch = h('span', { class: 'volcanic-pie-swatch', attrs: { 'aria-hidden': 'true' } });
      swatch.style.background = sliceColour(index);

      const grip = h('button', {
        class: 'volcanic-pie-grip',
        attrs: { type: 'button', 'aria-label': `Move ${this.name(slice)}. Drag, or use Alt with the up and down arrow keys.` },
        text: '⠿',
        on: { pointerdown: (event) => this.onPointerDown(event as PointerEvent, slice.id) },
      });

      const label = h('input', { class: 'volcanic-input volcanic-pie-name', attrs: { type: 'text', autocomplete: 'off', 'aria-label': `Name of slice ${n}` } });
      label.value = slice.label;
      label.addEventListener('input', () => {
        slice.label = label.value;
        this.update(`label:${slice.id}`);
        grip.setAttribute('aria-label', `Move ${this.name(slice)}. Drag, or use Alt with the up and down arrow keys.`);
      });

      const value = h('input', { class: 'volcanic-input volcanic-pie-value', attrs: { type: 'number', min: '0', step: 'any', inputmode: 'decimal', 'aria-label': `Value of ${this.name(slice)}` } });
      value.value = formatValue(slice.value);
      const slider = h('input', { class: 'volcanic-pie-slider', attrs: { type: 'range', min: '0', max: String(max), step: max > 200 ? '1' : '0.5', 'aria-label': `Slider for ${this.name(slice)}` } });
      slider.value = String(Math.min(slice.value, max));
      const share = h('span', { class: 'volcanic-pie-share', attrs: { 'aria-hidden': 'true' } });
      share.dataset.id = slice.id;

      value.addEventListener('input', () => {
        const raw = Number(value.value);
        if (!Number.isFinite(raw) || raw < 0 || value.value === '') return;
        slice.value = raw;
        slider.value = String(Math.min(raw, max));
        this.update(`value:${slice.id}`);
      });
      value.addEventListener('blur', () => {
        // Leave a tidy number, and put back the last good one if the box was emptied or went negative.
        value.value = formatValue(slice.value);
      });
      slider.addEventListener('input', () => {
        slice.value = Number(slider.value);
        value.value = formatValue(slice.value);
        this.update(`value:${slice.id}`);
      });

      const remove = iconButton(this.host.setIcon, 'Remove', 'x', () => this.removeSlice(slice.id));
      remove.setAttribute('aria-label', `Remove ${this.name(slice)}`);
      remove.title = 'Remove slice';

      const row = h('li', { class: 'volcanic-pie-row', attrs: { 'data-id': slice.id } }, grip, swatch, label, value, slider, share, remove);
      row.addEventListener('keydown', (event) => {
        if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
        event.preventDefault();
        const at = this.p.slices.indexOf(slice);
        const to = at + (event.key === 'ArrowUp' ? -1 : 1);
        if (to < 0 || to >= this.p.slices.length) return this.host.announce(event.key === 'ArrowUp' ? 'Already the first slice.' : 'Already the last slice.');
        const target = event.target as HTMLElement;
        this.move(slice.id, event.key === 'ArrowUp' ? to : to + 1);
        const again = this.rows.get(slice.id)?.querySelector<HTMLElement>(`.${target.className.split(' ').join('.')}`);
        again?.focus();
      });
      this.rows.set(slice.id, row);
      this.list.append(row);
    });

    if (!this.p.slices.length) this.list.append(h('li', { class: 'volcanic-hint volcanic-pie-empty', text: 'No slices yet. Add one with the Add slice button.' }));
    if (keep?.id) this.rows.get(keep.id)?.querySelector<HTMLElement>(`.${keep.cls.split(' ').join('.')}`)?.focus();
  }

  /** The share of each slice, which changes for every row whenever one value does. */
  private renderShares(): void {
    const total = totalOf(this.p);
    for (const slice of this.p.slices) {
      const cell = this.list.querySelector<HTMLElement>(`.volcanic-pie-share[data-id="${slice.id}"]`);
      if (cell) cell.textContent = percentOf(slice.value, total);
    }
    const over = total > 100 + 1e-9;
    this.meter.classList.toggle('is-over', over);
    this.meterFill.style.width = `${Math.min(100, total)}%`;
    this.meterText.textContent = over
      ? `⚠ Over 100: the slices add up to ${formatValue(total)}, which is ${formatValue(Math.round((total - 100) * 1e6) / 1e6)} too many. Shares are scaled to fit.`
      : total > 0
        ? `Adds up to ${formatValue(total)} of 100${total < 100 - 1e-9 ? ` (${formatValue(Math.round((100 - total) * 1e6) / 1e6)} to spare)` : ''}.`
        : 'Adds up to 0.';
    this.banner.hidden = !over;
    this.banner.textContent = over ? `⚠ These slices add up to ${formatValue(total)}, which is more than 100. Reduce some values by ${formatValue(Math.round((total - 100) * 1e6) / 1e6)} to bring the total back to 100.` : '';
    this.list.classList.toggle('is-over', over);
    if (over && !this.wasOver) this.host.announce(`Warning: the slices now add up to ${formatValue(total)}, more than 100.`);
    this.wasOver = over;
    this.summary.textContent = this.p.slices.length ? `${this.p.slices.length} ${this.p.slices.length === 1 ? 'slice' : 'slices'}.${total <= 0 ? ' Give a slice a value above zero to see the pie.' : ''}` : 'No slices yet.';
    this.shares.replaceChildren(...this.p.slices.map((slice) => h('li', { class: 'volcanic-pie-share-item', text: `${this.name(slice)}: ${percentOf(slice.value, total)}` })));
  }

  // ───────────────────────────── Dragging ─────────────────────────────

  private onPointerDown(event: PointerEvent, id: string): void {
    if (event.button !== 0) return;
    event.preventDefault();
    const startY = event.clientY;
    const source = this.rows.get(id)!;
    let dragging = false;
    let index: number | null = null;

    const finish = (apply: boolean): void => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onCancel, true);
      window.removeEventListener('keydown', onKey, true);
      this.cancelDrag = null;
      this.indicator.hidden = true;
      source.classList.remove('is-dragging');
      document.body.classList.remove('volcanic-is-dragging');
      if (dragging && apply && index !== null) {
        const from = this.p.slices.findIndex((s) => s.id === id);
        if (index !== from && index !== from + 1) this.move(id, index);
      }
    };
    const onMove = (move: PointerEvent): void => {
      if (!dragging) {
        if (Math.abs(move.clientY - startY) < DRAG_START) return;
        dragging = true;
        source.classList.add('is-dragging');
        document.body.classList.add('volcanic-is-dragging');
      }
      move.preventDefault();
      // The gap nearest the pointer: before the first row whose middle is below it.
      const slices = this.p.slices;
      index = slices.length;
      for (let i = 0; i < slices.length; i++) {
        const box = this.rows.get(slices[i].id)!.getBoundingClientRect();
        if (move.clientY < box.top + box.height / 2) {
          index = i;
          break;
        }
      }
      const table = this.indicator.parentElement!.getBoundingClientRect();
      const last = this.rows.get(slices[Math.min(index, slices.length - 1)].id)!.getBoundingClientRect();
      const y = index < slices.length ? last.top : last.bottom;
      this.indicator.hidden = false;
      this.indicator.style.top = `${y - table.top - 1}px`;
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

export { starterPie };
