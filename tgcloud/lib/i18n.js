/**
 * Minimal i18n for bot replies.
 * language_code from Telegram User (e.g. "ru", "en-US").
 */

const MESSAGES = {
  ru: {
    welcome:
      'TBridge - это SDK, написанный на чистом TypeScript, предназначенный для подключения кошельков, создания зашифрованных сессий, а также запроса переводов или подписей в сети TON.\n\nОн не привязан к конкретному фреймворку (поддерживает React, Vue, Svelte или работу без фреймворков), включает опциональный готовый пользовательский интерфейс и разработан для использования в полноценных dApp и мини-приложениях Telegram (Telegram Mini Apps).',

    openApp: 'Запустить демо-приложение',
  },
  en: {
    welcome:
      'TBridge - s a pure TypeScript SDK for discovering wallets, establishing encrypted sessions, and requesting transfers / signatures on TON.\n\nIt is framework-agnostic (React, Vue, Svelte, or vanilla), ships an optional vanilla UI, and is built for production dApps and Telegram Mini Apps.',
    openApp: 'Launch demo-app',
  },
};

/**
 * @param {string | undefined} languageCode
 * @returns {'en' | 'ru'}
 */
export function resolveLang(languageCode) {
  if (!languageCode) return 'en';
  const code = String(languageCode).toLowerCase();
  if (code.startsWith('ru')) return 'ru';
  return 'en';
}

/**
 * @param {string | undefined} languageCode
 */
export function t(languageCode) {
  const lang = resolveLang(languageCode);
  return MESSAGES[lang] ?? MESSAGES.en;
}
