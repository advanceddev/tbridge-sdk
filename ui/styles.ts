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
  --tb-accent: #0098EA;
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
  --tb-accent: #0098EA;
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

/* Wrapper содержит модалку + кнопки (на десктопе) */
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

/* Контейнер кнопок справа от модалки (только десктоп) */
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

/* Модальное окно */
.tbridge-modal {
  width: 100%;
  max-height: min(88vh, 640px);
  background: var(--tb-bg);
  border: 1px solid rgba(255, 255, 255, 0.05);
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
    border: 1px solid rgba(255, 255, 255, 0.05);
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

/* Хэдер */
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

/* Кнопки Назад и Закрыть */
.tbridge-back,
.tbridge-close {
  appearance: none;
  border: 0;
  background: var(--tb-surface);
  color: var(--tb-muted);
  width: 42px;
  height: 42px;
  padding: 0;
  border-radius: 50%;
  cursor: pointer;
  line-height: 0;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
}

.tbridge-back svg,
.tbridge-close svg {
  display: block;
  margin: auto;
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

/* Десктоп: кнопки увеличены и вынесены за модалку */
@media (min-width: 520px) {
  .tbridge-back,
  .tbridge-close {
    width: 40px;
    height: 40px;
    font-size: 20px;
    background: var(--tb-bg);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    border: 1px solid rgba(255, 255, 255, 0.05);
  }
  
  /* Фикс: используем непрозрачный цвет при наведении */
  .tbridge-back:hover,
  .tbridge-close:hover {
    background: var(--tb-icon-bg);
  }
  
  .tbridge-back:active,
  .tbridge-close:active {
    transform: scale(0.92);
  }
}

/* Mobile header end: about + close */
.tbridge-header-end {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* About button — same chrome as close/back, solid logo */
.tbridge-about-btn {
  appearance: none;
  border: 0;
  background: var(--tb-surface);
  color: var(--tb-muted);
  width: 42px;
  height: 42px;
  border-radius: 50%;
  cursor: pointer;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  padding: 0;
  line-height: 0;
  transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
}

.tbridge-about-btn svg {
  display: block;
  margin: auto;
}

.tbridge-about-btn:hover {
  background: var(--tb-surface-2);
  color: var(--tb-fg);
}

.tbridge-about-btn:active {
  transform: scale(0.92);
}

@media (min-width: 520px) {
  .tbridge-about-btn {
    width: 40px;
    height: 40px;
    background: var(--tb-bg);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .tbridge-about-btn:hover {
    background: var(--tb-icon-bg);
  }
}

/* Footer wordmark (display merged with .tbridge-footer below) */

.tbridge-wordmark {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--tb-faint);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  user-select: none;
}

.tbridge-wordmark-text {
  color: var(--tb-faint);
}

/* About popup above modal */
.tbridge-about-scrim {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  background: rgba(0, 0, 0, 0.45);
  box-sizing: border-box;
  animation: tbridge-fade-in 0.18s ease;
}

.tbridge-about-scrim[hidden] {
  display: none !important;
}

.tbridge-about-card {
  position: relative;
  width: min(100%, 320px);
  background: var(--tb-bg);
  color: var(--tb-fg);
  border-radius: 20px;
  padding: 28px 20px 24px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
  text-align: center;
  box-sizing: border-box;
}

.tbridge-about-close {
  appearance: none;
  border: 0;
  position: absolute;
  top: 12px;
  right: 12px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--tb-surface);
  color: var(--tb-muted);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  display: grid;
  place-items: center;
}

.tbridge-about-close:hover {
  background: var(--tb-surface-2);
  color: var(--tb-fg);
}

.tbridge-about-logo {
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
}

.tbridge-about-title {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--tb-fg);
}

.tbridge-about-body {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--tb-muted);
}

/* Тело модалки */
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

/* Сетка кошельков */
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

/* Футер */
.tbridge-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 8px 12px;
  text-align: center;
  font-size: 11px;
  font-weight: 500;
  color: var(--tb-faint);
  letter-spacing: 0.02em;
  user-select: none;
}

/* Кнопка подключения */
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

/* Экран ожидания */
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

/* Спиннер (без белого фона) */
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

/* QR код */
.tbridge-qr {
  width: 200px;
  height: 200px;
  border-radius: 16px;
  background: var(--tb-qr-bg);
  padding: 0;
  box-sizing: border-box;
  display: block;
}

/* Ссылка открытия */
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

/* Кнопка копирования */
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


