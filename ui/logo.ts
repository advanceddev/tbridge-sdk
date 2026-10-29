/**
 * TBridge brand mark — geometric bridge / connection.
 * Primary brand color aligned with TON / GRAM blue (#0098EA).
 */

/** Official TON-adjacent brand blue used across GRAM / TON ecosystem */
export const TBRIDGE_BRAND_COLOR = '#0098EA';

export interface LogoSvgOptions {
  /** Outline stroke only (header about button) */
  outline?: boolean;
  /** CSS pixel size of the viewBox square */
  size?: number;
  /** Stroke / fill color */
  color?: string;
  className?: string;
}

/**
 * Minimal mark: two nodes joined by a curved bridge (connection / “T” hint).
 * Pure SVG DOM — no external assets.
 */
export function createLogoSvg(opts: LogoSvgOptions = {}): SVGSVGElement {
  const size = opts.size ?? 20;
  const color = opts.color ?? TBRIDGE_BRAND_COLOR;
  const outline = opts.outline ?? false;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (opts.className) svg.setAttribute('class', opts.className);

  const ns = 'http://www.w3.org/2000/svg';

  if (outline) {
    // Outline mark for circular chrome button
    const path = document.createElementNS(ns, 'path');
    path.setAttribute(
      'd',
      // Left pier → arch → right pier; small gap = “bridge”
      'M6 22 V12 C6 8 10 6 16 6 C22 6 26 8 26 12 V22',
    );
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '2.25');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);

    // Center connection node
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', '16');
    dot.setAttribute('cy', '14');
    dot.setAttribute('r', '2.25');
    dot.setAttribute('fill', 'none');
    dot.setAttribute('stroke', color);
    dot.setAttribute('stroke-width', '2');
    svg.appendChild(dot);
  } else {
    // Solid mark for about panel / footer
    const path = document.createElementNS(ns, 'path');
    path.setAttribute(
      'd',
      'M7 23 V13 C7 9.5 10.5 7.5 16 7.5 C21.5 7.5 25 9.5 25 13 V23 ' +
        'H22 V13.2 C22 11.2 19.5 10 16 10 C12.5 10 10 11.2 10 13.2 V23 H7 Z',
    );
    path.setAttribute('fill', color);
    svg.appendChild(path);

    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', '16');
    dot.setAttribute('cy', '14.5');
    dot.setAttribute('r', '2.5');
    dot.setAttribute('fill', color);
    svg.appendChild(dot);
  }

  return svg;
}

/** Wordmark row: mark + “TBridge” text node */
export function createLogoWordmark(opts?: {
  size?: number;
  color?: string;
  className?: string;
}): HTMLElement {
  const row = document.createElement('span');
  row.className = opts?.className ?? 'tbridge-wordmark';
  row.appendChild(
    createLogoSvg({
      size: opts?.size ?? 14,
      color: opts?.color ?? TBRIDGE_BRAND_COLOR,
      outline: false,
    }),
  );
  const label = document.createElement('span');
  label.className = 'tbridge-wordmark-text';
  label.textContent = 'TBridge';
  row.appendChild(label);
  return row;
}
