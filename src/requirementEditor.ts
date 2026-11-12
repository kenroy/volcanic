import { h, uniqueId } from './dom';
import { History, type KindEditor, type KindHost, type KindMeta } from './kinds';
import {
  REQ_KINDS,
  REQ_RELATIONS,
  RISKS,
  VERIFY_METHODS,
  blankItem,
  duplicateItems,
  nextReqId,
  reqName,
  requirementToMermaid,
  starterRequirements,
  untraced,
  type ReqItem,
  type ReqKind,
  type ReqRelation,
  type ReqRelationKind,
  type ReqRisk,
  type ReqVerify,
  type RequirementDiagram,
} from './requirement';
import { DIRECTIONS } from './state';
import { field, iconButton, selectControl } from './ui';

/**
 * A requirement diagram as cards, one for each requirement or element, and a list of relationships written as a
 * sentence: test_entity satisfies test_req. Relationships are picked from the cards you have named.
 */
export class RequirementEditor implements KindEditor {
  readonly el: HTMLElement;
  private d: RequirementDiagram;
  private readonly history: History<RequirementDiagram>;
  private readonly initial: string;
  private readonly uid = uniqueId('volcanic-rq');

  private itemList!: HTMLElement;
  private relList!: HTMLElement;
  private options!: HTMLElement;
  private warning!: HTMLElement;
  private summary!: HTMLElement;

  constructor(private readonly host: KindHost, diagram: RequirementDiagram, pristine = false) {
    this.d = JSON.parse(JSON.stringify(diagram)) as RequirementDiagram;
    this.history = new History(this.d);
    this.initial = pristine ? JSON.stringify(this.d) : '';
    this.el = this.build();
    this.renderAll();
  }

  // ───────────────────────────── KindEditor ─────────────────────────────

  source(meta: KindMeta): string {
    return requirementToMermaid(this.d, meta);
  }

  isPristine(): boolean {
    return this.initial !== '' && JSON.stringify(this.d) === this.initial;
  }

  focus(): void {
    this.itemList.querySelector<HTMLElement>('input')?.focus();
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

  private apply(value: RequirementDiagram | null, message: string): void {
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
      { class: 'volcanic-kind-toolbar', attrs: { role: 'toolbar', 'aria-label': 'Requirement diagram tools' } },
      iconButton(this.host.setIcon, 'Add requirement', 'plus', () => this.addItem('requirement')),
      iconButton(this.host.setIcon, 'Add element', 'box', () => this.addItem('element')),
      iconButton(this.host.setIcon, 'Add relationship', 'arrow-left-right', () => this.addRelation()),
    );
    this.itemList = h('div', { class: 'volcanic-er-entities', attrs: { role: 'group', 'aria-label': 'Requirements and elements', 'aria-describedby': helpId } });
    this.relList = h('div', { class: 'volcanic-st-list', attrs: { role: 'group', 'aria-label': 'Relationships', 'aria-describedby': helpId } });
    const help = h('p', {
      class: 'volcanic-sr-only',
      attrs: { id: helpId },
      text: 'Add the requirements your system must meet, each with an id, its text, a risk and a way to verify it, and the elements that satisfy or verify them. Then join them with relationships, each read as a sentence. Hold Alt with the up and down arrow keys in a row to move it, or use its Move buttons.',
    });
    const canvas = h(
      'div',
      { class: 'volcanic-kind-canvas' },
      h('div', { class: 'volcanic-st-scroll' }, h('h3', { class: 'volcanic-panel-title', text: 'Requirements and elements' }), this.itemList, h('h3', { class: 'volcanic-panel-title', text: 'Relationships' }), this.relList, help),
    );
    this.options = h('div', { class: 'volcanic-st-options' });
    this.warning = h('p', { class: 'volcanic-radar-warning', attrs: { role: 'status' } });
    this.summary = h('p', { class: 'volcanic-hint' });
    const side = h(
      'section',
      { class: 'volcanic-card volcanic-kind-side', attrs: { 'aria-label': 'About this diagram' } },
      h('div', { class: 'volcanic-panel' }, h('h3', { class: 'volcanic-panel-title', text: 'Layout' }), this.options, this.warning, this.summary),
    );
    return h('div', { class: 'volcanic-kind volcanic-st volcanic-er volcanic-rq' }, toolbar, h('div', { class: 'volcanic-kind-main' }, canvas, side));
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
    if (pickers) this.renderRelations();
    this.renderNotes();
  }

  private name(id: string): string {
    const i = this.d.items.find((x) => x.id === id);
    return (i && reqName(i)) || 'an unnamed item';
  }

  private describe(r: ReqRelation): string {
    return `${this.name(r.from)} ${REQ_RELATIONS.find((k) => k.id === r.kind)?.name ?? ''} ${this.name(r.to)}`;
  }

