import { createTabs, h, uniqueId, type Tabs } from './dom';
import { History, type KindEditor, type KindHost, type KindMeta } from './kinds';
import {
  MIND_SHAPES,
  countNodes,
  findNode,
  flatten,
  isWithin,
  mindToMermaid,
  moveNode,
  nextMindId,
  parentOf,
  walk,
  type MindMap,
  type MindNode,
  type MindShape,
} from './mindmap';
import { field, iconButton, selectControl } from './ui';

/** Space around the map, and between neighbouring ideas. */
const PAD = 28;
const GAP_X = 56;
const GAP_Y = 12;
/** How far a pointer must move before a press becomes a drag. */
const DRAG_START = 6;

type DropZone = { id: string; place: 'child' | 'before' | 'after' };

/**
 * A mind map you grow as a tree: ideas branch to the right, drag one onto another to move it,
 * and everything also works from the keyboard and the Properties and Outline panels.
 */
export class MindMapEditor implements KindEditor {
  readonly el: HTMLElement;
  private m: MindMap;
  private readonly history: History<MindMap>;
  private readonly initial: string;
  private selectedId: string;
  private readonly uid = uniqueId('volcanic-mind');

  private scroller!: HTMLElement;
  private inner!: HTMLElement;
  private links!: SVGSVGElement;
  private indicator!: HTMLElement;
  private inspector!: HTMLElement;
  private outline!: HTMLElement;
  private tabs!: Tabs;
  private resizeObserver: ResizeObserver | null = null;
  private centred = false;
  private cancelRename: (() => void) | null = null;
  private cancelDrag: (() => void) | null = null;
  private readonly nodeEls = new Map<string, HTMLElement>();

  constructor(private readonly host: KindHost, map: MindMap, pristine = false) {
    this.m = JSON.parse(JSON.stringify(map)) as MindMap;
    this.history = new History(this.m);
    this.initial = pristine ? JSON.stringify(this.m) : '';
    this.selectedId = this.m.root.id;
    this.el = this.build();
    this.renderAll();
    // The map can only be measured once it is on screen, so lay it out again when it first gets a size.
    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(this.scroller);
    void document.fonts?.ready.then(() => this.layout());
  }

  // ───────────────────────────── KindEditor ─────────────────────────────

  source(meta: KindMeta): string {
    return mindToMermaid(this.m, meta);
  }

  isPristine(): boolean {
    return this.initial !== '' && JSON.stringify(this.m) === this.initial;
  }

  focus(): void {
    this.nodeEls.get(this.selectedId)?.focus();
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
    this.resizeObserver?.disconnect();
    this.cancelDrag?.();
    this.el.remove();
  }

  private apply(value: MindMap | null, message: string): void {
    if (!value) return;
    this.m = value;
    if (!findNode(this.m, this.selectedId)) this.selectedId = this.m.root.id;
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
      { class: 'volcanic-kind-toolbar', attrs: { role: 'toolbar', 'aria-label': 'Mind map tools' } },
      iconButton(setIcon, 'Add idea inside', 'plus', () => this.addChild(this.selectedId)),
      iconButton(setIcon, 'Add idea beside', 'corner-down-right', () => this.addSibling(this.selectedId)),
    );

    this.links = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.links.setAttribute('class', 'volcanic-mind-links');
    this.links.setAttribute('aria-hidden', 'true');
    this.indicator = h('div', { class: 'volcanic-mind-indicator', attrs: { 'aria-hidden': 'true', hidden: true } });
    this.inner = h('div', { class: 'volcanic-mind-inner', attrs: { role: 'tree', 'aria-label': 'Mind map', 'aria-describedby': helpId } });
    this.inner.append(this.links, this.indicator);
    this.scroller = h('div', { class: 'volcanic-mind-scroll' }, this.inner);
    const help = h('p', {
      class: 'volcanic-sr-only',
      attrs: { id: helpId },
      text: 'Up and down arrows move between ideas. Left and right follow the picture: toward the centre goes to the idea it belongs to, and away from it to its first branch. Enter adds an idea beside this one, and Command or Control with Enter adds one inside it. F2 renames, Delete removes. Hold Alt with the arrow keys to move an idea: up and down reorder it, toward the centre moves it out a level and away from it moves it into the idea above. You can also drag an idea onto another one. Everything is also available in the Properties and Outline panels.',
    });

