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

/**
 * Mount an overlay in the browser top layer via <dialog>.showModal(): it then sits
 * above host <dialog>s / popovers whatever their z-index (ton-connect/sdk#185), and
 * the newest modal dialog is the interactive one. Falls back to a plain body append
 * where showModal is unavailable. Returns the unmount function.
 */
export function mountOnTop(node: HTMLElement): () => void {
  const host = document.createElement('dialog');
  host.className = 'tbridge-top';
  host.append(node);
  // Escape is handled by our own keydown listeners (which also clean up).
  host.addEventListener('cancel', (e) => e.preventDefault());
  document.body.append(host);
  try {
    host.showModal();
  } catch {
    host.setAttribute('open', '');
  }
  return () => {
    try {
      host.close();
    } catch {
      /* ignore */
    }
    host.remove();
  };
}

export function lockScroll(): void {
  document.documentElement.classList.add('tbridge-scroll-lock');
  document.body.classList.add('tbridge-scroll-lock');
}

export function unlockScroll(): void {
  document.documentElement.classList.remove('tbridge-scroll-lock');
  document.body.classList.remove('tbridge-scroll-lock');
}
