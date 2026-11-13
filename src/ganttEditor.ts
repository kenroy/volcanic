import { createTabs, h, uniqueId, type Tabs } from './dom';
import {
  TASK_STATUSES,
  allTasks,
  dependsOn,
  formatDay,
  ganttToMermaid,
  resolveSpans,
  toDay,
  toIso,
  today,
  type GanttDiagram,
  type GanttSection,
  type GanttTask,
  type Span,
  type TaskStatus,
} from './gantt';
import { History, type KindEditor, type KindHost, type KindMeta } from './kinds';
import { INCLUDE_LEVELS, countryOptions, holidayColour, holidaysForPlaces, placeIndexes, placeName, regionOptions } from './holidays';
import { nextId, plainLabel } from './model';
import { checkbox, clamp, field, iconButton, selectControl } from './ui';

const LABEL_W = 230;
const RULER_H = 46;
const DAY_MS = 86400000;

const SCALES = [
  { id: 'day', name: 'Days', px: 34 },
  { id: 'week', name: 'Weeks', px: 14 },
  { id: 'month', name: 'Months', px: 4.5 },
];

type Selection = { kind: 'task' | 'section'; id: string } | null;

const dateOf = (day: number): Date => new Date(day * DAY_MS);
const month = (day: number): string => dateOf(day).toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' });

export class GanttEditor implements KindEditor {
  readonly el: HTMLElement;
  private d: GanttDiagram;
  private readonly history: History<GanttDiagram>;
  private readonly initial: string;
  private selection: Selection = null;
  private px = SCALES[1].px;
  private readonly uid = uniqueId('volcanic-gantt');

  private scroller!: HTMLElement;
  private inspector!: HTMLElement;
  private holidayPanel!: HTMLElement;
  private holidayToggle!: HTMLButtonElement;
  private outline!: HTMLElement;
  private tabs!: Tabs;
  private cancelRename: (() => void) | null = null;

  constructor(private readonly host: KindHost, diagram: GanttDiagram, pristine = false) {
    this.d = JSON.parse(JSON.stringify(diagram)) as GanttDiagram;
    this.history = new History(this.d);
    this.initial = pristine ? JSON.stringify(this.d) : '';
    this.el = this.build();
    this.renderAll();
  }

  // ───────────────────────────── KindEditor ─────────────────────────────

  source(meta: KindMeta): string {
    return ganttToMermaid(this.d, meta);
  }

  isPristine(): boolean {
    return this.initial !== '' && JSON.stringify(this.d) === this.initial;
  }

  focus(): void {
    const first = this.scroller.querySelector<HTMLElement>('[data-key]');
    if (first) first.focus();
    else this.el.querySelector<HTMLElement>('button')?.focus();
  }

  cancelTransient(): boolean {
    if (!this.cancelRename) return false;
    this.cancelRename();
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
    this.el.remove();
  }

  /**
   * Holidays: a button in the toolbar opens a panel where any number of countries (and, where a country has
   * them, states or regions) can be added, for teams that work in several places.
   */
  private buildHolidayControls(): HTMLElement {
    const panelId = `${this.uid}-holidays`;
    this.holidayPanel = h('div', { class: 'volcanic-holiday-panel', attrs: { id: panelId, role: 'group', 'aria-label': 'Holidays', hidden: true } });
    this.holidayToggle = h('button', {
      class: 'volcanic-button volcanic-holiday-toggle',
      attrs: { type: 'button', 'aria-expanded': 'false', 'aria-controls': panelId },
      on: { click: () => this.toggleHolidayPanel() },
    });
    this.renderHolidayPanel();
    return this.holidayToggle;
  }

  private toggleHolidayPanel(open = this.holidayPanel.hidden): void {
    this.holidayPanel.hidden = !open;
    this.holidayToggle.setAttribute('aria-expanded', String(open));
    if (open) this.holidayPanel.querySelector<HTMLElement>('select, button')?.focus();
  }

  private holidaySummary(): string {
    const places = this.d.holidays.filter((c) => c.country);
    return places.length ? `Holidays (${places.length})` : 'Holidays';
  }

  private changeHolidays(message: string): void {
    this.commit();
    this.renderHolidayPanel();
    this.host.announce(message);
  }

