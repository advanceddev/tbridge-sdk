/**
 * Inline CSS for default UI components.
 * Theme via [data-tbridge-theme="dark"|"light"] on overlay.
 *
 * Design system:
 *  - TON brand blue (#0098EA) with gradients and soft glows.
 *  - Telegram-style motion: spring easings, GPU-only (transform/opacity).
 *  - Progressive enhancement: @supports(backdrop-filter), @supports(color-mix).
 *  - Respects prefers-reduced-motion.
 */

const STYLE_ID = 'tbridge-ui-styles';

const CSS = `
/* ————————————————————————————————
   Scroll lock
———————————————————————————————— */
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

/* ————————————————————————————————
   Overlay (wallet picker)
———————————————————————————————— */
.tbridge-overlay {
  --tb-bg: #131418;
  --tb-bg-raised: #1c1e25;
  --tb-fg: #f5f6f8;
  --tb-muted: #9ba1ad;
  --tb-faint: #6b7180;
  --tb-surface: rgba(255, 255, 255, 0.055);
  --tb-surface-2: rgba(255, 255, 255, 0.11);
  --tb-border: rgba(255, 255, 255, 0.08);
  --tb-accent: #0098ea;
  --tb-accent-strong: #16a5f0;
  --tb-accent-soft: rgba(0, 152, 234, 0.16);
  --tb-accent-glow: rgba(0, 152, 234, 0.38);
  --tb-danger: #ff6b6b;
  --tb-scrim: radial-gradient(130% 110% at 50% 0%, rgba(10, 16, 28, 0.38) 0%, rgba(4, 6, 12, 0.66) 100%);
  --tb-qr-bg: #ffffff;
  --tb-icon-bg: #21242b;
  --tb-shadow-modal: 0 40px 80px -20px rgba(0, 0, 0, 0.6), 0 16px 32px -12px rgba(0, 0, 0, 0.45);
  --tb-shadow-raised: 0 6px 20px -6px rgba(0, 0, 0, 0.5);
  --tb-shadow-icon: 0 2px 10px -2px rgba(0, 0, 0, 0.3);
  --tb-shadow-qr: 0 0 0 1px rgba(255, 255, 255, 0.08), 0 16px 36px -14px rgba(0, 0, 0, 0.5);
  --tb-shadow-accent: 0 8px 24px -8px var(--tb-accent-glow);

  position: fixed;
  inset: 0;
  z-index: 2147483646;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  /* Opaque fallback — upgraded to blur inside @supports below */
  background: rgba(4, 6, 12, 0.58);
  background: var(--tb-scrim);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
  -webkit-tap-highlight-color: transparent;
  color: var(--tb-fg);
  animation: tbridge-fade-in 0.25s ease-out;
}

/* Blur only when supported; graceful fallback to the opaque scrim above */
@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .tbridge-overlay {
    backdrop-filter: blur(14px) saturate(150%);
    -webkit-backdrop-filter: blur(14px) saturate(150%);
  }
}

.tbridge-overlay[data-tbridge-theme="light"] {
  --tb-bg: #ffffff;
  --tb-bg-raised: #ffffff;
  --tb-fg: #16181d;
  --tb-muted: #5c6270;
  --tb-faint: #8a90a0;
  --tb-surface: rgba(15, 20, 35, 0.05);
  --tb-surface-2: rgba(15, 20, 35, 0.09);
  --tb-border: rgba(15, 20, 35, 0.09);
  --tb-accent: #0098ea;
  --tb-accent-strong: #0f9fe6;
  --tb-accent-soft: rgba(0, 152, 234, 0.12);
  --tb-accent-glow: rgba(0, 152, 234, 0.3);
  --tb-danger: #e5484d;
  --tb-scrim: radial-gradient(130% 110% at 50% 0%, rgba(80, 96, 130, 0.26) 0%, rgba(22, 28, 44, 0.5) 100%);
  --tb-qr-bg: #ffffff;
  --tb-icon-bg: #eef1f6;
  --tb-shadow-modal: 0 40px 80px -24px rgba(20, 30, 60, 0.35), 0 16px 32px -16px rgba(20, 30, 60, 0.2);
  --tb-shadow-raised: 0 6px 18px -6px rgba(20, 30, 60, 0.18);
  --tb-shadow-icon: 0 2px 8px -2px rgba(20, 30, 60, 0.16);
  --tb-shadow-qr: 0 0 0 1px rgba(15, 20, 35, 0.07), 0 14px 30px -14px rgba(20, 30, 60, 0.3);
  --tb-shadow-accent: 0 8px 22px -8px var(--tb-accent-glow);
}

/* Progressive enhancement: self-adaptive surfaces & borders via color-mix */
@supports (color: color-mix(in srgb, red, blue)) {
  .tbridge-overlay,
  .tbridge-overlay[data-tbridge-theme="light"],
  .tbridge-sheet-overlay,
  .tbridge-sheet-overlay[data-tbridge-theme="light"] {
    --tb-surface-2: color-mix(in srgb, var(--tb-fg) 11%, transparent);
    --tb-border: color-mix(in srgb, var(--tb-fg) 9%, transparent);
  }
}

.tbridge-overlay ::selection,
.tbridge-sheet-overlay ::selection {
  background: var(--tb-accent-soft);
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
  animation: tbridge-slide-up 0.5s cubic-bezier(0.32, 0.72, 0, 1);
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
  border: 1px solid var(--tb-border);
  border-radius: 24px 24px 0 0;
  box-shadow: var(--tb-shadow-modal), inset 0 1px 0 rgba(255, 255, 255, 0.045);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: tbridge-pop-in 0.45s cubic-bezier(0.3, 1.24, 0.44, 1);
}

@media (min-width: 520px) {
  .tbridge-modal {
    /* Fixed width — list ↔ waiting must not resize the shell */
    width: 420px;
    min-width: 420px;
    max-width: 420px;
    border-radius: 26px;
    border: 1px solid var(--tb-border);
    box-shadow: var(--tb-shadow-modal), inset 0 1px 0 rgba(255, 255, 255, 0.045);
  }
}

.tbridge-overlay[data-tbridge-theme="light"] .tbridge-modal {
  box-shadow: var(--tb-shadow-modal);
}

/* ————————————————————————————————
   Keyframes (transform/opacity only — compositor friendly)
———————————————————————————————— */
@keyframes tbridge-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes tbridge-slide-up {
  from { transform: translateY(56px); opacity: 0.4; }
  to { transform: translateY(0); opacity: 1; }
}

@keyframes tbridge-pop-in {
  from { transform: scale(0.94) translateY(14px); opacity: 0; }
  to { transform: scale(1) translateY(0); opacity: 1; }
}

@keyframes tbridge-content-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes tbridge-spin {
  to { transform: rotate(360deg); }
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
  letter-spacing: -0.02em;
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
  transition:
    background 0.18s ease,
    color 0.18s ease,
    transform 0.24s cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 0.18s ease;
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
  transform: scale(0.9);
}

.tbridge-back:focus-visible,
.tbridge-close:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--tb-bg), 0 0 0 4px var(--tb-accent);
}

/* Десктоп: кнопки увеличены и вынесены за модалку */
@media (min-width: 520px) {
  .tbridge-back,
  .tbridge-close {
    width: 40px;
    height: 40px;
    font-size: 20px;
    background: var(--tb-bg-raised);
    box-shadow: var(--tb-shadow-raised);
    border: 1px solid var(--tb-border);
  }

  .tbridge-back:hover,
  .tbridge-close:hover {
    background: var(--tb-icon-bg);
    transform: translateY(-1px);
  }

  .tbridge-back:active,
  .tbridge-close:active {
    transform: scale(0.9);
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
  transition:
    background 0.18s ease,
    color 0.18s ease,
    transform 0.24s cubic-bezier(0.34, 1.56, 0.64, 1);
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
  transform: scale(0.9);
}

.tbridge-about-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--tb-bg), 0 0 0 4px var(--tb-accent);
}

@media (min-width: 520px) {
  .tbridge-about-btn {
    width: 40px;
    height: 40px;
    background: var(--tb-bg-raised);
    box-shadow: var(--tb-shadow-raised);
    border: 1px solid var(--tb-border);
  }

  .tbridge-about-btn:hover {
    background: var(--tb-icon-bg);
    transform: translateY(-1px);
  }
}

/* Footer wordmark */
.tbridge-wordmark {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--tb-faint);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
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
  background: rgba(3, 6, 12, 0.5);
  box-sizing: border-box;
  animation: tbridge-fade-in 0.2s ease-out;
}

@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .tbridge-about-scrim {
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
  }
}

.tbridge-about-scrim[hidden] {
  display: none !important;
}

.tbridge-about-card {
  position: relative;
  width: min(100%, 320px);
  background: var(--tb-bg);
  color: var(--tb-fg);
  border: 1px solid var(--tb-border);
  border-radius: 24px;
  padding: 28px 20px 24px;
  box-shadow: var(--tb-shadow-modal), inset 0 1px 0 rgba(255, 255, 255, 0.045);
  text-align: center;
  box-sizing: border-box;
  animation: tbridge-pop-in 0.34s cubic-bezier(0.3, 1.36, 0.5, 1);
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
  transition:
    background 0.16s ease,
    color 0.16s ease,
    transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.tbridge-about-close:hover {
  background: var(--tb-surface-2);
  color: var(--tb-fg);
}

.tbridge-about-close:active {
  transform: scale(0.88);
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
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.45;
  color: var(--tb-muted);
}

/* Тело модалки — stable height for list ↔ waiting swap */
.tbridge-body {
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  -ms-overflow-style: none;
  padding: 8px 16px 12px;
  flex: 1;
  min-height: min(52vh, 400px);
  box-sizing: border-box;
  width: 100%;
}

@media (min-width: 520px) {
  .tbridge-body {
    /* Fits QR (200) + chip + actions without growing the shell */
    min-height: 420px;
  }
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
  align-content: start;
  animation: tbridge-content-in 0.28s ease-out;
}

.tbridge-item {
  appearance: none;
  border: 0;
  background: transparent;
  color: inherit;
  border-radius: 18px;
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
  transition:
    transform 0.26s cubic-bezier(0.34, 1.56, 0.64, 1),
    background 0.18s ease;
}

@media (hover: hover) and (pointer: fine) {
  .tbridge-item:hover {
    transform: translateY(-3px);
    background: var(--tb-surface);
  }
  .tbridge-item:hover .tbridge-item-icon {
    transform: scale(1.06);
    box-shadow: 0 10px 22px -6px rgba(0, 0, 0, 0.35);
  }
}

.tbridge-item:active {
  transform: translateY(-1px) scale(0.97);
  background: var(--tb-surface);
}

.tbridge-item:focus-visible {
  outline: none;
  background: var(--tb-surface);
  box-shadow: 0 0 0 2px var(--tb-bg), 0 0 0 4px var(--tb-accent);
}

.tbridge-item-icon {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--tb-icon-bg);
  box-shadow: var(--tb-shadow-icon);
  flex-shrink: 0;
  transition:
    box-shadow 0.22s ease,
    transform 0.26s cubic-bezier(0.34, 1.56, 0.64, 1);
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
  background: linear-gradient(135deg, #1cabef 0%, #0086d4 100%);
  box-shadow: 0 2px 8px -2px var(--tb-accent-glow);
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

.tbridge-github {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--tb-faint);
  text-decoration: none;
  width: 40px;
  height: 40px;
  padding: 0;
  border-radius: 50%;
  line-height: 0;
  transition: color 0.15s ease, background 0.15s ease, transform 0.15s ease;
}

.tbridge-github:hover {
  color: var(--tb-fg);
  background: var(--tb-surface);
}

.tbridge-github:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--tb-bg), 0 0 0 4px var(--tb-accent);
}

.tbridge-github svg {
  display: block;
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
  background: linear-gradient(135deg, #2cb2f5 0%, #0098ea 52%, #0082cf 100%);
  color: #fff;
  box-shadow: var(--tb-shadow-accent), inset 0 1px 0 rgba(255, 255, 255, 0.22);
  transition:
    filter 0.15s ease,
    opacity 0.15s ease,
    transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 0.18s ease;
}

.tbridge-btn:hover {
  filter: brightness(1.07);
  transform: translateY(-1px);
}

.tbridge-btn:active {
  transform: translateY(0) scale(0.98);
}

.tbridge-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.tbridge-btn:focus-visible {
  outline: none;
  box-shadow: var(--tb-shadow-accent), 0 0 0 2px var(--tb-bg), 0 0 0 4px var(--tb-accent);
}

/* Экран ожидания */
.tbridge-waiting {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 8px 8px 20px;
  text-align: center;
  gap: 10px;
  width: 100%;
  box-sizing: border-box;
  animation: tbridge-content-in 0.28s ease-out;
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
  box-shadow: inset 0 0 0 1px var(--tb-border);
  text-align: left;
}

.tbridge-wallet-chip-icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--tb-icon-bg);
  box-shadow: var(--tb-shadow-icon);
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
  letter-spacing: -0.01em;
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

/* Fixed media slot — spinner and QR occupy the same box (no layout jump) */
.tbridge-media-slot {
  width: 200px;
  height: 200px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 18px;
  box-sizing: border-box;
  overflow: hidden;
}

.tbridge-spinner-wrap {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  background: transparent;
}

.tbridge-spinner {
  width: 36px;
  height: 36px;
  border: 2.5px solid var(--tb-surface-2);
  border-top-color: var(--tb-accent);
  border-radius: 50%;
  animation: tbridge-spin 0.7s linear infinite;
}

.tbridge-qr {
  width: 200px;
  height: 200px;
  border-radius: 18px;
  background: var(--tb-qr-bg);
  padding: 0;
  box-sizing: border-box;
  display: block;
  box-shadow: var(--tb-shadow-qr);
}

.tbridge-waiting-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.tbridge-waiting-msg {
  margin: 0;
  font-size: 14px;
  color: var(--tb-muted);
  line-height: 1.45;
  max-width: 280px;
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
  background: linear-gradient(135deg, #2cb2f5 0%, #0098ea 52%, #0082cf 100%);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  box-shadow: var(--tb-shadow-accent), inset 0 1px 0 rgba(255, 255, 255, 0.22);
  transition:
    filter 0.15s ease,
    transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 0.18s ease;
}

.tbridge-open-link:hover {
  filter: brightness(1.07);
  transform: translateY(-1px);
}

.tbridge-open-link:active {
  transform: translateY(0) scale(0.98);
}

.tbridge-open-link:focus-visible {
  outline: none;
  box-shadow: var(--tb-shadow-accent), 0 0 0 2px var(--tb-bg), 0 0 0 4px var(--tb-accent);
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
  transition: color 0.15s ease, background 0.15s ease;
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

.tbridge-copy-link:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--tb-accent-soft), 0 0 0 3px var(--tb-accent);
}

/* ————————————————————————————————
   Action sheet (TX confirm)
———————————————————————————————— */
.tbridge-sheet-overlay {
  --tb-bg: #131418;
  --tb-bg-raised: #1c1e25;
  --tb-fg: #f5f6f8;
  --tb-muted: #9ba1ad;
  --tb-surface: rgba(255, 255, 255, 0.055);
  --tb-surface-2: rgba(255, 255, 255, 0.11);
  --tb-border: rgba(255, 255, 255, 0.08);
  --tb-accent: #0098ea;
  --tb-accent-glow: rgba(0, 152, 234, 0.38);
  --tb-icon-bg: #21242b;
  --tb-shadow-modal: 0 32px 64px -18px rgba(0, 0, 0, 0.55), 0 12px 24px -10px rgba(0, 0, 0, 0.4);
  --tb-shadow-raised: 0 6px 20px -6px rgba(0, 0, 0, 0.5);

  position: fixed;
  inset: 0;
  z-index: 2147483000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 12px;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
  box-sizing: border-box;
  background: rgba(4, 6, 12, 0.42);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
  color: var(--tb-fg);
  animation: tbridge-sheet-in 0.2s ease-out;
}

@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .tbridge-sheet-overlay {
    backdrop-filter: blur(10px) saturate(150%);
    -webkit-backdrop-filter: blur(10px) saturate(150%);
  }
}

.tbridge-sheet-overlay[data-tbridge-theme="light"] {
  --tb-bg: #ffffff;
  --tb-bg-raised: #ffffff;
  --tb-fg: #16181d;
  --tb-muted: #5c6270;
  --tb-surface: rgba(15, 20, 35, 0.05);
  --tb-surface-2: rgba(15, 20, 35, 0.09);
  --tb-border: rgba(15, 20, 35, 0.09);
  --tb-accent: #0098ea;
  --tb-accent-glow: rgba(0, 152, 234, 0.3);
  --tb-icon-bg: #eef1f6;
  --tb-shadow-modal: 0 32px 64px -22px rgba(20, 30, 60, 0.32), 0 12px 24px -14px rgba(20, 30, 60, 0.18);
  --tb-shadow-raised: 0 6px 18px -6px rgba(20, 30, 60, 0.18);
  background: rgba(22, 28, 44, 0.34);
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
  border: 1px solid var(--tb-border);
  border-radius: 22px;
  padding: 16px;
  box-shadow: var(--tb-shadow-modal), inset 0 1px 0 rgba(255, 255, 255, 0.045);
  box-sizing: border-box;
  animation: tbridge-sheet-up 0.34s cubic-bezier(0.32, 0.72, 0, 1);
}

.tbridge-sheet-overlay[data-tbridge-theme="light"] .tbridge-sheet {
  box-shadow: var(--tb-shadow-modal);
}

@keyframes tbridge-sheet-up {
  from { transform: translateY(26px) scale(0.98); opacity: 0; }
  to { transform: translateY(0) scale(1); opacity: 1; }
}

@media (min-width: 520px) {
  .tbridge-sheet-overlay {
    padding: 24px;
  }
  .tbridge-sheet {
    max-width: 360px;
    flex: 0 1 360px;
    border-radius: 22px;
    box-shadow: 0 24px 60px -16px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.045);
  }
  .tbridge-sheet-overlay[data-tbridge-theme="light"] .tbridge-sheet {
    box-shadow: 0 24px 60px -20px rgba(20, 30, 60, 0.3);
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
  letter-spacing: -0.01em;
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
  transition:
    background 0.18s ease,
    color 0.18s ease,
    transform 0.24s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.tbridge-sheet-close:hover {
  background: var(--tb-surface-2);
  color: var(--tb-fg);
}
.tbridge-sheet-close:active {
  transform: scale(0.9);
}
.tbridge-sheet-close:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--tb-bg), 0 0 0 4px var(--tb-accent);
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
    background: var(--tb-bg-raised);
    box-shadow: var(--tb-shadow-raised);
    border: 1px solid var(--tb-border);
  }
  .tbridge-sheet-side .tbridge-sheet-close:hover {
    background: var(--tb-icon-bg);
    transform: translateY(-1px);
  }
  .tbridge-sheet-side .tbridge-sheet-close:active {
    transform: scale(0.9);
  }
}

.tbridge-sheet-open {
  appearance: none;
  width: 100%;
  border: 0;
  border-radius: 12px;
  padding: 11px 14px;
  font: 600 14px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  letter-spacing: 0.01em;
  cursor: pointer;
  /* Dark theme: dark surface + accent glow */
  background: linear-gradient(180deg, #1e242e 0%, #151a22 100%);
  color: #f4f4f5;
  box-shadow:
    0 0 0 1px rgba(0, 152, 234, 0.32),
    0 0 22px rgba(0, 152, 234, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  transition:
    filter 0.15s ease,
    transform 0.16s ease,
    box-shadow 0.18s ease;
}
.tbridge-sheet-open:hover {
  filter: brightness(1.1);
  box-shadow:
    0 0 0 1px rgba(0, 152, 234, 0.5),
    0 0 28px rgba(0, 152, 234, 0.32),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}
.tbridge-sheet-open:active {
  transform: scale(0.985);
}
.tbridge-sheet-open:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--tb-bg), 0 0 0 4px var(--tb-accent);
}
.tbridge-sheet-overlay[data-tbridge-theme="light"] .tbridge-sheet-open {
  background: linear-gradient(180deg, #18a8f0 0%, #0090e0 100%);
  color: #fff;
  box-shadow: 0 6px 18px -6px rgba(0, 152, 234, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.28);
}
.tbridge-sheet-overlay[data-tbridge-theme="light"] .tbridge-sheet-open:hover {
  filter: brightness(1.05);
  box-shadow: 0 8px 22px -6px rgba(0, 152, 234, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.32);
}

/* ————————————————————————————————
   Accessibility: reduce motion
———————————————————————————————— */
@media (prefers-reduced-motion: reduce) {
  .tbridge-overlay,
  .tbridge-modal-wrapper,
  .tbridge-modal,
  .tbridge-grid,
  .tbridge-waiting,
  .tbridge-about-scrim,
  .tbridge-about-card,
  .tbridge-sheet-overlay,
  .tbridge-sheet {
    animation: none !important;
  }
  .tbridge-item,
  .tbridge-item-icon,
  .tbridge-back,
  .tbridge-close,
  .tbridge-about-btn,
  .tbridge-about-close,
  .tbridge-sheet-close,
  .tbridge-btn,
  .tbridge-open-link,
  .tbridge-copy-link,
  .tbridge-sheet-open {
    transition: none !important;
  }
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
