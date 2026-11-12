import { h, uniqueId } from './dom';
import { History, type KindEditor, type KindHost, type KindMeta } from './kinds';
import { QUADRANT_PLACES, clamp01, nextPointId, quadrantToMermaid, starterQuadrant, type Quadrant, type QuadrantPoint } from './quadrant';
import { field, iconButton } from './ui';

const NUDGE = 0.01;
const BIG_NUDGE = 0.1;
const DRAG_START = 3;

/**
 * A quadrant chart as a square you can drag points around, with a table of the same points underneath for typing
 * exact positions. Points can also be moved with the arrow keys (hold Shift for bigger steps).
 */
export class QuadrantEditor implements KindEditor {
  readonly el: HTMLElement;
  private q: Quadrant;
  private readonly history: History<Quadrant>;
  private readonly initial: string;
  private readonly uid = uniqueId('volcanic-quad');

  private plane!: HTMLElement;
  private list!: HTMLElement;
  private side!: HTMLElement;
  private summary!: HTMLElement;
  private readonly dots = new Map<string, HTMLElement>();
  private cancelDrag: (() => void) | null = null;

  constructor(private readonly host: KindHost, quadrant: Quadrant, pristine = false) {
    this.q = JSON.parse(JSON.stringify(quadrant)) as Quadrant;
    this.history = new History(this.q);
    this.initial = pristine ? JSON.stringify(this.q) : '';
    this.el = this.build();
    this.renderAll();
  }

  // ───────────────────────────── KindEditor ─────────────────────────────

  source(meta: KindMeta): string {
    return quadrantToMermaid(this.q, meta);
  }

  isPristine(): boolean {
    return this.initial !== '' && JSON.stringify(this.q) === this.initial;
  }