  private renderHolidayPanel(): void {
    this.holidayToggle.replaceChildren();
    const icon = h('span', { class: 'volcanic-icon', attrs: { 'aria-hidden': 'true' } });
    this.host.setIcon(icon, 'calendar-days');
    this.holidayToggle.append(icon, h('span', { text: this.holidaySummary() }));

    const places = this.d.holidays;
    const panel = this.holidayPanel;
    const hadFocus = panel.contains(document.activeElement);
    panel.replaceChildren(
      h('p', { class: 'volcanic-hint', text: 'Mark public holidays on the timeline. Add every country your teams work in.' }),
    );
    const list = h('ul', { class: 'volcanic-holiday-list' });
    const slots = placeIndexes(places);
    places.forEach((place, index) => {
      const countryId = `${this.uid}-hc-${index}`;
      const regionId = `${this.uid}-hr-${index}`;
      const country = selectControl<string>([{ id: '', name: 'Choose a country…' }, ...countryOptions()], place.country, (value) => {
        places[index] = { country: value, region: '', include: place.include ?? 0 };
        this.changeHolidays(value ? `Marking holidays for ${placeName(places[index])}.` : 'No country chosen.');
        this.holidayPanel.querySelector<HTMLElement>(`#${regionId}, #${countryId}`)?.focus();
      });
      country.id = countryId;
      const regions = regionOptions(place.country);
      const dot = h('span', { class: 'volcanic-holiday-dot', attrs: { 'aria-hidden': 'true' } });
      if (place.country) dot.style.setProperty('--holiday', holidayColour(slots.get(placeName(place)) ?? index));
      else dot.classList.add('is-blank');
      const row = h('li', { class: 'volcanic-holiday-row' }, h('div', { class: 'volcanic-field-inline' }, dot, h('label', { text: `Country ${index + 1}`, attrs: { for: countryId } }), country));
      if (regions.length) {
        const region = selectControl<string>([{ id: '', name: 'Whole country' }, ...regions], place.region, (value) => {
          places[index] = { ...place, region: value };
          this.changeHolidays(`Marking holidays for ${placeName(places[index])}.`);
          this.holidayPanel.querySelector<HTMLElement>(`#${regionId}`)?.focus();
        });
        region.id = regionId;
        row.append(h('div', { class: 'volcanic-field-inline' }, h('label', { text: 'Region', attrs: { for: regionId } }), region));
      }
      else row.append(h('div', { attrs: { 'aria-hidden': 'true' } }));
      row.append(
        iconButton(this.host.setIcon, 'Remove', 'x', () => {
          const name = place.country ? placeName(place) : 'This country';
          places.splice(index, 1);
          this.changeHolidays(`${name} removed.`);
          this.holidayPanel.querySelector<HTMLElement>('.volcanic-holiday-add')?.focus();
        }),
      );
      list.append(row);
    });
    panel.append(list);

    const includeId = `${this.uid}-holiday-include`;
    const include = selectControl<string>(INCLUDE_LEVELS, String(places.find((c) => c.country)?.include ?? 0), (value) => {
      for (let i = 0; i < places.length; i++) places[i] = { ...places[i], include: Number(value) as 0 | 1 | 2 };
      this.changeHolidays(`${INCLUDE_LEVELS.find((l) => l.id === value)?.name}.`);
      this.holidayPanel.querySelector<HTMLElement>(`#${includeId}`)?.focus();
    });
    include.id = includeId;
    const add = iconButton(this.host.setIcon, 'Add a country', 'plus', () => {
      places.push({ country: '', region: '', include: places.find((c) => c.country)?.include ?? 0 });
      this.renderHolidayPanel();
      this.holidayPanel.querySelectorAll<HTMLElement>('.volcanic-holiday-row:last-child select')[0]?.focus();
      this.host.announce('Choose a country.');
    }, 'volcanic-holiday-add');
    panel.append(h('div', { class: 'volcanic-holiday-footer' }, add, places.some((c) => c.country) ? h('div', { class: 'volcanic-field-inline' }, h('label', { text: 'Days', attrs: { for: includeId } }), include) : null));
    if (hadFocus && !panel.contains(document.activeElement)) add.focus();
  }

  private syncHolidayControls(): void {
    if (this.holidayPanel) this.renderHolidayPanel();
  }

  private apply(value: GanttDiagram | null, message: string): void {
    if (!value) return;
    this.d = value;
    if (this.selection && !this.exists(this.selection)) this.selection = null;
    this.syncHolidayControls();
    this.renderAll();
    this.host.changed();
    this.host.announce(message);
  }

  // ───────────────────────────── Build ─────────────────────────────

  private build(): HTMLElement {
    const { setIcon } = this.host;
    const helpId = `${this.uid}-help`;
    const scaleId = `${this.uid}-scale`;
    const scale = selectControl(
      SCALES.map((x) => ({ id: x.id, name: x.name })),
      SCALES.find((x) => x.px === this.px)!.id,
      (value) => {
        this.px = SCALES.find((x) => x.id === value)!.px;
        this.renderGrid();
        this.host.announce(`Timeline zoom: ${SCALES.find((x) => x.id === value)!.name}.`);
      },
    );
    scale.id = scaleId;

    const toolbar = h(
      'div',
      { class: 'volcanic-kind-toolbar', attrs: { role: 'toolbar', 'aria-label': 'Gantt chart tools' } },
      iconButton(setIcon, 'Add task', 'plus', () => this.addTask()),
      iconButton(setIcon, 'Add section', 'rows-3', () => this.addSection()),
      h('div', { class: 'volcanic-field-inline' }, h('label', { text: 'Zoom', attrs: { for: scaleId } }), scale),
      this.buildHolidayControls(),
    );

    this.scroller = h('div', { class: 'volcanic-gantt-scroll', attrs: { role: 'group', 'aria-label': 'Gantt chart timeline', 'aria-describedby': helpId } });
    const help = h('p', {
      class: 'volcanic-sr-only',
      attrs: { id: helpId },
      text: 'Tab moves between sections and tasks. Left and right arrows move a task by a day, or a week with Shift. Hold Alt to change its length instead. Up and down arrows move to the previous or next task. Enter renames it, Delete removes it. Double-click a name to rename it. Everything is also available in the Properties and Outline panels.',
    });

    this.inspector = h('div', { class: 'volcanic-panel volcanic-inspector' });
    this.outline = h('div', { class: 'volcanic-panel volcanic-outline' });
    this.tabs = createTabs('Details', [
      { id: 'properties', name: 'Properties', panel: this.inspector },
      { id: 'outline', name: 'Outline', panel: this.outline },
    ]);
    const side = h('section', { class: 'volcanic-card volcanic-kind-side', attrs: { 'aria-label': 'Details' } }, this.tabs.list, this.inspector, this.outline);
    const main = h('div', { class: 'volcanic-kind-main' }, h('div', { class: 'volcanic-kind-canvas' }, this.scroller, help), side);
    return h('div', { class: 'volcanic-kind volcanic-gantt' }, toolbar, this.holidayPanel, main);
  }

  // ───────────────────────────── Helpers ─────────────────────────────

  private exists(sel: NonNullable<Selection>): boolean {
    return sel.kind === 'task' ? allTasks(this.d).some((t) => t.id === sel.id) : this.d.sections.some((g) => g.id === sel.id);
  }

