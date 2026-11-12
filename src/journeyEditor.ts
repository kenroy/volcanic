import { createTabs, h, uniqueId, type Tabs } from './dom';
import {
  SCORES,
  actorsOf,
  allSteps,
  findStep,
  journeyToMermaid,
  moveStep,
  nextJourneyId,
  scoreName,
  type Journey,
  type JourneySection,
  type JourneyStep,
} from './journey';
import { History, type KindEditor, type KindHost, type KindMeta } from './kinds';
import { checkbox, field, iconButton, selectControl } from './ui';

/** Where things sit on the canvas, in pixels. */
const AXIS_W = 74;
const HEADER_H = 36;
const PLOT_TOP = HEADER_H + 22;
const ROW_H = 62;
const COL_W = 156;
const CARD_W = 136;
const CARD_H = 46;
const SECTION_GAP = 18;
const PAD = 16;
const DRAG_START = 6;

type Selection = { kind: 'step' | 'section'; id: string } | null;

const colourOf = (index: number): string => `var(--volcanic-branch-${(index % 8) + 1})`;

/**
 * A user journey drawn the way it reads: steps left to right, grouped in sections, each one as high as the
 * score for how the person felt. Drag a step up or down to change its score and sideways to move it.
 */
export class JourneyEditor implements KindEditor {
  readonly el: HTMLElement;
  private j: Journey;
  private readonly history: History<Journey>;
  private readonly initial: string;
  private selection: Selection;
  private readonly uid = uniqueId('volcanic-journey');

  private scroller!: HTMLElement;
  private inner!: HTMLElement;
  private svg!: SVGSVGElement;
  private marker!: HTMLElement;
  private rowGlow!: HTMLElement;
  private inspector!: HTMLElement;
  private outline!: HTMLElement;
  private tabs!: Tabs;
  private cancelRename: (() => void) | null = null;
  private cancelDrag: (() => void) | null = null;
  private readonly stepEls = new Map<string, HTMLElement>();
  private readonly sectionEls = new Map<string, HTMLElement>();
  /** Where each step sits (its centre), and where each section's columns start and end, from the last drawing. */
  private centres = new Map<string, number>();
  private ranges: { sectionIndex: number; left: number; right: number; empty: boolean }[] = [];

  constructor(private readonly host: KindHost, journey: Journey, pristine = false) {
    this.j = JSON.parse(JSON.stringify(journey)) as Journey;
    this.history = new History(this.j);
    this.initial = pristine ? JSON.stringify(this.j) : '';
    const first = allSteps(this.j)[0];
    this.selection = first ? { kind: 'step', id: first.step.id } : this.j.sections[0] ? { kind: 'section', id: this.j.sections[0].id } : null;
    this.el = this.build();
    this.renderAll();
  }

  // ───────────────────────────── KindEditor ─────────────────────────────

  source(meta: KindMeta): string {
    return journeyToMermaid(this.j, meta);
  }

  isPristine(): boolean {
    return this.initial !== '' && JSON.stringify(this.j) === this.initial;
  }

  focus(): void {
    this.focusSelection();
  }

