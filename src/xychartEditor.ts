import { h, uniqueId } from './dom';
import { History, type KindEditor, type KindHost, type KindMeta } from './kinds';
import { sliceColour } from './pie';
import { SERIES_KINDS, formatNumber, nextXyId, starterXyChart, valueAt, xyChartToMermaid, type XyCategory, type XyChart, type XySeries } from './xychart';
import { field, iconButton, selectControl } from './ui';

/**
 * An XY chart as a grid of values: one row for each item on the horizontal axis, one column for each series
 * (a set of bars or a line). Type a value into any cell. The arrows, or Alt with the up and down arrow keys, move a row.
 * The grid reuses the radar editor's table styles.
 */
export class XyChartEditor implements KindEditor {
  readonly el: HTMLElement;
  private c: XyChart;
  private readonly history: History<XyChart>;
  private readonly initial: string;
  private readonly uid = uniqueId('volcanic-xy');

  private table!: HTMLTableElement;
  private summary!: HTMLElement;
  private options!: HTMLElement;

  constructor(private readonly host: KindHost, chart: XyChart, pristine = false) {
    this.c = JSON.parse(JSON.stringify(chart)) as XyChart;
    this.history = new History(this.c);
    this.initial = pristine ? JSON.stringify(this.c) : '';
    this.el = this.build();
    this.renderAll();
  }

  // ───────────────────────────── KindEditor ─────────────────────────────

  source(meta: KindMeta): string {
    return xyChartToMermaid(this.c, meta);
  }

  isPristine(): boolean {
    return this.initial !== '' && JSON.stringify(this.c) === this.initial;
  }