  private task(id: string): GanttTask | undefined {
    return allTasks(this.d).find((t) => t.id === id);
  }

  private sectionOf(id: string): GanttSection | undefined {
    return this.d.sections.find((g) => g.tasks.some((t) => t.id === id));
  }

  private taskName(id: string): string {
    const task = this.task(id);
    return task ? plainLabel(task.name, 'Untitled task') : id;
  }

  private commit(tag = ''): void {
    this.history.push(this.d, tag);
    this.host.changed();
    this.renderAll();
  }

  /** Record a change made while typing: redraw the timeline but not the fields. */
  private update(tag: string): void {
    this.history.push(this.d, tag);
    this.host.changed();
    this.renderGrid();
    this.renderOutline();
  }

  private select(selection: Selection): void {
    if (selection?.kind === this.selection?.kind && selection?.id === this.selection?.id) return;
    this.selection = selection;
    this.markSelection();
    this.renderInspector();
  }

  private markSelection(): void {
    const key = this.selection ? `${this.selection.kind === 'task' ? 't' : 'g'}:${this.selection.id}` : '';
    for (const el of Array.from(this.scroller.querySelectorAll<HTMLElement>('[data-key]'))) {
      const on = el.dataset.key === key;
      el.classList.toggle('is-selected', on);
      el.setAttribute('aria-pressed', String(on));
    }
    for (const row of Array.from(this.scroller.querySelectorAll<HTMLElement>('[data-row]'))) row.classList.toggle('is-selected', row.dataset.row === key);
  }

  private focusKey(key: string): void {
    this.scroller.querySelector<HTMLElement>(`[data-key="${key}"]`)?.focus();
  }

  /** Rename a task or section right where its name is shown. */
  private startRename(kind: 'task' | 'section', id: string): void {
    const key = `${kind === 'task' ? 't' : 'g'}:${id}`;
    const cell = this.scroller.querySelector<HTMLElement>(`[data-row="${key}"] .volcanic-gantt-label`);
    const target = kind === 'task' ? this.task(id) : this.d.sections.find((g) => g.id === id);
    if (!cell || !target || cell.querySelector('input')) return;
    this.select({ kind, id });
    const input = h('input', {
      class: 'volcanic-input volcanic-gantt-rename',
      attrs: { type: 'text', autocomplete: 'off', 'aria-label': `${kind === 'task' ? 'Task' : 'Section'} name. Enter saves, Escape cancels.` },
    });
    input.value = target.name;
    let done = false;
    const finish = (save: boolean): void => {
      if (done) return;
      done = true;
      this.cancelRename = null;
      const value = input.value.trim();
      if (save && value && value !== target.name) {
        target.name = value;
        this.commit();
        this.host.announce(`Renamed to ${value}.`);
      } else this.renderGrid();
      this.focusKey(key);
    };
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('pointerdown', (event) => event.stopPropagation());
    input.addEventListener('dblclick', (event) => event.stopPropagation());
    this.cancelRename = () => finish(false);
    cell.replaceChildren(input);
    input.focus();
    input.select();
  }

  private focusInspector(): void {
    this.tabs.select('properties');
    this.inspector.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }

  private spans(): Map<string, Span> {
    return resolveSpans(this.d);
  }

  private describe(task: GanttTask, span: Span): string {
    const when = task.milestone ? `on ${formatDay(span.start)}` : `${formatDay(span.start)} to ${formatDay(span.end - 1)}, ${task.duration} ${task.duration === 1 ? 'day' : 'days'}`;
    const extras = [task.milestone ? 'milestone' : '', task.critical ? 'critical' : '', task.status === 'planned' ? '' : task.status === 'active' ? 'in progress' : 'done'].filter(Boolean);
    const after = task.start.type === 'after' ? `starts after ${this.taskName(task.start.id)}` : '';
    const who = task.assignee.trim() ? `assigned to ${task.assignee.trim()}` : '';
    const done = task.progress > 0 ? `${task.progress} percent complete` : '';
    return [`${plainLabel(task.name, 'Untitled task')}: ${when}`, ...extras, who, done, after].filter(Boolean).join('. ');
  }

  // ───────────────────────────── Actions ─────────────────────────────

  private addSection(): void {
    const id = nextId('g', this.d.sections.map((g) => g.id));
    this.d.sections.push({ id, name: `Phase ${this.d.sections.length + 1}`, tasks: [] });
    this.selection = { kind: 'section', id };
    this.commit();
    this.host.announce('Section added. Type a name.');
    this.focusInspector();
  }

  private addTask(): void {
    if (!this.d.sections.length) this.d.sections.push({ id: 'g1', name: 'Phase 1', tasks: [] });
    const sel = this.selection;
    const section =
      (sel?.kind === 'task' ? this.sectionOf(sel.id) : sel?.kind === 'section' ? this.d.sections.find((g) => g.id === sel.id) : undefined) ?? this.d.sections[this.d.sections.length - 1];
    const id = nextId('t', allTasks(this.d).map((t) => t.id));
    const after = sel?.kind === 'task' ? section.tasks.findIndex((t) => t.id === sel.id) : section.tasks.length - 1;
    const previous = section.tasks[after];
    const spans = this.spans();
    const starts = Array.from(spans.values()).map((x) => x.start);
    const task: GanttTask = {
      id,
      name: 'New task',
      status: 'planned',
      critical: false,
      milestone: false,
      start: previous ? { type: 'after', id: previous.id } : { type: 'date', day: starts.length ? Math.min(...starts) : today() },
      duration: 5,
      assignee: '',
      progress: 0,
    };
    section.tasks.splice(after + 1, 0, task);
    this.selection = { kind: 'task', id };
    this.commit();
    this.host.announce('Task added. Type a name.');
    this.focusInspector();
  }

