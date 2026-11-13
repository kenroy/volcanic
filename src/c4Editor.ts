import { h, uniqueId } from './dom';
import {
  C4_BOUNDARIES,
  C4_ELEMENTS,
  C4_LINES,
  c4Label,
  c4ToMermaid,
  nextC4Id,
  starterC4,
  unrelatedC4,
  type C4Boundary,
  type C4BoundaryKind,
  type C4Diagram,
  type C4Element,
  type C4ElementKind,
  type C4Line,
  type C4Relation,
} from './c4';
import { History, type KindEditor, type KindHost, type KindMeta } from './kinds';
import { iconButton, selectControl } from './ui';

/**
 * A C4 context diagram as three lists: the people and systems, the boundaries that group them, and the relationships
 * between them, each written as a sentence such as User uses Web app over HTTPS.
 */
export class C4Editor implements KindEditor {
  readonly el: HTMLElement;
  private d: C4Diagram;
  private readonly history: History<C4Diagram>;
  private readonly initial: string;
  private readonly uid = uniqueId('volcanic-c4');

  private elementList!: HTMLElement;
  private boundaryList!: HTMLElement;
  private relList!: HTMLElement;
  private warning!: HTMLElement;
  private summary!: HTMLElement;

  constructor(private readonly host: KindHost, diagram: C4Diagram, pristine = false) {
    this.d = JSON.parse(JSON.stringify(diagram)) as C4Diagram;
    this.history = new History(this.d);
    this.initial = pristine ? JSON.stringify(this.d) : '';
    this.el = this.build();
    this.renderAll();
  }

  // ───────────────────────────── KindEditor ─────────────────────────────

  source(meta: KindMeta): string {
    return c4ToMermaid(this.d, meta);
  }