  focus(): void {
    this.dots.values().next().value?.focus();
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

  private apply(value: Quadrant | null, message: string): void {
    if (!value) return;
    this.q = value;
    this.renderAll();
    this.host.changed();
    this.host.announce(message);
  }

  // ───────────────────────────── Build ─────────────────────────────

  private build(): HTMLElement {
    const helpId = `${this.uid}-help`;
    const toolbar = h(
      'div',
      { class: 'volcanic-kind-toolbar', attrs: { role: 'toolbar', 'aria-label': 'Quadrant chart tools' } },
      iconButton(this.host.setIcon, 'Add point', 'plus', () => this.addPoint()),
    );
    this.plane = h('div', { class: 'volcanic-quad-plane', attrs: { role: 'group', 'aria-label': 'Chart. Each point can be dragged, or moved with the arrow keys.', 'aria-describedby': helpId } });
    const help = h('p', {
      class: 'volcanic-sr-only',
      attrs: { id: helpId },
      text: 'Drag a point to move it, or focus it and use the arrow keys. Hold Shift for bigger steps. The table below sets exact positions from 0 to 100.',
    });
    this.list = h('div', { class: 'volcanic-quad-table' });
    const canvas = h('div', { class: 'volcanic-kind-canvas' }, h('div', { class: 'volcanic-quad-scroll' }, h('div', { class: 'volcanic-quad-frame' }, this.plane), help, this.list));

    this.summary = h('p', { class: 'volcanic-hint' });
    this.side = h('div', { class: 'volcanic-panel' });
    const side = h('section', { class: 'volcanic-card volcanic-kind-side', attrs: { 'aria-label': 'Chart options' } }, this.side);
    this.buildSide();
    return h('div', { class: 'volcanic-kind volcanic-quad' }, toolbar, h('div', { class: 'volcanic-kind-main' }, canvas, side));
  }

  private text(label: string, value: string, set: (value: string) => void, hint?: string): HTMLElement {
    const input = h('input', { class: 'volcanic-input', attrs: { type: 'text', autocomplete: 'off' } });
    input.value = value;
    input.addEventListener('input', () => {
      set(input.value);
      this.history.push(this.q, `text:${label}`);
      this.host.changed();
      this.renderPlane();
      this.renderNotes();
    });
    return field(label, input, hint);
  }

  private buildSide(): void {
    this.side.replaceChildren(
      h('h3', { class: 'volcanic-panel-title', text: 'Horizontal axis' }),
      this.text('Left end', this.q.xLeft, (v) => (this.q.xLeft = v)),
      this.text('Right end', this.q.xRight, (v) => (this.q.xRight = v)),
      h('h3', { class: 'volcanic-panel-title', text: 'Vertical axis' }),
      this.text('Bottom end', this.q.yBottom, (v) => (this.q.yBottom = v)),
      this.text('Top end', this.q.yTop, (v) => (this.q.yTop = v)),
      h('h3', { class: 'volcanic-panel-title', text: 'Quadrant names' }),
      ...QUADRANT_PLACES.map((place, i) => this.text(place, this.q.names[i], (v) => (this.q.names[i] = v))),
      this.summary,
    );
  }

  // ───────────────────────────── Changing the chart ─────────────────────────────

  private commit(tag = ''): void {
    this.history.push(this.q, tag);
    this.host.changed();
    this.renderAll();
  }

  /** A change to numbers or names only: keep the rows and the focus where they are. */
  private update(tag: string): void {
    this.history.push(this.q, tag);
    this.host.changed();
    this.renderPlane();
    this.syncInputs();
    this.renderNotes();
  }

  private name(p: QuadrantPoint): string {
    return p.label.replace(/\s+/g, ' ').trim() || 'Untitled point';
  }

  private addPoint(): void {
    const p: QuadrantPoint = { id: nextPointId(this.q), label: 'New point', x: 0.5, y: 0.5 };
    this.q.points.push(p);
    this.commit();
    this.host.announce('Point added in the middle. Type its name.');
    const input = this.list.querySelector<HTMLInputElement>(`[data-key="name:${p.id}"]`);
    input?.focus();
    input?.select();
  }

  private removePoint(id: string): void {
    const at = this.q.points.findIndex((p) => p.id === id);
    if (at < 0) return;
    const [gone] = this.q.points.splice(at, 1);
    this.commit();
    this.host.announce(`${this.name(gone)} removed.`);
    const near = this.q.points[Math.min(at, this.q.points.length - 1)];
    (near ? this.list.querySelector<HTMLElement>(`[data-key="name:${near.id}"]`) : this.el.querySelector<HTMLElement>('button'))?.focus();
  }

  private moveTo(p: QuadrantPoint, x: number, y: number, tag = `pos:${p.id}`): void {
    p.x = Math.round(clamp01(x) * 100) / 100;
    p.y = Math.round(clamp01(y) * 100) / 100;
    this.update(tag);
  }

  // ───────────────────────────── Drawing ─────────────────────────────

  private renderAll(): void {
    const active = document.activeElement;
    const keep = active instanceof HTMLElement && this.el.contains(active) ? active.dataset.key : undefined;
    this.renderPlane();
    this.renderTable();
    this.buildSide();
    this.renderNotes();
    if (keep) this.el.querySelector<HTMLElement>(`[data-key="${keep}"]`)?.focus();
  }

  private position(p: QuadrantPoint): string {
    return `${Math.round(p.x * 100)} across, ${Math.round(p.y * 100)} up`;
  }

  private renderPlane(): void {
    const active = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.key : undefined;
    this.plane.replaceChildren();
    this.dots.clear();
    const { q } = this;
    // Names of the quadrants, in the corners they belong to: 1 top right, 2 top left, 3 bottom left, 4 bottom right.
    const corners = ['tr', 'tl', 'bl', 'br'];
    q.names.forEach((name, i) => {
      if (name.trim()) this.plane.append(h('span', { class: `volcanic-quad-name is-${corners[i]}`, text: name, attrs: { 'aria-hidden': 'true' } }));
    });
    this.plane.append(
      h('span', { class: 'volcanic-quad-axis is-left', text: q.xLeft, attrs: { 'aria-hidden': 'true' } }),
      h('span', { class: 'volcanic-quad-axis is-right', text: q.xRight, attrs: { 'aria-hidden': 'true' } }),
      h('span', { class: 'volcanic-quad-axis is-bottom', text: q.yBottom, attrs: { 'aria-hidden': 'true' } }),
      h('span', { class: 'volcanic-quad-axis is-top', text: q.yTop, attrs: { 'aria-hidden': 'true' } }),
    );
    for (const p of q.points) {
      const dot = h(
        'button',
        { class: 'volcanic-quad-dot', attrs: { type: 'button', 'data-key': `dot:${p.id}`, 'aria-label': `${this.name(p)}, ${this.position(p)}. Use the arrow keys to move it.` } },
        h('span', { class: 'volcanic-quad-dot-mark', attrs: { 'aria-hidden': 'true' } }),
        h('span', { class: 'volcanic-quad-dot-label', text: this.name(p), attrs: { 'aria-hidden': 'true' } }),
      );
      dot.style.left = `${p.x * 100}%`;
      dot.style.top = `${(1 - p.y) * 100}%`;
      dot.addEventListener('pointerdown', (event) => this.onPointerDown(event, p));
      dot.addEventListener('keydown', (event) => this.onKey(event, p));
      this.dots.set(p.id, dot);
      this.plane.append(dot);
    }
    if (active?.startsWith('dot:')) this.plane.querySelector<HTMLElement>(`[data-key="${active}"]`)?.focus();
  }

  private renderTable(): void {
    const rows = this.q.points.map((p, index) => {
      const name = h('input', { class: 'volcanic-input', attrs: { type: 'text', autocomplete: 'off', 'aria-label': `Name of point ${index + 1}`, 'data-key': `name:${p.id}` } });
      name.value = p.label;
      name.addEventListener('input', () => {
        p.label = name.value;
        this.update(`name:${p.id}`);
      });
      const axis = (key: 'x' | 'y', label: string): HTMLInputElement => {
        const input = h('input', {
          class: 'volcanic-input volcanic-quad-number',
          attrs: { type: 'number', min: '0', max: '100', step: '1', inputmode: 'numeric', 'aria-label': `${label} of ${this.name(p)}, 0 to 100`, 'data-key': `${key}:${p.id}` },
        });
        input.value = String(Math.round(p[key] * 100));
        input.addEventListener('input', () => {
          const n = Number(input.value);
          if (input.value === '' || !Number.isFinite(n)) return;
          p[key] = clamp01(n / 100);
          this.update(`${key}:${p.id}`);
        });
        input.addEventListener('blur', () => (input.value = String(Math.round(p[key] * 100))));
        return input;
      };
      const remove = iconButton(this.host.setIcon, 'Remove', 'x', () => this.removePoint(p.id), 'volcanic-quad-remove');
      remove.setAttribute('aria-label', `Remove ${this.name(p)}`);
      remove.title = 'Remove point';
      return h('div', { class: 'volcanic-quad-row', attrs: { 'data-id': p.id } }, name, axis('x', 'Across'), axis('y', 'Up'), remove);
    });
    const head = h('div', { class: 'volcanic-quad-row volcanic-quad-head', attrs: { 'aria-hidden': 'true' } }, h('span', { text: 'Point' }), h('span', { text: 'Across' }), h('span', { text: 'Up' }), h('span'));
    this.list.replaceChildren(head, ...rows);
    if (!rows.length) this.list.append(h('p', { class: 'volcanic-hint', text: 'No points yet. Add one with the Add point button.' }));
  }

  /** Keep the number boxes and the plane's labels in step with a point that moved. */
  private syncInputs(): void {
    for (const p of this.q.points) {
      for (const key of ['x', 'y'] as const) {
        const input = this.list.querySelector<HTMLInputElement>(`[data-key="${key}:${p.id}"]`);
        if (input && document.activeElement !== input) input.value = String(Math.round(p[key] * 100));
      }
    }
  }

  private renderNotes(): void {
    const n = this.q.points.length;
    const parts = [`${n} ${n === 1 ? 'point' : 'points'}.`];
    if (!this.q.xLeft.trim() && this.q.xRight.trim()) parts.push('Give the horizontal axis a left end, or its right end is left out.');
    if (!this.q.yBottom.trim() && this.q.yTop.trim()) parts.push('Give the vertical axis a bottom end, or its top end is left out.');
    this.summary.textContent = parts.join(' ');
  }

  // ───────────────────────────── Moving points ─────────────────────────────

  private onKey(event: KeyboardEvent, p: QuadrantPoint): void {
    const step = event.shiftKey ? BIG_NUDGE : NUDGE;
    const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const move = delta[event.key];
    if (move) {
      event.preventDefault();
      this.moveTo(p, p.x + move[0], p.y + move[1]);
      this.host.announce(this.position(p));
      this.refreshDot(p);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.removePoint(p.id);
    }
  }

  private refreshDot(p: QuadrantPoint): void {
    this.dots.get(p.id)?.setAttribute('aria-label', `${this.name(p)}, ${this.position(p)}. Use the arrow keys to move it.`);
  }

  private onPointerDown(event: PointerEvent, p: QuadrantPoint): void {
    if (event.button !== 0) return;
    const dot = this.dots.get(p.id)!;
    const startX = event.clientX;
    const startY = event.clientY;
    const from = { x: p.x, y: p.y };
    let dragging = false;

    const finish = (apply: boolean): void => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onCancel, true);
      window.removeEventListener('keydown', onKey, true);
      this.cancelDrag = null;
      dot.classList.remove('is-dragging');
      document.body.classList.remove('volcanic-is-dragging');
      if (!dragging) return;
      if (!apply) {
        p.x = from.x;
        p.y = from.y;
        this.update(`pos:${p.id}`);
      }
      this.refreshDot(p);
      this.host.announce(apply ? `${this.name(p)} moved: ${this.position(p)}.` : 'Move cancelled.');
    };
    const onMove = (move: PointerEvent): void => {
      if (!dragging) {
        if (Math.hypot(move.clientX - startX, move.clientY - startY) < DRAG_START) return;
        dragging = true;
        dot.classList.add('is-dragging');
        document.body.classList.add('volcanic-is-dragging');
      }
      move.preventDefault();
      const box = this.plane.getBoundingClientRect();
      if (!box.width || !box.height) return;
      p.x = Math.round(clamp01((move.clientX - box.left) / box.width) * 100) / 100;
      p.y = Math.round(clamp01(1 - (move.clientY - box.top) / box.height) * 100) / 100;
      dot.style.left = `${p.x * 100}%`;
      dot.style.top = `${(1 - p.y) * 100}%`;
      this.history.push(this.q, `drag:${p.id}`);
      this.host.changed();
      this.syncInputs();
    };
    const onUp = (): void => finish(true);
    const onCancel = (): void => finish(false);
    const onKey = (key: KeyboardEvent): void => {
      if (key.key !== 'Escape') return;
      key.preventDefault();
      key.stopPropagation();
      finish(false);
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onCancel, true);
    window.addEventListener('keydown', onKey, true);
    this.cancelDrag = () => finish(false);
  }
}

export { starterQuadrant };
