import { h, uniqueId } from './dom';
import { History, type KindEditor, type KindHost, type KindMeta } from './kinds';
import { sliceColour } from './pie';
import { DEFAULT_OPTIONS, MAX_TICKS, formatScore, nextRadarId, overMax, radarToMermaid, starterRadar, valueOf, type Radar, type RadarAxis, type RadarSeries } from './radar';
import { checkbox, field, iconButton, selectControl } from './ui';

/**
 * A radar chart as a grid of scores: one row for each axis (a spoke of the web), one column for each series
 * (a shape on it). Type a score into any cell. Use the arrows, or Alt with the arrow keys, to move an axis.
 */
export class RadarEditor implements KindEditor {
  readonly el: HTMLElement;
  private r: Radar;
  private readonly history: History<Radar>;
  private readonly initial: string;
  private readonly uid = uniqueId('volcanic-radar');

  private table!: HTMLTableElement;
  private summary!: HTMLElement;
  private warning!: HTMLElement;
  private options!: HTMLElement;

  constructor(private readonly host: KindHost, radar: Radar, pristine = false) {
    this.r = JSON.parse(JSON.stringify(radar)) as Radar;
    this.history = new History(this.r);
    this.initial = pristine ? JSON.stringify(this.r) : '';
    this.el = this.build();
    this.renderAll();
  }

  // ───────────────────────────── KindEditor ─────────────────────────────

  source(meta: KindMeta): string {
    return radarToMermaid(this.r, meta);
  }

