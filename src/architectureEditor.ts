import { h, uniqueId } from './dom';
import {
  ARCH_ARROWS,
  ARCH_ICONS,
  ELEMENT_KINDS,
  ARCH_SIDES,
  architectureToMermaid,
  insideOf,
  joinable,
  elementLabel,
  nextElementId,
  starterArchitecture,
  unconnectedElements,
  type Architecture,
  type ArchArrows,
  type ArchConnection,
  type ArchElement,
  type ArchElementKind,
  type ArchIcon,
  type ArchSide,
} from './architecture';
import { History, type KindEditor, type KindHost, type KindMeta } from './kinds';
import { iconButton, selectControl } from './ui';

/**
 * An architecture diagram as two lists: the elements (services, groups and junctions, each optionally inside a group)
 * and the connections between services and junctions, each leaving and arriving at a side.
 */
export class ArchitectureEditor implements KindEditor {
  readonly el: HTMLElement;
  private a: Architecture;
  private readonly history: History<Architecture>;
  private readonly initial: string;
  private readonly uid = uniqueId('volcanic-ar');

  private elementList!: HTMLElement;
  private connectionList!: HTMLElement;
  private warning!: HTMLElement;
  private summary!: HTMLElement;

  constructor(private readonly host: KindHost, architecture: Architecture, pristine = false) {
    this.a = JSON.parse(JSON.stringify(architecture)) as Architecture;
    this.history = new History(this.a);
    this.initial = pristine ? JSON.stringify(this.a) : '';
    this.el = this.build();
    this.renderAll();
  }

  // ───────────────────────────── KindEditor ─────────────────────────────

  source(meta: KindMeta): string {
    return architectureToMermaid(this.a, meta);
  }

  isPristine(): boolean {
    return this.initial !== '' && JSON.stringify(this.a) === this.initial;
  }