  cancelTransient(): boolean {
    if (this.cancelRename) {
      this.cancelRename();
      return true;
    }
    if (this.cancelDrag) {
      this.cancelDrag();
      return true;
    }
    return false;
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

  private apply(value: Journey | null, message: string): void {
    if (!value) return;
    this.j = value;
    if (this.selection && !this.exists(this.selection)) this.selection = null;
    this.renderAll();
    this.host.changed();
    this.host.announce(message);
  }

  private exists(sel: NonNullable<Selection>): boolean {
    return sel.kind === 'step' ? !!findStep(this.j, sel.id) : this.j.sections.some((s) => s.id === sel.id);
  }

  // ───────────────────────────── Build ─────────────────────────────

  private build(): HTMLElement {
    const { setIcon } = this.host;
    const helpId = `${this.uid}-help`;
    const toolbar = h(
      'div',
      { class: 'volcanic-kind-toolbar', attrs: { role: 'toolbar', 'aria-label': 'User journey tools' } },
      iconButton(setIcon, 'Add step', 'plus', () => this.addStep()),
      iconButton(setIcon, 'Add section', 'rows-3', () => this.addSection()),
    );
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'volcanic-journey-line');
    this.svg.setAttribute('aria-hidden', 'true');
    this.marker = h('div', { class: 'volcanic-journey-marker', attrs: { 'aria-hidden': 'true', hidden: true } });
    this.rowGlow = h('div', { class: 'volcanic-journey-glow', attrs: { 'aria-hidden': 'true', hidden: true } });
    this.inner = h('div', { class: 'volcanic-journey-inner', attrs: { role: 'group', 'aria-label': 'User journey', 'aria-describedby': helpId } });
    this.inner.append(this.rowGlow, this.svg, this.marker);
    this.scroller = h('div', { class: 'volcanic-journey-scroll' }, this.inner);
    const help = h('p', {
      class: 'volcanic-sr-only',
      attrs: { id: helpId },
      text: 'Left and right arrows move between steps. Up and down arrows raise or lower the score for how the person felt, from 1 to 5. Hold Alt with left and right to move a step earlier or later, including into another section. Enter adds a step after this one and F2 renames it. Delete removes it. You can also drag a step up or down to change its score and sideways to move it. Everything is also available in the Properties and Outline panels.',
    });
    this.inspector = h('div', { class: 'volcanic-panel volcanic-inspector' });
    this.outline = h('div', { class: 'volcanic-panel volcanic-outline' });
    this.tabs = createTabs('Details', [
      { id: 'properties', name: 'Properties', panel: this.inspector },
      { id: 'outline', name: 'Outline', panel: this.outline },
    ]);
    const side = h('section', { class: 'volcanic-card volcanic-kind-side', attrs: { 'aria-label': 'Details' } }, this.tabs.list, this.inspector, this.outline);
    const main = h('div', { class: 'volcanic-kind-main' }, h('div', { class: 'volcanic-kind-canvas' }, this.scroller, help), side);
    return h('div', { class: 'volcanic-kind volcanic-journey' }, toolbar, main);
  }

  // ───────────────────────────── Changing the journey ─────────────────────────────

  private commit(tag = ''): void {
    this.history.push(this.j, tag);
    this.host.changed();
    this.renderAll();
  }

  /** Record a change made while typing: redraw the canvas but not the fields. */
  private update(tag: string): void {
    this.history.push(this.j, tag);
    this.host.changed();
    this.renderCanvas();
    this.renderOutline();
  }

  private select(selection: Selection, focus = false): void {
    const same = selection?.kind === this.selection?.kind && selection?.id === this.selection?.id;
    this.selection = selection;
    this.markSelection();
    if (!same) this.renderInspector();
    if (focus) this.focusSelection();
  }

  private focusSelection(): void {
    window.setTimeout(() => {
      const el = this.selection?.kind === 'step' ? this.stepEls.get(this.selection.id) : this.selection ? this.sectionEls.get(this.selection.id) : null;
      (el ?? this.inner.querySelector<HTMLElement>('[data-key]'))?.focus();
    }, 0);
  }

  private label(step: JourneyStep): string {
    return oneLine(step.text) || 'Untitled step';
  }

  private describe(step: JourneyStep): string {
    return `${this.label(step)}: ${scoreName(step.score).toLowerCase()}, ${step.score} of 5, ${step.actors.length ? step.actors.join(', ') : 'nobody named'}`;
  }

  private addStep(): void {
    const sel = this.selection;
    const found = sel?.kind === 'step' ? findStep(this.j, sel.id) : null;
    let section: JourneySection | undefined = found?.section ?? (sel?.kind === 'section' ? this.j.sections.find((s) => s.id === sel.id) : undefined);
    if (!section) section = this.j.sections[this.j.sections.length - 1];
    if (!section) {
      section = { id: nextJourneyId(this.j, 'j'), name: '', steps: [] };
      this.j.sections.push(section);
    }
    const before = found ? found.step : section.steps[section.steps.length - 1];
    const step: JourneyStep = { id: nextJourneyId(this.j, 's'), text: 'New step', score: before?.score ?? 3, actors: before ? [...before.actors] : [] };
    section.steps.splice(found ? found.index + 1 : section.steps.length, 0, step);
    this.selection = { kind: 'step', id: step.id };
    this.commit();
    this.host.announce('Step added. Type its name.');
    this.startRename({ kind: 'step', id: step.id });
  }

