/**
 * Minimal i18n for TBridge UI (EN / RU).
 * No external i18n runtime.
 */

export type TBridgeLocale = 'en' | 'ru';

type Dict = Record<string, string>;

const EN: Dict = {
  'modal.title': 'Connect wallet',
  'modal.close': 'Close',
  'modal.back': 'Back',
  'modal.empty': 'No wallets available',
  'modal.recent': 'Recent',
  'modal.powered': 'TBridge',
  'modal.about': 'About TBridge',
  'about.title': 'TBridge',
  'about.body': 'Browser SDK for connecting TON wallets - secure, fast, and framework-agnostic.',
  'about.close': 'Close',
  'waiting.preparing': 'Preparing connection…',
  'waiting.scan': 'Scan with your wallet',
  'waiting.open': 'Open the link in your wallet',
  'waiting.confirm': 'Confirm connection in your wallet…',
  'waiting.failed': 'Connection failed',
  'waiting.openLink': 'Open in wallet',
  'waiting.copy': 'Copy link',
  'waiting.copied': 'Copied',
};

const RU: Dict = {
  'modal.title': 'Подключить кошелёк',
  'modal.close': 'Закрыть',
  'modal.back': 'Назад',
  'modal.empty': 'Нет доступных кошельков',
  'modal.recent': 'Недавний',
  'modal.powered': 'TBridge',
  'modal.about': 'О TBridge',
  'about.title': 'TBridge',
  'about.body':
    'SDK для подключения TON-кошельков в браузере - безопасно, быстро и без привязки к фреймворку.',
  'about.close': 'Закрыть',
  'waiting.preparing': 'Подготовка подключения…',
  'waiting.scan': 'Отсканируйте кошельком',
  'waiting.open': 'Откройте ссылку в кошельке',
  'waiting.confirm': 'Подтвердите подключение в кошельке…',
  'waiting.failed': 'Ошибка подключения',
  'waiting.openLink': 'Открыть в кошельке',
  'waiting.copy': 'Копировать ссылку',
  'waiting.copied': 'Скопировано',
};

const TABLES: Record<TBridgeLocale, Dict> = { en: EN, ru: RU };

export function t(locale: TBridgeLocale, key: string): string {
  return TABLES[locale]?.[key] ?? TABLES.en[key] ?? key;
}

export function normalizeLocale(value: unknown): TBridgeLocale {
  if (value === 'ru' || value === 'en') return value;
  if (typeof value === 'string' && value.toLowerCase().startsWith('ru')) return 'ru';
  return 'en';
}
