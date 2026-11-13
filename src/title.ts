import type { TitleAlign } from './model';

/** Space kept between the title and the edge of the picture. */
const EDGE = 8;

/**
 * Pele always centres a diagram's title. Move it to the left or right edge of
 * the drawing instead. Safe to call again after every re-render.
 */
export function alignTitle(root: Element, align: TitleAlign): void {
  const svg = root.instanceOf(SVGSVGElement) ? root : root.querySelector('svg');
  // Pele's class first; Mermaid.js names its title "flowchartTitleText" and similar.
  const title = svg?.querySelector('text.pele-title, text[class$="TitleText"]');
  if (!svg || !title || align === 'center') return;
  const box = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  if (box.length !== 4 || box.some((n) => !Number.isFinite(n))) return;

  // The title can sit inside shifted groups; work in its own coordinates.
  let shift = 0;
  for (let el = title.parentElement; el && el !== (svg as Element); el = el.parentElement) {
    const match = /translate\(\s*(-?[\d.]+)/.exec(el.getAttribute('transform') ?? '');
    if (match) shift += Number(match[1]);
  }
  const x = (align === 'left' ? box[0] + EDGE : box[0] + box[2] - EDGE) - shift;
  title.setAttribute('text-anchor', align === 'left' ? 'start' : 'end');
  if (title.hasAttribute('x')) title.setAttribute('x', String(x));
  for (const span of Array.from(title.querySelectorAll('tspan'))) span.setAttribute('x', String(x));
}
