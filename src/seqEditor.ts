import { createTabs, h, s, setAttrs, uniqueId, type Tabs } from './dom';
import { History, type KindEditor, type KindHost, type KindMeta } from './kinds';
import { nextId, plainLabel } from './model';
import {
  NOTE_PLACES,
  SEQ_STYLES,
  describeStep,
  seqLabel,
  seqToMermaid,
  type NotePlace,
  type SeqDiagram,
  type SeqMessage,
  type SeqNote,
  type SeqStep,
  type SeqStyle,
} from './sequence';
import { checkbox, clamp, field, iconButton, selectControl } from './ui';

const COL = 190;
const LEFT = 30;
const HEAD_W = 150;
const HEAD_H = 46;
const TOP = 16;
const FIRST = TOP + HEAD_H + 54;
const ROW = 64;
const NOTE_W = 150;

type Selection = { kind: 'participant' | 'step'; id: string } | null;

const short = (text: string, max = 20): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export class SequenceEditor implements KindEditor {
  readonly el: HTMLElement;
  private d: SeqDiagram;
  private readonly history: History<SeqDiagram>;
  private readonly initial: string;
  private selection: Selection = null;
  private readonly uid = uniqueId('volcanic-seq');

  private svg!: SVGSVGElement;
  private scroller!: HTMLElement;
  private inspector!: HTMLElement;
  private outline!: HTMLElement;
  private tabs!: Tabs;
  private dropLine!: SVGLineElement;
  private stage!: HTMLElement;
  private cancelEdit: (() => void) | null = null;

  constructor(private readonly host: KindHost, diagram: SeqDiagram, pristine = false) {
    this.d = JSON.parse(JSON.stringify(diagram)) as SeqDiagram;
    this.history = new History(this.d);
    this.initial = pristine ? JSON.stringify(this.d) : '';
    this.el = this.build();
    this.renderAll();
  }

  // ───────────────────────────── KindEditor ─────────────────────────────

  source(meta: KindMeta): string {
    return seqToMermaid(this.d, meta);
  }

  isPristine(): boolean {
    return this.initial !== '' && JSON.stringify(this.d) === this.initial;
  }

  focus(): void {
    const first = this.svg.querySelector<SVGElement>('[data-key]');
    if (first) first.focus();
    else this.el.querySelector<HTMLElement>('button')?.focus();
  }

  cancelTransient(): boolean {
    if (!this.cancelEdit) return false;
    this.cancelEdit();
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

  private apply(value: SeqDiagram | null, message: string): void {
    if (!value) return;
    this.d = value;
    if (this.selection && !this.exists(this.selection)) this.selection = null;
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
      { class: 'volcanic-kind-toolbar', attrs: { role: 'toolbar', 'aria-label': 'Sequence diagram tools' } },
      iconButton(setIcon, 'Add participant', 'user-plus', () => this.addParticipant()),
      iconButton(setIcon, 'Add message', 'arrow-right', () => this.addMessage()),
      iconButton(setIcon, 'Add note', 'sticky-note', () => this.addNote()),
      checkbox('Number the messages', this.d.autonumber, (value) => {
        this.d.autonumber = value;
        this.commit();
        this.host.announce(value ? 'Messages are numbered.' : 'Messages are not numbered.');
      }),
    );

    this.dropLine = s('line', { class: 'volcanic-seq-drop' });
    this.dropLine.style.display = 'none';
    this.svg = s('svg', { class: 'volcanic-seq-svg' });
    this.stage = h('div', { class: 'volcanic-seq-stage' }, this.svg);
    this.scroller = h(
      'div',
      { class: 'volcanic-seq-canvas', attrs: { role: 'group', 'aria-label': 'Sequence diagram canvas', 'aria-describedby': helpId } },
      this.stage,
    );
    const help = h('p', {
      class: 'volcanic-sr-only',
      attrs: { id: helpId },
      text: 'Tab moves between participants and steps. Up and down arrows move to the previous or next step. Hold Alt with the arrow keys to move a step up or down, or a participant left or right. Enter renames it, Delete removes it. Double-click a name or message to edit it in place. Everything is also available in the Properties and Outline panels.',
    });

    this.inspector = h('div', { class: 'volcanic-panel volcanic-inspector' });
    this.outline = h('div', { class: 'volcanic-panel volcanic-outline' });
    this.tabs = createTabs('Details', [
      { id: 'properties', name: 'Properties', panel: this.inspector },
      { id: 'outline', name: 'Outline', panel: this.outline },
    ]);
    const side = h('section', { class: 'volcanic-card volcanic-kind-side', attrs: { 'aria-label': 'Details' } }, this.tabs.list, this.inspector, this.outline);
    const main = h('div', { class: 'volcanic-kind-main' }, h('div', { class: 'volcanic-kind-canvas' }, this.scroller, help), side);
    return h('div', { class: 'volcanic-kind volcanic-seq' }, toolbar, main);
  }

  // ───────────────────────────── Helpers ─────────────────────────────

  private exists(sel: NonNullable<Selection>): boolean {
    return sel.kind === 'participant' ? this.d.participants.some((p) => p.id === sel.id) : this.d.steps.some((x) => x.id === sel.id);
  }

  private index(id: string): number {
    return this.d.participants.findIndex((p) => p.id === id);
  }

  private px(id: string): number {
    return LEFT + COL * Math.max(0, this.index(id)) + COL / 2;
  }

  private rowY(index: number): number {
    return FIRST + index * ROW;
  }

  private stepIndex(id: string): number {
    return this.d.steps.findIndex((x) => x.id === id);
  }

  private name(id: string): string {
    return seqLabel(this.d, id);
  }

  /** Record a change and redraw everything, including the property fields. */
  private commit(tag = ''): void {
    this.history.push(this.d, tag);
    this.host.changed();
    this.renderAll();
  }

  /** Record a change while typing: redraw the picture but leave the field being typed in. */
  private update(tag: string): void {
    this.history.push(this.d, tag);
    this.host.changed();
    this.renderSvg();
    this.renderOutline();
  }

  private select(selection: Selection): void {
    if (selection?.kind === this.selection?.kind && selection?.id === this.selection?.id) return;
    this.selection = selection;
    this.markSelection();
    this.renderInspector();
  }

  private markSelection(): void {
    for (const el of Array.from(this.svg.querySelectorAll<SVGElement>('[data-key]'))) {
      const on = !!this.selection && el.dataset.key === `${this.selection.kind === 'participant' ? 'p' : 's'}:${this.selection.id}`;
      el.classList.toggle('is-selected', on);
      el.setAttribute('aria-pressed', String(on));
    }
  }

  private focusKey(key: string): void {
    this.svg.querySelector<SVGElement>(`[data-key="${key}"]`)?.focus({ preventScroll: false });
  }

  // ───────────────────────────── Actions ─────────────────────────────

  private addParticipant(): void {
    const id = nextId('p', this.d.participants.map((p) => p.id));
    const at = this.selection?.kind === 'participant' ? this.index(this.selection.id) + 1 : this.d.participants.length;
    this.d.participants.splice(at, 0, { id, label: `Participant ${this.d.participants.length + 1}`, actor: false });
    this.selection = { kind: 'participant', id };
    this.commit();
    this.host.announce('Participant added. Type a name.');
    this.focusInspector();
  }

  private addMessage(): void {
    if (!this.d.participants.length) {
      this.host.announce('Add a participant first.');
      return;
    }
    const sel = this.selection;
    const current = sel?.kind === 'step' ? this.d.steps[this.stepIndex(sel.id)] : undefined;
    const from = sel?.kind === 'participant' ? sel.id : current?.kind === 'message' ? current.to : this.d.participants[0].id;
    const others = this.d.participants.filter((p) => p.id !== from);
    const to = (current?.kind === 'message' ? current.from : others[0]?.id) ?? from;
    const id = nextId('s', this.d.steps.map((x) => x.id));
    const at = current ? this.stepIndex(current.id) + 1 : this.d.steps.length;
    this.d.steps.splice(at, 0, { kind: 'message', id, from, to, text: 'Message', style: 'solid' });
    this.selection = { kind: 'step', id };
    this.commit();
    this.host.announce('Message added. Type its text.');
    this.focusInspector();
  }

  private addNote(): void {
    if (!this.d.participants.length) {
      this.host.announce('Add a participant first.');
      return;
    }
    const sel = this.selection;
    const current = sel?.kind === 'step' ? this.d.steps[this.stepIndex(sel.id)] : undefined;
    const target = sel?.kind === 'participant' ? sel.id : current ? (current.kind === 'message' ? current.from : current.targets[0]) : this.d.participants[0].id;
    const id = nextId('s', this.d.steps.map((x) => x.id));
    const at = current ? this.stepIndex(current.id) + 1 : this.d.steps.length;
    this.d.steps.splice(at, 0, { kind: 'note', id, place: 'right', targets: [target], text: 'Note' });
    this.selection = { kind: 'step', id };
    this.commit();
    this.host.announce('Note added. Type its text.');
    this.focusInspector();
  }

  private focusInspector(): void {
    this.tabs.select('properties');
    this.inspector.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }

  private deleteSelected(): void {
    const sel = this.selection;
    if (!sel) return;
    if (sel.kind === 'step') {
      const index = this.stepIndex(sel.id);
      if (index < 0) return;
      this.d.steps.splice(index, 1);
      const next = this.d.steps[Math.min(index, this.d.steps.length - 1)];
      this.selection = next ? { kind: 'step', id: next.id } : null;
      this.commit();
      this.host.announce('Step deleted.');
      if (next) this.focusKey(`s:${next.id}`);
    } else {
      const index = this.index(sel.id);
      if (index < 0) return;
      const name = this.name(sel.id);
      let removed = 0;
      this.d.steps = this.d.steps.filter((x) => {
        if (x.kind === 'message') {
          const drop = x.from === sel.id || x.to === sel.id;
          if (drop) removed += 1;
          return !drop;
        }
        x.targets = x.targets.filter((t) => t !== sel.id);
        if (!x.targets.length) removed += 1;
        return x.targets.length > 0;
      });
      this.d.participants.splice(index, 1);
      const next = this.d.participants[Math.min(index, this.d.participants.length - 1)];
      this.selection = next ? { kind: 'participant', id: next.id } : null;
      this.commit();
      this.host.announce(`${name} deleted${removed ? `, along with ${removed} ${removed === 1 ? 'step' : 'steps'} that used it` : ''}.`);
      if (next) this.focusKey(`p:${next.id}`);
    }
  }

  private moveStep(from: number, to: number): void {
    to = clamp(to, 0, this.d.steps.length - 1);
    if (from === to || from < 0) return;
    const [step] = this.d.steps.splice(from, 1);
    this.d.steps.splice(to, 0, step);
    this.commit();
    this.host.announce(`Moved to step ${to + 1} of ${this.d.steps.length}.`);
    this.focusKey(`s:${step.id}`);
  }

  private moveParticipant(from: number, to: number): void {
    to = clamp(to, 0, this.d.participants.length - 1);
    if (from === to || from < 0) return;
    const [p] = this.d.participants.splice(from, 1);
    this.d.participants.splice(to, 0, p);
    this.commit();
    this.host.announce(`${seqLabel(this.d, p.id)} moved to position ${to + 1} of ${this.d.participants.length}.`);
    this.focusKey(`p:${p.id}`);
  }

  // ───────────────────────────── Drawing ─────────────────────────────

  private renderAll(): void {
    this.renderSvg();
    this.renderInspector();
    this.renderOutline();
  }

  private marker(name: string, ...children: SVGElement[]): SVGMarkerElement {
    return s('marker', { id: `${this.uid}-${name}`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 9, markerHeight: 9, orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse' }, ...children);
  }

  private renderSvg(): void {
    const active = document.activeElement;
    const focused = active instanceof SVGElement && this.svg.contains(active) ? active.dataset.key : undefined;

    const n = this.d.participants.length;
    const width = Math.max(520, LEFT * 2 + COL * n);
    const height = this.rowY(this.d.steps.length) + 50;
    setAttrs(this.svg, { width, height, viewBox: `0 0 ${width} ${height}` });
    this.svg.replaceChildren();

    this.svg.append(
      s(
        'defs',
        {},
        this.marker('arrow', s('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'context-stroke' })),
        this.marker('open', s('path', { d: 'M1,1 L9,5 L1,9', fill: 'none', stroke: 'context-stroke', 'stroke-width': 1.6 })),
        this.marker('cross', s('path', { d: 'M2,2 L8,8 M8,2 L2,8', fill: 'none', stroke: 'context-stroke', 'stroke-width': 1.8 })),
      ),
    );

    if (!n) {
      const empty = s('text', { x: width / 2, y: 90, 'text-anchor': 'middle', class: 'volcanic-seq-hint' });
      empty.textContent = 'Add a participant to begin.';
      this.svg.append(empty);
    }

    for (const p of this.d.participants) {
      const cx = this.px(p.id);
      this.svg.append(s('line', { x1: cx, y1: TOP + HEAD_H, x2: cx, y2: height - 16, class: 'volcanic-seq-life' }));
    }
    for (const [i, step] of this.d.steps.entries()) this.svg.append(this.drawStep(step, i));
    for (const p of this.d.participants) this.svg.append(this.drawParticipant(p.id));
    this.svg.append(this.dropLine);

    this.markSelection();
    if (focused) this.focusKey(focused);
  }

  private lines(text: string, x: number, y: number, anchor: string, cls: string, centre: boolean): SVGTextElement {
    const rows = (plainLabelLines(text) || ['']).slice(0, 4);
    const t = s('text', { x, y, 'text-anchor': anchor, class: cls });
    const first = centre ? -((rows.length - 1) * 7) : -((rows.length - 1) * 14);
    rows.forEach((row, i) => {
      const span = s('tspan', { x, dy: i === 0 ? first : 14 });
      span.textContent = short(row, 34);
      t.append(span);
    });
    return t;
  }

  private drawParticipant(id: string): SVGGElement {
    const p = this.d.participants.find((x) => x.id === id)!;
    const cx = this.px(id);
    const text = this.lines(p.label, cx, TOP + HEAD_H / 2 + 5, 'middle', 'volcanic-seq-name', false);
    const g = s(
      'g',
      { class: 'volcanic-seq-participant', 'data-key': `p:${id}`, tabindex: 0, role: 'button', 'aria-pressed': 'false', 'aria-label': `${p.actor ? 'Actor' : 'Participant'} ${plainLabel(p.label)}. Position ${this.index(id) + 1} of ${this.d.participants.length}.` },
      s('rect', { x: cx - HEAD_W / 2, y: TOP, width: HEAD_W, height: HEAD_H, rx: p.actor ? HEAD_H / 2 : 8, class: 'volcanic-seq-box' }),
      text,
    );
    g.addEventListener('pointerdown', (event) => this.startParticipantDrag(event, id, g));
    g.addEventListener('dblclick', () => this.startEdit('participant', id));
    g.addEventListener('focus', () => this.select({ kind: 'participant', id }));
    g.addEventListener('keydown', (event) => this.onParticipantKey(event, id));
    return g;
  }

  private drawStep(step: SeqStep, index: number): SVGGElement {
    const y = this.rowY(index);
    const description = `Step ${index + 1} of ${this.d.steps.length}. ${describeStep(this.d, step)}.`;
    const g = s('g', { class: `volcanic-seq-step is-${step.kind}`, 'data-key': `s:${step.id}`, tabindex: 0, role: 'button', 'aria-pressed': 'false', 'aria-label': description });
    if (step.kind === 'message') this.drawMessage(g, step, y, index);
    else this.drawNote(g, step, y);
    g.addEventListener('pointerdown', (event) => this.startStepDrag(event, step.id, g));
    g.addEventListener('dblclick', () => this.startEdit('step', step.id));
    g.addEventListener('focus', () => this.select({ kind: 'step', id: step.id }));
    g.addEventListener('keydown', (event) => this.onStepKey(event, step.id));
    return g;
  }

  private drawMessage(g: SVGGElement, step: SeqMessage, y: number, index: number): void {
    const x1 = this.px(step.from);
    const x2 = this.px(step.to);
    const self = step.from === step.to;
    const marker = { solid: 'arrow', dotted: 'arrow', async: 'open', lost: 'cross' }[step.style];
    const d = self ? `M${x1},${y - 10} h48 v24 h-48` : `M${x1},${y} L${x2},${y}`;
    const label = `${this.d.autonumber ? `${index + 1}. ` : ''}${step.text}`;
    const left = Math.min(x1, x2) - 14;
    g.append(
      s('rect', { x: left, y: y - 34, width: self ? 140 : Math.abs(x2 - x1) + 28, height: 56, class: 'volcanic-seq-hit' }),
      s('path', { d, class: `volcanic-seq-line is-${step.style}`, 'marker-end': `url(#${this.uid}-${marker})` }),
      self ? this.lines(label, x1 + 56, y + 2, 'start', 'volcanic-seq-text', true) : this.lines(label, (x1 + x2) / 2, y - 10, 'middle', 'volcanic-seq-text', false),
    );
  }

  private noteBox(step: SeqNote): { x: number; w: number } {
    const xs = step.targets.map((t) => this.px(t));
    if (step.place === 'left') return { x: xs[0] - 10 - NOTE_W, w: NOTE_W };
    if (step.place === 'right') return { x: xs[0] + 10, w: NOTE_W };
    return { x: Math.min(...xs) - NOTE_W / 2, w: Math.max(...xs) - Math.min(...xs) + NOTE_W };
  }

  /** Rename a participant or retype a message or note right where it is drawn. */
  private startEdit(kind: 'participant' | 'step', id: string): void {
    if (this.cancelEdit) return;
    const key = `${kind === 'participant' ? 'p' : 's'}:${id}`;
    this.select({ kind, id });
    let box: { left: number; top: number; width: number; height: number };
    let value: string;
    let label: string;
    if (kind === 'participant') {
      const p = this.d.participants.find((x) => x.id === id);
      if (!p) return;
      box = { left: this.px(id) - HEAD_W / 2, top: TOP, width: HEAD_W, height: HEAD_H };
      value = p.label;
      label = 'Participant name';
    } else {
      const index = this.stepIndex(id);
      const step = this.d.steps[index];
      if (!step) return;
      const y = this.rowY(index);
      value = step.text;
      if (step.kind === 'note') {
        const n = this.noteBox(step);
        box = { left: n.x, top: y - 22, width: n.w, height: 44 };
        label = 'Note text';
      } else {
        const x1 = this.px(step.from);
        const x2 = this.px(step.to);
        const self = step.from === step.to;
        const width = self ? 160 : clamp(Math.abs(x2 - x1) - 24, 150, 420);
        box = { left: self ? x1 + 54 : (x1 + x2) / 2 - width / 2, top: y - 44, width, height: 38 };
        label = 'Message text';
      }
    }
    const multiline = kind === 'step';
    const field = multiline
      ? h('textarea', { class: 'volcanic-input volcanic-seq-edit', attrs: { rows: '1' } })
      : h('input', { class: 'volcanic-input volcanic-seq-edit', attrs: { type: 'text', autocomplete: 'off' } });
    field.setAttribute('aria-label', `${label}. Enter saves${multiline ? ', Shift and Enter add a line' : ''}, Escape cancels.`);
    field.value = value;
    Object.assign(field.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
    let done = false;
    const finish = (save: boolean): void => {
      if (done) return;
      done = true;
      this.cancelEdit = null;
      const text = field.value;
      field.remove();
      let changed = false;
      if (save) {
        if (kind === 'participant') {
          const p = this.d.participants.find((x) => x.id === id);
          if (p && text.trim() && text !== p.label) {
            p.label = text.trim();
            changed = true;
          }
        } else {
          const step = this.d.steps[this.stepIndex(id)];
          if (step && text !== step.text) {
            step.text = text;
            changed = true;
          }
        }
      }
      if (changed) {
        this.commit();
        this.host.announce('Saved.');
      }
      this.focusKey(key);
    };
    field.addEventListener('keydown', (raw: Event) => {
      const event = raw as KeyboardEvent;
      event.stopPropagation();
      if (event.key === 'Enter' && !(multiline && event.shiftKey)) {
        event.preventDefault();
        finish(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
    });
    field.addEventListener('blur', () => finish(true));
    field.addEventListener('pointerdown', (event) => event.stopPropagation());
    this.cancelEdit = () => finish(false);
    this.stage.append(field);
    field.focus();
    field.select();
  }

  private drawNote(g: SVGGElement, step: SeqNote, y: number): void {
    const { x, w } = this.noteBox(step);
    g.append(
      s('rect', { x, y: y - 22, width: w, height: 44, rx: 3, class: 'volcanic-seq-note' }),
      this.lines(step.text, x + w / 2, y + 4, 'middle', 'volcanic-seq-text', true),
    );
  }

  // ───────────────────────────── Dragging ─────────────────────────────

  private startStepDrag(event: PointerEvent, id: string, g: SVGGElement): void {
    if (event.button !== 0) return;
    this.select({ kind: 'step', id });
    const from = this.stepIndex(id);
    const y0 = event.clientY;
    let target = from;
    let moved = false;
    g.setPointerCapture(event.pointerId);
    const onMove = (move: PointerEvent): void => {
      const dy = move.clientY - y0;
      if (!moved && Math.abs(dy) < 4) return;
      moved = true;
      g.classList.add('is-dragging');
      g.setAttribute('transform', `translate(0,${dy})`);
      target = clamp(Math.round(dy / ROW) + from, 0, this.d.steps.length - 1);
      if (target === from) this.dropLine.style.display = 'none';
      else {
        const y = this.rowY(target) + (target > from ? ROW / 2 : -ROW / 2);
        setAttrs(this.dropLine, { x1: 8, x2: Number(this.svg.getAttribute('width')) - 8, y1: y, y2: y });
        this.dropLine.style.display = '';
      }
    };
    const onUp = (): void => {
      g.removeEventListener('pointermove', onMove);
      g.removeEventListener('pointerup', onUp);
      g.removeEventListener('pointercancel', onUp);
      g.classList.remove('is-dragging');
      g.removeAttribute('transform');
      this.dropLine.style.display = 'none';
      if (moved && target !== from) this.moveStep(from, target);
    };
    g.addEventListener('pointermove', onMove);
    g.addEventListener('pointerup', onUp);
    g.addEventListener('pointercancel', onUp);
  }

  private startParticipantDrag(event: PointerEvent, id: string, g: SVGGElement): void {
    if (event.button !== 0) return;
    this.select({ kind: 'participant', id });
    const from = this.index(id);
    const x0 = event.clientX;
    let target = from;
    let moved = false;
    g.setPointerCapture(event.pointerId);
    const onMove = (move: PointerEvent): void => {
      const dx = move.clientX - x0;
      if (!moved && Math.abs(dx) < 4) return;
      moved = true;
      g.classList.add('is-dragging');
      g.setAttribute('transform', `translate(${dx},0)`);
      target = clamp(Math.round(dx / COL) + from, 0, this.d.participants.length - 1);
      if (target === from) this.dropLine.style.display = 'none';
      else {
        const x = LEFT + COL * target + (target > from ? COL : 0);
        setAttrs(this.dropLine, { x1: x, x2: x, y1: TOP - 4, y2: TOP + HEAD_H + 4 });
        this.dropLine.style.display = '';
      }
    };
    const onUp = (): void => {
      g.removeEventListener('pointermove', onMove);
      g.removeEventListener('pointerup', onUp);
      g.removeEventListener('pointercancel', onUp);
      g.classList.remove('is-dragging');
      g.removeAttribute('transform');
      this.dropLine.style.display = 'none';
      if (moved && target !== from) this.moveParticipant(from, target);
    };
    g.addEventListener('pointermove', onMove);
    g.addEventListener('pointerup', onUp);
    g.addEventListener('pointercancel', onUp);
  }

  // ───────────────────────────── Keyboard ─────────────────────────────

  private onStepKey(event: KeyboardEvent, id: string): void {
    const index = this.stepIndex(id);
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowDown': {
        event.preventDefault();
        const delta = event.key === 'ArrowUp' ? -1 : 1;
        if (event.altKey) this.moveStep(index, index + delta);
        else {
          const next = this.d.steps[index + delta];
          if (next) this.focusKey(`s:${next.id}`);
          else if (delta < 0 && this.d.participants[0]) this.focusKey(`p:${this.d.participants[0].id}`);
        }
        break;
      }
      case 'Enter':
      case 'F2':
        event.preventDefault();
        this.startEdit('step', id);
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

  private onParticipantKey(event: KeyboardEvent, id: string): void {
    const index = this.index(id);
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowRight': {
        event.preventDefault();
        const delta = event.key === 'ArrowLeft' ? -1 : 1;
        if (event.altKey) this.moveParticipant(index, index + delta);
        else {
          const next = this.d.participants[index + delta];
          if (next) this.focusKey(`p:${next.id}`);
        }
        break;
      }
      case 'ArrowDown':
        event.preventDefault();
        if (this.d.steps[0]) this.focusKey(`s:${this.d.steps[0].id}`);
        break;
      case 'Enter':
      case 'F2':
        event.preventDefault();
        this.startEdit('participant', id);
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
      this.inspector.append(
        h('div', { class: 'volcanic-intro' }, h('p', { text: 'Select a participant, message or note to edit it. Drag steps up and down to reorder them, and drag participants left and right.' })),
      );
      return;
    }
    if (sel.kind === 'participant') this.inspector.append(...this.participantFields(sel.id));
    else {
      const step = this.d.steps[this.stepIndex(sel.id)];
      this.inspector.append(...(step.kind === 'message' ? this.messageFields(step) : this.noteFields(step)));
    }
  }

  private textField(label: string, value: string, multiline: boolean, onInput: (value: string) => void, tag: string): HTMLElement {
    const control = multiline
      ? h('textarea', { class: 'volcanic-input', attrs: { rows: '2', 'data-autofocus': true } })
      : h('input', { class: 'volcanic-input', attrs: { type: 'text', 'data-autofocus': true, autocomplete: 'off' } });
    control.value = value;
    control.addEventListener('input', () => {
      onInput(control.value);
      this.update(tag);
    });
    return field(label, control, multiline ? 'Press Enter for a new line.' : undefined);
  }

  private participantOptions(): { id: string; name: string }[] {
    return this.d.participants.map((p) => ({ id: p.id, name: plainLabel(p.label) }));
  }

  private participantFields(id: string): HTMLElement[] {
    const p = this.d.participants.find((x) => x.id === id)!;
    const index = this.index(id);
    return [
      h('h3', { class: 'volcanic-panel-title', text: 'Participant' }),
      this.textField('Name', p.label, false, (v) => (p.label = v), `name:${id}`),
      field(
        'Looks like',
        selectControl<'box' | 'actor'>([{ id: 'box', name: 'A box' }, { id: 'actor', name: 'A person (rounded)' }], p.actor ? 'actor' : 'box', (v) => {
          p.actor = v === 'actor';
          this.commit();
        }),
      ),
      h(
        'div',
        { class: 'volcanic-actions' },
        iconButton(this.host.setIcon, 'Move left', 'arrow-left', () => this.moveParticipant(index, index - 1), index === 0 ? 'is-disabled' : ''),
        iconButton(this.host.setIcon, 'Move right', 'arrow-right', () => this.moveParticipant(index, index + 1), index === this.d.participants.length - 1 ? 'is-disabled' : ''),
        iconButton(this.host.setIcon, 'Delete', 'trash-2', () => this.deleteSelected(), 'mod-warning'),
      ),
    ];
  }

  private stepButtons(step: SeqStep): HTMLElement {
    const index = this.stepIndex(step.id);
    return h(
      'div',
      { class: 'volcanic-actions' },
      iconButton(this.host.setIcon, 'Move up', 'arrow-up', () => this.moveStep(index, index - 1)),
      iconButton(this.host.setIcon, 'Move down', 'arrow-down', () => this.moveStep(index, index + 1)),
      iconButton(this.host.setIcon, 'Delete', 'trash-2', () => this.deleteSelected(), 'mod-warning'),
    );
  }

  private messageFields(step: SeqMessage): HTMLElement[] {
    const options = this.participantOptions();
    return [
      h('h3', { class: 'volcanic-panel-title', text: `Message ${this.stepIndex(step.id) + 1}` }),
      this.textField('Text', step.text, true, (v) => (step.text = v), `text:${step.id}`),
      h(
        'div',
        { class: 'volcanic-row' },
        field('From', selectControl(options, step.from, (v) => ((step.from = v), this.commit()))),
        field('To', selectControl(options, step.to, (v) => ((step.to = v), this.commit()))),
      ),
      iconButton(this.host.setIcon, 'Reverse direction', 'arrow-left-right', () => {
        [step.from, step.to] = [step.to, step.from];
        this.commit();
        this.host.announce(`Now from ${this.name(step.from)} to ${this.name(step.to)}.`);
      }),
      field('Line', selectControl<SeqStyle>(SEQ_STYLES, step.style, (v) => ((step.style = v), this.commit()))),
      this.stepButtons(step),
    ];
  }

  private noteFields(step: SeqNote): HTMLElement[] {
    const options = this.participantOptions();
    const second = [{ id: '', name: '(none)' }, ...options.filter((o) => o.id !== step.targets[0])];
    const fields: HTMLElement[] = [
      h('h3', { class: 'volcanic-panel-title', text: `Note ${this.stepIndex(step.id) + 1}` }),
      this.textField('Text', step.text, true, (v) => (step.text = v), `text:${step.id}`),
      field(
        'Position',
        selectControl<NotePlace>(NOTE_PLACES, step.place, (v) => {
          step.place = v;
          if (v !== 'over') step.targets = [step.targets[0]];
          this.commit();
        }),
      ),
      field(
        step.place === 'over' ? 'First participant' : 'Participant',
        selectControl(options, step.targets[0], (v) => {
          step.targets = [v, ...step.targets.slice(1).filter((t) => t !== v)];
          this.commit();
        }),
      ),
    ];
    if (step.place === 'over') {
      fields.push(
        field(
          'Second participant (optional)',
          selectControl(second, step.targets[1] ?? '', (v) => {
            step.targets = v ? [step.targets[0], v] : [step.targets[0]];
            this.commit();
          }),
        ),
      );
    }
    fields.push(this.stepButtons(step));
    return fields;
  }

  private renderOutline(): void {
    this.outline.replaceChildren();
    const { participants, steps } = this.d;
    if (!participants.length) {
      this.outline.append(h('p', { class: 'volcanic-hint', text: 'Nothing here yet. Add a participant to begin.' }));
      return;
    }
    const pick = (selection: NonNullable<Selection>): void => {
      this.select(selection);
      this.focusInspector();
    };
    const people = h('ol', { class: 'volcanic-list' });
    for (const p of participants) people.append(h('li', {}, h('button', { class: 'volcanic-list-item', text: plainLabel(p.label), attrs: { type: 'button' }, on: { click: () => pick({ kind: 'participant', id: p.id }) } })));
    this.outline.append(h('h3', { class: 'volcanic-panel-title', text: `Participants (${participants.length})` }), people);

    this.outline.append(h('h3', { class: 'volcanic-panel-title', text: `Steps (${steps.length})` }));
    if (!steps.length) {
      this.outline.append(h('p', { class: 'volcanic-hint', text: 'No messages yet.' }));
      return;
    }
    const list = h('ol', { class: 'volcanic-list' });
    for (const step of steps) {
      list.append(h('li', {}, h('button', { class: 'volcanic-list-item', text: describeStep(this.d, step), attrs: { type: 'button', 'aria-label': `${describeStep(this.d, step)}. Edit.` }, on: { click: () => pick({ kind: 'step', id: step.id }) } })));
    }
    this.outline.append(list);
  }
}

function plainLabelLines(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter((line, i, all) => line || all.length === 1);
}