  private addSection(): void {
    const section: JourneySection = { id: nextJourneyId(this.j, 'j'), name: `Section ${this.j.sections.length + 1}`, steps: [] };
    this.j.sections.push(section);
    this.selection = { kind: 'section', id: section.id };
    this.commit();
    this.host.announce('Section added. Type its name.');
    this.startRename({ kind: 'section', id: section.id });
  }

  private deleteSelected(): void {
    const sel = this.selection;
    if (!sel) return;
    if (sel.kind === 'step') {
      const found = findStep(this.j, sel.id);
      if (!found) return;
      found.section.steps.splice(found.index, 1);
      const rest = allSteps(this.j);
      const near = rest[Math.min(rest.findIndex((x) => x.section === found.section && x.index >= found.index), rest.length - 1)] ?? rest[rest.length - 1];
      this.selection = near ? { kind: 'step', id: near.step.id } : { kind: 'section', id: found.section.id };
      this.commit();
      this.host.announce(`${this.label(found.step)} deleted.`);
    } else {
      const at = this.j.sections.findIndex((s) => s.id === sel.id);
      if (at < 0) return;
      const [gone] = this.j.sections.splice(at, 1);
      const left = this.j.sections[Math.min(at, this.j.sections.length - 1)];
      this.selection = left ? { kind: 'section', id: left.id } : null;
      this.commit();
      this.host.announce(`Section ${oneLine(gone.name) || 'Untitled'} deleted${gone.steps.length ? `, with its ${gone.steps.length} ${gone.steps.length === 1 ? 'step' : 'steps'}` : ''}.`);
    }
    this.focusSelection();
  }

  private setScore(step: JourneyStep, score: number): void {
    const next = Math.min(5, Math.max(1, Math.round(score)));
    if (next === step.score) return;
    step.score = next;
    this.history.push(this.j, `score:${step.id}`);
    this.host.changed();
    this.renderCanvas();
    this.renderInspector();
    this.renderOutline();
    this.host.announce(`${this.label(step)}: ${scoreName(next).toLowerCase()}, ${next} of 5.`);
  }

  /** Move a step one place earlier or later in the whole journey, crossing into the next section when it reaches an edge. */
  private shift(id: string, delta: -1 | 1): void {
    const found = findStep(this.j, id);
    if (!found) return;
    const { sectionIndex, index, section } = found;
    let targetSection = sectionIndex;
    let at = index + delta;
    if (at < 0) {
      if (sectionIndex === 0) return this.host.announce('Already the first step.');
      targetSection = sectionIndex - 1;
      at = this.j.sections[targetSection].steps.length;
    } else if (at >= section.steps.length) {
      if (sectionIndex >= this.j.sections.length - 1) return this.host.announce('Already the last step.');
      targetSection = sectionIndex + 1;
      at = 0;
    }
    // moveStep counts places before the step is lifted out of its own list.
    moveStep(this.j, id, targetSection, targetSection === sectionIndex ? (delta > 0 ? at + 1 : at) : at);
    this.commit();
    const now = findStep(this.j, id)!;
    this.host.announce(`${this.label(now.step)} moved to position ${allSteps(this.j).findIndex((x) => x.step.id === id) + 1} of ${allSteps(this.j).length}${now.section !== section ? `, in ${oneLine(now.section.name) || 'the next section'}` : ''}.`);
    this.focusSelection();
  }

  private shiftSection(id: string, delta: -1 | 1): void {
    const at = this.j.sections.findIndex((s) => s.id === id);
    const to = at + delta;
    if (at < 0 || to < 0 || to >= this.j.sections.length) return;
    const [section] = this.j.sections.splice(at, 1);
    this.j.sections.splice(to, 0, section);
    this.commit();
    this.host.announce(`Section moved to position ${to + 1} of ${this.j.sections.length}.`);
    this.focusSelection();
  }

  // ───────────────────────────── Renaming ─────────────────────────────

