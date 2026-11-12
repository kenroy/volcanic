import { h, uniqueId } from './dom';
import type { SetIcon } from './kinds';

export function iconButton(setIcon: SetIcon, label: string, icon: string, onClick: () => void, extraClass = ''): HTMLButtonElement {
  const iconEl = h('span', { class: 'volcanic-icon', attrs: { 'aria-hidden': 'true' } });
  setIcon(iconEl, icon);
  return h(
    'button',
    {
      class: `volcanic-button ${extraClass}`.trim(),
      attrs: { type: 'button' },
      on: {
        click: (event) => {
          if ((event.currentTarget as HTMLElement).getAttribute('aria-disabled') === 'true') return;
          onClick();
        },
      },
    },
    iconEl,
    h('span', { text: label }),
  );
}

/** A labelled form control, with an optional hint tied to it for screen readers. */
export function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const id = control.id || uniqueId('volcanic-field');
  control.id = id;
  const wrap = h('div', { class: 'volcanic-field' }, h('label', { text: label, attrs: { for: id } }), control);
  if (hint) {
    const hintId = `${id}-hint`;
    control.setAttribute('aria-describedby', hintId);
    wrap.append(h('p', { class: 'volcanic-hint', text: hint, attrs: { id: hintId } }));
  }
  return wrap;
}

export function selectControl<T extends string>(options: { id: T; name: string }[], value: T, onChange: (value: T) => void): HTMLSelectElement {
  const select = h('select', { class: 'dropdown volcanic-select', on: { change: () => onChange(select.value as T) } });
  for (const option of options) select.append(h('option', { text: option.name, attrs: { value: option.id } }));
  select.value = value;
  return select;
}

export function checkbox(label: string, checked: boolean, onChange: (value: boolean) => void): HTMLElement {
  const input = h('input', { attrs: { type: 'checkbox' }, on: { change: () => onChange(input.checked) } });
  input.checked = checked;
  return h('label', { class: 'volcanic-check' }, input, h('span', { text: label }));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface SwatchOption {
  id: string;
  name: string;
  description?: string;
  colours: string[];
}

export interface SwatchSelect {
  el: HTMLElement;
  /** Show another option as chosen, without calling onChange. */
  set(id: string, options?: SwatchOption[]): void;
}

function strip(colours: string[]): HTMLElement {
  const wrap = h('span', { class: 'volcanic-swatch-strip', attrs: { 'aria-hidden': 'true' } });
  for (const colour of colours) {
    const dot = h('span', { class: 'volcanic-swatch-dot' });
    dot.style.background = colour;
    wrap.append(dot);
  }
  return wrap;
}

/**
 * A drop-down whose options carry colour swatches (a native select cannot draw them).
 * Follows the select-only combobox pattern: focus stays on the button and the list is
 * driven with the arrow keys, Home, End, Enter, Space and Escape.
 */
export function swatchSelect(id: string, labelledBy: string, initial: SwatchOption[], value: string, onChange: (id: string) => void): SwatchSelect {
  let options = initial;
  let current = value;
  let active = -1;
  let open = false;
  const listId = `${id}-list`;
  const stripSlot = h('span', { class: 'volcanic-swatch-slot' });
  const name = h('span', { class: 'volcanic-swatch-name' });
  const button = h(
    'button',
    {
      class: 'volcanic-swatch-button',
      attrs: { id, type: 'button', role: 'combobox', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-controls': listId, 'aria-labelledby': `${labelledBy} ${id}` },
    },
    stripSlot,
    name,
    h('span', { class: 'volcanic-swatch-chevron', attrs: { 'aria-hidden': 'true' } }),
  );
  const list = h('ul', { class: 'volcanic-swatch-list', attrs: { id: listId, role: 'listbox', 'aria-labelledby': labelledBy, hidden: true } });
  const el = h('div', { class: 'volcanic-swatch-select' }, button, list);

  const items = (): HTMLElement[] => Array.from(list.children) as HTMLElement[];

  const paint = (): void => {
    const option = options.find((o) => o.id === current) ?? options[0];
    name.textContent = option.name;
    stripSlot.replaceChildren(strip(option.colours));
    list.replaceChildren(
      ...options.map((o, index) => {
        const item = h(
          'li',
          { class: 'volcanic-swatch-option', attrs: { id: `${id}-opt-${index}`, role: 'option', 'aria-selected': String(o.id === current), 'data-id': o.id } },
          strip(o.colours),
          h('span', { class: 'volcanic-swatch-text' }, h('span', { class: 'volcanic-swatch-name', text: o.name }), o.description ? h('span', { class: 'volcanic-swatch-desc', text: o.description }) : null),
        );
        item.addEventListener('pointerdown', (event) => event.preventDefault());
        item.addEventListener('click', () => choose(index));
        item.addEventListener('pointermove', () => highlight(index, false));
        return item;
      }),
    );
  };

  const highlight = (index: number, scroll = true): void => {
    active = index;
    items().forEach((item, i) => item.classList.toggle('is-active', i === index));
    if (index >= 0) {
      button.setAttribute('aria-activedescendant', `${id}-opt-${index}`);
      if (scroll) items()[index]?.scrollIntoView({ block: 'nearest' });
    } else button.removeAttribute('aria-activedescendant');
  };

  const onOutside = (event: Event): void => {
    if (!el.contains(event.target as Node)) close(false);
  };

  const show = (): void => {
    if (open) return;
    open = true;
    list.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    highlight(Math.max(0, options.findIndex((o) => o.id === current)));
    document.addEventListener('pointerdown', onOutside, true);
  };

  function close(refocus: boolean): void {
    if (!open) return;
    open = false;
    list.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    button.removeAttribute('aria-activedescendant');
    document.removeEventListener('pointerdown', onOutside, true);
    if (refocus) button.focus();
  }

  function choose(index: number): void {
    const option = options[index];
    close(true);
    if (!option || option.id === current) return;
    current = option.id;
    paint();
    onChange(option.id);
  }

  button.addEventListener('click', () => (open ? close(false) : show()));
  button.addEventListener('blur', () => window.setTimeout(() => !el.contains(document.activeElement) && close(false), 0));
  button.addEventListener('keydown', (event) => {
    const last = options.length - 1;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (!open) show();
        else highlight(event.key === 'ArrowDown' ? Math.min(last, active + 1) : Math.max(0, active - 1));
        break;
      }
      case 'Home':
      case 'End':
        if (!open) return;
        event.preventDefault();
        highlight(event.key === 'Home' ? 0 : last);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (open) choose(active);
        else show();
        break;
      case 'Escape':
        if (!open) return;
        // Close the list only, not the whole editor.
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
          const at = options.findIndex((o, i) => i > active && o.name.toLowerCase().startsWith(event.key.toLowerCase()));
          const found = at >= 0 ? at : options.findIndex((o) => o.name.toLowerCase().startsWith(event.key.toLowerCase()));
          if (found >= 0) {
            if (!open) show();
            highlight(found);
          }
        }
    }
  });

  paint();
  return {
    el,
    set(id, next) {
      current = id;
      if (next) options = next;
      const wasOpen = open;
      paint();
      if (wasOpen) highlight(Math.max(0, options.findIndex((o) => o.id === current)));
    },
  };
}