  private deleteSelected(): void {
    const sel = this.selection;
    if (!sel) return;
    const spans = this.spans();
    // Anything that started after a removed task keeps its place on the timeline.
    const detach = (removed: Set<string>): void => {
      for (const t of allTasks(this.d)) {
        if (t.start.type === 'after' && removed.has(t.start.id) && !removed.has(t.id)) t.start = { type: 'date', day: spans.get(t.id)!.start };
      }
    };
    if (sel.kind === 'task') {
      const section = this.sectionOf(sel.id);
      if (!section) return;
      const index = section.tasks.findIndex((t) => t.id === sel.id);
      const name = this.taskName(sel.id);
      section.tasks.splice(index, 1);
      detach(new Set([sel.id]));
      const next = section.tasks[Math.min(index, section.tasks.length - 1)];
      this.selection = next ? { kind: 'task', id: next.id } : { kind: 'section', id: section.id };
      this.commit();
      this.host.announce(`${name} deleted.`);
      this.focusKey(next ? `t:${next.id}` : `g:${section.id}`);
    } else {
      const index = this.d.sections.findIndex((g) => g.id === sel.id);
      if (index < 0) return;
      const section = this.d.sections[index];
      const gone = new Set(section.tasks.map((t) => t.id));
      this.d.sections.splice(index, 1);
      detach(gone);
      const next = this.d.sections[Math.min(index, this.d.sections.length - 1)];
      this.selection = next ? { kind: 'section', id: next.id } : null;
      this.commit();
      this.host.announce(`Section ${plainLabel(section.name, 'Untitled')} deleted${gone.size ? `, with its ${gone.size} ${gone.size === 1 ? 'task' : 'tasks'}` : ''}.`);
      if (next) this.focusKey(`g:${next.id}`);
    }
  }

  private moveSelected(delta: number): void {
    const sel = this.selection;
    if (!sel) return;
    if (sel.kind === 'task') {
      const section = this.sectionOf(sel.id)!;
      const from = section.tasks.findIndex((t) => t.id === sel.id);
      const to = from + delta;
      if (to < 0 || to >= section.tasks.length) return;
      const [task] = section.tasks.splice(from, 1);
      section.tasks.splice(to, 0, task);
      this.commit();
      this.host.announce(`${this.taskName(sel.id)} moved to position ${to + 1} of ${section.tasks.length} in ${plainLabel(section.name, 'its section')}.`);
      this.focusKey(`t:${sel.id}`);
    } else {
      const from = this.d.sections.findIndex((g) => g.id === sel.id);
      const to = from + delta;
      if (to < 0 || to >= this.d.sections.length) return;
      const [section] = this.d.sections.splice(from, 1);
      this.d.sections.splice(to, 0, section);
      this.commit();
      this.host.announce(`Section moved to position ${to + 1} of ${this.d.sections.length}.`);
      this.focusKey(`g:${sel.id}`);
    }
  }

  /** Fix a task to a date, leaving any link to another task. */
  private startOn(task: GanttTask, day: number): boolean {
    const wasLinked = task.start.type === 'after';
    task.start = { type: 'date', day };
    return wasLinked;
  }

  private shiftTask(task: GanttTask, days: number, span: Span): void {
    const linked = this.startOn(task, span.start + days);
    this.commit(`shift:${task.id}`);
    this.announceTask(task, linked ? 'No longer follows another task. ' : '');
    this.focusKey(`t:${task.id}`);
  }

  private resizeTask(task: GanttTask, days: number): void {
    if (task.milestone) return;
    task.duration = Math.max(1, task.duration + days);
    this.commit(`size:${task.id}`);
    this.announceTask(task);
    this.focusKey(`t:${task.id}`);
  }

  private announceTask(task: GanttTask, prefix = ''): void {
    const span = this.spans().get(task.id);
    if (span) this.host.announce(`${prefix}${this.describe(task, span)}.`);
  }

  // ───────────────────────────── Drawing ─────────────────────────────

  private renderAll(): void {
    this.renderGrid();
    this.renderInspector();
    this.renderOutline();
  }

  private ticks(min: number, max: number): { day: number; label: string; major: boolean }[] {
    const out: { day: number; label: string; major: boolean }[] = [];
    for (let day = min; day <= max; day += 1) {
      const date = dateOf(day);
      const first = date.getUTCDate() === 1;
      if (this.px >= 24) out.push({ day, label: first ? `${month(day)} 1` : String(date.getUTCDate()), major: first });
      else if (this.px >= 10) {
        if (date.getUTCDay() === 1) out.push({ day, label: `${date.getUTCDate()} ${month(day)}`, major: first });
      } else if (first) out.push({ day, label: `${month(day)} ${String(date.getUTCFullYear()).slice(2)}`, major: true });
    }
    return out;
  }

