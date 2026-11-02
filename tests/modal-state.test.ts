import { describe, expect, it } from 'vitest';
import { createInitialState, reduceModal, sortWalletsForGrid } from '../ui/modal-state';
import type { WalletInfo } from '../core/types';

const wallet = (app_name: string, name = app_name): WalletInfo => ({
  app_name,
  name,
  image: '',
  about_url: '',
  bridge: [],
  platforms: ['ios'],
  features: [],
});

describe('modal-state', () => {
  it('starts in list mode', () => {
    const s = createInitialState({
      wallets: [],
      locale: 'en',
      theme: 'dark',
    });
    expect(s.mode).toBe('list');
    expect(s.closed).toBe(false);
    expect(s.waiting).toBeNull();
  });

  it('list ↔ waiting transitions', () => {
    let s = createInitialState({
      wallets: [wallet('tonkeeper')],
      locale: 'en',
      theme: 'dark',
    });
    s = reduceModal(s, {
      type: 'set_waiting',
      payload: { message: 'Confirm', link: 'https://example.com' },
    });
    expect(s.mode).toBe('waiting');
    expect(s.waiting?.link).toBe('https://example.com');

    s = reduceModal(s, { type: 'show_list' });
    expect(s.mode).toBe('list');
    expect(s.waiting).toBeNull();
  });

  it('ignores actions after close', () => {
    let s = createInitialState({
      wallets: [],
      locale: 'en',
      theme: 'dark',
    });
    s = reduceModal(s, { type: 'close' });
    s = reduceModal(s, { type: 'set_locale', locale: 'ru' });
    expect(s.closed).toBe(true);
    expect(s.locale).toBe('en');
  });

  it('sorts recent wallet first', () => {
    const list = [wallet('a'), wallet('b'), wallet('c')];
    expect(sortWalletsForGrid(list, 'b').map((w) => w.app_name)).toEqual(['b', 'a', 'c']);
  });
});
