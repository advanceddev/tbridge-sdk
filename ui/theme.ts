/**
 * Light / dark palette for TBridge UI.
 * Applied via data-tbridge-theme on the overlay root.
 */

export type TBridgeTheme = 'dark' | 'light';

export function normalizeTheme(value: unknown): TBridgeTheme {
  return value === 'light' ? 'light' : 'dark';
}