export interface ResizeOptions {
  /** Smallest height, in pixels. */
  min: number;
  /** Largest height, in pixels (checked each time, since windows change size). */
  max: () => number;
  /** Where the chosen height is remembered between sessions. */
  storageKey: string;
  /** Called after the height changes, so the owner can react (for example to relayout). */
  onResize?: (height: number) => void;
}

function remembered(key: string): number | null {
  try {
    const value = Number(window.localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function remember(key: string, value: number | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, String(Math.round(value)));
  } catch {
    // Remembering the height is a convenience only.
  }
}

/**
 * A bar to drag, or to move with the arrow keys, that changes the height of `target`.
 * Follows the window-splitter pattern: a focusable separator with its current value exposed.
 */
export function resizeHandle(target: HTMLElement, options: ResizeOptions): HTMLElement {
  const grip = h('span', { class: 'volcanic-resize-grip', attrs: { 'aria-hidden': 'true' } });
  const handle = h(
    'div',
    {
      class: 'volcanic-resize-handle',
      attrs: {
        role: 'separator',
        'aria-orientation': 'horizontal',
        'aria-label': 'Editor height',
        'aria-describedby': '',
        tabindex: '0',
        title: 'Drag to change the height. Double-click to reset.',
      },
    },
    grip,
  );
  handle.removeAttribute('aria-describedby');

  const clampHeight = (value: number): number => Math.round(clamp(value, options.min, Math.max(options.min, options.max())));
  const current = (): number => target.getBoundingClientRect().height;
  const sync = (): void => {
    handle.setAttribute('aria-valuemin', String(options.min));
    handle.setAttribute('aria-valuemax', String(Math.round(Math.max(options.min, options.max()))));
    handle.setAttribute('aria-valuenow', String(Math.round(current())));
    handle.setAttribute('aria-valuetext', `${Math.round(current())} pixels`);
  };
  const apply = (value: number, save: boolean): void => {
    const height = clampHeight(value);
    target.style.height = `${height}px`;
    if (save) remember(options.storageKey, height);
    sync();
    options.onResize?.(height);
  };

  const saved = remembered(options.storageKey);
  if (saved !== null) apply(saved, false);
  window.setTimeout(sync, 0);

  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = current();
    handle.setPointerCapture(event.pointerId);
    handle.classList.add('is-dragging');
    const onMove = (move: PointerEvent): void => apply(startHeight + move.clientY - startY, false);
    const onUp = (): void => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      handle.classList.remove('is-dragging');
      remember(options.storageKey, current());
      sync();
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  });

  handle.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 120 : 24;
    let next: number | null = null;
    if (event.key === 'ArrowDown') next = current() + step;
    else if (event.key === 'ArrowUp') next = current() - step;
    else if (event.key === 'PageDown') next = current() + 240;
    else if (event.key === 'PageUp') next = current() - 240;
    else if (event.key === 'Home') next = options.min;
    else if (event.key === 'End') next = options.max();
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    apply(next, true);
  });

  handle.addEventListener('dblclick', () => {
    target.style.removeProperty('height');
    remember(options.storageKey, null);
    sync();
    options.onResize?.(current());
  });

  return handle;
}
