/** Helpers for changing the size of a Pele picture without fighting whatever resets it. */

export type Box = [number, number, number, number];

export function viewBoxOf(svg: SVGSVGElement): Box | null {
  const box = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  return box.length === 4 && box.every((n) => Number.isFinite(n)) ? (box as Box) : null;
}

const round = (n: number): number => Math.round(n * 100) / 100;

/** Set an attribute only if it would change, so we never stir up our own observers. */
function setIfChanged(el: Element, name: string, value: string): void {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

/**
 * Change the drawing's width and/or height (in its own units). The width and height attributes follow
 * as absolute values (the picture's own pixels-per-unit, remembered the first time), never as repeated
 * scaling, so calling this over and over cannot make them drift.
 */
export function resizeView(svg: SVGSVGElement, width?: number, height?: number): void {
  const box = viewBoxOf(svg);
  if (!box) return;
  const [x, y, w, h] = box;
  const nw = width ?? w;
  const nh = height ?? h;
  // Pixels per unit, taken from the untouched picture.
  if (!svg.hasAttribute('data-volcanic-scale')) {
    const attrW = Number(svg.getAttribute('width'));
    const attrH = Number(svg.getAttribute('height'));
    svg.setAttribute('data-volcanic-scale', JSON.stringify([Number.isFinite(attrW) && attrW > 0 ? attrW / w : 0, Number.isFinite(attrH) && attrH > 0 ? attrH / h : 0]));
  }
  const [sw, sh] = JSON.parse(svg.getAttribute('data-volcanic-scale') ?? '[0,0]') as [number, number];
  setIfChanged(svg, 'viewBox', `${x} ${y} ${nw} ${nh}`);
  if (sw > 0 && svg.hasAttribute('width')) setIfChanged(svg, 'width', String(round(nw * sw)));
  if (sh > 0 && svg.hasAttribute('height')) setIfChanged(svg, 'height', String(round(nh * sh)));
}

const keepers = new WeakMap<SVGSVGElement, { observer: MutationObserver; heals: number; since: number }>();

/**
 * Pele (or the note) may reset the picture's size after room was made for extra content, which cuts the
 * edge off the drawing. Put the room back when that happens. The sizes to keep are stored on the element
 * as data-volcanic-vbw and data-volcanic-vbh. Gives up if something keeps undoing it, rather than looping.
 */
export function keepSize(svg: SVGSVGElement): void {
  if (keepers.has(svg)) return;
  const state = { observer: new MutationObserver(() => guarded()), heals: 0, since: Date.now() };
  const guarded = (): void => {
    const now = Date.now();
    if (now - state.since > 2000) {
      state.since = now;
      state.heals = 0;
    }
    if (state.heals >= 8) return;
    if (heal(svg)) state.heals += 1;
  };
  state.observer.observe(svg, { attributes: true, attributeFilter: ['viewBox'] });
  keepers.set(svg, state);
}

/** Restore the wanted size if it was reset. True if anything had to change. */
export function heal(svg: SVGSVGElement): boolean {
  const box = viewBoxOf(svg);
  if (!box) return false;
  const wantedW = Number(svg.getAttribute('data-volcanic-vbw'));
  const wantedH = Number(svg.getAttribute('data-volcanic-vbh'));
  const width = Number.isFinite(wantedW) && wantedW > box[2] ? wantedW : undefined;
  const height = Number.isFinite(wantedH) && wantedH > box[3] ? wantedH : undefined;
  if (width === undefined && height === undefined) return false;
  resizeView(svg, width, height);
  return true;
}