/* —— Action sheet (TX confirm) —— */
.tbridge-sheet-overlay {
  --tb-bg: #0c0c0e;
  --tb-fg: #f4f4f5;
  --tb-muted: #a1a1aa;
  --tb-surface: rgba(255, 255, 255, 0.06);
  --tb-surface-2: rgba(255, 255, 255, 0.1);
  --tb-icon-bg: #1a1a1e;
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 12px;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
  box-sizing: border-box;
  background: rgba(0, 0, 0, 0.35);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--tb-fg);
  animation: tbridge-sheet-in 0.18s ease;
}
.tbridge-sheet-overlay[data-tbridge-theme="light"] {
  --tb-bg: #fafafa;
  --tb-fg: #18181b;
  --tb-muted: #52525b;
  --tb-surface: rgba(0, 0, 0, 0.04);
  --tb-surface-2: rgba(0, 0, 0, 0.08);
  --tb-icon-bg: #e4e4e7;
}
@keyframes tbridge-sheet-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.tbridge-sheet-wrapper {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  max-width: 400px;
  justify-content: center;
}

.tbridge-sheet {
  flex: 1;
  min-width: 0;
  background: var(--tb-bg);
  color: var(--tb-fg);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 22px;
  padding: 16px;
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.25);
  box-sizing: border-box;
  animation: tbridge-sheet-up 0.22s ease;
}
@keyframes tbridge-sheet-up {
  from { transform: translateY(12px); opacity: 0.85; }
  to { transform: translateY(0); opacity: 1; }
}

@media (min-width: 520px) {
  .tbridge-sheet-overlay {
    padding: 24px;
  }
  .tbridge-sheet {
    max-width: 360px;
    flex: 0 1 360px;
    border-radius: 22px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
  }
}

.tbridge-sheet-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.tbridge-sheet-title {
  margin: 0;
  flex: 1;
  font: 600 15px/1.35 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--tb-fg);
  text-align: left;
  padding-top: 10px;
}

@media (min-width: 520px) {
  .tbridge-sheet-title {
    text-align: center;
    padding-top: 0;
    margin-bottom: 4px;
  }
  .tbridge-sheet-header {
    margin-bottom: 12px;
  }
}

/* Mobile: close inside header; desktop: external column */
.tbridge-sheet-close {
  appearance: none;
  border: 0;
  background: var(--tb-surface);
  color: var(--tb-muted);
  width: 42px;
  height: 42px;
  padding: 0;
  border-radius: 50%;
  cursor: pointer;
  line-height: 0;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
}
.tbridge-sheet-close:hover {
  background: var(--tb-surface-2);
  color: var(--tb-fg);
}
.tbridge-sheet-close:active {
  transform: scale(0.92);
}
.tbridge-sheet-close svg {
  display: block;
  margin: auto;
}

.tbridge-sheet-side {
  display: none;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

@media (min-width: 520px) {
  .tbridge-sheet-header .tbridge-sheet-close {
    display: none;
  }
  .tbridge-sheet-side {
    display: flex;
  }
  .tbridge-sheet-side .tbridge-sheet-close {
    width: 40px;
    height: 40px;
    background: var(--tb-bg);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    border: 1px solid rgba(255, 255, 255, 0.05);
  }
  .tbridge-sheet-side .tbridge-sheet-close:hover {
    background: var(--tb-icon-bg);
  }
}

.tbridge-sheet-open {
  appearance: none;
  width: 100%;
  border: 0;
  border-radius: 10px;
  padding: 11px 14px;
  font: 600 14px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  cursor: pointer;
  /* Dark theme: dark surface + accent glow */
  background: #1a1d24;
  color: #f4f4f5;
  box-shadow: 0 0 0 1px rgba(0, 152, 234, 0.25), 0 0 20px rgba(0, 152, 234, 0.22);
  transition: filter 0.15s ease, transform 0.12s ease, box-shadow 0.15s ease;
}
.tbridge-sheet-open:hover {
  filter: brightness(1.08);
  box-shadow: 0 0 0 1px rgba(0, 152, 234, 0.4), 0 0 24px rgba(0, 152, 234, 0.32);
}
.tbridge-sheet-open:active {
  transform: scale(0.99);
}
.tbridge-sheet-overlay[data-tbridge-theme="light"] .tbridge-sheet-open {
  background: #0098EA;
  color: #fff;
  box-shadow: 0 2px 10px rgba(0, 152, 234, 0.28);
}
.tbridge-sheet-overlay[data-tbridge-theme="light"] .tbridge-sheet-open:hover {
  filter: brightness(1.05);
  box-shadow: 0 4px 14px rgba(0, 152, 234, 0.35);
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