  isPristine(): boolean {
    return this.initial !== '' && JSON.stringify(this.r) === this.initial;
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

  private apply(value: Radar | null, message: string): void {
    if (!value) return;
    this.r = value;
    this.renderAll();
    this.host.changed();
    this.host.announce(message);
  }

  // ───────────────────────────── Build ─────────────────────────────

  private build(): HTMLElement {
    const helpId = `${this.uid}-help`;
    const toolbar = h(
      'div',
      { class: 'volcanic-kind-toolbar', attrs: { role: 'toolbar', 'aria-label': 'Radar chart tools' } },
      iconButton(this.host.setIcon, 'Add axis', 'plus', () => this.addAxis()),
      iconButton(this.host.setIcon, 'Add series', 'plus', () => this.addSeries()),
    );
    this.table = h('table', { class: 'volcanic-radar-table', attrs: { 'aria-describedby': helpId } });
    const help = h('p', {
      class: 'volcanic-sr-only',
      attrs: { id: helpId },
      text: 'Each row is an axis and each column is a series. Type a score in any cell. Hold Alt with the up and down arrow keys to move an axis, or use its Move buttons.',
    });
    const canvas = h('div', { class: 'volcanic-kind-canvas' }, h('div', { class: 'volcanic-radar-scroll' }, this.table, help));

    this.warning = h('p', { class: 'volcanic-radar-warning', attrs: { role: 'status' } });
    this.summary = h('p', { class: 'volcanic-hint' });
    this.options = h('div', { class: 'volcanic-radar-options' });
    const side = h(
      'section',
      { class: 'volcanic-card volcanic-kind-side', attrs: { 'aria-label': 'Chart options' } },
      h('div', { class: 'volcanic-panel' }, h('h3', { class: 'volcanic-panel-title', text: 'Chart' }), this.options, this.warning, this.summary),
    );
    this.buildOptions();
    return h('div', { class: 'volcanic-kind volcanic-radar' }, toolbar, h('div', { class: 'volcanic-kind-main' }, canvas, side));
  }

  private buildOptions(): void {
    const o = this.r.options;
    const rings = h('input', { class: 'volcanic-input', attrs: { type: 'number', min: '1', max: String(MAX_TICKS), step: '1', inputmode: 'numeric' } });
    rings.value = String(o.ticks);
    rings.addEventListener('input', () => {
      const n = Math.round(Number(rings.value));
      if (rings.value === '' || !Number.isFinite(n) || n < 1 || n > MAX_TICKS) return;
      this.r.options.ticks = n;
      this.update('ticks');
    });
    rings.addEventListener('blur', () => (rings.value = String(this.r.options.ticks)));

    const lowest = h('input', { class: 'volcanic-input', attrs: { type: 'number', min: '0', step: 'any', inputmode: 'decimal' } });
    lowest.value = formatScore(o.min);
    lowest.addEventListener('input', () => {
      const n = Number(lowest.value);
      if (lowest.value === '' || !Number.isFinite(n) || n < 0) return;
      this.r.options.min = n;
      this.update('min');
    });
    lowest.addEventListener('blur', () => (lowest.value = formatScore(this.r.options.min)));

    const highest = h('input', { class: 'volcanic-input', attrs: { type: 'number', min: '0', step: 'any', inputmode: 'decimal', placeholder: 'Automatic' } });
    highest.value = o.max === null ? '' : formatScore(o.max);
    highest.addEventListener('input', () => {
      if (highest.value === '') {
        this.r.options.max = null;
        return this.update('max');
      }
      const n = Number(highest.value);
      if (!Number.isFinite(n) || n < 0) return;
      this.r.options.max = n;
      this.update('max');
    });
    highest.addEventListener('blur', () => (highest.value = this.r.options.max === null ? '' : formatScore(this.r.options.max)));

    this.options.replaceChildren(
      checkbox('Show the legend', o.showLegend, (on) => {
        this.r.options.showLegend = on;
        this.commit();
        this.host.announce(on ? 'Legend shown.' : 'Legend hidden.');
      }),
      field(
        'Grid shape',
        selectControl(
          [
            { id: 'circle', name: 'Circles' },
            { id: 'polygon', name: 'Polygons' },
          ],
          o.graticule,
          (value) => {
            this.r.options.graticule = value;
            this.commit();
            this.host.announce(value === 'circle' ? 'Grid drawn with circles.' : 'Grid drawn with polygons.');
          },
        ),
      ),
      field('Rings', rings, `Lines between the centre and the edge, 1 to ${MAX_TICKS}.`),
      field('Lowest score', lowest, 'The score at the centre.'),
      field('Highest score', highest, 'The score at the edge. Leave empty to fit the biggest score.'),
    );
  }

  // ───────────────────────────── Changing the chart ─────────────────────────────

  private commit(tag = ''): void {
    this.history.push(this.r, tag);
    this.host.changed();
    this.renderAll();
  }

  /** Record a change made while typing: update the notes, not the grid. */
  private update(tag: string): void {
    this.history.push(this.r, tag);
    this.host.changed();
    this.renderNotes();
  }

  private axisName(axis: RadarAxis): string {
    return axis.label.replace(/\s+/g, ' ').trim() || 'Untitled axis';
  }

  private seriesName(series: RadarSeries): string {
    return series.label.replace(/\s+/g, ' ').trim() || 'Untitled series';
  }

  private addAxis(): void {
    const axis: RadarAxis = { id: nextRadarId(this.r, 'a'), label: 'New axis' };
    this.r.axes.push(axis);
    this.commit();
    this.host.announce('Axis added. Type its name.');
    this.focusKey(`axis:${axis.id}`, true);
  }

  private addSeries(): void {
    const series: RadarSeries = { id: nextRadarId(this.r, 'c'), label: 'New series', values: {} };
    this.r.series.push(series);
    this.commit();
    this.host.announce('Series added. Type its name, then its scores.');
    this.focusKey(`series:${series.id}`, true);
  }

  private removeAxis(id: string): void {
    const at = this.r.axes.findIndex((a) => a.id === id);
    if (at < 0) return;
    const [gone] = this.r.axes.splice(at, 1);
    for (const s of this.r.series) delete s.values[id];
    this.commit();
    this.host.announce(`${this.axisName(gone)} removed.`);
    const near = this.r.axes[Math.min(at, this.r.axes.length - 1)];
    if (!near || !this.focusKey(`axis:${near.id}`)) this.el.querySelector<HTMLElement>('button')?.focus();
  }

  private removeSeries(id: string): void {
    if (this.r.series.length <= 1) return this.host.announce('A radar chart needs at least one series.');
    const at = this.r.series.findIndex((s) => s.id === id);
    if (at < 0) return;
    const [gone] = this.r.series.splice(at, 1);
    this.commit();
    this.host.announce(`${this.seriesName(gone)} removed.`);
    this.focusKey(`series:${this.r.series[Math.min(at, this.r.series.length - 1)].id}`);
  }

  private moveAxis(id: string, by: -1 | 1): boolean {
    const from = this.r.axes.findIndex((a) => a.id === id);
    const to = from + by;
    if (from < 0) return false;
    if (to < 0 || to >= this.r.axes.length) {
      this.host.announce(by < 0 ? 'Already the first axis.' : 'Already the last axis.');
      return false;
    }
    const [axis] = this.r.axes.splice(from, 1);
    this.r.axes.splice(to, 0, axis);
    this.commit();
    this.host.announce(`${this.axisName(axis)} moved to position ${to + 1} of ${this.r.axes.length}.`);
    return true;
  }

  private focusKey(key: string, select = false): boolean {
    const input = this.table.querySelector<HTMLInputElement>(`[data-key="${key}"]`);
    if (!input) return false;
    input.focus();
    if (select) input.select();
    return true;
  }

  // ───────────────────────────── Drawing ─────────────────────────────

  private renderAll(): void {
    const active = document.activeElement;
    const keep = active instanceof HTMLElement && this.table.contains(active) ? active.dataset.key : undefined;
    const keepButton = active instanceof HTMLElement && this.table.contains(active) && !keep ? active.getAttribute('data-act') : null;
    this.renderTable();
    this.buildOptions();
    this.renderNotes();
    if (keep) this.focusKey(keep);
    else if (keepButton) this.table.querySelector<HTMLElement>(`[data-act="${keepButton}"]`)?.focus();
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
    const { axes, series } = this.r;
    const head = h('tr', {}, h('td'), h('th', { attrs: { scope: 'col' }, text: 'Axis' }));
    series.forEach((s, index) => {
      const swatch = h('span', { class: 'volcanic-pie-swatch', attrs: { 'aria-hidden': 'true' } });
      swatch.style.background = sliceColour(index);
      const name = h('input', { class: 'volcanic-input volcanic-radar-name', attrs: { type: 'text', autocomplete: 'off', 'aria-label': `Name of series ${index + 1}`, 'data-key': `series:${s.id}` } });
      name.value = s.label;
      name.addEventListener('input', () => {
        s.label = name.value;
        this.update(`series:${s.id}`);
      });
      const remove = this.small(`Remove ${this.seriesName(s)}`, 'x', `rm-s:${s.id}`, () => this.removeSeries(s.id), series.length <= 1);
      head.append(h('th', { attrs: { scope: 'col' } }, h('div', { class: 'volcanic-radar-series' }, swatch, name, remove)));
    });
    head.append(h('td'));

    const body = h('tbody');
    axes.forEach((axis, index) => {
      const name = h('input', { class: 'volcanic-input volcanic-radar-name', attrs: { type: 'text', autocomplete: 'off', 'aria-label': `Name of axis ${index + 1}`, 'data-key': `axis:${axis.id}` } });
      name.value = axis.label;
      name.addEventListener('input', () => {
        axis.label = name.value;
        this.update(`axis:${axis.id}`);
      });
      const row = h(
        'tr',
        {},
        h(
          'td',
          { class: 'volcanic-radar-move' },
          this.small(`Move ${this.axisName(axis)} up`, 'arrow-up', `up:${axis.id}`, () => this.moveAxis(axis.id, -1), index === 0),
          this.small(`Move ${this.axisName(axis)} down`, 'arrow-down', `down:${axis.id}`, () => this.moveAxis(axis.id, 1), index === axes.length - 1),
        ),
        h('th', { attrs: { scope: 'row' } }, name),
      );
      series.forEach((s) => {
        const cell = h('input', {
          class: 'volcanic-input volcanic-radar-value',
          attrs: { type: 'number', min: '0', step: 'any', inputmode: 'decimal', 'aria-label': `${this.seriesName(s)}, ${this.axisName(axis)}`, 'data-key': `v:${axis.id}:${s.id}` },
        });
        cell.value = formatScore(valueOf(s, axis));
        cell.addEventListener('input', () => {
          const n = Number(cell.value);
          if (cell.value === '' || !Number.isFinite(n) || n < 0) return;
          s.values[axis.id] = n;
          this.update(`v:${axis.id}:${s.id}`);
        });
        cell.addEventListener('blur', () => (cell.value = formatScore(valueOf(s, axis))));
        row.append(h('td', {}, cell));
      });
      row.append(h('td', {}, this.small(`Remove ${this.axisName(axis)}`, 'x', `rm-a:${axis.id}`, () => this.removeAxis(axis.id))));
      row.addEventListener('keydown', (event) => {
        if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
        event.preventDefault();
        const key = (event.target as HTMLElement).dataset.key;
        if (this.moveAxis(axis.id, event.key === 'ArrowUp' ? -1 : 1) && key) this.focusKey(key);
      });
      body.append(row);
    });
    if (!axes.length) body.append(h('tr', {}, h('td', { attrs: { colspan: String(series.length + 3) }, class: 'volcanic-hint', text: 'No axes yet. Add one with the Add axis button.' })));
    this.table.replaceChildren(h('thead', {}, head), body);
  }

  private renderNotes(): void {
    const { axes, series } = this.r;
    const over = overMax(this.r);
    this.warning.hidden = !over;
    this.warning.textContent = over ? `⚠ ${over} ${over === 1 ? 'score is' : 'scores are'} higher than the highest score, so ${over === 1 ? 'it goes' : 'they go'} past the edge. Raise the highest score, or leave it empty.` : '';
    const o = this.r.options;
    const parts = [`${axes.length} ${axes.length === 1 ? 'axis' : 'axes'}, ${series.length} ${series.length === 1 ? 'series' : 'series'}.`];
    if (axes.length < 3) parts.push('A radar chart looks best with at least three axes.');
    if (o.max !== null && o.max <= o.min) parts.push('The highest score is not above the lowest, so the edge is set from the data instead.');
    this.summary.textContent = parts.join(' ');
  }
}

export { starterRadar, DEFAULT_OPTIONS };