  focus(): void {
    this.elementList.querySelector<HTMLElement>('input')?.focus();
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

  private apply(value: Architecture | null, message: string): void {
    if (!value) return;
    this.a = value;
    this.renderAll();
    this.host.changed();
    this.host.announce(message);
  }

  // ───────────────────────────── Build ─────────────────────────────

  private build(): HTMLElement {
    const helpId = `${this.uid}-help`;
    const toolbar = h(
      'div',
      { class: 'volcanic-kind-toolbar', attrs: { role: 'toolbar', 'aria-label': 'Architecture diagram tools' } },
      iconButton(this.host.setIcon, 'Add service', 'plus', () => this.addElement('service')),
      iconButton(this.host.setIcon, 'Add group', 'layout-dashboard', () => this.addElement('group')),
      iconButton(this.host.setIcon, 'Add junction', 'git-fork', () => this.addElement('junction')),
      iconButton(this.host.setIcon, 'Add connection', 'arrow-left-right', () => this.addConnection()),
    );
    this.elementList = h('div', { class: 'volcanic-st-list', attrs: { role: 'group', 'aria-label': 'Elements', 'aria-describedby': helpId } });
    this.connectionList = h('div', { class: 'volcanic-st-list', attrs: { role: 'group', 'aria-label': 'Connections', 'aria-describedby': helpId } });
    const help = h('p', {
      class: 'volcanic-sr-only',
      attrs: { id: helpId },
      text: 'List the services, groups and junctions in your system, and choose which group each sits in. Then connect services and junctions, choosing the side each connection leaves from and arrives at. Hold Alt with the up and down arrow keys in a row to move it, or use its Move buttons.',
    });
    const canvas = h(
      'div',
      { class: 'volcanic-kind-canvas' },
      h('div', { class: 'volcanic-st-scroll' }, h('h3', { class: 'volcanic-panel-title', text: 'Elements' }), this.elementList, h('h3', { class: 'volcanic-panel-title', text: 'Connections' }), this.connectionList, help),
    );
    this.warning = h('p', { class: 'volcanic-radar-warning', attrs: { role: 'status' } });
    this.summary = h('p', { class: 'volcanic-hint' });
    const side = h(
      'section',
      { class: 'volcanic-card volcanic-kind-side', attrs: { 'aria-label': 'About this diagram' } },
      h('div', { class: 'volcanic-panel' }, h('h3', { class: 'volcanic-panel-title', text: 'About' }), this.warning, this.summary),
    );
    return h('div', { class: 'volcanic-kind volcanic-st volcanic-er volcanic-ar' }, toolbar, h('div', { class: 'volcanic-kind-main' }, canvas, side));
  }

  // ───────────────────────────── Changing the diagram ─────────────────────────────

  private commit(tag = ''): void {
    this.history.push(this.a, tag);
    this.host.changed();
    this.renderAll();
  }

  /** Typing: record it and refresh the preview, pickers and notes, but leave the field being typed in alone. */
  private update(tag: string): void {
    this.history.push(this.a, tag);
    this.host.changed();
    this.renderConnections();
    this.renderNotes();
  }

  private name(id: string): string {
    const e = this.a.elements.find((x) => x.id === id);
    return (e && elementLabel(e)) || 'an unnamed element';
  }

  private describe(c: ArchConnection): string {
    return `${this.name(c.from)} to ${this.name(c.to)}`;
  }

  private focusKey(key: string, select = false): boolean {
    const el = this.el.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-key="${key}"]`);
    if (!el) return false;
    el.focus();
    if (select && el?.instanceOf(HTMLInputElement)) el.select();
    return true;
  }

  private addElement(kind: ArchElementKind): void {
    const e: ArchElement = { id: nextElementId(this.a, 'e'), kind, label: '', icon: kind === 'service' ? 'server' : kind === 'group' ? 'cloud' : '', parent: '', code: '' };
    this.a.elements.push(e);
    this.commit();
    this.host.announce(kind === 'junction' ? 'Junction added.' : `${kind === 'group' ? 'Group' : 'Service'} added. Type its name.`);
    if (!this.focusKey(`label:${e.id}`)) this.focusKey(`kind:${e.id}`);
  }

  private removeElement(id: string): void {
    const at = this.a.elements.findIndex((e) => e.id === id);
    if (at < 0) return;
    const name = this.name(id);
    const before = this.a.connections.length;
    this.a.elements.splice(at, 1);
    // What sat inside a removed group moves out of it.
    for (const e of this.a.elements) if (e.parent === id) e.parent = '';
    this.a.connections = this.a.connections.filter((c) => c.from !== id && c.to !== id);
    const dropped = before - this.a.connections.length;
    this.commit();
    this.host.announce(`${name} removed${dropped ? `, with ${dropped} ${dropped === 1 ? 'connection' : 'connections'}` : ''}.`);
    const near = this.a.elements[Math.min(at, this.a.elements.length - 1)];
    if (!near || !(this.focusKey(`label:${near.id}`) || this.focusKey(`kind:${near.id}`))) this.el.querySelector<HTMLElement>('button')?.focus();
  }

  private moveIn<T>(list: T[], at: number, by: -1 | 1, what: string, name: string, key?: string): boolean {
    const to = at + by;
    if (at < 0) return false;
    if (to < 0 || to >= list.length) {
      this.host.announce(by < 0 ? `Already the first ${what}.` : `Already the last ${what}.`);
      return false;
    }
    const [item] = list.splice(at, 1);
    list.splice(to, 0, item);
    this.commit();
    this.host.announce(`${name} moved to position ${to + 1} of ${list.length}.`);
    if (key) this.focusKey(key);
    return true;
  }

  private addConnection(): void {
    const nodes = joinable(this.a);
    if (nodes.length < 1) {
      this.host.announce('Add a service first.');
      return;
    }
    const last = this.a.connections[this.a.connections.length - 1];
    const from = last && nodes.some((n) => n.id === last.to) ? last.to : nodes[0].id;
    const other = nodes.find((n) => n.id !== from);
    const c: ArchConnection = { id: nextElementId(this.a, 'k'), from, fromSide: 'R', to: other ? other.id : from, toSide: 'L', arrows: 'line' };
    this.a.connections.push(c);
    this.commit();
    this.host.announce(`Connection added, ${this.describe(c)}. Choose its sides.`);
    this.focusKey(`from:${c.id}`);
  }

  private removeConnection(id: string): void {
    const at = this.a.connections.findIndex((c) => c.id === id);
    if (at < 0) return;
    const [gone] = this.a.connections.splice(at, 1);
    this.commit();
    this.host.announce(`Connection ${this.describe(gone)} removed.`);
    const near = this.a.connections[Math.min(at, this.a.connections.length - 1)];
    if (!near || !this.focusKey(`from:${near.id}`)) this.el.querySelector<HTMLElement>('button')?.focus();
  }

  // ───────────────────────────── Drawing ─────────────────────────────

  private renderAll(): void {
    const active = document.activeElement;
    const inside = active?.instanceOf(HTMLElement) && this.el.contains(active);
    const keep = inside ? active.dataset.key : undefined;
    const keepAct = inside && !keep ? active.dataset.act : undefined;
    this.renderElements();
    this.renderConnections();
    this.renderNotes();
    if (keep) this.focusKey(keep);
    else if (keepAct) this.el.querySelector<HTMLElement>(`[data-act="${keepAct}"]`)?.focus();
  }

  private small(label: string, icon: string, act: string, onClick: () => void, disabled = false): HTMLButtonElement {
    const button = iconButton(this.host.setIcon, label, icon, onClick, 'volcanic-radar-small');
    button.setAttribute('aria-label', label);
    button.title = label;
    button.dataset.act = act;
    if (disabled) button.setAttribute('aria-disabled', 'true');
    return button;
  }

  private moveButtons(kind: string, id: string, index: number, count: number, move: (by: -1 | 1) => void): HTMLElement {
    return h(
      'span',
      { class: 'volcanic-radar-move' },
      this.small(`Move ${kind} ${index + 1} up`, 'arrow-up', `up:${id}`, () => move(-1), index === 0),
      this.small(`Move ${kind} ${index + 1} down`, 'arrow-down', `down:${id}`, () => move(1), index === count - 1),
    );
  }

  private altMove(row: HTMLElement, move: (by: -1 | 1, key?: string) => void): void {
    row.addEventListener('keydown', (event) => {
      if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
      event.preventDefault();
      event.stopPropagation();
      move(event.key === 'ArrowUp' ? -1 : 1, (event.target as HTMLElement).dataset.key);
    });
  }

  private pick<T extends string>(options: { id: T; name: string }[], value: T, key: string, label: string, set: (v: T) => void): HTMLSelectElement {
    const select = selectControl(options, value, (v) => {
      set(v);
      this.commit();
    });
    select.setAttribute('aria-label', label);
    select.dataset.key = key;
    return select;
  }

  private renderElements(): void {
    const { elements } = this.a;
    const rows = elements.map((e, index) => {
      const n = `element ${index + 1}`;
      const kind = this.pick(ELEMENT_KINDS, e.kind, `kind:${e.id}`, `Type of ${n}`, (v) => {
        e.kind = v;
        if (v === 'junction') e.icon = '';
        else if (!e.icon) e.icon = v === 'group' ? 'cloud' : 'server';
        // A junction cannot hold anything.
        if (v !== 'group') for (const o of elements) if (o.parent === e.id) o.parent = '';
      });
      const text = h('input', { class: 'volcanic-input', attrs: { type: 'text', autocomplete: 'off', 'aria-label': `Name of ${n}`, 'data-key': `label:${e.id}`, placeholder: e.kind === 'group' ? 'Group name' : 'Service name' } });
      text.value = e.label;
      text.addEventListener('input', () => {
        e.label = text.value;
        this.update(`label:${e.id}`);
      });
      if (e.kind === 'junction') {
        text.disabled = true;
        text.value = '';
        text.placeholder = 'Junctions have no name';
      }
      const icon = this.pick(ARCH_ICONS, e.icon, `icon:${e.id}`, `Icon of ${n}`, (v: ArchIcon) => (e.icon = v));
      icon.disabled = e.kind === 'junction';
      const within = insideOf(this.a, e.id);
      const groups = [{ id: '', name: 'Not in a group' }, ...elements.filter((g) => g.kind === 'group' && !within.has(g.id)).map((g) => ({ id: g.id, name: `In ${elementLabel(g) || 'unnamed group'}` }))];
      const parent = this.pick(groups, groups.some((g) => g.id === e.parent) ? e.parent : '', `parent:${e.id}`, `Group of ${n}`, (v) => (e.parent = v));
      const row = h(
        'div',
        { class: 'volcanic-ar-el' },
        this.moveButtons('element', e.id, index, elements.length, (by) => this.moveIn(elements, index, by, 'element', `Element ${this.name(e.id)}`)),
        kind,
        text,
        icon,
        parent,
        this.small(`Remove ${n}`, 'x', `rm:${e.id}`, () => this.removeElement(e.id)),
      );
      this.altMove(row, (by, k) => this.moveIn(elements, index, by, 'element', `Element ${this.name(e.id)}`, k));
      return row;
    });
    this.elementList.replaceChildren(...rows);
    if (!rows.length) this.elementList.append(h('p', { class: 'volcanic-hint', text: 'Nothing here yet. Add a service, group or junction with the buttons above.' }));
  }

  /** The services and junctions offered in a connection's pickers. Elements that share a name are told apart by number. */
  private choices(): { id: string; name: string }[] {
    const nodes = joinable(this.a);
    const totals = new Map<string, number>();
    const seen = new Map<string, number>();
    const base = (e: ArchElement): string => elementLabel(e) || 'Unnamed service';
    for (const e of nodes) totals.set(base(e).toLowerCase(), (totals.get(base(e).toLowerCase()) ?? 0) + 1);
    return nodes.map((e) => {
      const k = base(e).toLowerCase();
      const n = (seen.get(k) ?? 0) + 1;
      seen.set(k, n);
      return { id: e.id, name: (totals.get(k) ?? 0) > 1 ? `${base(e)} (${n})` : base(e) };
    });
  }

  private renderConnections(): void {
    const { connections } = this.a;
    const choices = this.choices();
    const active = document.activeElement;
    const keep = active?.instanceOf(HTMLElement) && this.connectionList.contains(active) ? active.dataset.key : undefined;
    const rows = connections.map((c, index) => {
      const n = `connection ${index + 1}`;
      const end = (id: string): string => (choices.some((o) => o.id === id) ? id : (choices[0]?.id ?? ''));
      const row = h(
        'div',
        { class: 'volcanic-ar-edge' },
        this.moveButtons('connection', c.id, index, connections.length, (by) => this.moveIn(connections, index, by, 'connection', `Connection ${this.describe(c)}`)),
        this.pick(choices, end(c.from), `from:${c.id}`, `From of ${n}`, (v) => (c.from = v)),
        this.pick(ARCH_SIDES, c.fromSide, `fs:${c.id}`, `Side it leaves from in ${n}`, (v: ArchSide) => (c.fromSide = v)),
        this.pick(ARCH_ARROWS, c.arrows, `ar:${c.id}`, `Line style of ${n}`, (v: ArchArrows) => (c.arrows = v)),
        this.pick(ARCH_SIDES, c.toSide, `ts:${c.id}`, `Side it arrives at in ${n}`, (v: ArchSide) => (c.toSide = v)),
        this.pick(choices, end(c.to), `to:${c.id}`, `To of ${n}`, (v) => (c.to = v)),
        this.small(`Remove ${n}`, 'x', `rmc:${c.id}`, () => this.removeConnection(c.id)),
      );
      this.altMove(row, (by, k) => this.moveIn(connections, index, by, 'connection', `Connection ${this.describe(c)}`, k));
      return row;
    });
    this.connectionList.replaceChildren(...rows);
    if (!rows.length) this.connectionList.append(h('p', { class: 'volcanic-hint', text: 'No connections yet. Add one with the Add connection button.' }));
    if (keep) this.connectionList.querySelector<HTMLElement>(`[data-key="${keep}"]`)?.focus();
  }

  private renderNotes(): void {
    const messages: string[] = [];
    const loose = this.a.elements.length > 1 ? unconnectedElements(this.a) : [];
    if (loose.length) messages.push(`${loose.map((e) => elementLabel(e) || 'unnamed service').join(', ')} ${loose.length === 1 ? 'has' : 'have'} no connections.`);
    const blank = this.a.elements.filter((e) => e.kind !== 'junction' && !elementLabel(e)).length;
    if (blank) messages.push(`${blank} ${blank === 1 ? 'element has' : 'elements have'} no name and will show its short code.`);
    this.warning.hidden = !messages.length;
    this.warning.textContent = messages.join(' ');
    const { elements, connections } = this.a;
    const groups = elements.filter((e) => e.kind === 'group').length;
    this.summary.textContent = `${elements.length - groups} ${elements.length - groups === 1 ? 'service or junction' : 'services and junctions'}, ${groups} ${groups === 1 ? 'group' : 'groups'}, ${connections.length} ${connections.length === 1 ? 'connection' : 'connections'}.`;
  }
}

export { starterArchitecture };
