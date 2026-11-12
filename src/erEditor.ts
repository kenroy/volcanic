import { h, uniqueId } from './dom';
import { CARDINALITIES, KEYS, duplicateEntities, entityName, erToMermaid, nextErId, starterEr, unconnected, type Attribute, type Cardinality, type Entity, type ErDiagram, type Key, type Relationship } from './er';
import { History, type KindEditor, type KindHost, type KindMeta } from './kinds';
import { DIRECTIONS } from './state';
import { field, iconButton, selectControl } from './ui';

/**
 * An entity relationship diagram as entity cards, each with its attributes, and a list of relationships written
 * as a sentence: one CUSTOMER places zero or more ORDER. Relationships are picked from the entities you have named.
 */
export class ErEditor implements KindEditor {
  readonly el: HTMLElement;
  private d: ErDiagram;
  private readonly history: History<ErDiagram>;
  private readonly initial: string;
  private readonly uid = uniqueId('volcanic-er');

  private entityList!: HTMLElement;
  private relList!: HTMLElement;
  private options!: HTMLElement;
  private warning!: HTMLElement;
  private summary!: HTMLElement;

  constructor(private readonly host: KindHost, diagram: ErDiagram, pristine = false) {
    this.d = JSON.parse(JSON.stringify(diagram)) as ErDiagram;
    this.history = new History(this.d);
    this.initial = pristine ? JSON.stringify(this.d) : '';
    this.el = this.build();
    this.renderAll();
  }

  // ───────────────────────────── KindEditor ─────────────────────────────

  source(meta: KindMeta): string {
    return erToMermaid(this.d, meta);
  }

  isPristine(): boolean {
    return this.initial !== '' && JSON.stringify(this.d) === this.initial;
  }

  focus(): void {
    this.entityList.querySelector<HTMLElement>('input')?.focus();
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

  private apply(value: ErDiagram | null, message: string): void {
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
      { class: 'volcanic-kind-toolbar', attrs: { role: 'toolbar', 'aria-label': 'Entity relationship diagram tools' } },
      iconButton(this.host.setIcon, 'Add entity', 'plus', () => this.addEntity()),
      iconButton(this.host.setIcon, 'Add relationship', 'arrow-left-right', () => this.addRelationship()),
    );
    this.entityList = h('div', { class: 'volcanic-er-entities', attrs: { role: 'group', 'aria-label': 'Entities', 'aria-describedby': helpId } });
    this.relList = h('div', { class: 'volcanic-st-list', attrs: { role: 'group', 'aria-label': 'Relationships', 'aria-describedby': helpId } });
    const help = h('p', {
      class: 'volcanic-sr-only',
      attrs: { id: helpId },
      text: 'Name your entities and give each its attributes, then join entities with relationships. Each relationship reads as a sentence: how many of the first entity, the label, how many of the second. Hold Alt with the up and down arrow keys in a row to move it, or use its Move buttons.',
    });
    const canvas = h(
      'div',
      { class: 'volcanic-kind-canvas' },
      h('div', { class: 'volcanic-st-scroll' }, h('h3', { class: 'volcanic-panel-title', text: 'Entities' }), this.entityList, h('h3', { class: 'volcanic-panel-title', text: 'Relationships' }), this.relList, help),
    );
    this.options = h('div', { class: 'volcanic-st-options' });
    this.warning = h('p', { class: 'volcanic-radar-warning', attrs: { role: 'status' } });
    this.summary = h('p', { class: 'volcanic-hint' });
    const side = h(
      'section',
      { class: 'volcanic-card volcanic-kind-side', attrs: { 'aria-label': 'About this diagram' } },
      h('div', { class: 'volcanic-panel' }, h('h3', { class: 'volcanic-panel-title', text: 'Layout' }), this.options, this.warning, this.summary),
    );
    return h('div', { class: 'volcanic-kind volcanic-st volcanic-er' }, toolbar, h('div', { class: 'volcanic-kind-main' }, canvas, side));
  }