  private renderGrid(): void {
    const active = document.activeElement;
    const focused = active?.instanceOf(HTMLElement) && this.scroller.contains(active) ? active.dataset.key : undefined;
    const keepLeft = this.scroller.scrollLeft;

    const spans = this.spans();
    const starts = Array.from(spans.values());
    const min = (starts.length ? Math.min(...starts.map((x) => x.start)) : today()) - 4;
    const max = Math.max(starts.length ? Math.max(...starts.map((x) => x.end)) : today(), min + 28) + 14;
    const x = (day: number): number => (day - min) * this.px;
    const trackW = Math.ceil(x(max));

    const inner = h('div', { class: 'volcanic-gantt-inner' });
    inner.style.width = `${LABEL_W + trackW}px`;

    // Grid lines and today marker sit behind the rows.
    const lines = h('div', { class: 'volcanic-gantt-lines', attrs: { 'aria-hidden': 'true' } });
    lines.style.left = `${LABEL_W}px`;
    lines.style.top = `${RULER_H}px`;
    // Weekends get a faint band. Day 0 (1970-01-01) was a Thursday.
    for (let day = Math.floor(min); day < max; day++) {
      const weekday = (((day + 4) % 7) + 7) % 7;
      if (weekday !== 6 && !(weekday === 0 && day === Math.floor(min))) continue;
      const band = h('div', { class: 'volcanic-gantt-weekend' });
      band.style.left = `${x(day)}px`;
      band.style.width = `${(weekday === 6 ? Math.min(2, max - day) : 1) * this.px}px`;
      lines.append(band);
    }
    const holidays = holidaysForPlaces(this.d.holidays, Math.floor(min), Math.ceil(max));
    // Several countries can share a day: the bands stack, so a day more places have off looks stronger.
    const several = this.d.holidays.filter((c) => c.country).length > 1;
    const byDay = new Map<number, typeof holidays>();
    for (const holiday of holidays) byDay.set(holiday.day, [...(byDay.get(holiday.day) ?? []), holiday]);
    const colours = placeIndexes(this.d.holidays);
    // Countries that share a day split it into side-by-side stripes, one colour each.
    for (const [day, onThatDay] of byDay) {
      const places = Array.from(new Set(onThatDay.map((holiday) => holiday.place)));
      places.forEach((place, i) => {
        const band = h('div', { class: 'volcanic-gantt-holiday' });
        band.style.left = `${x(day) + (this.px * i) / places.length}px`;
        band.style.width = `${this.px / places.length}px`;
        band.style.setProperty('--holiday', holidayColour(colours.get(place) ?? 0));
        lines.append(band);
      });
    }
    const ticks = this.ticks(min, max);
    for (const tick of ticks) {
      const line = h('div', { class: `volcanic-gantt-line${tick.major ? ' is-major' : ''}` });
      line.style.left = `${x(tick.day)}px`;
      lines.append(line);
    }
    const now = today();
    if (now >= min && now <= max) {
      const marker = h('div', { class: 'volcanic-gantt-today', attrs: { title: 'Today' } });
      marker.style.left = `${x(now) + this.px / 2}px`;
      lines.append(marker);
    }
    inner.append(lines);

    const ruler = h('div', { class: 'volcanic-gantt-row volcanic-gantt-ruler', attrs: { 'aria-hidden': 'true' } }, h('div', { class: 'volcanic-gantt-label', text: 'Task' }));
    const rulerTrack = h('div', { class: 'volcanic-gantt-track' });
    rulerTrack.style.width = `${trackW}px`;
    for (const tick of ticks) {
      const label = h('span', { class: `volcanic-gantt-tick${tick.major ? ' is-major' : ''}`, text: tick.label });
      label.style.left = `${x(tick.day) + 3}px`;
      rulerTrack.append(label);
    }
    // A small flag in the ruler for each holiday, with its name as a tooltip.
    for (const [day, onThatDay] of byDay) {
      const places = Array.from(new Set(onThatDay.map((holiday) => holiday.place)));
      places.forEach((place, i) => {
        const text = onThatDay.filter((holiday) => holiday.place === place).map((holiday) => (several ? `${holiday.name} (${holiday.place})` : holiday.name)).join('; ');
        const flag = h('span', { class: 'volcanic-gantt-holiday-flag', attrs: { title: `${formatDay(day)}: ${text}`, 'aria-hidden': 'true' } });
        flag.style.left = `${x(day) + (this.px * (i + 0.5)) / places.length - 4}px`;
        flag.style.setProperty('--holiday', holidayColour(colours.get(place) ?? 0));
        rulerTrack.append(flag);
      });
    }
    ruler.append(rulerTrack);
    inner.append(ruler);

    if (!this.d.sections.length) {
      inner.append(h('p', { class: 'volcanic-hint volcanic-gantt-empty', text: 'Add a task to begin.' }));
    }
    for (const section of this.d.sections) {
      inner.append(this.sectionRow(section, trackW));
      for (const task of section.tasks) inner.append(this.taskRow(task, spans.get(task.id)!, x, trackW));
    }

    this.scroller.replaceChildren(inner);
    this.scroller.scrollLeft = keepLeft;
    this.markSelection();
    if (focused) this.focusKey(focused);
  }

  private sectionRow(section: GanttSection, trackW: number): HTMLElement {
    const button = h('button', {
      class: 'volcanic-gantt-section-button',
      text: plainLabel(section.name, 'Untitled section'),
      attrs: { type: 'button', title: 'Double-click to rename', 'data-key': `g:${section.id}`, 'aria-pressed': 'false', 'aria-label': `Section ${plainLabel(section.name, 'Untitled')}, ${section.tasks.length} ${section.tasks.length === 1 ? 'task' : 'tasks'}` },
      on: {
        focus: () => this.select({ kind: 'section', id: section.id }),
        pointerdown: () => this.select({ kind: 'section', id: section.id }),
        dblclick: () => this.startRename('section', section.id),
        keydown: (event) => this.onKey(event, null, null, `g:${section.id}`),
      },
    });
    const track = h('div', { class: 'volcanic-gantt-track' });
    track.style.width = `${trackW}px`;
    return h('div', { class: 'volcanic-gantt-row is-section', attrs: { 'data-row': `g:${section.id}` } }, h('div', { class: 'volcanic-gantt-label' }, button), track);
  }

