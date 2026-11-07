/**
 * Minimal i18n for bot replies.
 * language_code from Telegram User (e.g. "ru", "en-US").
 */

const MESSAGES = {
  ru: {
    welcome: {
      title: 'TBridge SDK',
      p1: 'TBridge - это SDK, написанный на чистом TypeScript, предназначенный для подключения кошельков, создания зашифрованных сессий, а также запроса переводов или подписей в сети TON.',
      p2: '\nУстановка',
    },
    openApp: 'Запустить демо-приложение',
  },
  en: {
    welcome: {
      title: 'TBridge SDK',
      p1: 'TBridge - is a pure TypeScript SDK for discovering wallets, establishing encrypted sessions, and requesting transfers / signatures on TON.',
      p2: '\nInstall:',
    },
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
