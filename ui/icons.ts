/**
 * Inline SVG icons for modal chrome (no external assets).
 */

function svgEl(
  tag: string,
  attrs: Record<string, string>,
  children: SVGElement[] = [],
): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  for (const c of children) el.appendChild(c);
  return el;
}

function iconRoot(size: number): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('fill', 'none');
  return svg;
}

/** X mark — close */
export function createCloseIcon(size = 18): SVGSVGElement {
  const svg = iconRoot(size);
  svg.appendChild(
    svgEl('path', {
      d: 'M6 6l12 12M18 6L6 18',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
    }),
  );
  return svg;
}

/** Chevron left — back */
export function createBackIcon(size = 18): SVGSVGElement {
  const svg = iconRoot(size);
  svg.appendChild(
    svgEl('path', {
      d: 'M15 6l-6 6 6 6',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }),
  );
  return svg;
}
