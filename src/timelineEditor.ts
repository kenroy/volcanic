import { h, uniqueId } from './dom';
import { History, type KindEditor, type KindHost, type KindMeta } from './kinds';
import { allPeriods, findPeriod, nextTimelineId, shiftPeriod, starterTimeline, timelineToMermaid, type Timeline, type TimelinePeriod, type TimelineSection } from './timeline';
import { iconButton } from './ui';

/**
 * A timeline as an outline: optional sections, each holding periods (a year, an age, a quarter), each holding the
 * events that happened in it. Arrows move things; Alt with the up and down arrow keys does the same from a field.
 */
export class TimelineEditor implements KindEditor {
  readonly el: HTMLElement;
  private t: Timeline;
  private readonly history: History<Timeline>;
  private readonly initial: string;
  private readonly uid = uniqueId('volcanic-tl');

  private list!: HTMLElement;
  private summary!: HTMLElement;
  /** The section new periods go into: the one last worked in. */
  private current = '';

  constructor(private readonly host: KindHost, timeline: Timeline, pristine = false) {
    this.t = JSON.parse(JSON.stringify(timeline)) as Timeline;
    this.history = new History(this.t);
    this.initial = pristine ? JSON.stringify(this.t) : '';
    this.current = this.t.sections[this.t.sections.length - 1]?.id ?? '';
    this.el = this.build();
    this.renderAll();
  }

  // ───────────────────────────── KindEditor ─────────────────────────────