    this.inspector = h('div', { class: 'volcanic-panel volcanic-inspector' });
    this.outline = h('div', { class: 'volcanic-panel volcanic-outline' });
    this.tabs = createTabs('Details', [
      { id: 'properties', name: 'Properties', panel: this.inspector },
      { id: 'outline', name: 'Outline', panel: this.outline },
    ]);
    const side = h('section', { class: 'volcanic-card volcanic-kind-side', attrs: { 'aria-label': 'Details' } }, this.tabs.list, this.inspector, this.outline);
    const main = h('div', { class: 'volcanic-kind-main' }, h('div', { class: 'volcanic-kind-canvas' }, this.scroller, help), side);
    return h('div', { class: 'volcanic-kind volcanic-mind' }, toolbar, main);
  }

  // ───────────────────────────── Changing the map ─────────────────────────────

  private commit(tag = ''): void {
    this.history.push(this.m, tag);
    this.host.changed();
    this.renderAll();
  }

  /** Record a change made while typing: redraw the map but not the fields. */
  private update(tag: string): void {
    this.history.push(this.m, tag);
    this.host.changed();
    this.renderCanvas();
    this.renderOutline();
  }

  private select(id: string, focus = false): void {
    if (!findNode(this.m, id)) return;
    const changed = id !== this.selectedId;
    this.selectedId = id;
    this.markSelection();
    if (changed) this.renderInspector();
    if (focus) this.nodeEls.get(id)?.focus();
  }

  private name(node: MindNode | null | undefined): string {
    return node ? oneLine(node.text) || 'Untitled idea' : 'the map';
  }

  private addChild(parentId: string): void {
    const parent = findNode(this.m, parentId);
    if (!parent) return;
    const node: MindNode = { id: nextMindId(this.m), text: 'New idea', shape: 'default', children: [] };
    parent.children.push(node);
    this.selectedId = node.id;
    this.commit();
    this.host.announce(`Idea added inside ${this.name(parent)}. Type its name.`);
    this.startRename(node.id);
  }

  private addSibling(id: string): void {
    const parent = parentOf(this.m, id);
    // The central idea has no siblings, so a new idea goes inside it.
    if (!parent) {
      this.addChild(id);
      return;
    }
    const at = parent.children.findIndex((c) => c.id === id);
    const node: MindNode = { id: nextMindId(this.m), text: 'New idea', shape: 'default', children: [] };
    parent.children.splice(at + 1, 0, node);
    this.selectedId = node.id;
    this.commit();
    this.host.announce(`Idea added beside ${this.name(findNode(this.m, id))}. Type its name.`);
    this.startRename(node.id);
  }

  private deleteNode(id: string): void {
    const parent = parentOf(this.m, id);
    const node = findNode(this.m, id);
    if (!parent || !node) return;
    const at = parent.children.indexOf(node);
    const count = countNodes(node) - 1;
    parent.children.splice(at, 1);
    this.selectedId = (parent.children[at] ?? parent.children[at - 1] ?? parent).id;
    this.commit();
    this.host.announce(`${this.name(node)} deleted${count ? `, with the ${count} ${count === 1 ? 'idea' : 'ideas'} inside it` : ''}.`);
    this.focusSelected();
  }

  private move(id: string, target: MindNode, index: number, message: string): boolean {
    if (!moveNode(this.m, id, target, index)) return false;
    this.selectedId = id;
    this.commit();
    this.host.announce(message);
    this.focusSelected();
    return true;
  }

  private reorder(id: string, delta: -1 | 1): void {
    const parent = parentOf(this.m, id);
    const node = findNode(this.m, id);
    if (!parent || !node) return;
    const at = parent.children.indexOf(node);
    const to = at + delta;
    if (to < 0 || to >= parent.children.length) {
      this.host.announce(delta < 0 ? 'Already the first idea here.' : 'Already the last idea here.');
      return;
    }
    // moveNode counts positions before the idea is taken out of the list.
    this.move(id, parent, delta < 0 ? to : to + 1, `${this.name(node)} moved to position ${to + 1} of ${parent.children.length}.`);
  }

  /** Make an idea part of the idea just above it. */
  private indent(id: string): void {
    const parent = parentOf(this.m, id);
    const node = findNode(this.m, id);
    if (!parent || !node) return;
    const above = parent.children[parent.children.indexOf(node) - 1];
    if (!above) {
      this.host.announce('There is no idea above to move it into.');
      return;
    }
    this.move(id, above, above.children.length, `${this.name(node)} moved inside ${this.name(above)}.`);
  }

  /** Move an idea out one level, to sit just after the idea it belonged to. */
  private outdent(id: string): void {
    const parent = parentOf(this.m, id);
    const grand = parent ? parentOf(this.m, parent.id) : null;
    const node = findNode(this.m, id);
    if (!parent || !grand || !node) {
      this.host.announce('It is already at the first level.');
      return;
    }
    this.move(id, grand, grand.children.indexOf(parent) + 1, `${this.name(node)} moved out to sit beside ${this.name(parent)}.`);
  }

  private focusSelected(): void {
    window.setTimeout(() => this.nodeEls.get(this.selectedId)?.focus(), 0);
  }

  // ───────────────────────────── Renaming ─────────────────────────────

  /** Rename an idea right where it is shown. */
  private startRename(id: string): void {
    const el = this.nodeEls.get(id);
    const node = findNode(this.m, id);
    if (!el || !node || el.querySelector('input')) return;
    this.select(id);
    const input = h('input', {
      class: 'volcanic-input volcanic-mind-rename',
      attrs: { type: 'text', autocomplete: 'off', 'aria-label': 'Idea text. Enter saves, Escape cancels.' },
    });
    input.value = node.text.replace(/\n/g, ' ');
    let done = false;
    const finish = (save: boolean): void => {
      if (done) return;
      done = true;
      this.cancelRename = null;
      const value = input.value.trim();
      if (save && value && value !== node.text.replace(/\n/g, ' ')) {
        node.text = value;
        this.commit();
        this.host.announce(`Renamed to ${value}.`);
      } else this.renderCanvas();
      this.focusSelected();
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
    input.style.width = `${Math.max(120, el.offsetWidth - 8)}px`;
    input.focus();
    input.select();
  }

  // ───────────────────────────── Drawing ─────────────────────────────

  private renderAll(): void {
    this.renderCanvas();
    this.renderInspector();
    this.renderOutline();
  }

  private renderCanvas(): void {
    const active = document.activeElement;
    const hadFocus = active instanceof HTMLElement && this.inner.contains(active);
    for (const el of this.nodeEls.values()) el.remove();
    this.nodeEls.clear();

    const rows = flatten(this.m);
    const branchOf = new Map<string, number>();
    this.m.root.children.forEach((child, index) => walk(child, (n) => branchOf.set(n.id, index)));
    for (const { node, parent, depth } of rows) {
      const siblings = parent ? parent.children : [node];
      const label = oneLine(node.text) || 'Untitled idea';
      const el = h(
        'div',
        {
          class: `volcanic-mind-node${depth === 0 ? ' is-root' : ''}`,
          attrs: {
            role: 'treeitem',
            tabindex: node.id === this.selectedId ? '0' : '-1',
            'data-id': node.id,
            'data-shape': node.shape,
            'aria-level': String(depth + 1),
            'aria-setsize': String(siblings.length),
            'aria-posinset': String(siblings.indexOf(node) + 1),
            'aria-selected': String(node.id === this.selectedId),
            'aria-label': `${label}${node.children.length ? `, ${node.children.length} ${node.children.length === 1 ? 'branch' : 'branches'}` : ''}`,
          },
          on: {
            pointerdown: (event) => this.onPointerDown(event, node.id),
            keydown: (event) => this.onKey(event, node.id),
            focus: () => this.select(node.id),
            dblclick: () => this.startRename(node.id),
          },
        },
        h('span', { class: 'volcanic-mind-text', text: node.text }),
      );
      const branch = branchOf.get(node.id);
      if (branch !== undefined) el.style.setProperty('--branch', `var(--volcanic-branch-${(branch % 8) + 1})`);
      this.nodeEls.set(node.id, el);
      this.inner.append(el);
    }
    this.layout();
    if (hadFocus) this.nodeEls.get(this.selectedId)?.focus({ preventScroll: true });
  }

  /** Which ideas hang to the right of the central one and which to the left, as Pele draws a mind map. */
  private sides(): { right: MindNode[]; left: MindNode[] } {
    const kids = this.m.root.children;
    const right = Math.max(kids.length ? 1 : 0, Math.floor(kids.length / 2));
    return { right: kids.slice(0, right), left: kids.slice(right) };
  }

  private sideOf(id: string): 'root' | 'right' | 'left' {
    if (id === this.m.root.id) return 'root';
    return this.sides().left.some((n) => isWithin(n, id)) ? 'left' : 'right';
  }

  /**
   * Place every idea as Pele does: the central idea in the middle, its first branches to the right and the
   * rest to the left, each side's tree centred on the middle.
   */
  private layout(): void {
    // Measure each idea at its natural size, not at the size an earlier layout gave it.
    for (const el of this.nodeEls.values()) {
      el.style.minWidth = '';
      el.style.height = '';
      // Free of where it sat before, so there is always room to size it by its text.
      el.style.left = '0px';
      el.style.width = 'max-content';
    }
    const sizes = new Map<string, { w: number; h: number }>();
    walk(this.m.root, (n) => {
      const el = this.nodeEls.get(n.id);
      sizes.set(n.id, { w: el?.offsetWidth || 120, h: el?.offsetHeight || 40 });
    });
    for (const el of this.nodeEls.values()) el.style.width = '';
    const { right, left } = this.sides();
    const rootSize = sizes.get(this.m.root.id)!;

    // Widest idea at each level, on each side.
    const widths = (roots: MindNode[]): number[] => {
      const out: number[] = [];
      for (const r of roots) walk(r, (n, _p, d) => (out[d] = Math.max(out[d] ?? 0, sizes.get(n.id)!.w)));
      return out;
    };
    const rightCols = widths(right);
    const leftCols = widths(left);
    const span = (cols: number[]): number => cols.reduce((sum, w) => sum + w + GAP_X, 0);

    // Heights: stack the leaves of each side, and centre every idea beside the branches it holds.
    const centres = new Map<string, number>();
    const stack = (roots: MindNode[]): number => {
      let cursor = 0;
      const put = (node: MindNode): void => {
        const size = sizes.get(node.id)!;
        if (!node.children.length) {
          centres.set(node.id, cursor + size.h / 2);
          cursor += size.h + GAP_Y;
          return;
        }
        for (const child of node.children) put(child);
        centres.set(node.id, (centres.get(node.children[0].id)! + centres.get(node.children[node.children.length - 1].id)!) / 2);
      };
      for (const r of roots) put(r);
      return Math.max(0, cursor - GAP_Y);
    };
    const rightH = stack(right);
    const leftH = stack(left);
    const middle = PAD + Math.max(rightH, leftH, rootSize.h) / 2;
    const shift = (roots: MindNode[], h: number): void => {
      const by = middle - h / 2;
      for (const r of roots) walk(r, (n) => centres.set(n.id, centres.get(n.id)! + by));
    };
    shift(right, rightH);
    shift(left, leftH);
    centres.set(this.m.root.id, middle);

    const rootLeft = PAD + span(leftCols);
    const rootRight = rootLeft + rootSize.w;
    const boxes = new Map<string, { x: number; w: number }>();
    boxes.set(this.m.root.id, { x: rootLeft, w: rootSize.w });
    const colsRight: number[] = [];
    let at = rootRight + GAP_X;
    rightCols.forEach((w, d) => {
      colsRight[d] = at;
      at += w + GAP_X;
    });
    const colsLeft: number[] = [];
    let edge = rootLeft - GAP_X;
    leftCols.forEach((w, d) => {
      colsLeft[d] = edge - w;
      edge -= w + GAP_X;
    });
    const place = (roots: MindNode[], starts: number[], cols: number[]): void => {
      for (const r of roots) walk(r, (n, _p, d) => boxes.set(n.id, { x: starts[d], w: cols[d] }));
    };
    place(right, colsRight, rightCols);
    place(left, colsLeft, leftCols);

    const width = rootRight + span(rightCols) - (rightCols.length ? GAP_X : 0) + PAD;
    const height = PAD * 2 + Math.max(rightH, leftH, rootSize.h);
    for (const [id, el] of this.nodeEls) {
      const size = sizes.get(id)!;
      const box = boxes.get(id)!;
      el.style.left = `${Math.round(box.x)}px`;
      el.style.top = `${Math.round(centres.get(id)! - size.h / 2)}px`;
      // A minimum, not a fixed width: text that turns out wider (a late-loading font) widens the idea instead of wrapping.
      el.style.minWidth = `${box.w}px`;
      el.style.height = `${size.h}px`;
    }
    this.inner.style.width = `${Math.ceil(width)}px`;
    this.inner.style.height = `${Math.ceil(height)}px`;
    // The first time the map has a size, show its middle rather than its far left edge.
    if (!this.centred && this.scroller.clientWidth > 0) {
      this.centred = true;
      this.scroller.scrollLeft = Math.max(0, rootLeft + rootSize.w / 2 - this.scroller.clientWidth / 2);
    }

    // Curved lines from each idea to the ones inside it.
    this.links.setAttribute('width', String(Math.ceil(width)));
    this.links.setAttribute('height', String(Math.ceil(height)));
    this.links.replaceChildren();
    walk(this.m.root, (node) => {
      const from = boxes.get(node.id)!;
      for (const child of node.children) {
        const to = boxes.get(child.id)!;
        const toLeft = to.x + to.w <= from.x + 1;
        const x1 = toLeft ? from.x : from.x + from.w;
        const x2 = toLeft ? to.x + to.w : to.x;
        const y1 = centres.get(node.id)!;
        const y2 = centres.get(child.id)!;
        const dx = (x2 - x1) / 2;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`);
        path.setAttribute('class', 'volcanic-mind-link');
        const branch = this.nodeEls.get(child.id)?.style.getPropertyValue('--branch');
        if (branch) path.style.setProperty('--branch', branch);
        this.links.append(path);
      }
    });
  }

  private markSelection(): void {
    for (const [id, el] of this.nodeEls) {
      const on = id === this.selectedId;
      el.classList.toggle('is-selected', on);
      el.setAttribute('aria-selected', String(on));
      el.tabIndex = on ? 0 : -1;
    }
  }

  // ───────────────────────────── Dragging ─────────────────────────────

  private onPointerDown(event: PointerEvent, id: string): void {
    if (event.button !== 0 || (event.target as HTMLElement).closest('input')) return;
    this.select(id);
    const node = findNode(this.m, id)!;
    // The central idea stays where it is; everything else can be dragged.
    if (node === this.m.root) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const source = this.nodeEls.get(id)!;
    let dragging = false;
    let ghost: HTMLElement | null = null;
    let zone: DropZone | null = null;

    const finish = (apply: boolean): void => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onCancel, true);
      window.removeEventListener('keydown', onKey, true);
      this.cancelDrag = null;
      ghost?.remove();
      this.indicator.hidden = true;
      this.inner.querySelectorAll('.is-drop-child').forEach((el) => el.classList.remove('is-drop-child'));
      source.classList.remove('is-dragging');
      document.body.classList.remove('volcanic-is-dragging');
      if (dragging && apply && zone) this.dropOn(id, zone);
    };
    const onMove = (move: PointerEvent): void => {
      if (!dragging) {
        if (Math.hypot(move.clientX - startX, move.clientY - startY) < DRAG_START) return;
        dragging = true;
        source.classList.add('is-dragging');
        document.body.classList.add('volcanic-is-dragging');
        ghost = source.cloneNode(true) as HTMLElement;
        ghost.removeAttribute('role');
        ghost.removeAttribute('data-id');
        ghost.classList.add('volcanic-mind-ghost');
        ghost.setAttribute('aria-hidden', 'true');
        document.body.append(ghost);
      }
      move.preventDefault();
      if (ghost) {
        ghost.style.left = `${move.clientX + 12}px`;
        ghost.style.top = `${move.clientY + 8}px`;
      }
      this.autoScroll(move);
      zone = this.zoneAt(move.clientX, move.clientY, node);
      this.showZone(zone);
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

  /** Where a dragged idea would land if dropped here: inside an idea, or just before or after it. */
  private zoneAt(x: number, y: number, dragged: MindNode): DropZone | null {
    const hit = document.elementsFromPoint(x, y).find((el): el is HTMLElement => el instanceof HTMLElement && el.classList.contains('volcanic-mind-node') && !el.classList.contains('volcanic-mind-ghost'));
    const id = hit?.dataset.id;
    if (!hit || !id || isWithin(dragged, id)) return null;
    const rect = hit.getBoundingClientRect();
    const fraction = (y - rect.top) / Math.max(1, rect.height);
    if (id === this.m.root.id || (fraction > 0.28 && fraction < 0.72)) return { id, place: 'child' };
    return { id, place: fraction <= 0.28 ? 'before' : 'after' };
  }

  private showZone(zone: DropZone | null): void {
    this.inner.querySelectorAll('.is-drop-child').forEach((el) => el.classList.remove('is-drop-child'));
    if (!zone) {
      this.indicator.hidden = true;
      return;
    }
    const el = this.nodeEls.get(zone.id)!;
    if (zone.place === 'child') {
      el.classList.add('is-drop-child');
      this.indicator.hidden = true;
      return;
    }
    this.indicator.hidden = false;
    this.indicator.style.left = `${el.offsetLeft}px`;
    this.indicator.style.width = `${el.offsetWidth}px`;
    this.indicator.style.top = `${zone.place === 'before' ? el.offsetTop - GAP_Y / 2 - 1 : el.offsetTop + el.offsetHeight + GAP_Y / 2 - 1}px`;
  }

  private autoScroll(event: PointerEvent): void {
    const rect = this.scroller.getBoundingClientRect();
    const edge = 36;
    if (event.clientY < rect.top + edge) this.scroller.scrollTop -= 14;
    else if (event.clientY > rect.bottom - edge) this.scroller.scrollTop += 14;
    if (event.clientX < rect.left + edge) this.scroller.scrollLeft -= 14;
    else if (event.clientX > rect.right - edge) this.scroller.scrollLeft += 14;
  }

  private dropOn(id: string, zone: DropZone): void {
    const node = findNode(this.m, id);
    const target = findNode(this.m, zone.id);
    if (!node || !target) return;
    if (zone.place === 'child') {
      if (!this.move(id, target, target.children.length, `${this.name(node)} moved inside ${this.name(target)}.`)) this.host.announce('That idea cannot go there.');
      return;
    }
    const parent = parentOf(this.m, zone.id);
    if (!parent) return;
    const at = parent.children.indexOf(target) + (zone.place === 'after' ? 1 : 0);
    // Dropping an idea back where it already is changes nothing.
    const current = parentOf(this.m, id);
    const from = current ? current.children.indexOf(node) : -1;
    if (current === parent && (at === from || at === from + 1)) return;
    this.move(id, parent, at, `${this.name(node)} moved ${zone.place === 'before' ? 'before' : 'after'} ${this.name(target)}.`);
  }

  // ───────────────────────────── Keyboard ─────────────────────────────

  private onKey(event: KeyboardEvent, id: string): void {
    this.select(id);
    const rows = flatten(this.m);
    const at = rows.findIndex((r) => r.node.id === id);
    const node = rows[at]?.node;
    if (!node) return;
    const mod = event.metaKey || event.ctrlKey;
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowDown': {
        event.preventDefault();
        if (event.altKey) this.reorder(id, event.key === 'ArrowUp' ? -1 : 1);
        else {
          const next = rows[at + (event.key === 'ArrowUp' ? -1 : 1)];
          if (next) this.select(next.node.id, true);
        }
        break;
      }
      case 'ArrowLeft':
      case 'ArrowRight': {
        event.preventDefault();
        // Arrows follow the picture: on the left side of the map, right goes back toward the centre.
        const side = this.sideOf(id);
        const toward = (event.key === 'ArrowRight') === (side === 'left'); // true: toward the central idea
        if (side === 'root') {
          const first = event.key === 'ArrowRight' ? this.sides().right[0] : this.sides().left[0];
          if (first && !event.altKey) this.select(first.id, true);
        } else if (event.altKey) {
          if (toward) this.outdent(id);
          else this.indent(id);
        } else if (toward) {
          if (rows[at].parent) this.select(rows[at].parent!.id, true);
        } else if (node.children[0]) this.select(node.children[0].id, true);
        break;
      }
      case 'Home':
        event.preventDefault();
        this.select(this.m.root.id, true);
        break;
      case 'End':
        event.preventDefault();
        this.select(rows[rows.length - 1].node.id, true);
        break;
      case 'Enter':
        event.preventDefault();
        if (mod) this.addChild(id);
        else this.addSibling(id);
        break;
      case 'F2':
        event.preventDefault();
        this.startRename(id);
        break;
      case ' ':
        event.preventDefault();
        this.focusInspector();
        break;
      case 'Delete':
      case 'Backspace':
        event.preventDefault();
        if (rows[at].parent) this.deleteNode(id);
        else this.host.announce('The central idea cannot be deleted. Rename it instead.');
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
    const node = findNode(this.m, this.selectedId);
    if (!node) return;
    const parent = parentOf(this.m, node.id);
    const siblings = parent?.children ?? [];
    const at = siblings.indexOf(node);

    const text = h('textarea', { class: 'volcanic-input volcanic-mind-text-field', attrs: { rows: '3', 'data-autofocus': true } });
    text.value = node.text;
    text.addEventListener('input', () => {
      node.text = text.value.replace(/\r/g, '');
      this.update(`text:${node.id}`);
    });
    text.addEventListener('blur', () => {
      if (!node.text.trim()) {
        node.text = 'New idea';
        text.value = node.text;
        this.update(`text:${node.id}`);
      }
    });

    const actions = h('div', { class: 'volcanic-actions' });
    const act = (label: string, icon: string, run: () => void, enabled: boolean, extra = ''): void => {
      const button = iconButton(this.host.setIcon, label, icon, run, extra);
      if (!enabled) {
        button.disabled = true;
        button.setAttribute('aria-disabled', 'true');
      }
      actions.append(button);
    };
    act('Add inside', 'plus', () => this.addChild(node.id), true);
    act('Add beside', 'corner-down-right', () => this.addSibling(node.id), !!parent);
    act('Move up', 'arrow-up', () => this.reorder(node.id, -1), !!parent && at > 0);
    act('Move down', 'arrow-down', () => this.reorder(node.id, 1), !!parent && at < siblings.length - 1);
    act('Move into the idea above', 'indent-increase', () => this.indent(node.id), !!parent && at > 0);
    act('Move out a level', 'indent-decrease', () => this.outdent(node.id), !!parent && !!parentOf(this.m, parent.id));
    if (parent) act('Delete', 'trash-2', () => this.deleteNode(node.id), true, 'mod-warning');

    const inside = countNodes(node) - 1;
    this.inspector.append(
      h('h3', { class: 'volcanic-panel-title', text: parent ? 'Idea' : 'Central idea' }),
      field('Text', text, 'Press Enter on the map to add an idea beside this one.'),
      field(
        'Shape',
        selectControl<MindShape>(MIND_SHAPES, node.shape, (shape) => {
          node.shape = shape;
          this.commit();
          this.host.announce(`Shape: ${MIND_SHAPES.find((s) => s.id === shape)?.name}.`);
        }),
      ),
      h('p', { class: 'volcanic-hint', text: inside ? `Holds ${inside} ${inside === 1 ? 'idea' : 'ideas'}.` : 'Nothing inside it yet.' }),
      actions,
    );
  }

  // ───────────────────────────── Outline ─────────────────────────────

  private renderOutline(): void {
    this.outline.replaceChildren();
    const build = (node: MindNode, depth: number): HTMLElement => {
      const label = oneLine(node.text) || 'Untitled idea';
      const item = h(
        'li',
        {},
        h('button', {
          class: 'volcanic-list-item',
          text: label,
          attrs: { type: 'button', 'aria-label': `Level ${depth + 1}: ${label}. Edit.` },
          on: {
            click: () => {
              this.select(node.id);
              this.focusInspector();
            },
          },
        }),
      );
      if (node.children.length) {
        const list = h('ul', { class: 'volcanic-list volcanic-mind-sublist' });
        for (const child of node.children) list.append(build(child, depth + 1));
        item.append(list);
      }
      return item;
    };
    this.outline.append(h('ul', { class: 'volcanic-list volcanic-mind-sublist' }, build(this.m.root, 0)));
  }
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