  private startRename(sel: NonNullable<Selection>): void {
    const el = sel.kind === 'step' ? this.stepEls.get(sel.id) : this.sectionEls.get(sel.id);
    const target = sel.kind === 'step' ? findStep(this.j, sel.id)?.step : this.j.sections.find((s) => s.id === sel.id);
    if (!el || !target || el.querySelector('input')) return;
    this.select(sel);
    const current = sel.kind === 'step' ? (target as JourneyStep).text : (target as JourneySection).name;
    const input = h('input', {
      class: 'volcanic-input volcanic-journey-rename',
      attrs: { type: 'text', autocomplete: 'off', 'aria-label': `${sel.kind === 'step' ? 'Step' : 'Section'} name. Enter saves, Escape cancels.` },
    });
    input.value = current;
    let done = false;
    const finish = (save: boolean): void => {
      if (done) return;
      done = true;
      this.cancelRename = null;
      const value = input.value.trim();
      if (save && value && value !== current) {
        if (sel.kind === 'step') (target as JourneyStep).text = value;
        else (target as JourneySection).name = value;
        this.commit();
        this.host.announce(`Renamed to ${value}.`);
      } else this.renderCanvas();
      this.focusSelection();
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
    for (const type of ['pointerdown', 'dblclick', 'click']) input.addEventListener(type, (event) => event.stopPropagation());
    this.cancelRename = () => finish(false);
    el.replaceChildren(input);
    input.focus();
    input.select();
  }

  // ───────────────────────────── Drawing ─────────────────────────────

  private renderAll(): void {
    this.renderCanvas();
    this.renderInspector();
    this.renderOutline();
  }

  private yOf(score: number): number {
    return PLOT_TOP + (5 - score) * ROW_H + ROW_H / 2;
  }

  private renderCanvas(): void {
    const active = document.activeElement;
    const hadFocus = active instanceof HTMLElement && this.inner.contains(active);
    for (const el of [...this.stepEls.values(), ...this.sectionEls.values()]) el.remove();
    this.stepEls.clear();
    this.sectionEls.clear();
    this.inner.querySelectorAll('.volcanic-journey-grid, .volcanic-journey-axis').forEach((el) => el.remove());

    const people = actorsOf(this.j);
    const steps = allSteps(this.j);
    this.centres = new Map();
    this.ranges = [];

    // Score rows: a faint band and a label on the left, which stays in view as the journey scrolls.
    const axis = h('div', { class: 'volcanic-journey-axis', attrs: { 'aria-hidden': 'true' } });
    axis.style.height = `${PLOT_TOP + 5 * ROW_H}px`;
    SCORES.forEach(({ score, name }) => {
      const label = h('div', { class: 'volcanic-journey-axis-label' }, h('strong', { text: String(score) }), h('span', { text: name }));
      label.style.top = `${this.yOf(score) - 16}px`;
      axis.append(label);
      const band = h('div', { class: 'volcanic-journey-grid', attrs: { 'aria-hidden': 'true' } });
      band.style.top = `${PLOT_TOP + (5 - score) * ROW_H}px`;
      band.style.height = `${ROW_H}px`;
      this.inner.append(band);
    });
    this.inner.append(axis);

    let x = AXIS_W + PAD;
    let globalIndex = 0;
    this.j.sections.forEach((section, sectionIndex) => {
      const left = x;
      const columns = Math.max(1, section.steps.length);
      const right = left + columns * COL_W - (COL_W - CARD_W);
      const header = h(
        'div',
        {
          class: `volcanic-journey-section${this.selection?.kind === 'section' && this.selection.id === section.id ? ' is-selected' : ''}`,
          attrs: { role: 'button', tabindex: '-1', 'data-key': `g:${section.id}`, 'aria-label': `Section ${oneLine(section.name) || 'Untitled'}, ${section.steps.length} ${section.steps.length === 1 ? 'step' : 'steps'}` },
          on: {
            pointerdown: () => this.select({ kind: 'section', id: section.id }),
            dblclick: () => this.startRename({ kind: 'section', id: section.id }),
            keydown: (event) => this.onKey(event, { kind: 'section', id: section.id }),
            focus: () => this.select({ kind: 'section', id: section.id }),
          },
        },
        h('span', { text: section.name || 'Untitled section' }),
      );
      header.style.left = `${left}px`;
      header.style.width = `${right - left}px`;
      header.style.setProperty('--tone', colourOf(sectionIndex));
      this.sectionEls.set(section.id, header);
      this.inner.append(header);
      this.ranges.push({ sectionIndex, left, right, empty: !section.steps.length });

      section.steps.forEach((step, index) => {
        const centre = left + index * COL_W + CARD_W / 2;
        this.centres.set(step.id, centre);
        const selected = this.selection?.kind === 'step' && this.selection.id === step.id;
        const card = h(
          'div',
          {
            class: `volcanic-journey-card${selected ? ' is-selected' : ''}`,
            attrs: {
              role: 'button',
              tabindex: '-1',
              'data-key': `s:${step.id}`,
              'aria-label': this.describe(step),
              'aria-posinset': String(globalIndex + 1),
              'aria-setsize': String(steps.length),
            },
            on: {
              pointerdown: (event) => this.onPointerDown(event, step.id),
              keydown: (event) => this.onKey(event, { kind: 'step', id: step.id }),
              focus: () => this.select({ kind: 'step', id: step.id }),
              dblclick: () => this.startRename({ kind: 'step', id: step.id }),
            },
          },
          h('span', { class: 'volcanic-journey-text', text: step.text }),
          h(
            'span',
            { class: 'volcanic-journey-people', attrs: { 'aria-hidden': 'true' } },
            ...step.actors.map((actor) => {
              const dot = h('span', { class: 'volcanic-journey-dot', attrs: { title: actor } });
              dot.style.background = colourOf(people.indexOf(actor));
              return dot;
            }),
          ),
        );
        card.style.left = `${centre - CARD_W / 2}px`;
        card.style.top = `${this.yOf(step.score) - CARD_H / 2}px`;
        card.style.width = `${CARD_W}px`;
        card.style.height = `${CARD_H}px`;
        card.style.setProperty('--tone', colourOf(sectionIndex));
        this.stepEls.set(step.id, card);
        this.inner.append(card);
        globalIndex += 1;
      });
      x = right + SECTION_GAP + (COL_W - CARD_W);
    });

    // The people, so each coloured dot can be read.
    this.inner.querySelector('.volcanic-journey-legend')?.remove();
    if (people.length) {
      const legend = h('div', { class: 'volcanic-journey-legend', attrs: { 'aria-hidden': 'true' } });
      people.forEach((name, index) => {
        const dot = h('span', { class: 'volcanic-journey-dot' });
        dot.style.background = colourOf(index);
        legend.append(h('span', { class: 'volcanic-journey-person' }, dot, name));
      });
      legend.style.top = `${PLOT_TOP + 5 * ROW_H + 12}px`;
      this.inner.append(legend);
    }

    const width = Math.max(x, AXIS_W + 300) + PAD;
    const height = PLOT_TOP + 5 * ROW_H + (people.length ? 54 : 24);
    this.inner.style.width = `${Math.ceil(width)}px`;
    this.inner.style.height = `${height}px`;
    this.drawLine(width, height);
    this.markSelection();
    this.syncRoving();
    if (hadFocus) this.focusSelection();
  }

  /** The line through the steps, as in the finished journey. */
  private drawLine(width: number, height: number): void {
    this.svg.setAttribute('width', String(Math.ceil(width)));
    this.svg.setAttribute('height', String(height));
    this.svg.replaceChildren();
    const points = allSteps(this.j).map(({ step }) => [this.centres.get(step.id)!, this.yOf(step.score)] as const);
    if (points.length < 2) return;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    let d = `M${points[0][0]},${points[0][1]}`;
    for (let i = 1; i < points.length; i++) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      const mid = (x0 + x1) / 2;
      d += ` C${mid},${y0} ${mid},${y1} ${x1},${y1}`;
    }
    path.setAttribute('d', d);
    path.setAttribute('class', 'volcanic-journey-path');
    this.svg.append(path);
  }