  source(meta: KindMeta): string {
    return timelineToMermaid(this.t, meta);
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

  private apply(value: Timeline | null, message: string): void {
    if (!value) return;
    this.t = value;
    if (!this.t.sections.some((s) => s.id === this.current)) this.current = this.t.sections[this.t.sections.length - 1]?.id ?? '';
    this.renderAll();
    this.host.changed();
    this.host.announce(message);
  }

  // ───────────────────────────── Build ─────────────────────────────

  private build(): HTMLElement {
    const helpId = `${this.uid}-help`;
    const toolbar = h(
      'div',
      { class: 'volcanic-kind-toolbar', attrs: { role: 'toolbar', 'aria-label': 'Timeline tools' } },
      iconButton(this.host.setIcon, 'Add period', 'plus', () => this.addPeriod()),
      iconButton(this.host.setIcon, 'Add section', 'plus', () => this.addSection()),
    );
    this.list = h('div', { class: 'volcanic-tl-list', attrs: { 'aria-describedby': helpId } });
    const help = h('p', {
      class: 'volcanic-sr-only',
      attrs: { id: helpId },
      text: 'Sections group periods, and each period lists its events. Use the Move buttons, or hold Alt with the up and down arrow keys in a field, to reorder. A period can move into the next section.',
    });
    const canvas = h('div', { class: 'volcanic-kind-canvas' }, h('div', { class: 'volcanic-tl-scroll' }, this.list, help));
    this.summary = h('p', { class: 'volcanic-hint' });
    const side = h(
      'section',
      { class: 'volcanic-card volcanic-kind-side', attrs: { 'aria-label': 'About this timeline' } },
      h(
        'div',
        { class: 'volcanic-panel' },
        h('h3', { class: 'volcanic-panel-title', text: 'Timeline' }),
        this.summary,
        h('p', { class: 'volcanic-hint', text: 'Sections are optional. When there are some, each one gets its own colour in the finished chart.' }),
      ),
    );
    return h('div', { class: 'volcanic-kind volcanic-tl' }, toolbar, h('div', { class: 'volcanic-kind-main' }, canvas, side));
  }

  // ───────────────────────────── Changing the timeline ─────────────────────────────

  private commit(tag = ''): void {
    this.history.push(this.t, tag);
    this.host.changed();
    this.renderAll();
  }

  /** Typing: record it and refresh the preview, but leave the rows alone. */
  private update(tag: string): void {
    this.history.push(this.t, tag);
    this.host.changed();
    this.renderNotes();
  }

  private periodName(p: TimelinePeriod): string {
    return p.label.replace(/\s+/g, ' ').trim() || 'Untitled period';
  }

  private sectionName(s: TimelineSection): string {
    return s.name.replace(/\s+/g, ' ').trim() || 'Untitled section';
  }

  private focusKey(key: string, select = false): boolean {
    const el = this.list.querySelector<HTMLInputElement>(`[data-key="${key}"]`);
    if (!el) return false;
    el.focus();
    if (select) el.select();
    return true;
  }

  private addSection(): void {
    const section: TimelineSection = { id: nextTimelineId(this.t, 's'), name: 'New section', periods: [] };
    this.t.sections.push(section);
    this.current = section.id;
    this.commit();
    this.host.announce('Section added. Type its name, then add periods to it.');
    this.focusKey(`sec:${section.id}`, true);
  }

  private addPeriod(): void {
    let section = this.t.sections.find((s) => s.id === this.current) ?? this.t.sections[this.t.sections.length - 1];
    if (!section) {
      section = { id: nextTimelineId(this.t, 's'), name: '', periods: [] };
      this.t.sections.push(section);
    }
    const period: TimelinePeriod = { id: nextTimelineId(this.t, 'p'), label: 'New period', events: [] };
    section.periods.push(period);
    this.commit();
    this.host.announce('Period added. Type its name, then add events.');
    this.focusKey(`per:${period.id}`, true);
  }

  private addEvent(periodId: string): void {
    const found = findPeriod(this.t, periodId);
    if (!found) return;
    const event = { id: nextTimelineId(this.t, 'e'), text: 'New event' };
    found.period.events.push(event);
    this.commit();
    this.host.announce('Event added. Type what happened.');
    this.focusKey(`ev:${event.id}`, true);
  }

  private removePeriod(id: string): void {
    const found = findPeriod(this.t, id);
    if (!found) return;
    found.section.periods.splice(found.index, 1);
    this.commit();
    this.host.announce(`${this.periodName(found.period)} removed.`);
    const near = allPeriods(this.t)[0] ? (found.section.periods[Math.min(found.index, found.section.periods.length - 1)] ?? allPeriods(this.t)[0].period) : null;
    if (!near || !this.focusKey(`per:${near.id}`)) this.focusKey(`sec:${found.section.id}`);
  }

  private removeEvent(periodId: string, eventId: string): void {
    const found = findPeriod(this.t, periodId);
    if (!found) return;
    const at = found.period.events.findIndex((e) => e.id === eventId);
    if (at < 0) return;
    found.period.events.splice(at, 1);
    this.commit();
    this.host.announce('Event removed.');
    const near = found.period.events[Math.min(at, found.period.events.length - 1)];
    if (!near || !this.focusKey(`ev:${near.id}`)) this.focusKey(`per:${periodId}`);
  }

  private removeSection(id: string): void {
    const at = this.t.sections.findIndex((s) => s.id === id);
    if (at < 0) return;
    const [gone] = this.t.sections.splice(at, 1);
    this.commit();
    const lost = gone.periods.length;
    this.host.announce(`${this.sectionName(gone)} removed${lost ? ` with its ${lost} ${lost === 1 ? 'period' : 'periods'}. Undo brings it back` : ''}.`);
    const near = this.t.sections[Math.min(at, this.t.sections.length - 1)];
    if (!near || !this.focusKey(`sec:${near.id}`)) this.el.querySelector<HTMLElement>('button')?.focus();
  }

  private movePeriod(id: string, by: -1 | 1, key: string): void {
    const found = findPeriod(this.t, id);
    if (!found) return;
    if (!shiftPeriod(this.t, id, by)) return void this.host.announce(by < 0 ? 'Already the first period.' : 'Already the last period.');
    this.commit();
    const now = findPeriod(this.t, id)!;
    this.host.announce(`${this.periodName(found.period)} moved to position ${allPeriods(this.t).findIndex((x) => x.period.id === id) + 1} of ${allPeriods(this.t).length}${now.section !== found.section ? `, in ${this.sectionName(now.section)}` : ''}.`);
    this.focusKey(key);
  }

  private moveSection(id: string, by: -1 | 1, key: string): void {
    const from = this.t.sections.findIndex((s) => s.id === id);
    const to = from + by;
    if (from < 0) return;
    if (to < 0 || to >= this.t.sections.length) return void this.host.announce(by < 0 ? 'Already the first section.' : 'Already the last section.');
    const [section] = this.t.sections.splice(from, 1);
    this.t.sections.splice(to, 0, section);
    this.commit();
    this.host.announce(`${this.sectionName(section)} moved to position ${to + 1} of ${this.t.sections.length}.`);
    this.focusKey(key);
  }

  private moveEvent(periodId: string, eventId: string, by: -1 | 1, key: string): void {
    const found = findPeriod(this.t, periodId);
    if (!found) return;
    const events = found.period.events;
    const from = events.findIndex((e) => e.id === eventId);
    const to = from + by;
    if (from < 0) return;
    if (to < 0 || to >= events.length) return void this.host.announce(by < 0 ? 'Already the first event.' : 'Already the last event.');
    const [event] = events.splice(from, 1);
    events.splice(to, 0, event);
    this.commit();
    this.host.announce(`Event moved to position ${to + 1} of ${events.length}.`);
    this.focusKey(key);
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
    const button = iconButton(this.host.setIcon, label, icon, onClick, 'volcanic-tl-small');
    button.setAttribute('aria-label', label);
    button.title = label;
    button.dataset.act = act;
    if (disabled) button.setAttribute('aria-disabled', 'true');
    return button;
  }

  private input(value: string, key: string, label: string, onInput: (value: string) => void, extra = ''): HTMLInputElement {
    const input = h('input', { class: `volcanic-input ${extra}`.trim(), attrs: { type: 'text', autocomplete: 'off', 'aria-label': label, 'data-key': key } });
    input.value = value;
    input.addEventListener('input', () => {
      onInput(input.value);
      this.update(key);
    });
    input.addEventListener('focus', () => {
      const section = this.t.sections.find((s) => s.id === key.slice(4) || s.periods.some((p) => p.id === key.slice(4) || p.events.some((e) => e.id === key.slice(3))));
      if (section) this.current = section.id;
    });
    return input;
  }

  /** Alt with the up and down arrows moves whatever the field belongs to. */
  private altArrows(el: HTMLElement, move: (by: -1 | 1) => void): void {
    el.addEventListener('keydown', (event) => {
      if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
      event.preventDefault();
      move(event.key === 'ArrowUp' ? -1 : 1);
    });
  }

  private renderList(): void {
    const sections = this.t.sections;
    const order = allPeriods(this.t);
    const blocks = sections.map((section, si) => {
      const secKey = `sec:${section.id}`;
      const name = this.input(section.name, secKey, `Name of section ${si + 1}${si === 0 ? ' (optional)' : ''}`, (v) => (section.name = v), 'volcanic-tl-section-name');
      name.placeholder = si === 0 ? 'Section name (optional)' : 'Section name';
      this.altArrows(name, (by) => this.moveSection(section.id, by, secKey));
      const head = h(
        'div',
        { class: 'volcanic-tl-section-head' },
        name,
        this.small(`Move ${this.sectionName(section)} up`, 'arrow-up', `sec-up:${section.id}`, () => this.moveSection(section.id, -1, secKey), si === 0),
        this.small(`Move ${this.sectionName(section)} down`, 'arrow-down', `sec-down:${section.id}`, () => this.moveSection(section.id, 1, secKey), si === sections.length - 1),
        this.small(`Remove ${this.sectionName(section)} and its periods`, 'x', `sec-rm:${section.id}`, () => this.removeSection(section.id)),
      );

      const periods = section.periods.map((period) => {
        const perKey = `per:${period.id}`;
        const position = order.findIndex((x) => x.period.id === period.id);
        const label = this.input(period.label, perKey, `Name of period ${position + 1}`, (v) => (period.label = v), 'volcanic-tl-period-name');
        this.altArrows(label, (by) => this.movePeriod(period.id, by, perKey));
        const events = period.events.map((event, ei) => {
          const evKey = `ev:${event.id}`;
          const text = this.input(event.text, evKey, `Event ${ei + 1} of ${this.periodName(period)}`, (v) => (event.text = v));
          this.altArrows(text, (by) => this.moveEvent(period.id, event.id, by, evKey));
          return h(
            'li',
            { class: 'volcanic-tl-event' },
            text,
            this.small(`Move event ${ei + 1} of ${this.periodName(period)} up`, 'arrow-up', `ev-up:${event.id}`, () => this.moveEvent(period.id, event.id, -1, evKey), ei === 0),
            this.small(`Move event ${ei + 1} of ${this.periodName(period)} down`, 'arrow-down', `ev-down:${event.id}`, () => this.moveEvent(period.id, event.id, 1, evKey), ei === period.events.length - 1),
            this.small(`Remove event ${ei + 1} of ${this.periodName(period)}`, 'x', `ev-rm:${event.id}`, () => this.removeEvent(period.id, event.id)),
          );
        });
        return h(
          'li',
          { class: 'volcanic-tl-period' },
          h(
            'div',
            { class: 'volcanic-tl-period-head' },
            label,
            this.small(`Move ${this.periodName(period)} earlier`, 'arrow-up', `per-up:${period.id}`, () => this.movePeriod(period.id, -1, perKey), position === 0),
            this.small(`Move ${this.periodName(period)} later`, 'arrow-down', `per-down:${period.id}`, () => this.movePeriod(period.id, 1, perKey), position === order.length - 1),
            this.small(`Remove ${this.periodName(period)} and its events`, 'x', `per-rm:${period.id}`, () => this.removePeriod(period.id)),
          ),
          h('ul', { class: 'volcanic-tl-events', attrs: { 'aria-label': `Events in ${this.periodName(period)}` } }, ...events),
          iconButton(this.host.setIcon, 'Add event', 'plus', () => this.addEvent(period.id), 'volcanic-tl-add'),
        );
      });
      const empty = section.periods.length ? [] : [h('p', { class: 'volcanic-hint', text: 'No periods in this section yet.' })];
      return h('section', { class: 'volcanic-tl-section', attrs: { 'aria-label': `Section ${si + 1}: ${this.sectionName(section)}` } }, head, h('ul', { class: 'volcanic-tl-periods' }, ...periods), ...empty);
    });
    this.list.replaceChildren(...blocks);
    if (!blocks.length) this.list.append(h('p', { class: 'volcanic-hint', text: 'Nothing here yet. Add a period with the Add period button.' }));
  }

  private renderNotes(): void {
    const periods = allPeriods(this.t).length;
    const events = this.t.sections.reduce((n, s) => n + s.periods.reduce((m, p) => m + p.events.length, 0), 0);
    this.summary.textContent = `${periods} ${periods === 1 ? 'period' : 'periods'}, ${events} ${events === 1 ? 'event' : 'events'}.${periods ? '' : ' Add a period to see the timeline.'}`;
  }
}

export { starterTimeline };
