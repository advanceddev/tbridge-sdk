import { GITHUB_URL, NPM_URL, WEB_APP_URL } from './constants.js';

/**
 * @param {ReturnType<import('./i18n.js').t>} copy
 * @param {number | string} ownerId Telegram user id who may press nav buttons
 */
export function welcomeKeyboard(copy, _ownerId) {
  return {
    inline_keyboard: [
      [
        {
          text: copy.openApp,
          web_app: { url: WEB_APP_URL },
          style: 'primary',
        },
      ],
      [
        {
          text: 'GitHub',
          url: GITHUB_URL,
        },
        {
          text: 'NPM',
          url: NPM_URL,
        },
      ],
    ],
  };
}
