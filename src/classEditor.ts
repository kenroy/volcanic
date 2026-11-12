import { h, uniqueId } from './dom';
import {
  RELATIONS,
  STEREOTYPES,
  VISIBILITIES,
  className,
  classToMermaid,
  duplicateClasses,
  nextClassId,
  starterClasses,
  unrelated,
  type ClassBox,
  type ClassDiagram,
  type Member,
  type Relation,
  type RelationKind,
  type Stereotype,
  type Visibility,
} from './classDiagram';
import { History, type KindEditor, type KindHost, type KindMeta } from './kinds';
import { DIRECTIONS } from './state';
import { field, iconButton, selectControl } from './ui';

/**
 * A class diagram as class cards, each with its members, and a list of relationships written as a sentence:
 * Dog inherits from Animal. Relationships are picked from the classes you have named.
 */
export class ClassEditor implements KindEditor {
  readonly el: HTMLElement;
  private d: ClassDiagram;
  private readonly history: History<ClassDiagram>;
  private readonly initial: string;
  private readonly uid = uniqueId('volcanic-cl');

  private classList!: HTMLElement;
  private relList!: HTMLElement;
  private options!: HTMLElement;
  private warning!: HTMLElement;
  private summary!: HTMLElement;

  constructor(private readonly host: KindHost, diagram: ClassDiagram, pristine = false) {
    this.d = JSON.parse(JSON.stringify(diagram)) as ClassDiagram;
    this.history = new History(this.d);
    this.initial = pristine ? JSON.stringify(this.d) : '';
    this.el = this.build();
    this.renderAll();
  }

  // ───────────────────────────── KindEditor ─────────────────────────────

  source(meta: KindMeta): string {
    return classToMermaid(this.d, meta);
  }

  isPristine(): boolean {
    return this.initial !== '' && JSON.stringify(this.d) === this.initial;
  }