  private focusKey(key: string, select = false): boolean {
    const el = this.el.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-key="${key}"]`);
    if (!el) return false;
    el.focus();
    if (select && el instanceof HTMLInputElement) el.select();
    return true;
  }

  private addItem(kind: ReqKind): void {
    const i = blankItem(nextReqId(this.d, 'q'), kind);
    this.d.items.push(i);
    this.commit();
    this.host.announce(`${kind === 'element' ? 'Element' : 'Requirement'} added. Type its name.`);
    this.focusKey(`name:${i.id}`);
  }

  private removeItem(id: string): void {
    const at = this.d.items.findIndex((i) => i.id === id);
    if (at < 0) return;
    const name = this.name(id);
    const before = this.d.relations.length;
    this.d.items.splice(at, 1);
    this.d.relations = this.d.relations.filter((r) => r.from !== id && r.to !== id);
    const dropped = before - this.d.relations.length;
    this.commit();
    this.host.announce(`${name} removed${dropped ? `, with ${dropped} ${dropped === 1 ? 'relationship' : 'relationships'}` : ''}.`);
    const near = this.d.items[Math.min(at, this.d.items.length - 1)];
    if (!near || !this.focusKey(`name:${near.id}`)) this.el.querySelector<HTMLElement>('button')?.focus();
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
    const { items } = this.d;
    if (!items.length) {
      this.host.announce('Add a requirement or element first.');
      return;
    }
    const element = items.find((i) => i.kind === 'element');
    const requirement = items.find((i) => i.kind !== 'element');
    const r: ReqRelation = {
      id: nextReqId(this.d, 'r'),
      from: (element ?? items[0]).id,
      to: (requirement ?? items.find((i) => i.id !== (element ?? items[0]).id) ?? items[0]).id,
      kind: element && requirement ? 'satisfies' : 'contains',
    };
    this.d.relations.push(r);
    this.commit();
    this.host.announce(`Relationship added, ${this.describe(r)}. Change it as needed.`);
    this.focusKey(`rf:${r.id}`);
  }

  private removeRelation(id: string): void {
    const at = this.d.relations.findIndex((r) => r.id === id);
    if (at < 0) return;
    const [gone] = this.d.relations.splice(at, 1);
    this.commit();
    this.host.announce(`Relationship ${this.describe(gone)} removed.`);
    const near = this.d.relations[Math.min(at, this.d.relations.length - 1)];
    if (!near || !this.focusKey(`rf:${near.id}`)) this.el.querySelector<HTMLElement>('button')?.focus();
  }

  // ───────────────────────────── Drawing ─────────────────────────────

  private renderAll(): void {
    const active = document.activeElement;
    const inside = active instanceof HTMLElement && this.el.contains(active);
    const keep = inside ? active.dataset.key : undefined;
    const keepAct = inside && !keep ? active.dataset.act : undefined;
    this.renderItems();
    this.renderRelations();
    this.renderOptions();
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

  private renderItems(): void {
    const { items } = this.d;
    const cards = items.map((item, index) => {
      const n = `${item.kind === 'element' ? 'element' : 'requirement'} ${index + 1}`;
      const kind = this.pick(REQ_KINDS, item.kind, `kind:${item.id}`, `Type of item ${index + 1}`, (v: ReqKind) => {
        const wasElement = item.kind === 'element';
        item.kind = v;
        // Moving between a requirement and an element gives it the fields it was missing.
        if (wasElement && v !== 'element') Object.assign(item, { risk: item.risk || 'medium', verify: item.verify || 'test' });
        if (!wasElement && v === 'element') Object.assign(item, { risk: '', verify: '' });
      });
      const head = h(
        'div',
        { class: 'volcanic-rq-head' },
        this.moveButtons('item', item.id, index, items.length, (by) => this.moveIn(items, index, by, 'item', this.name(item.id))),
        this.text(item.name, `name:${item.id}`, `Name of ${n}`, 'Name', (v) => {
          item.name = v;
          this.update(`name:${item.id}`, true);
        }),
        kind,
        this.small(`Remove ${n}`, 'x', `rm:${item.id}`, () => this.removeItem(item.id)),
      );
      this.altMove(head, (by, k) => this.moveIn(items, index, by, 'item', this.name(item.id), k));
      const body =
        item.kind === 'element'
          ? [
              this.text(item.elementType, `etype:${item.id}`, `Type of ${n}`, 'Type, such as simulation', (v) => {
                item.elementType = v;
                this.update(`etype:${item.id}`);
              }),
              this.text(item.docRef, `docref:${item.id}`, `Document reference of ${n}`, 'Document reference (optional)', (v) => {
                item.docRef = v;
                this.update(`docref:${item.id}`);
              }),
            ]
          : [
              this.text(item.reqId, `reqid:${item.id}`, `Requirement id of ${n}`, 'Id, such as REQ-1', (v) => {
                item.reqId = v;
                this.update(`reqid:${item.id}`);
              }),
              this.text(item.text, `text:${item.id}`, `Text of ${n}`, 'What the system must do', (v) => {
                item.text = v;
                this.update(`text:${item.id}`);
              }),
              this.pick(RISKS, item.risk, `risk:${item.id}`, `Risk of ${n}`, (v: ReqRisk) => (item.risk = v)),
              this.pick(VERIFY_METHODS, item.verify, `verify:${item.id}`, `How ${n} is verified`, (v: ReqVerify) => (item.verify = v)),
            ];
      return h('section', { class: 'volcanic-er-card', attrs: { 'aria-label': `${n}: ${this.name(item.id)}` } }, head, h('div', { class: 'volcanic-rq-fields' }, ...body));
    });
    this.itemList.replaceChildren(...cards);
    if (!cards.length) this.itemList.append(h('p', { class: 'volcanic-hint', text: 'Nothing here yet. Add a requirement or an element with the buttons above.' }));
  }

  /** The cards offered in a picker. Items that share a name are told apart by number. */
  private choices(): { id: string; name: string }[] {
    const totals = new Map<string, number>();
    const seen = new Map<string, number>();
    const base = (i: ReqItem): string => reqName(i) || 'Unnamed item';
    for (const i of this.d.items) totals.set(base(i).toLowerCase(), (totals.get(base(i).toLowerCase()) ?? 0) + 1);
    return this.d.items.map((i) => {
      const k = base(i).toLowerCase();
      const n = (seen.get(k) ?? 0) + 1;
      seen.set(k, n);
      return { id: i.id, name: (totals.get(k) ?? 0) > 1 ? `${base(i)} (${n})` : base(i) };
    });
  }

  private renderRelations(): void {
    const { relations } = this.d;
    const choices = this.choices();
    const active = document.activeElement;
    const keep = active instanceof HTMLElement && this.relList.contains(active) ? active.dataset.key : undefined;
    const rows = relations.map((r, index) => {
      const n = `relationship ${index + 1}`;
      const row = h(
        'div',
        { class: 'volcanic-rq-rel' },
        this.moveButtons('relationship', r.id, index, relations.length, (by) => this.moveIn(relations, index, by, 'relationship', `Relationship ${this.describe(r)}`)),
        this.pick(choices, r.from, `rf:${r.id}`, `First item of ${n}`, (v) => (r.from = v)),
        this.pick(REQ_RELATIONS, r.kind, `rk:${r.id}`, `How the first item relates in ${n}`, (v: ReqRelationKind) => (r.kind = v)),
        this.pick(choices, r.to, `rt:${r.id}`, `Second item of ${n}`, (v) => (r.to = v)),
        this.small(`Remove ${n}`, 'x', `rmr:${r.id}`, () => this.removeRelation(r.id)),
      );
      this.altMove(row, (by, k) => this.moveIn(relations, index, by, 'relationship', `Relationship ${this.describe(r)}`, k));
      return row;
    });
    this.relList.replaceChildren(...rows);
    if (!rows.length) this.relList.append(h('p', { class: 'volcanic-hint', text: 'No relationships yet. Add one with the Add relationship button.' }));
    if (keep) this.relList.querySelector<HTMLElement>(`[data-key="${keep}"]`)?.focus();
  }

  private renderOptions(): void {
    this.options.replaceChildren(
      field(
        'Direction',
        selectControl(DIRECTIONS, this.d.direction, (value) => {
          this.d.direction = value;
          this.commit();
          this.host.announce(`${DIRECTIONS.find((o) => o.id === value)?.name ?? value}.`);
        }),
        'Which way the diagram flows.',
      ),
    );
  }

  private renderNotes(): void {
    const messages: string[] = [];
    const dupes = duplicateItems(this.d);
    if (dupes.length) messages.push(`⚠ More than one item is called ${dupes.join(', ')}. The diagram draws them as one, so give them different names.`);
    const loose = this.d.items.length > 1 ? untraced(this.d) : [];
    if (loose.length) messages.push(`Nothing is related to ${loose.map((i) => reqName(i) || 'an unnamed requirement').join(', ')}, so ${loose.length === 1 ? 'it has' : 'they have'} no element satisfying or verifying ${loose.length === 1 ? 'it' : 'them'}.`);
    const blank = this.d.items.filter((i) => !reqName(i)).length;
    if (blank) messages.push(`${blank} ${blank === 1 ? 'item has' : 'items have'} no name and will be given a placeholder.`);
    this.warning.hidden = !messages.length;
    this.warning.textContent = messages.join(' ');
    const reqs = this.d.items.filter((i) => i.kind !== 'element').length;
    const els = this.d.items.length - reqs;
    this.summary.textContent = `${reqs} ${reqs === 1 ? 'requirement' : 'requirements'}, ${els} ${els === 1 ? 'element' : 'elements'}, ${this.d.relations.length} ${this.d.relations.length === 1 ? 'relationship' : 'relationships'}.`;
  }
}

export { starterRequirements };
