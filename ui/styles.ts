/**
 * Inline CSS for default UI components.
 * Theme via [data-tbridge-theme="dark"|"light"] on overlay.
 */

const STYLE_ID = 'tbridge-ui-styles';

const CSS = `
html.tbridge-scroll-lock,
html.tbridge-scroll-lock body {
  overflow: hidden !important;
  overscroll-behavior: none;
  touch-action: none;
}
body.tbridge-scroll-lock {
  overflow: hidden !important;
  position: relative;
}

.tbridge-overlay {
  --tb-bg: #0c0c0e;
  --tb-fg: #f4f4f5;
  --tb-muted: #a1a1aa;
  --tb-faint: #71717a;
  --tb-surface: rgba(255, 255, 255, 0.06);
  --tb-surface-2: rgba(255, 255, 255, 0.1);
  --tb-accent: #3b82f6;
  --tb-danger: #f87171;
  --tb-scrim: rgba(0, 0, 0, 0.6);
  --tb-qr-bg: #ffffff;
  --tb-icon-bg: #1a1a1e;

  position: fixed;
  inset: 0;
  z-index: 2147483646;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: var(--tb-scrim);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  -webkit-tap-highlight-color: transparent;
  color: var(--tb-fg);
}
.tbridge-overlay[data-tbridge-theme="light"] {
  --tb-bg: #fafafa;
  --tb-fg: #18181b;
  --tb-muted: #52525b;
  --tb-faint: #71717a;
  --tb-surface: rgba(0, 0, 0, 0.04);
  --tb-surface-2: rgba(0, 0, 0, 0.08);
  --tb-accent: #2563eb;
  --tb-danger: #dc2626;
  --tb-scrim: rgba(15, 15, 20, 0.4);
  --tb-qr-bg: #ffffff;
  --tb-icon-bg: #e4e4e7;
}

@media (min-width: 520px) {
  .tbridge-overlay {
    align-items: center;
  }
}

.tbridge-modal-wrapper {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 16px;
  width: 100%;
  justify-content: center;
}

@media (min-width: 520px) {
  .tbridge-modal-wrapper {
    width: auto;
  }
}

.tbridge-buttons {
  display: none;
}

@media (min-width: 520px) {
  .tbridge-buttons {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-shrink: 0;
  }
}

.tbridge-modal {
  width: 100%;
  max-height: min(88vh, 640px);
  background: var(--tb-bg);
  border-radius: 24px 24px 0 0;
  box-shadow: 0 -12px 48px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: tbridge-slide-up 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

@media (min-width: 520px) {
  .tbridge-modal {
    min-width: 420px;
    width: auto;
    border-radius: 24px;
    animation: tbridge-fade-in 0.22s cubic-bezier(0.22, 1, 0.36, 1);
  }
}

@keyframes tbridge-slide-up {
  from { transform: translateY(28px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes tbridge-fade-in {
  from { transform: scale(0.96) translateY(8px); opacity: 0; }
  to { transform: scale(1) translateY(0); opacity: 1; }
}

.tbridge-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 16px 16px 8px;
  flex-shrink: 0;
}

.tbridge-header-start {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.tbridge-title {
  margin: 0;
  font-size: 17px;
  font-weight: 650;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--tb-fg);
}

.tbridge-back,
.tbridge-close {
  appearance: none;
  border: 0;
  background: var(--tb-surface);
  color: var(--tb-muted);
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
}

.tbridge-back:hover,
.tbridge-close:hover {
  background: var(--tb-surface-2);
  color: var(--tb-fg);
}

.tbridge-back:active,
.tbridge-close:active {
  transform: scale(0.92);
}

@media (min-width: 520px) {
  .tbridge-back,
  .tbridge-close {
    width: 40px;
    height: 40px;
    font-size: 20px;
    background: var(--tb-bg);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }
  
  .tbridge-back:hover,
  .tbridge-close:hover {
    background: var(--tb-icon-bg);
  }
  
  .tbridge-back:active,
  .tbridge-close:active {
    transform: scale(0.92);
  }
}

.tbridge-body {
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  -ms-overflow-style: none;
  padding: 8px 16px 12px;
  flex: 1;
  min-height: 0;
  box-sizing: border-box;
  width: 100%;
}

.tbridge-body::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

.tbridge-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px 6px;
  width: 100%;
  box-sizing: border-box;
  padding-bottom: 8px;
}

.tbridge-item {
  appearance: none;
  border: 0;
  background: transparent;
  color: inherit;
  border-radius: 16px;
  padding: 10px 4px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  text-align: center;
  min-width: 0;
  max-width: 100%;
  position: relative;
  transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1),
    background 0.15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .tbridge-item:hover {
    transform: translateY(-4px);
    background: var(--tb-surface);
  }
  .tbridge-item:hover .tbridge-item-icon {
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.25);
  }
}

.tbridge-item:active {
  transform: translateY(-2px) scale(0.98);
  background: var(--tb-surface);
}

.tbridge-item:focus-visible {
  outline: none;
  background: var(--tb-surface);
}

.tbridge-item-icon {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--tb-icon-bg);
  flex-shrink: 0;
  transition: box-shadow 0.2s ease;
}

.tbridge-item-icon--ph {
  display: grid;
  place-items: center;
  font-size: 18px;
  font-weight: 600;
  color: var(--tb-muted);
}

.tbridge-item-name {
  font-size: 12px;
  font-weight: 500;
  line-height: 1.2;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--tb-fg);
}

.tbridge-item-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  padding: 2px 5px;
  border-radius: 999px;
  background: var(--tb-accent);
  color: #fff;
  line-height: 1.2;
}

.tbridge-empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--tb-faint);
  font-size: 14px;
  grid-column: 1 / -1;
}

.tbridge-footer {
  flex-shrink: 0;
  padding: 8px;
  text-align: center;
  font-size: 11px;
  font-weight: 500;
  color: var(--tb-faint);
  letter-spacing: 0.02em;
  user-select: none;
}

.tbridge-btn {
  appearance: none;
  border: 0;
  border-radius: 999px;
  padding: 12px 20px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  background: var(--tb-accent);
  color: #fff;
  transition: filter 0.12s ease, opacity 0.12s ease, transform 0.12s ease;
}

.tbridge-btn:hover {
  filter: brightness(1.08);
}

.tbridge-btn:active {
  transform: scale(0.98);
}

.tbridge-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tbridge-waiting {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 8px 20px;
  text-align: center;
  gap: 10px;
  width: 100%;
  box-sizing: border-box;
}

.tbridge-wallet-chip {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border-radius: 16px;
  background: var(--tb-surface);
  text-align: left;
}

.tbridge-wallet-chip-icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--tb-icon-bg);
  flex-shrink: 0;
}

.tbridge-wallet-chip-icon--ph {
  display: grid;
  place-items: center;
  font-size: 16px;
  font-weight: 600;
  color: var(--tb-muted);
}

.tbridge-wallet-chip-meta {
  min-width: 0;
  flex: 1;
}

.tbridge-wallet-chip-name {
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tbridge-wallet-chip-platforms {
  font-size: 12px;
  color: var(--tb-muted);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tbridge-waiting p {
  margin: 0;
  font-size: 14px;
  color: var(--tb-muted);
  line-height: 1.45;
  max-width: 280px;
}

.tbridge-waiting-error {
  color: var(--tb-danger) !important;
}

.tbridge-spinner-wrap {
  width: 200px;
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  background: transparent;
}

.tbridge-spinner {
  width: 36px;
  height: 36px;
  border: 2.5px solid var(--tb-surface-2);
  border-top-color: var(--tb-accent);
  border-radius: 50%;
  animation: tbridge-spin 0.65s linear infinite;
}

@keyframes tbridge-spin {
  to { transform: rotate(360deg); }
}

.tbridge-qr {
  width: 200px;
  height: 200px;
  border-radius: 16px;
  background: var(--tb-qr-bg);
  padding: 0;
  box-sizing: border-box;
  display: block;
}

.tbridge-open-link {
  appearance: none;
  border: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-top: 2px;
  padding: 10px 18px;
  border-radius: 999px;
  background: var(--tb-accent);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: filter 0.12s ease, transform 0.12s ease;
}

.tbridge-open-link:hover {
  filter: brightness(1.08);
}

.tbridge-open-link:active {
  transform: scale(0.98);
}

.tbridge-copy-link {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--tb-faint);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  padding: 6px 12px;
  border-radius: 999px;
  transition: color 0.12s ease, background 0.12s ease;
}

@media (hover: hover) and (pointer: fine) {
  .tbridge-copy-link:hover {
    color: var(--tb-fg);
    background: var(--tb-surface);
  }
}

.tbridge-copy-link:active {
  color: var(--tb-fg);
  background: var(--tb-surface);
}
`;

export function ensureStyles(): void {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById(STYLE_ID);
  if (existing) {
    existing.textContent = CSS;
    return;
  }
  const node = document.createElement('style');
  node.id = STYLE_ID;
  node.textContent = CSS;
  document.head.appendChild(node);
}

export function removeStyles(): void {
  if (typeof document === 'undefined') return;
  document.getElementById(STYLE_ID)?.remove();
}