  isPristine(): boolean {
    return this.initial !== '' && JSON.stringify(this.d) === this.initial;
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

  private apply(value: C4Diagram | null, message: string): void {
    if (!value) return;
    this.d = value;
    this.renderAll();
    this.host.changed();
    this.host.announce(message);
  }

  // ───────────────────────────── Build ─────────────────────────────

  private build(): HTMLElement {
    const helpId = `${this.uid}-help`;
    const toolbar = h(
      'div',
      { class: 'volcanic-kind-toolbar', attrs: { role: 'toolbar', 'aria-label': 'C4 diagram tools' } },
      iconButton(this.host.setIcon, 'Add person', 'user', () => this.addElement('Person')),
      iconButton(this.host.setIcon, 'Add system', 'plus', () => this.addElement('System')),
      iconButton(this.host.setIcon, 'Add boundary', 'layout-dashboard', () => this.addBoundary()),
      iconButton(this.host.setIcon, 'Add relationship', 'arrow-left-right', () => this.addRelation()),
    );
    this.elementList = h('div', { class: 'volcanic-st-list', attrs: { role: 'group', 'aria-label': 'People and systems', 'aria-describedby': helpId } });
    this.boundaryList = h('div', { class: 'volcanic-st-list', attrs: { role: 'group', 'aria-label': 'Boundaries', 'aria-describedby': helpId } });
    this.relList = h('div', { class: 'volcanic-st-list', attrs: { role: 'group', 'aria-label': 'Relationships', 'aria-describedby': helpId } });
    const help = h('p', {
      class: 'volcanic-sr-only',
      attrs: { id: helpId },
      text: 'List the people and systems around your software, say which are outside your organisation, and group the ones that belong together in a boundary. Then join them with relationships, each read as a sentence. Hold Alt with the up and down arrow keys in a row to move it, or use its Move buttons.',
    });
    const canvas = h(
      'div',
      { class: 'volcanic-kind-canvas' },
      h(
        'div',
        { class: 'volcanic-st-scroll' },
        h('h3', { class: 'volcanic-panel-title', text: 'People and systems' }),
        this.elementList,
        h('h3', { class: 'volcanic-panel-title', text: 'Boundaries' }),
        this.boundaryList,
        h('h3', { class: 'volcanic-panel-title', text: 'Relationships' }),
        this.relList,
        help,
      ),
    );
    this.warning = h('p', { class: 'volcanic-radar-warning', attrs: { role: 'status' } });
    this.summary = h('p', { class: 'volcanic-hint' });
    const side = h(
      'section',
      { class: 'volcanic-card volcanic-kind-side', attrs: { 'aria-label': 'About this diagram' } },
      h('div', { class: 'volcanic-panel' }, h('h3', { class: 'volcanic-panel-title', text: 'About' }), this.warning, this.summary),
    );
    return h('div', { class: 'volcanic-kind volcanic-st volcanic-er volcanic-c4' }, toolbar, h('div', { class: 'volcanic-kind-main' }, canvas, side));
  }

  // ───────────────────────────── Changing the diagram ─────────────────────────────

  private commit(tag = ''): void {
    this.history.push(this.d, tag);
    this.host.changed();
    this.renderAll();
  }

  /** Typing: record it and refresh the preview, pickers and notes, but leave the field being typed in alone. */
  private update(tag: string, pickers = false): void {
    this.history.push(this.d, tag);
    this.host.changed();
    if (pickers) {
      this.renderElements(true);
      this.renderRelations();
    }
    this.renderNotes();
  }

  private name(id: string): string {
    const e = this.d.elements.find((x) => x.id === id) ?? this.d.boundaries.find((x) => x.id === id);
    return (e && c4Label(e)) || 'an unnamed item';
  }

  private describe(r: C4Relation): string {
    return `${this.name(r.from)} ${C4_LINES.find((l) => l.id === r.line)?.name ?? 'to'} ${this.name(r.to)}`;
  }

  private focusKey(key: string, select = false): boolean {
    const el = this.el.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-key="${key}"]`);
    if (!el) return false;
    el.focus();
    if (select && el?.instanceOf(HTMLInputElement)) el.select();
    return true;
  }

  private addElement(kind: C4ElementKind): void {
    const e: C4Element = { id: nextC4Id(this.d, 'e'), kind, label: '', description: '', boundary: '', code: '' };
    this.d.elements.push(e);
    this.commit();
    this.host.announce(`${kind === 'Person' ? 'Person' : 'System'} added. Type its name.`);
    this.focusKey(`label:${e.id}`);
  }

  private removeElement(id: string): void {
    const at = this.d.elements.findIndex((e) => e.id === id);
    if (at < 0) return;
    const name = this.name(id);
    const before = this.d.relations.length;
    this.d.elements.splice(at, 1);
    this.d.relations = this.d.relations.filter((r) => r.from !== id && r.to !== id);
    const dropped = before - this.d.relations.length;
    this.commit();
    this.host.announce(`${name} removed${dropped ? `, with ${dropped} ${dropped === 1 ? 'relationship' : 'relationships'}` : ''}.`);
    const near = this.d.elements[Math.min(at, this.d.elements.length - 1)];
    if (!near || !this.focusKey(`label:${near.id}`)) this.el.querySelector<HTMLElement>('button')?.focus();
  }

  private addBoundary(): void {
    const b: C4Boundary = { id: nextC4Id(this.d, 'b'), kind: 'Enterprise_Boundary', label: '', code: '' };
    this.d.boundaries.push(b);
    this.commit();
    this.host.announce('Boundary added. Type its name, then choose it for the people and systems it holds.');
    this.focusKey(`blabel:${b.id}`);
  }

  private removeBoundary(id: string): void {
    const at = this.d.boundaries.findIndex((b) => b.id === id);
    if (at < 0) return;
    const name = this.name(id);
    this.d.boundaries.splice(at, 1);
    // What was inside stays, outside any boundary.
    for (const e of this.d.elements) if (e.boundary === id) e.boundary = '';
    this.commit();
    this.host.announce(`Boundary ${name} removed. What was inside it is kept.`);
    const near = this.d.boundaries[Math.min(at, this.d.boundaries.length - 1)];
    if (!near || !this.focusKey(`blabel:${near.id}`)) this.el.querySelector<HTMLElement>('button')?.focus();
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

  private addRelation(): void {
    const { elements } = this.d;
    if (elements.length < 1) {
      this.host.announce('Add a person or system first.');
      return;
    }
    const last = this.d.relations[this.d.relations.length - 1];
    const from = last && elements.some((e) => e.id === last.to) ? last.to : elements[0].id;
    const other = elements.find((e) => e.id !== from);
    const r: C4Relation = { id: nextC4Id(this.d, 'r'), from, to: other ? other.id : from, line: 'Rel', label: '', technology: '' };
    this.d.relations.push(r);
    this.commit();
    this.host.announce(`Relationship added, ${this.describe(r)}. Type what it is.`);
    this.focusKey(`rl:${r.id}`);
  }

  private removeRelation(id: string): void {
    const at = this.d.relations.findIndex((r) => r.id === id);
    if (at < 0) return;
    const [gone] = this.d.relations.splice(at, 1);
    this.commit();
    this.host.announce(`Relationship ${this.describe(gone)} removed.`);
    const near = this.d.relations[Math.min(at, this.d.relations.length - 1)];
    if (!near || !this.focusKey(`rl:${near.id}`)) this.el.querySelector<HTMLElement>('button')?.focus();
  }

  // ───────────────────────────── Drawing ─────────────────────────────

  private renderAll(): void {
    const active = document.activeElement;
    const inside = active?.instanceOf(HTMLElement) && this.el.contains(active);
    const keep = inside ? active.dataset.key : undefined;
    const keepAct = inside && !keep ? active.dataset.act : undefined;
    this.renderElements();
    this.renderBoundaries();
    this.renderRelations();
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

  private text(value: string, key: string, label: string, placeholder: string, onInput: (v: string) => void): HTMLInputElement {
    const input = h('input', { class: 'volcanic-input', attrs: { type: 'text', autocomplete: 'off', 'aria-label': label, 'data-key': key, placeholder } });
    input.value = value;
    input.addEventListener('input', () => onInput(input.value));
    return input;
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

  /** Rows for the people and systems. `onlyPickers` rebuilds just the boundary pickers, for when a boundary is renamed. */
  private renderElements(onlyPickers = false): void {
    const { elements } = this.d;
    if (onlyPickers) {
      // Rebuilding the rows would pull focus from the boundary being typed in, so only the pickers change.
      const options = this.boundaryOptions();
      for (const e of elements) {
        const select = this.el.querySelector<HTMLSelectElement>(`[data-key="in:${e.id}"]`);
        if (!select) continue;
        select.replaceChildren(...options.map((o) => h('option', { text: o.name, attrs: { value: o.id } })));
        select.value = options.some((o) => o.id === e.boundary) ? e.boundary : '';
      }
      return;
    }
    const options = this.boundaryOptions();
    const rows = elements.map((e, index) => {
      const n = `item ${index + 1}`;
      const row = h(
        'div',
        { class: 'volcanic-c4-el' },
        this.moveButtons('item', e.id, index, elements.length, (by) => this.moveIn(elements, index, by, 'item', this.name(e.id))),
        this.pick(C4_ELEMENTS, e.kind, `kind:${e.id}`, `Kind of ${n}`, (v: C4ElementKind) => (e.kind = v)),
        this.text(e.label, `label:${e.id}`, `Name of ${n}`, 'Name', (v) => {
          e.label = v;
          this.update(`label:${e.id}`, false);
          this.renderRelations();
        }),
        this.text(e.description, `desc:${e.id}`, `Description of ${n}`, 'What it is or does', (v) => {
          e.description = v;
          this.update(`desc:${e.id}`);
        }),
        this.pick(options, options.some((o) => o.id === e.boundary) ? e.boundary : '', `in:${e.id}`, `Boundary of ${n}`, (v) => (e.boundary = v)),
        this.small(`Remove ${n}`, 'x', `rm:${e.id}`, () => this.removeElement(e.id)),
      );
      this.altMove(row, (by, k) => this.moveIn(elements, index, by, 'item', this.name(e.id), k));
      return row;
    });
    this.elementList.replaceChildren(...rows);
    if (!rows.length) this.elementList.append(h('p', { class: 'volcanic-hint', text: 'Nothing here yet. Add a person or system with the buttons above.' }));
  }

  private boundaryOptions(): { id: string; name: string }[] {
    return [{ id: '', name: 'Outside any boundary' }, ...this.d.boundaries.map((b) => ({ id: b.id, name: `In ${c4Label(b) || 'unnamed boundary'}` }))];
  }

  private renderBoundaries(): void {
    const { boundaries } = this.d;
    const rows = boundaries.map((b, index) => {
      const n = `boundary ${index + 1}`;
      const row = h(
        'div',
        { class: 'volcanic-c4-bd' },
        this.moveButtons('boundary', b.id, index, boundaries.length, (by) => this.moveIn(boundaries, index, by, 'boundary', `Boundary ${this.name(b.id)}`)),
        this.pick(C4_BOUNDARIES, b.kind, `bkind:${b.id}`, `Kind of ${n}`, (v: C4BoundaryKind) => (b.kind = v)),
        this.text(b.label, `blabel:${b.id}`, `Name of ${n}`, 'Boundary name', (v) => {
          b.label = v;
          this.update(`blabel:${b.id}`, true);
        }),
        this.small(`Remove ${n}`, 'x', `rmb:${b.id}`, () => this.removeBoundary(b.id)),
      );
      this.altMove(row, (by, k) => this.moveIn(boundaries, index, by, 'boundary', `Boundary ${this.name(b.id)}`, k));
      return row;
    });
    this.boundaryList.replaceChildren(...rows);
    if (!rows.length) this.boundaryList.append(h('p', { class: 'volcanic-hint', text: 'No boundaries. Add one to group the people and systems that belong together.' }));
  }

  /** The people and systems offered in a relationship picker. Ones that share a name are told apart by number. */
  private choices(): { id: string; name: string }[] {
    const totals = new Map<string, number>();
    const seen = new Map<string, number>();
    const base = (e: C4Element): string => c4Label(e) || 'Unnamed';
    for (const e of this.d.elements) totals.set(base(e).toLowerCase(), (totals.get(base(e).toLowerCase()) ?? 0) + 1);
    return this.d.elements.map((e) => {
      const k = base(e).toLowerCase();
      const n = (seen.get(k) ?? 0) + 1;
      seen.set(k, n);
      return { id: e.id, name: (totals.get(k) ?? 0) > 1 ? `${base(e)} (${n})` : base(e) };
    });
  }

  private renderRelations(): void {
    const { relations } = this.d;
    const choices = this.choices();
    const active = document.activeElement;
    const keep = active?.instanceOf(HTMLElement) && this.relList.contains(active) ? active.dataset.key : undefined;
    const rows = relations.map((r, index) => {
      const n = `relationship ${index + 1}`;
      const row = h(
        'div',
        { class: 'volcanic-c4-rel' },
        this.moveButtons('relationship', r.id, index, relations.length, (by) => this.moveIn(relations, index, by, 'relationship', `Relationship ${this.describe(r)}`)),
        this.pick(choices, r.from, `rf:${r.id}`, `First item of ${n}`, (v) => (r.from = v)),
        this.pick(C4_LINES, r.line, `rk:${r.id}`, `Direction of ${n}`, (v: C4Line) => (r.line = v)),
        this.pick(choices, r.to, `rt:${r.id}`, `Second item of ${n}`, (v) => (r.to = v)),
        this.text(r.label, `rl:${r.id}`, `What ${n} is`, 'What it is, e.g. Uses', (v) => {
          r.label = v;
          this.update(`rl:${r.id}`);
        }),
        this.text(r.technology, `rtech:${r.id}`, `Technology of ${n}`, 'Technology (optional)', (v) => {
          r.technology = v;
          this.update(`rtech:${r.id}`);
        }),
        this.small(`Remove ${n}`, 'x', `rmr:${r.id}`, () => this.removeRelation(r.id)),
      );
      this.altMove(row, (by, k) => this.moveIn(relations, index, by, 'relationship', `Relationship ${this.describe(r)}`, k));
      return row;
    });
    this.relList.replaceChildren(...rows);
    if (!rows.length) this.relList.append(h('p', { class: 'volcanic-hint', text: 'No relationships yet. Add one with the Add relationship button.' }));
    if (keep) this.relList.querySelector<HTMLElement>(`[data-key="${keep}"]`)?.focus();
  }

  private renderNotes(): void {
    const messages: string[] = [];
    const loose = this.d.elements.length > 1 ? unrelatedC4(this.d) : [];
    if (loose.length) messages.push(`${loose.map((e) => c4Label(e) || 'an unnamed item').join(', ')} ${loose.length === 1 ? 'has' : 'have'} no relationships.`);
    const blank = this.d.elements.filter((e) => !c4Label(e)).length + this.d.boundaries.filter((b) => !c4Label(b)).length;
    if (blank) messages.push(`${blank} ${blank === 1 ? 'item has' : 'items have'} no name and will show its short code.`);
    const empty = this.d.boundaries.filter((b) => !this.d.elements.some((e) => e.boundary === b.id));
    if (empty.length) messages.push(`${empty.map((b) => c4Label(b) || 'An unnamed boundary').join(', ')} ${empty.length === 1 ? 'holds' : 'hold'} nothing yet, so ${empty.length === 1 ? 'it is' : 'they are'} left out of the diagram until something is put inside.`);
    this.warning.hidden = !messages.length;
    this.warning.textContent = messages.join(' ');
    const { elements, boundaries, relations } = this.d;
    this.summary.textContent = `${elements.length} ${elements.length === 1 ? 'person or system' : 'people and systems'}, ${boundaries.length} ${boundaries.length === 1 ? 'boundary' : 'boundaries'}, ${relations.length} ${relations.length === 1 ? 'relationship' : 'relationships'}.`;
  }
}

export { starterC4 };