  private taskRow(task: GanttTask, span: Span, x: (day: number) => number, trackW: number): HTMLElement {
    const name = plainLabel(task.name, 'Untitled task');
    const width = task.milestone ? 18 : Math.max(8, task.duration * this.px);
    const handle = task.milestone ? null : h('span', { class: 'volcanic-gantt-handle', attrs: { 'aria-hidden': 'true', title: 'Drag to change the length' } });
    const bar = h(
      'div',
      {
        class: `volcanic-gantt-bar is-${task.status}${task.critical ? ' is-critical' : ''}${task.milestone ? ' is-milestone' : ''}`,
        attrs: { role: 'button', tabindex: '0', 'data-key': `t:${task.id}`, 'aria-pressed': 'false', 'aria-label': this.describe(task, span) },
        on: {
          pointerdown: (event) => this.startBarDrag(event, task, span, 'move', bar),
          focus: () => this.select({ kind: 'task', id: task.id }),
          keydown: (event) => this.onKey(event, task, span, `t:${task.id}`),
        },
      },
      handle,
    );
    if (task.progress > 0 && !task.milestone) {
      bar.classList.add('has-progress');
      bar.style.setProperty('--progress', `${task.progress}%`);
    }
    bar.style.left = `${task.milestone ? x(span.start) + this.px / 2 - 9 : x(span.start)}px`;
    bar.style.width = `${width}px`;
    handle?.addEventListener('pointerdown', (event) => this.startBarDrag(event, task, span, 'resize', bar));

    const track = h('div', { class: 'volcanic-gantt-track' }, bar);
    track.style.width = `${trackW}px`;
    const label = h('div', { class: 'volcanic-gantt-label', attrs: { 'aria-hidden': 'true', title: 'Double-click to rename' }, on: { pointerdown: () => this.select({ kind: 'task', id: task.id }), dblclick: () => this.startRename('task', task.id) } }, h('span', { text: name }));
    if (task.assignee.trim()) label.append(h('span', { class: 'volcanic-gantt-person', text: initials(task.assignee), attrs: { title: `Assigned to ${task.assignee.trim()}` } }));
    if (task.progress > 0) label.append(h('span', { class: 'volcanic-gantt-percent', text: `${task.progress}%`, attrs: { title: `${task.progress} percent complete` } }));
    const linked = task.start.type === 'after';
    if (linked) label.append(h('span', { class: 'volcanic-gantt-link', text: '↳', attrs: { title: `Starts after ${this.taskName((task.start as { id: string }).id)}` } }));
    return h('div', { class: 'volcanic-gantt-row', attrs: { 'data-row': `t:${task.id}` } }, label, track);
  }

  // ───────────────────────────── Dragging ─────────────────────────────

  private startBarDrag(event: PointerEvent, task: GanttTask, span: Span, mode: 'move' | 'resize', bar: HTMLElement): void {
    if (event.button !== 0) return;
    if (mode === 'resize') event.stopPropagation();
    this.select({ kind: 'task', id: task.id });
    const x0 = event.clientX;
    const startLeft = parseFloat(bar.style.left);
    const startWidth = parseFloat(bar.style.width);
    let delta = 0;
    let moved = false;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    // A readout that follows the bar while it is dragged (sighted users only: the result is announced on release).
    let readout: HTMLElement | null = null;
    const showReadout = (): void => {
      const start = mode === 'move' ? span.start + delta : span.start;
      const length = mode === 'resize' ? Math.max(1, task.duration + delta) : task.duration;
      const text = task.milestone
        ? `${formatDay(start)}`
        : `${formatDay(start, false)} to ${formatDay(start + length - 1)} · ${length} ${length === 1 ? 'day' : 'days'}`;
      if (!readout) {
        readout = h('div', { class: 'volcanic-gantt-readout', attrs: { 'aria-hidden': 'true' } });
        bar.parentElement?.append(readout);
      }
      readout.textContent = text;
      const left = parseFloat(bar.style.left);
      const width = parseFloat(bar.style.width);
      const trackWidth = bar.parentElement?.clientWidth ?? 0;
      // To the right of the bar, or to its left when there is no room.
      const room = trackWidth - (left + width) > readout.offsetWidth + 12;
      readout.style.left = room ? `${left + width + 8}px` : `${Math.max(0, left - readout.offsetWidth - 8)}px`;
    };
    const onMove = (move: PointerEvent): void => {
      const dx = move.clientX - x0;
      if (!moved && Math.abs(dx) < 4) return;
      if (!moved) document.body.classList.add('volcanic-is-dragging');
      moved = true;
      bar.classList.add('is-dragging');
      delta = Math.round(dx / this.px);
      if (mode === 'move') bar.style.left = `${startLeft + delta * this.px}px`;
      else {
        delta = Math.max(delta, 1 - task.duration);
        bar.style.width = `${Math.max(8, startWidth + delta * this.px)}px`;
      }
      showReadout();
    };
    const onUp = (): void => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      bar.classList.remove('is-dragging');
      document.body.classList.remove('volcanic-is-dragging');
      readout?.remove();
      if (!moved || delta === 0) {
        if (moved) this.renderGrid();
        return;
      }
      if (mode === 'move') {
        const linked = this.startOn(task, span.start + delta);
        this.commit();
        this.announceTask(task, linked ? 'No longer follows another task. ' : '');
      } else {
        task.duration = Math.max(1, task.duration + delta);
        this.commit();
        this.announceTask(task);
      }
      this.focusKey(`t:${task.id}`);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  }

  // ───────────────────────────── Keyboard ─────────────────────────────

