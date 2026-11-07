// handlers/message.js — runs on each `message` update. The file name is the
// Telegram update type; the platform calls the default export with the matching
// payload (here, a Message). The full update is available as `ctx.update`.

import { api } from 'sdk';
import { t } from '../lib/i18n.js';
import { welcomeKeyboard } from '../lib/keyboards.js';
import { SPLASH_IMAGE_URL, ALLOWED_CMDS } from '../lib/constants.js';

/**
 * Parse /cmd, /cmd@bot, /cmd args
 * @param {string | undefined} text
 * @returns {{ name: string, args: string } | null}
 */
function parseCommand(text) {
  if (!text || text.charAt(0) !== '/') return null;
  const trimmed = text.trim();
  const space = trimmed.indexOf(' ');
  const head = space === -1 ? trimmed : trimmed.slice(0, space);
  const args = space === -1 ? '' : trimmed.slice(space + 1).trim();
  const at = head.indexOf('@');
  const name = (at === -1 ? head.slice(1) : head.slice(1, at)).toLowerCase();
  if (!name) return null;
  return { name, args };
}

/**
 *
 * @param {string | undefined} cmd
 * @returns {boolean}
 */
function isAllowedCommand(cmd) {
  if (!cmd) return false;
  return ALLOWED_CMDS.includes(cmd.name);
}

export default async function (message) {
  const cmd = parseCommand(message.text);
  if (!cmd || !isAllowedCommand(cmd)) {
    return;
  }

  const chatId = message.chat.id;
  const copy = t(message.from && message.from.language_code);

  const ownerId = message.from && message.from.id;
  const keyboard = welcomeKeyboard(copy, ownerId);

  if (cmd.name === 'start') {
    try {
      await api.sendPhoto({
        chat_id: chatId,
        photo: SPLASH_IMAGE_URL,
        caption: copy.welcome,
        reply_markup: keyboard,
      });
    } catch {
      await api.sendMessage({
        chat_id: chatId,
        text: copy.welcome,
        reply_markup: keyboard,
      });
    }
  }
}