  focus(): void {
    this.classList.querySelector<HTMLElement>('input')?.focus();
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

  private apply(value: ClassDiagram | null, message: string): void {
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
      { class: 'volcanic-kind-toolbar', attrs: { role: 'toolbar', 'aria-label': 'Class diagram tools' } },
      iconButton(this.host.setIcon, 'Add class', 'plus', () => this.addClass()),
      iconButton(this.host.setIcon, 'Add relationship', 'arrow-left-right', () => this.addRelation()),
    );
    this.classList = h('div', { class: 'volcanic-er-entities', attrs: { role: 'group', 'aria-label': 'Classes', 'aria-describedby': helpId } });
    this.relList = h('div', { class: 'volcanic-st-list', attrs: { role: 'group', 'aria-label': 'Relationships', 'aria-describedby': helpId } });
    const help = h('p', {
      class: 'volcanic-sr-only',
      attrs: { id: helpId },
      text: 'Name your classes and give each its attributes and methods, then join classes with relationships. Each relationship reads as a sentence: the first class, how it relates, the second class. Hold Alt with the up and down arrow keys in a row to move it, or use its Move buttons.',
    });
    const canvas = h(
      'div',
      { class: 'volcanic-kind-canvas' },
      h('div', { class: 'volcanic-st-scroll' }, h('h3', { class: 'volcanic-panel-title', text: 'Classes' }), this.classList, h('h3', { class: 'volcanic-panel-title', text: 'Relationships' }), this.relList, help),
    );
    this.options = h('div', { class: 'volcanic-st-options' });
    this.warning = h('p', { class: 'volcanic-radar-warning', attrs: { role: 'status' } });
    this.summary = h('p', { class: 'volcanic-hint' });
    const side = h(
      'section',
      { class: 'volcanic-card volcanic-kind-side', attrs: { 'aria-label': 'About this diagram' } },
      h('div', { class: 'volcanic-panel' }, h('h3', { class: 'volcanic-panel-title', text: 'Layout' }), this.options, this.warning, this.summary),
    );
    return h('div', { class: 'volcanic-kind volcanic-st volcanic-er volcanic-cl' }, toolbar, h('div', { class: 'volcanic-kind-main' }, canvas, side));
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

  private label(id: string): string {
    const c = this.d.classes.find((x) => x.id === id);
    return (c && className(c.name)) || 'an unnamed class';
  }

  private describe(r: Relation): string {
    return `${this.label(r.from)} ${RELATIONS.find((k) => k.id === r.kind)?.name ?? ''} ${this.label(r.to)}`;
  }

  private focusKey(key: string, select = false): boolean {
    const el = this.el.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-key="${key}"]`);
    if (!el) return false;
    el.focus();
    if (select && el instanceof HTMLInputElement) el.select();
    return true;
  }

  private addClass(): void {
    const c: ClassBox = { id: nextClassId(this.d, 'c'), name: '', stereotype: '', members: [] };
    this.d.classes.push(c);
    this.commit();
    this.host.announce('Class added. Type its name.');
    this.focusKey(`cname:${c.id}`);
  }

  private removeClass(id: string): void {
    const at = this.d.classes.findIndex((c) => c.id === id);
    if (at < 0) return;
    const name = this.label(id);
    const before = this.d.relations.length;
    this.d.classes.splice(at, 1);
    this.d.relations = this.d.relations.filter((r) => r.from !== id && r.to !== id);
    const dropped = before - this.d.relations.length;
    this.commit();
    this.host.announce(`Class ${name} removed${dropped ? `, with ${dropped} ${dropped === 1 ? 'relationship' : 'relationships'}` : ''}.`);
    const near = this.d.classes[Math.min(at, this.d.classes.length - 1)];
    if (!near || !this.focusKey(`cname:${near.id}`)) this.el.querySelector<HTMLElement>('button')?.focus();
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

  private addMember(box: ClassBox): void {
    const m: Member = { id: nextClassId(this.d, 'm'), visibility: '+', text: '' };
    box.members.push(m);
    this.commit();
    this.host.announce(`Member added to ${this.label(box.id)}. Type it, such as String name or speak() void.`);
    this.focusKey(`mtext:${m.id}`);
  }

  private removeMember(box: ClassBox, id: string): void {
    const at = box.members.findIndex((m) => m.id === id);
    if (at < 0) return;
    const [gone] = box.members.splice(at, 1);
    this.commit();
    this.host.announce(`Member ${gone.text.trim() || 'unnamed'} removed from ${this.label(box.id)}.`);
    const near = box.members[Math.min(at, box.members.length - 1)];
    if (!near || !this.focusKey(`mtext:${near.id}`)) this.focusKey(`cname:${box.id}`);
  }

  private addRelation(): void {
    const { classes } = this.d;
    if (!classes.length) {
      this.host.announce('Add a class first.');
      return;
    }
    const last = this.d.relations[this.d.relations.length - 1];
    const from = last ? last.to : classes[0].id;
    const other = classes.find((c) => c.id !== from);
    const r: Relation = { id: nextClassId(this.d, 'r'), from, to: other ? other.id : from, kind: 'uses', label: '', fromCount: '', toCount: '' };
    this.d.relations.push(r);
    this.commit();
    this.host.announce(`Relationship added, ${this.label(r.from)} to ${this.label(r.to)}. Choose how they relate.`);
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
    this.renderClasses();
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

  private text(value: string, key: string, label: string, onInput: (v: string) => void, placeholder = ''): HTMLInputElement {
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

  private renderClasses(): void {
    const { classes } = this.d;
    const cards = classes.map((box, index) => {
      const name = this.text(box.name, `cname:${box.id}`, `Name of class ${index + 1}`, (v) => {
        box.name = v;
        this.update(`cname:${box.id}`, true);
      }, 'Class name');
      const kind = selectControl(STEREOTYPES, box.stereotype, (value: Stereotype) => {
        box.stereotype = value;
        this.commit();
      });
      kind.setAttribute('aria-label', `Kind of class ${index + 1}`);
      kind.dataset.key = `cks:${box.id}`;
      const head = h(
        'div',
        { class: 'volcanic-cl-head' },
        this.moveButtons('class', box.id, index, classes.length, (by) => this.moveIn(classes, index, by, 'class', `Class ${this.label(box.id)}`)),
        name,
        kind,
        this.small(`Remove class ${index + 1}`, 'x', `rm:${box.id}`, () => this.removeClass(box.id)),
      );
      this.altMove(head, (by, key) => this.moveIn(classes, index, by, 'class', `Class ${this.label(box.id)}`, key));
      const members = box.members.map((m, mi) => {
        const n = `member ${mi + 1} of ${this.label(box.id)}`;
        const vis = selectControl(VISIBILITIES, m.visibility, (value: Visibility) => {
          m.visibility = value;
          this.commit();
        });
        vis.setAttribute('aria-label', `Visibility of ${n}`);
        vis.dataset.key = `mvis:${m.id}`;
        const row = h(
          'div',
          { class: 'volcanic-cl-member' },
          this.moveButtons('member', m.id, mi, box.members.length, (by) => this.moveIn(box.members, mi, by, 'member', `Member ${m.text.trim() || 'unnamed'}`)),
          vis,
          this.text(m.text, `mtext:${m.id}`, `Text of ${n}`, (v) => {
            m.text = v;
            this.update(`mtext:${m.id}`);
          }, 'String name   or   speak() void'),
          this.small(`Remove ${n}`, 'x', `rmm:${m.id}`, () => this.removeMember(box, m.id)),
        );
        this.altMove(row, (by, k) => this.moveIn(box.members, mi, by, 'member', `Member ${m.text.trim() || 'unnamed'}`, k));
        return row;
      });
      const add = iconButton(this.host.setIcon, `Add member to class ${index + 1}`, 'plus', () => this.addMember(box), 'volcanic-er-add');
      add.dataset.act = `addm:${box.id}`;
      return h('section', { class: 'volcanic-er-card', attrs: { 'aria-label': `Class ${index + 1}: ${this.label(box.id)}` } }, head, h('div', { class: 'volcanic-er-attrs' }, ...members), add);
    });
    this.classList.replaceChildren(...cards);
    if (!cards.length) this.classList.append(h('p', { class: 'volcanic-hint', text: 'No classes yet. Add one with the Add class button.' }));
  }

  /** The classes offered in a picker. Classes that share a name are told apart by number. */
  private choices(): { id: string; name: string }[] {
    const totals = new Map<string, number>();
    const seen = new Map<string, number>();
    for (const c of this.d.classes) {
      const k = (className(c.name) || 'Unnamed class').toLowerCase();
      totals.set(k, (totals.get(k) ?? 0) + 1);
    }
    return this.d.classes.map((c) => {
      const base = className(c.name) || 'Unnamed class';
      const k = base.toLowerCase();
      const n = (seen.get(k) ?? 0) + 1;
      seen.set(k, n);
      return { id: c.id, name: (totals.get(k) ?? 0) > 1 ? `${base} (${n})` : base };
    });
  }

  private renderRelations(): void {
    const { relations } = this.d;
    const choices = this.choices();
    const active = document.activeElement;
    const keep = active instanceof HTMLElement && this.relList.contains(active) ? active.dataset.key : undefined;
    const rows = relations.map((r, index) => {
      const n = `relationship ${index + 1}`;
      const pick = (prefix: string, value: string, label: string, set: (v: string) => void): HTMLSelectElement => {
        const select = selectControl(choices, value, (v) => {
          set(v);
          this.commit();
        });
        select.setAttribute('aria-label', `${label} of ${n}`);
        select.dataset.key = `${prefix}:${r.id}`;
        return select;
      };
      const kind = selectControl(RELATIONS, r.kind, (v: RelationKind) => {
        r.kind = v;
        this.commit();
      });
      kind.setAttribute('aria-label', `How the first class relates in ${n}`);
      kind.dataset.key = `rk:${r.id}`;
      const row = h(
        'div',
        { class: 'volcanic-cl-rel' },
        this.moveButtons('relationship', r.id, index, relations.length, (by) => this.moveIn(relations, index, by, 'relationship', `Relationship ${this.describe(r)}`)),
        pick('rf', r.from, 'First class', (v) => (r.from = v)),
        kind,
        pick('rt', r.to, 'Second class', (v) => (r.to = v)),
        this.text(r.label, `rl:${r.id}`, `Label of ${n}`, (v) => {
          r.label = v;
          this.update(`rl:${r.id}`);
        }, 'Label'),
        this.text(r.fromCount, `rfc:${r.id}`, `How many at the first class in ${n}`, (v) => {
          r.fromCount = v;
          this.update(`rfc:${r.id}`);
        }, 'e.g. 1'),
        this.text(r.toCount, `rtc:${r.id}`, `How many at the second class in ${n}`, (v) => {
          r.toCount = v;
          this.update(`rtc:${r.id}`);
        }, 'e.g. 0..*'),
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
    const names = (list: ClassBox[]): string => list.map((c) => className(c.name) || 'unnamed class').join(', ');
    const messages: string[] = [];
    const dupes = duplicateClasses(this.d);
    if (dupes.length) messages.push(`⚠ More than one class is called ${dupes.join(', ')}. The diagram draws them as one, so give them different names.`);
    const loose = this.d.classes.length > 1 ? unrelated(this.d) : [];
    if (loose.length) messages.push(`${names(loose)} ${loose.length === 1 ? 'has' : 'have'} no relationships.`);
    const blank = this.d.classes.filter((c) => !className(c.name)).length;
    if (blank) messages.push(`${blank} ${blank === 1 ? 'class has' : 'classes have'} no name and will be called Class.`);
    this.warning.hidden = !messages.length;
    this.warning.textContent = messages.join(' ');
    const { classes, relations } = this.d;
    this.summary.textContent = `${classes.length} ${classes.length === 1 ? 'class' : 'classes'}, ${relations.length} ${relations.length === 1 ? 'relationship' : 'relationships'}.`;
  }
}

export { starterClasses };