  private onKey(event: KeyboardEvent, task: GanttTask | null, span: Span | null, key: string): void {
    const keys = Array.from(this.scroller.querySelectorAll<HTMLElement>('[data-key]')).map((el) => el.dataset.key!);
    const at = keys.indexOf(key);
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowDown': {
        event.preventDefault();
        const next = keys[at + (event.key === 'ArrowUp' ? -1 : 1)];
        if (event.altKey) this.moveSelected(event.key === 'ArrowUp' ? -1 : 1);
        else if (next) this.focusKey(next);
        break;
      }
      case 'ArrowLeft':
      case 'ArrowRight': {
        if (!task || !span) return;
        event.preventDefault();
        const sign = event.key === 'ArrowLeft' ? -1 : 1;
        const step = event.shiftKey ? 7 : 1;
        if (event.altKey) this.resizeTask(task, sign * step);
        else this.shiftTask(task, sign * step, span);
        break;
      }
      case 'Enter':
      case 'F2':
        event.preventDefault();
        this.startRename(key.startsWith('t:') ? 'task' : 'section', key.slice(2));
        break;
      case ' ':
        event.preventDefault();
        this.focusInspector();
        break;
      case 'Delete':
      case 'Backspace':
        event.preventDefault();
        this.deleteSelected();
        break;
    }
  }

  // ───────────────────────────── Properties ─────────────────────────────

  private renderInspector(): void {
    this.inspector.replaceChildren();
    const sel = this.selection;
    if (!sel || !this.exists(sel)) {
      this.inspector.append(h('div', { class: 'volcanic-intro' }, h('p', { text: 'Select a task or section to edit it. Drag a bar to change when it starts, and drag its right end to change its length.' })));
      return;
    }
    if (sel.kind === 'section') this.inspector.append(...this.sectionFields(this.d.sections.find((g) => g.id === sel.id)!));
    else this.inspector.append(...this.taskFields(this.task(sel.id)!));
  }

  private nameField(label: string, value: string, onInput: (value: string) => void, tag: string): HTMLElement {
    const input = h('input', { class: 'volcanic-input', attrs: { type: 'text', 'data-autofocus': true, autocomplete: 'off' } });
    input.value = value;
    input.addEventListener('input', () => {
      onInput(input.value);
      this.update(tag);
    });
    return field(label, input);
  }

  /** Who the task is assigned to, with the names already used in this chart offered as suggestions. */
  private assigneeField(task: GanttTask): HTMLElement {
    const listId = uniqueId('volcanic-people');
    const input = h('input', { class: 'volcanic-input', attrs: { type: 'text', autocomplete: 'off', list: listId, maxlength: '60', placeholder: 'Nobody yet' } });
    input.value = task.assignee;
    const names = Array.from(new Set(allTasks(this.d).map((t) => t.assignee).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    const list = h('datalist', { attrs: { id: listId } });
    for (const name of names) list.append(h('option', { attrs: { value: name } }));
    input.addEventListener('input', () => {
      task.assignee = input.value.replace(/\s+/g, ' ').trimStart();
      this.update(`assignee:${task.id}`);
    });
    input.addEventListener('change', () => this.host.announce(task.assignee.trim() ? `Assigned to ${task.assignee.trim()}.` : 'Unassigned.'));
    const wrap = field('Assigned to', input, 'A name or initials. Shown beside the task on the chart.');
    wrap.append(list);
    return wrap;
  }

  /** Percent complete: a number box and a slider that stay in step. */
  private progressField(task: GanttTask): HTMLElement {
    const number = h('input', { class: 'volcanic-input volcanic-progress-number', attrs: { type: 'number', min: '0', max: '100', step: '5', inputmode: 'numeric', 'aria-label': 'Percent complete' } });
    const slider = h('input', { class: 'volcanic-progress-range', attrs: { type: 'range', min: '0', max: '100', step: '5', 'aria-label': 'Percent complete slider' } });
    number.value = String(task.progress);
    slider.value = String(task.progress);
    const set = (raw: number, from: 'number' | 'slider'): void => {
      if (!Number.isFinite(raw)) return;
      task.progress = clamp(Math.round(raw), 0, 100);
      if (from === 'number') slider.value = String(task.progress);
      else number.value = String(task.progress);
      this.update(`progress:${task.id}`);
    };
    number.addEventListener('input', () => set(Number(number.value), 'number'));
    slider.addEventListener('input', () => set(Number(slider.value), 'slider'));
    const change = (): void => this.host.announce(`${task.progress} percent complete.`);
    number.addEventListener('change', change);
    slider.addEventListener('change', change);
    const wrap = h('div', { class: 'volcanic-field' }, h('label', { text: 'Percent complete', attrs: { for: (number.id = uniqueId('volcanic-progress')) } }), h('div', { class: 'volcanic-progress-row' }, slider, number, h('span', { text: '%', attrs: { 'aria-hidden': 'true' } })));
    return wrap;
  }

  private moveButtons(): HTMLElement {
    return h(
      'div',
      { class: 'volcanic-actions' },
      iconButton(this.host.setIcon, 'Move up', 'arrow-up', () => this.moveSelected(-1)),
      iconButton(this.host.setIcon, 'Move down', 'arrow-down', () => this.moveSelected(1)),
      iconButton(this.host.setIcon, 'Delete', 'trash-2', () => this.deleteSelected(), 'mod-warning'),
    );
  }

  private sectionFields(section: GanttSection): HTMLElement[] {
    return [h('h3', { class: 'volcanic-panel-title', text: 'Section' }), this.nameField('Name', section.name, (v) => (section.name = v), `name:${section.id}`), this.moveButtons()];
  }

  private taskFields(task: GanttTask): HTMLElement[] {
    const span = this.spans().get(task.id)!;
    const section = this.sectionOf(task.id)!;
    const sections = this.d.sections.map((g) => ({ id: g.id, name: plainLabel(g.name, 'Untitled section') }));
    const eligible = allTasks(this.d).filter((t) => t.id !== task.id && !dependsOn(this.d, t, task.id));

    const startMode = selectControl<'date' | 'after'>(
      [{ id: 'date', name: 'On a date' }, ...(eligible.length ? [{ id: 'after' as const, name: 'After another task finishes' }] : [])],
      task.start.type,
      (mode) => {
        if (mode === 'date') this.startOn(task, span.start);
        else task.start = { type: 'after', id: eligible[Math.max(0, eligible.findIndex((t) => t.id === section.tasks[section.tasks.indexOf(task) - 1]?.id))].id };
        this.commit();
      },
    );

    let startControl: HTMLElement;
    if (task.start.type === 'date') {
      const date = h('input', { class: 'volcanic-input', attrs: { type: 'date', 'data-start': true } });
      date.value = toIso(task.start.day);
      date.addEventListener('change', () => {
        const day = toDay(date.value);
        if (day === null) return;
        task.start = { type: 'date', day };
        this.commit();
        this.announceTask(task);
      });
      startControl = field('Start date', date);
    } else {
      startControl = field(
        'Starts after',
        selectControl(
          eligible.map((t) => ({ id: t.id, name: plainLabel(t.name, 'Untitled task') })),
          task.start.id,
          (id) => {
            task.start = { type: 'after', id };
            this.commit();
            this.announceTask(task);
          },
        ),
      );
    }

    const duration = h('input', { class: 'volcanic-input', attrs: { type: 'number', min: '1', step: '1', inputmode: 'numeric' } });
    duration.value = String(task.milestone ? 0 : task.duration);
    duration.disabled = task.milestone;
    duration.addEventListener('input', () => {
      const value = Math.round(Number(duration.value));
      if (!Number.isFinite(value) || value < 1) return;
      task.duration = value;
      this.update(`duration:${task.id}`);
    });

    return [
      h('h3', { class: 'volcanic-panel-title', text: 'Task' }),
      this.nameField('Name', task.name, (v) => (task.name = v), `name:${task.id}`),
      field(
        'Section',
        selectControl(sections, section.id, (id) => {
          const target = this.d.sections.find((g) => g.id === id);
          if (!target || target === section) return;
          section.tasks.splice(section.tasks.indexOf(task), 1);
          target.tasks.push(task);
          this.commit();
          this.host.announce(`Moved to ${plainLabel(target.name, 'the section')}.`);
        }),
      ),
      field('Status', selectControl<TaskStatus>(TASK_STATUSES, task.status, (v) => ((task.status = v), this.commit()))),
      this.assigneeField(task),
      this.progressField(task),
      h(
        'div',
        { class: 'volcanic-checks' },
        checkbox('Critical', task.critical, (v) => ((task.critical = v), this.commit())),
        checkbox('Milestone (a single day)', task.milestone, (v) => {
          task.milestone = v;
          if (!v && task.duration < 1) task.duration = 1;
          this.commit();
        }),
      ),
      field('Starts', startMode),
      startControl,
      field('Length in days', duration),
      h('p', { class: 'volcanic-hint', text: task.milestone ? `On ${formatDay(span.start)}.` : `${formatDay(span.start)} to ${formatDay(span.end - 1)}.` }),
      this.moveButtons(),
    ];
  }

  private renderOutline(): void {
    this.outline.replaceChildren();
    if (!this.d.sections.length) {
      this.outline.append(h('p', { class: 'volcanic-hint', text: 'Nothing here yet. Add a task to begin.' }));
      return;
    }
    const spans = this.spans();
    const pick = (selection: NonNullable<Selection>): void => {
      this.select(selection);
      this.focusInspector();
    };
    for (const section of this.d.sections) {
      this.outline.append(
        h('h3', { class: 'volcanic-panel-title' }, h('button', { class: 'volcanic-list-item', text: `${plainLabel(section.name, 'Untitled section')} (${section.tasks.length})`, attrs: { type: 'button' }, on: { click: () => pick({ kind: 'section', id: section.id }) } })),
      );
      const list = h('ul', { class: 'volcanic-list' });
      for (const task of section.tasks) {
        const text = this.describe(task, spans.get(task.id)!);
        list.append(h('li', {}, h('button', { class: 'volcanic-list-item', text, attrs: { type: 'button', 'aria-label': `${text}. Edit.` }, on: { click: () => pick({ kind: 'task', id: task.id }) } })));
      }
      this.outline.append(list);
    }
    this.outline.append(...this.holidayOutline(spans));
  }

  /** The holidays that fall during the project, as text (the bands on the timeline are only visual). */
  private holidayOutline(spans: Map<string, Span>): HTMLElement[] {
    const title = h('h3', { class: 'volcanic-panel-title', text: 'Holidays during this project' });
    const places = this.d.holidays.filter((c) => c.country);
    if (!places.length) return [title, h('p', { class: 'volcanic-hint', text: 'Use the Holidays button above the timeline to mark the public holidays of one or more countries.' })];
    const all = Array.from(spans.values());
    if (!all.length) return [];
    const found = holidaysForPlaces(places, Math.min(...all.map((x) => x.start)), Math.max(...all.map((x) => x.end - 1)));
    if (!found.length) return [title, h('p', { class: 'volcanic-hint', text: 'No holidays fall during this project.' })];
    const several = places.length > 1;
    const list = h('ul', { class: 'volcanic-list' });
    const colours = placeIndexes(places);
    for (const holiday of found) {
      const item = h('li', { class: 'volcanic-holiday-item', text: `${formatDay(holiday.day)}: ${holiday.name}${several ? ` (${holiday.place})` : ''}` });
      item.style.setProperty('--holiday', holidayColour(colours.get(holiday.place) ?? 0));
      list.append(item);
    }
    return [title, list];
  }
}

/** "Martin Tamer" becomes "MT"; a single word gives its first two letters. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2);
  return letters.toUpperCase();
}