  // ───────────────────────────── Changing the diagram ─────────────────────────────

  private commit(tag = ''): void {
    this.history.push(this.d, tag);
    this.host.changed();
    this.renderAll();
  }

  /** Typing: record it and refresh the preview, relationship pickers and notes, but leave the field being typed in alone. */
  private update(tag: string, pickers = false): void {
    this.history.push(this.d, tag);
    this.host.changed();
    if (pickers) this.renderRelationships();
    this.renderNotes();
  }

  private label(id: string): string {
    const e = this.d.entities.find((x) => x.id === id);
    return (e && entityName(e.name)) || 'an unnamed entity';
  }

  private describe(r: Relationship): string {
    return `${this.label(r.a)} ${r.label.trim() || 'to'} ${this.label(r.b)}`;
  }

  private focusKey(key: string, select = false): boolean {
    const el = this.el.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-key="${key}"]`);
    if (!el) return false;
    el.focus();
    if (select && el instanceof HTMLInputElement) el.select();
    return true;
  }

  private addEntity(): void {
    const e: Entity = { id: nextErId(this.d, 'e'), name: '', attributes: [] };
    this.d.entities.push(e);
    this.commit();
    this.host.announce('Entity added. Type its name.');
    this.focusKey(`ename:${e.id}`);
  }

  private removeEntity(id: string): void {
    const at = this.d.entities.findIndex((e) => e.id === id);
    if (at < 0) return;
    const name = this.label(id);
    const before = this.d.relationships.length;
    this.d.entities.splice(at, 1);
    this.d.relationships = this.d.relationships.filter((r) => r.a !== id && r.b !== id);
    const dropped = before - this.d.relationships.length;
    this.commit();
    this.host.announce(`Entity ${name} removed${dropped ? `, with ${dropped} ${dropped === 1 ? 'relationship' : 'relationships'}` : ''}.`);
    const near = this.d.entities[Math.min(at, this.d.entities.length - 1)];
    if (!near || !this.focusKey(`ename:${near.id}`)) this.el.querySelector<HTMLElement>('button')?.focus();
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

  private addAttribute(entity: Entity): void {
    const a: Attribute = { id: nextErId(this.d, 'a'), type: 'string', name: '', key: '', comment: '' };
    entity.attributes.push(a);
    this.commit();
    this.host.announce(`Attribute added to ${this.label(entity.id)}. Type its name.`);
    this.focusKey(`aname:${a.id}`);
  }

  private removeAttribute(entity: Entity, id: string): void {
    const at = entity.attributes.findIndex((a) => a.id === id);
    if (at < 0) return;
    const [gone] = entity.attributes.splice(at, 1);
    this.commit();
    this.host.announce(`Attribute ${gone.name.trim() || 'unnamed'} removed from ${this.label(entity.id)}.`);
    const near = entity.attributes[Math.min(at, entity.attributes.length - 1)];
    if (!near || !this.focusKey(`aname:${near.id}`)) this.focusKey(`ename:${entity.id}`);
  }

  private addRelationship(): void {
    const { entities } = this.d;
    if (!entities.length) {
      this.host.announce('Add an entity first.');
      return;
    }
    const last = this.d.relationships[this.d.relationships.length - 1];
    const a = last ? last.b : entities[0].id;
    const other = entities.find((e) => e.id !== a);
    const r: Relationship = { id: nextErId(this.d, 'r'), a, b: other ? other.id : a, cardA: 'one', cardB: 'zeroMany', identifying: true, label: '' };
    this.d.relationships.push(r);
    this.commit();
    this.host.announce(`Relationship added, ${this.label(r.a)} to ${this.label(r.b)}. Choose how they relate.`);
    this.focusKey(`ra:${r.id}`);
  }

  private removeRelationship(id: string): void {
    const at = this.d.relationships.findIndex((r) => r.id === id);
    if (at < 0) return;
    const [gone] = this.d.relationships.splice(at, 1);
    this.commit();
    this.host.announce(`Relationship ${this.describe(gone)} removed.`);
    const near = this.d.relationships[Math.min(at, this.d.relationships.length - 1)];
    if (!near || !this.focusKey(`ra:${near.id}`)) this.el.querySelector<HTMLElement>('button')?.focus();
  }

  // ───────────────────────────── Drawing ─────────────────────────────

  private renderAll(): void {
    const active = document.activeElement;
    const inside = active instanceof HTMLElement && this.el.contains(active);
    const keep = inside ? active.dataset.key : undefined;
    const keepAct = inside && !keep ? active.dataset.act : undefined;
    this.renderEntities();
    this.renderRelationships();
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

  private renderEntities(): void {
    const { entities } = this.d;
    const cards = entities.map((entity, index) => {
      const name = this.text(entity.name, `ename:${entity.id}`, `Name of entity ${index + 1}`, (v) => {
        entity.name = v;
        this.update(`ename:${entity.id}`, true);
      }, 'Entity name');
      const head = h(
        'div',
        { class: 'volcanic-er-head' },
        this.moveButtons('entity', entity.id, index, entities.length, (by) => this.moveIn(entities, index, by, 'entity', `Entity ${this.label(entity.id)}`)),
        name,
        this.small(`Remove entity ${index + 1}`, 'x', `rm:${entity.id}`, () => this.removeEntity(entity.id)),
      );
      this.altMove(head, (by, key) => this.moveIn(entities, index, by, 'entity', `Entity ${this.label(entity.id)}`, key));
      const attrs = entity.attributes.map((a, ai) => {
        const n = `attribute ${ai + 1} of ${this.label(entity.id)}`;
        const key = selectControl(KEYS, a.key, (value: Key) => {
          a.key = value;
          this.commit();
        });
        key.setAttribute('aria-label', `Key of ${n}`);
        key.dataset.key = `akey:${a.id}`;
        const row = h(
          'div',
          { class: 'volcanic-er-attr' },
          this.moveButtons(`attribute`, a.id, ai, entity.attributes.length, (by) => this.moveIn(entity.attributes, ai, by, 'attribute', `Attribute ${a.name.trim() || 'unnamed'}`)),
          this.text(a.type, `atype:${a.id}`, `Type of ${n}`, (v) => {
            a.type = v;
            this.update(`atype:${a.id}`);
          }, 'Type'),
          this.text(a.name, `aname:${a.id}`, `Name of ${n}`, (v) => {
            a.name = v;
            this.update(`aname:${a.id}`);
          }, 'Name'),
          key,
          this.text(a.comment, `acomment:${a.id}`, `Comment on ${n}`, (v) => {
            a.comment = v;
            this.update(`acomment:${a.id}`);
          }, 'Comment'),
          this.small(`Remove ${n}`, 'x', `rma:${a.id}`, () => this.removeAttribute(entity, a.id)),
        );
        this.altMove(row, (by, k) => this.moveIn(entity.attributes, ai, by, 'attribute', `Attribute ${a.name.trim() || 'unnamed'}`, k));
        return row;
      });
      const add = iconButton(this.host.setIcon, `Add attribute to entity ${index + 1}`, 'plus', () => this.addAttribute(entity), 'volcanic-er-add');
      add.dataset.act = `adda:${entity.id}`;
      return h('section', { class: 'volcanic-er-card', attrs: { 'aria-label': `Entity ${index + 1}: ${this.label(entity.id)}` } }, head, h('div', { class: 'volcanic-er-attrs' }, ...attrs), add);
    });
    this.entityList.replaceChildren(...cards);
    if (!cards.length) this.entityList.append(h('p', { class: 'volcanic-hint', text: 'No entities yet. Add one with the Add entity button.' }));
  }

  /** The entities offered in a picker. Entities that share a name are told apart by number. */
  private choices(): { id: string; name: string }[] {
    const totals = new Map<string, number>();
    const seen = new Map<string, number>();
    for (const e of this.d.entities) {
      const k = (entityName(e.name) || 'Unnamed entity').toLowerCase();
      totals.set(k, (totals.get(k) ?? 0) + 1);
    }
    return this.d.entities.map((e) => {
      const base = entityName(e.name) || 'Unnamed entity';
      const k = base.toLowerCase();
      const n = (seen.get(k) ?? 0) + 1;
      seen.set(k, n);
      return { id: e.id, name: (totals.get(k) ?? 0) > 1 ? `${base} (${n})` : base };
    });
  }

  private renderRelationships(): void {
    const { relationships } = this.d;
    const choices = this.choices();
    const active = document.activeElement;
    const keep = active instanceof HTMLElement && this.relList.contains(active) ? active.dataset.key : undefined;
    const rows = relationships.map((r, index) => {
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
      const card = (prefix: string, value: Cardinality, label: string, set: (v: Cardinality) => void): HTMLSelectElement => {
        const select = selectControl(CARDINALITIES, value, (v) => {
          set(v);
          this.commit();
        });
        select.setAttribute('aria-label', `${label} of ${n}`);
        select.dataset.key = `${prefix}:${r.id}`;
        return select;
      };
      const solid = h('input', { attrs: { type: 'checkbox', 'aria-label': `Solid line for ${n}`, 'data-key': `ri:${r.id}` } });
      solid.checked = r.identifying;
      solid.addEventListener('change', () => {
        r.identifying = solid.checked;
        this.history.push(this.d);
        this.host.changed();
      });
      const row = h(
        'div',
        { class: 'volcanic-er-rel' },
        this.moveButtons('relationship', r.id, index, relationships.length, (by) => this.moveIn(relationships, index, by, 'relationship', `Relationship ${this.describe(r)}`)),
        pick('ra', r.a, 'First entity', (v) => (r.a = v)),
        card('rca', r.cardA, 'How many of the first entity', (v) => (r.cardA = v)),
        this.text(r.label, `rl:${r.id}`, `Label of ${n}`, (v) => {
          r.label = v;
          this.update(`rl:${r.id}`);
        }, 'e.g. places'),
        card('rcb', r.cardB, 'How many of the second entity', (v) => (r.cardB = v)),
        pick('rb', r.b, 'Second entity', (v) => (r.b = v)),
        h('label', { class: 'volcanic-check volcanic-er-solid', attrs: { title: 'Solid line: an identifying relationship. Clear it for a dotted line.' } }, solid, h('span', { text: 'Solid' })),
        this.small(`Remove ${n}`, 'x', `rmr:${r.id}`, () => this.removeRelationship(r.id)),
      );
      this.altMove(row, (by, k) => this.moveIn(relationships, index, by, 'relationship', `Relationship ${this.describe(r)}`, k));
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
    const names = (list: Entity[]): string => list.map((e) => entityName(e.name) || 'unnamed entity').join(', ');
    const messages: string[] = [];
    const dupes = duplicateEntities(this.d);
    if (dupes.length) messages.push(`⚠ More than one entity is called ${dupes.join(', ')}. The diagram draws them as one, so give them different names.`);
    const loose = this.d.entities.length > 1 ? unconnected(this.d) : [];
    if (loose.length) messages.push(`${names(loose)} ${loose.length === 1 ? 'has' : 'have'} no relationships.`);
    const blank = this.d.entities.filter((e) => !entityName(e.name)).length;
    if (blank) messages.push(`${blank} ${blank === 1 ? 'entity has' : 'entities have'} no name and will be called Entity.`);
    this.warning.hidden = !messages.length;
    this.warning.textContent = messages.join(' ');
    const { entities, relationships } = this.d;
    this.summary.textContent = `${entities.length} ${entities.length === 1 ? 'entity' : 'entities'}, ${relationships.length} ${relationships.length === 1 ? 'relationship' : 'relationships'}.`;
  }
}

export { starterEr };