  private markSelection(): void {
    for (const [id, el] of this.stepEls) el.classList.toggle('is-selected', this.selection?.kind === 'step' && this.selection.id === id);
    for (const [id, el] of this.sectionEls) el.classList.toggle('is-selected', this.selection?.kind === 'section' && this.selection.id === id);
    this.syncRoving();
  }

  /** One tab stop for the whole canvas: the selected item. */
  private syncRoving(): void {
    const selected = this.selection ? `${this.selection.kind === 'step' ? 's' : 'g'}:${this.selection.id}` : '';
    const items = Array.from(this.inner.querySelectorAll<HTMLElement>('[data-key]'));
    for (const el of items) el.tabIndex = el.dataset.key === selected ? 0 : -1;
    if (!items.some((el) => el.tabIndex === 0) && items[0]) items[0].tabIndex = 0;
  }

  // ───────────────────────────── Dragging ─────────────────────────────

  private onPointerDown(event: PointerEvent, id: string): void {
    if (event.button !== 0 || (event.target as HTMLElement).closest('input')) return;
    this.select({ kind: 'step', id });
    const found = findStep(this.j, id);
    if (!found) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const source = this.stepEls.get(id)!;
    let dragging = false;
    let ghost: HTMLElement | null = null;
    let drop: { score: number; sectionIndex: number; index: number } | null = null;

    const finish = (apply: boolean): void => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onCancel, true);
      window.removeEventListener('keydown', onKey, true);
      this.cancelDrag = null;
      ghost?.remove();
      this.marker.hidden = true;
      this.rowGlow.hidden = true;
      source.classList.remove('is-dragging');
      document.body.classList.remove('volcanic-is-dragging');
      if (dragging && apply && drop) this.dropAt(id, drop);
    };
    const onMove = (move: PointerEvent): void => {
      if (!dragging) {
        if (Math.hypot(move.clientX - startX, move.clientY - startY) < DRAG_START) return;
        dragging = true;
        source.classList.add('is-dragging');
        document.body.classList.add('volcanic-is-dragging');
        ghost = source.cloneNode(true) as HTMLElement;
        ghost.removeAttribute('role');
        ghost.removeAttribute('data-key');
        ghost.setAttribute('aria-hidden', 'true');
        ghost.classList.add('volcanic-journey-ghost');
        document.body.append(ghost);
      }
      move.preventDefault();
      if (ghost) {
        ghost.style.left = `${move.clientX - CARD_W / 2}px`;
        ghost.style.top = `${move.clientY - CARD_H / 2}px`;
      }
      this.autoScroll(move);
      drop = this.dropAtPoint(move.clientX, move.clientY);
      this.showDrop(drop);
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

  /** The score row under a point, and the place among the steps where a dropped step would go. */
  private dropAtPoint(clientX: number, clientY: number): { score: number; sectionIndex: number; index: number } | null {
    const box = this.inner.getBoundingClientRect();
    const x = clientX - box.left;
    const y = clientY - box.top;
    const score = Math.min(5, Math.max(1, 5 - Math.floor((y - PLOT_TOP) / ROW_H)));
    // An empty section takes the step when the pointer is over it.
    const empty = this.ranges.find((r) => r.empty && x >= r.left - 8 && x <= r.right + 8);
    if (empty) return { score, sectionIndex: empty.sectionIndex, index: 0 };
    const steps = allSteps(this.j);
    if (!steps.length) return null;
    let best = steps[0];
    let distance = Infinity;
    for (const item of steps) {
      const d = Math.abs(x - this.centres.get(item.step.id)!);
      if (d < distance) {
        distance = d;
        best = item;
      }
    }
    const before = x < this.centres.get(best.step.id)!;
    return { score, sectionIndex: best.sectionIndex, index: best.index + (before ? 0 : 1) };
  }

  private showDrop(drop: { score: number; sectionIndex: number; index: number } | null): void {
    if (!drop) {
      this.marker.hidden = true;
      this.rowGlow.hidden = true;
      return;
    }
    this.rowGlow.hidden = false;
    this.rowGlow.style.top = `${PLOT_TOP + (5 - drop.score) * ROW_H}px`;
    this.rowGlow.style.height = `${ROW_H}px`;
    const section = this.j.sections[drop.sectionIndex];
    const range = this.ranges[drop.sectionIndex];
    const neighbour = section.steps[Math.min(drop.index, section.steps.length) - 1];
    const x = !section.steps.length ? range.left : neighbour && drop.index > 0 ? this.centres.get(neighbour.id)! + CARD_W / 2 + (COL_W - CARD_W) / 2 : this.centres.get(section.steps[0].id)! - CARD_W / 2 - (COL_W - CARD_W) / 2;
    this.marker.hidden = false;
    this.marker.style.left = `${x - 1}px`;
    this.marker.style.top = `${PLOT_TOP - 8}px`;
    this.marker.style.height = `${5 * ROW_H + 16}px`;
  }

  private autoScroll(event: PointerEvent): void {
    const rect = this.scroller.getBoundingClientRect();
    const edge = 40;
    if (event.clientX < rect.left + edge + AXIS_W) this.scroller.scrollLeft -= 16;
    else if (event.clientX > rect.right - edge) this.scroller.scrollLeft += 16;
  }

  private dropAt(id: string, drop: { score: number; sectionIndex: number; index: number }): void {
    const found = findStep(this.j, id);
    if (!found) return;
    const scoreChanged = found.step.score !== drop.score;
    const samePlace = found.sectionIndex === drop.sectionIndex && (drop.index === found.index || drop.index === found.index + 1);
    if (!scoreChanged && samePlace) return;
    found.step.score = drop.score;
    if (!samePlace) moveStep(this.j, id, drop.sectionIndex, drop.index);
    this.selection = { kind: 'step', id };
    this.commit();
    const now = findStep(this.j, id)!;
    const where = samePlace ? '' : ` Moved to position ${allSteps(this.j).findIndex((x) => x.step.id === id) + 1}${now.section !== found.section ? ` in ${oneLine(now.section.name) || 'a section'}` : ''}.`;
    this.host.announce(`${this.label(now.step)}: ${scoreName(now.step.score).toLowerCase()}, ${now.step.score} of 5.${where}`);
    this.focusSelection();
  }

  // ───────────────────────────── Keyboard ─────────────────────────────

  private onKey(event: KeyboardEvent, sel: NonNullable<Selection>): void {
    // The key press belongs to this item, whether or not its focus event arrived first.
    this.select(sel);
    const order = Array.from(this.inner.querySelectorAll<HTMLElement>('[data-key]')).map((el) => el.dataset.key!);
    const key = `${sel.kind === 'step' ? 's' : 'g'}:${sel.id}`;
    const at = order.indexOf(key);
    const goto = (target: string | undefined): void => {
      if (!target) return;
      const [kind, id] = [target[0] === 's' ? 'step' : 'section', target.slice(2)] as const;
      this.select({ kind, id }, true);
    };
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowRight': {
        event.preventDefault();
        const delta = event.key === 'ArrowLeft' ? -1 : 1;
        if (event.altKey) {
          if (sel.kind === 'step') this.shift(sel.id, delta);
          else this.shiftSection(sel.id, delta);
        } else goto(order[at + delta]);
        break;
      }
      case 'ArrowUp':
      case 'ArrowDown': {
        event.preventDefault();
        if (sel.kind !== 'step') break;
        const found = findStep(this.j, sel.id);
        if (found) this.setScore(found.step, found.step.score + (event.key === 'ArrowUp' ? 1 : -1));
        break;
      }
      case 'Enter':
        event.preventDefault();
        this.addStep();
        break;
      case 'F2':
        event.preventDefault();
        this.startRename(sel);
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

  private focusInspector(): void {
    this.tabs.select('properties');
    this.inspector.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }

  // ───────────────────────────── Properties ─────────────────────────────

  private renderInspector(): void {
    this.inspector.replaceChildren();
    const sel = this.selection;
    if (!sel || !this.exists(sel)) {
      this.inspector.append(h('div', { class: 'volcanic-intro' }, h('p', { text: 'Select a step or section to edit it. Drag a step up or down to change how the person felt, and sideways to move it.' })));
      return;
    }
    if (sel.kind === 'section') this.inspector.append(...this.sectionFields(this.j.sections.find((s) => s.id === sel.id)!));
    else this.inspector.append(...this.stepFields(findStep(this.j, sel.id)!));
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

  private sectionFields(section: JourneySection): HTMLElement[] {
    const at = this.j.sections.indexOf(section);
    const move = (label: string, icon: string, delta: -1 | 1, enabled: boolean): HTMLButtonElement => {
      const button = iconButton(this.host.setIcon, label, icon, () => this.shiftSection(section.id, delta));
      button.disabled = !enabled;
      return button;
    };
    return [
      h('h3', { class: 'volcanic-panel-title', text: 'Section' }),
      this.nameField('Name', section.name, (v) => (section.name = v), `name:${section.id}`),
      h('p', { class: 'volcanic-hint', text: section.steps.length ? `Holds ${section.steps.length} ${section.steps.length === 1 ? 'step' : 'steps'}.` : 'No steps yet. Add one with the Add step button.' }),
      h(
        'div',
        { class: 'volcanic-actions' },
        move('Move earlier', 'arrow-left', -1, at > 0),
        move('Move later', 'arrow-right', 1, at < this.j.sections.length - 1),
        iconButton(this.host.setIcon, 'Delete', 'trash-2', () => this.deleteSelected(), 'mod-warning'),
      ),
    ];
  }

  private stepFields(found: NonNullable<ReturnType<typeof findStep>>): HTMLElement[] {
    const { step } = found;
    const people = actorsOf(this.j);

    const score = selectControl<string>(
      SCORES.map((s) => ({ id: String(s.score), name: `${s.score}: ${s.name}` })),
      String(step.score),
      (value) => this.setScore(step, Number(value)),
    );

    const section = selectControl<string>(
      this.j.sections.map((s, i) => ({ id: s.id, name: oneLine(s.name) || `Section ${i + 1}` })),
      found.section.id,
      (id) => {
        const target = this.j.sections.findIndex((s) => s.id === id);
        if (target < 0 || this.j.sections[target] === found.section) return;
        moveStep(this.j, step.id, target, this.j.sections[target].steps.length);
        this.commit();
        this.host.announce(`Moved to ${oneLine(this.j.sections[target].name) || 'the section'}.`);
      },
    );

    const who = h('fieldset', { class: 'volcanic-fieldset' }, h('legend', { text: 'Who is involved' }));
    const list = h('div', { class: 'volcanic-checks' });
    for (const name of people) {
      list.append(
        checkbox(name, step.actors.includes(name), (on) => {
          step.actors = on ? [...step.actors, name] : step.actors.filter((a) => a !== name);
          this.commit();
          this.host.announce(`${name} ${on ? 'added to' : 'removed from'} ${this.label(step)}.`);
        }),
      );
    }
    if (!people.length) list.append(h('p', { class: 'volcanic-hint', text: 'Nobody yet. Add a person below.' }));
    const add = h('input', { class: 'volcanic-input', attrs: { type: 'text', autocomplete: 'off', 'aria-label': 'Add a person', placeholder: 'Add a person' } });
    const addPerson = (): void => {
      const name = add.value.replace(/\s+/g, ' ').trim();
      if (!name) return;
      if (!step.actors.includes(name)) step.actors.push(name);
      this.commit();
      this.host.announce(`${name} added to ${this.label(step)}.`);
    };
    add.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        addPerson();
      }
    });
    who.append(list, h('div', { class: 'volcanic-row' }, add, iconButton(this.host.setIcon, 'Add', 'plus', addPerson)));

    const first = allSteps(this.j)[0]?.step === step;
    const last = allSteps(this.j).slice(-1)[0]?.step === step;
    const move = (label: string, icon: string, delta: -1 | 1, enabled: boolean): HTMLButtonElement => {
      const button = iconButton(this.host.setIcon, label, icon, () => this.shift(step.id, delta));
      button.disabled = !enabled;
      return button;
    };

    return [
      h('h3', { class: 'volcanic-panel-title', text: 'Step' }),
      this.nameField('Name', step.text, (v) => (step.text = v), `name:${step.id}`),
      field('How the person felt', score),
      field('Section', section),
      who,
      h(
        'div',
        { class: 'volcanic-actions' },
        move('Move earlier', 'arrow-left', -1, !first),
        move('Move later', 'arrow-right', 1, !last),
        iconButton(this.host.setIcon, 'Delete', 'trash-2', () => this.deleteSelected(), 'mod-warning'),
      ),
    ];
  }

  // ───────────────────────────── Outline ─────────────────────────────

  private renderOutline(): void {
    this.outline.replaceChildren();
    if (!this.j.sections.length) {
      this.outline.append(h('p', { class: 'volcanic-hint', text: 'Nothing here yet. Add a step to begin.' }));
      return;
    }
    const pick = (selection: NonNullable<Selection>): void => {
      this.select(selection);
      this.focusInspector();
    };
    for (const section of this.j.sections) {
      this.outline.append(
        h(
          'h3',
          { class: 'volcanic-panel-title' },
          h('button', { class: 'volcanic-list-item', text: `${oneLine(section.name) || 'Untitled section'} (${section.steps.length})`, attrs: { type: 'button' }, on: { click: () => pick({ kind: 'section', id: section.id }) } }),
        ),
      );
      const list = h('ul', { class: 'volcanic-list' });
      for (const step of section.steps) {
        const text = this.describe(step);
        list.append(h('li', {}, h('button', { class: 'volcanic-list-item', text, attrs: { type: 'button', 'aria-label': `${text}. Edit.` }, on: { click: () => pick({ kind: 'step', id: step.id }) } })));
      }
      this.outline.append(list);
    }
  }
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
