/**
 * Shared DOM helpers for optional vanilla UI.
 * Zero framework — plain createElement.
 */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function capitalizePlatform(platform: string): string {
  if (!platform) return platform;
  return platform.charAt(0).toUpperCase() + platform.slice(1).toLowerCase();
}

/** Matches CSS breakpoint used for desktop chrome (external close / about). */
export const isDesktop = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(min-width: 520px)').matches;

export function lockScroll(): void {
  document.documentElement.classList.add('tbridge-scroll-lock');
  document.body.classList.add('tbridge-scroll-lock');
}

export function unlockScroll(): void {
  document.documentElement.classList.remove('tbridge-scroll-lock');
  document.body.classList.remove('tbridge-scroll-lock');
}