  focus(): void {
    this.table.querySelector<HTMLElement>('input')?.focus();
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

  private apply(value: XyChart | null, message: string): void {
    if (!value) return;
    this.c = value;
    this.renderAll();
    this.host.changed();
    this.host.announce(message);
  }

  // ───────────────────────────── Build ─────────────────────────────

  private build(): HTMLElement {
    const helpId = `${this.uid}-help`;
    const toolbar = h(
      'div',
      { class: 'volcanic-kind-toolbar', attrs: { role: 'toolbar', 'aria-label': 'XY chart tools' } },
      iconButton(this.host.setIcon, 'Add item', 'plus', () => this.addCategory()),
      iconButton(this.host.setIcon, 'Add series', 'plus', () => this.addSeries()),
    );
    this.table = h('table', { class: 'volcanic-radar-table', attrs: { 'aria-describedby': helpId } });
    const help = h('p', {
      class: 'volcanic-sr-only',
      attrs: { id: helpId },
      text: 'Each row is an item on the horizontal axis and each column is a series of bars or a line. Type a value in any cell. Hold Alt with the up and down arrow keys to move an item, or use its Move buttons.',
    });
    const canvas = h('div', { class: 'volcanic-kind-canvas' }, h('div', { class: 'volcanic-radar-scroll' }, this.table, help));
    this.summary = h('p', { class: 'volcanic-hint' });
    this.options = h('div', { class: 'volcanic-radar-options' });
    const side = h('section', { class: 'volcanic-card volcanic-kind-side', attrs: { 'aria-label': 'Chart options' } }, h('div', { class: 'volcanic-panel' }, h('h3', { class: 'volcanic-panel-title', text: 'Chart' }), this.options, this.summary));
    this.buildOptions();
    return h('div', { class: 'volcanic-kind volcanic-xy' }, toolbar, h('div', { class: 'volcanic-kind-main' }, canvas, side));
  }

  private text(label: string, value: string, set: (value: string) => void): HTMLElement {
    const input = h('input', { class: 'volcanic-input', attrs: { type: 'text', autocomplete: 'off' } });
    input.value = value;
    input.addEventListener('input', () => {
      set(input.value);
      this.update(`opt:${label}`);
    });
    return field(label, input);
  }

  private number(label: string, value: number | null, set: (value: number | null) => void, hint: string): HTMLElement {
    const input = h('input', { class: 'volcanic-input', attrs: { type: 'number', step: 'any', inputmode: 'decimal', placeholder: 'Automatic' } });
    input.value = value === null ? '' : formatNumber(value);
    input.addEventListener('input', () => {
      if (input.value === '') {
        set(null);
        return this.update(`opt:${label}`);
      }
      const n = Number(input.value);
      if (!Number.isFinite(n)) return;
      set(n);
      this.update(`opt:${label}`);
    });
    input.addEventListener('blur', () => {
      const now = label === 'Lowest value' ? this.c.yMin : this.c.yMax;
      input.value = now === null ? '' : formatNumber(now);
    });
    return field(label, input, hint);
  }

  private buildOptions(): void {
    this.options.replaceChildren(
      field(
        'Direction',
        selectControl(
          [
            { id: 'vertical', name: 'Bars stand up' },
            { id: 'horizontal', name: 'Bars lie sideways' },
          ],
          this.c.horizontal ? 'horizontal' : 'vertical',
          (value) => {
            this.c.horizontal = value === 'horizontal';
            this.commit();
            this.host.announce(this.c.horizontal ? 'Bars lie sideways.' : 'Bars stand up.');
          },
        ),
      ),
      this.text('Horizontal axis title', this.c.xTitle, (v) => (this.c.xTitle = v)),
      this.text('Vertical axis title', this.c.yTitle, (v) => (this.c.yTitle = v)),
      this.number('Lowest value', this.c.yMin, (v) => (this.c.yMin = v), 'The bottom of the value axis. Leave empty to fit the data.'),
      this.number('Highest value', this.c.yMax, (v) => (this.c.yMax = v), 'The top of the value axis. Both ends are needed to set the range.'),
    );
  }

  // ───────────────────────────── Changing the chart ─────────────────────────────

  private commit(tag = ''): void {
    this.history.push(this.c, tag);
    this.host.changed();
    this.renderAll();
  }

  /** Typing: record it and refresh the preview, but leave the grid alone. */
  private update(tag: string): void {
    this.history.push(this.c, tag);
    this.host.changed();
    this.renderNotes();
  }

  private itemName(x: XyCategory): string {
    return x.label.replace(/\s+/g, ' ').trim() || 'Untitled item';
  }

  private seriesName(s: XySeries): string {
    return s.label.replace(/\s+/g, ' ').trim() || 'Untitled series';
  }

  private focusKey(key: string, select = false): boolean {
    const el = this.table.querySelector<HTMLInputElement>(`[data-key="${key}"]`);
    if (!el) return false;
    el.focus();
    if (select) el.select();
    return true;
  }

  private addCategory(): void {
    const item: XyCategory = { id: nextXyId(this.c, 'x'), label: `Item ${this.c.categories.length + 1}` };
    this.c.categories.push(item);
    this.commit();
    this.host.announce('Item added. Type its name, then its values.');
    this.focusKey(`item:${item.id}`, true);
  }

  private addSeries(): void {
    const series: XySeries = { id: nextXyId(this.c, 's'), kind: this.c.series.length ? 'line' : 'bar', label: 'New series', values: {} };
    this.c.series.push(series);
    this.commit();
    this.host.announce('Series added. Type its name, then its values.');
    this.focusKey(`series:${series.id}`, true);
  }

  private removeCategory(id: string): void {
    if (this.c.categories.length <= 1) return void this.host.announce('A chart needs at least one item.');
    const at = this.c.categories.findIndex((x) => x.id === id);
    if (at < 0) return;
    const [gone] = this.c.categories.splice(at, 1);
    for (const s of this.c.series) delete s.values[id];
    this.commit();
    this.host.announce(`${this.itemName(gone)} removed.`);
    this.focusKey(`item:${this.c.categories[Math.min(at, this.c.categories.length - 1)].id}`);
  }

  private removeSeries(id: string): void {
    if (this.c.series.length <= 1) return void this.host.announce('A chart needs at least one series.');
    const at = this.c.series.findIndex((s) => s.id === id);
    if (at < 0) return;
    const [gone] = this.c.series.splice(at, 1);
    this.commit();
    this.host.announce(`${this.seriesName(gone)} removed.`);
    this.focusKey(`series:${this.c.series[Math.min(at, this.c.series.length - 1)].id}`);
  }

  private moveCategory(id: string, by: -1 | 1, key?: string): boolean {
    const from = this.c.categories.findIndex((x) => x.id === id);
    const to = from + by;
    if (from < 0) return false;
    if (to < 0 || to >= this.c.categories.length) {
      this.host.announce(by < 0 ? 'Already the first item.' : 'Already the last item.');
      return false;
    }
    const [item] = this.c.categories.splice(from, 1);
    this.c.categories.splice(to, 0, item);
    this.commit();
    this.host.announce(`${this.itemName(item)} moved to position ${to + 1} of ${this.c.categories.length}.`);
    if (key) this.focusKey(key);
    return true;
  }

  // ───────────────────────────── Drawing ─────────────────────────────

  private renderAll(): void {
    const active = document.activeElement;
    const inside = active instanceof HTMLElement && this.table.contains(active);
    const keep = inside ? active.dataset.key : undefined;
    const keepAct = inside && !keep ? active.dataset.act : undefined;
    this.renderTable();
    this.buildOptions();
    this.renderNotes();
    if (keep) this.focusKey(keep);
    else if (keepAct) this.table.querySelector<HTMLElement>(`[data-act="${keepAct}"]`)?.focus();
  }

  private small(label: string, icon: string, act: string, onClick: () => void, disabled = false): HTMLButtonElement {
    const button = iconButton(this.host.setIcon, label, icon, onClick, 'volcanic-radar-small');
    button.setAttribute('aria-label', label);
    button.title = label;
    button.dataset.act = act;
    if (disabled) button.setAttribute('aria-disabled', 'true');
    return button;
  }

  private renderTable(): void {
    const { categories, series } = this.c;
    const head = h('tr', {}, h('td'), h('th', { attrs: { scope: 'col' }, text: 'Item' }));
    series.forEach((s, index) => {
      const swatch = h('span', { class: 'volcanic-pie-swatch', attrs: { 'aria-hidden': 'true' } });
      swatch.style.background = sliceColour(index);
      const name = h('input', { class: 'volcanic-input volcanic-radar-name', attrs: { type: 'text', autocomplete: 'off', 'aria-label': `Name of series ${index + 1}`, 'data-key': `series:${s.id}` } });
      name.value = s.label;
      name.addEventListener('input', () => {
        s.label = name.value;
        this.update(`series:${s.id}`);
      });
      const kind = selectControl(SERIES_KINDS, s.kind, (value) => {
        s.kind = value;
        this.commit();
        this.host.announce(`${this.seriesName(s)} is drawn as ${value === 'bar' ? 'bars' : 'a line'}.`);
      });
      kind.setAttribute('aria-label', `How ${this.seriesName(s)} is drawn`);
      kind.dataset.key = `kind:${s.id}`;
      const remove = this.small(`Remove ${this.seriesName(s)}`, 'x', `rm-s:${s.id}`, () => this.removeSeries(s.id), series.length <= 1);
      head.append(h('th', { attrs: { scope: 'col' } }, h('div', { class: 'volcanic-radar-series' }, swatch, name, remove), kind));
    });
    head.append(h('td'));

    const body = h('tbody');
    categories.forEach((item, index) => {
      const name = h('input', { class: 'volcanic-input volcanic-radar-name', attrs: { type: 'text', autocomplete: 'off', 'aria-label': `Name of item ${index + 1}`, 'data-key': `item:${item.id}` } });
      name.value = item.label;
      name.addEventListener('input', () => {
        item.label = name.value;
        this.update(`item:${item.id}`);
      });
      const row = h(
        'tr',
        {},
        h(
          'td',
          { class: 'volcanic-radar-move' },
          this.small(`Move ${this.itemName(item)} up`, 'arrow-up', `up:${item.id}`, () => this.moveCategory(item.id, -1), index === 0),
          this.small(`Move ${this.itemName(item)} down`, 'arrow-down', `down:${item.id}`, () => this.moveCategory(item.id, 1), index === categories.length - 1),
        ),
        h('th', { attrs: { scope: 'row' } }, name),
      );
      series.forEach((s) => {
        const cell = h('input', {
          class: 'volcanic-input volcanic-radar-value',
          attrs: { type: 'number', step: 'any', inputmode: 'decimal', 'aria-label': `${this.seriesName(s)}, ${this.itemName(item)}`, 'data-key': `v:${item.id}:${s.id}` },
        });
        cell.value = formatNumber(valueAt(s, item));
        cell.addEventListener('input', () => {
          const n = Number(cell.value);
          if (cell.value === '' || !Number.isFinite(n)) return;
          s.values[item.id] = n;
          this.update(`v:${item.id}:${s.id}`);
        });
        cell.addEventListener('blur', () => (cell.value = formatNumber(valueAt(s, item))));
        row.append(h('td', {}, cell));
      });
      row.append(h('td', {}, this.small(`Remove ${this.itemName(item)}`, 'x', `rm-x:${item.id}`, () => this.removeCategory(item.id), categories.length <= 1)));
      row.addEventListener('keydown', (event) => {
        if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
        event.preventDefault();
        this.moveCategory(item.id, event.key === 'ArrowUp' ? -1 : 1, (event.target as HTMLElement).dataset.key);
      });
      body.append(row);
    });
    this.table.replaceChildren(h('thead', {}, head), body);
  }

  private renderNotes(): void {
    const { categories, series, yMin, yMax } = this.c;
    const parts = [`${categories.length} ${categories.length === 1 ? 'item' : 'items'}, ${series.length} ${series.length === 1 ? 'series' : 'series'}.`];
    if ((yMin === null) !== (yMax === null)) parts.push('Set both the lowest and highest value to fix the range; with only one, the chart fits the data.');
    else if (yMin !== null && yMax !== null && yMax <= yMin) parts.push('The highest value is not above the lowest, so the chart fits the data instead.');
    this.summary.textContent = parts.join(' ');
  }
}

export { starterXyChart };
