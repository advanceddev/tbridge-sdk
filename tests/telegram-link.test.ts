/**
 * Connect links to Telegram-hosted wallets (t.me / tg:). Telegram hands a Mini App
 * only `startapp` (≤ 512 chars, [A-Za-z0-9_-]).
 */
import { describe, expect, it } from 'vitest';
import { buildConnectLink } from '../bridge/http-bridge';
import { withReturnStrategy } from '../utils/open-wallet-link';

const ID = 'a'.repeat(64);
const REQ = {
  manifestUrl: 'https://ton-connect.github.io/demo-dapp-with-react-ui/tonconnect-manifest.json',
  items: [{ name: 'ton_addr' as const, network: '-239' }],
};
// Exactly the link that opened the connect on Telegram Desktop (Windows)
const VERIFIED =
  'https://t.me/sendgrams?startapp=tonconnect-v__2-id__aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-r__--7B--22manifestUrl--22--3A--22https--3A--2F--2Fton--2Dconnect--2Egithub--2Eio--2Fdemo--2Ddapp--2Dwith--2Dreact--2Dui--2Ftonconnect--2Dmanifest--2Ejson--22--2C--22items--22--3A--5B--7B--22name--22--3A--22ton--5Faddr--22--2C--22network--22--3A--22--2D239--22--7D--5D--7D';

/** Wallet side: decodeTelegramUrlParameters (inverse of the encoding) + query parse. */
function decodeStartapp(link: string): URLSearchParams {
  const s = new URL(link).searchParams.get('startapp')!;
  expect(s.startsWith('tonconnect-')).toBe(true);
  const q = s
    .slice('tonconnect-'.length)
    .replaceAll('--', '%')
    .replaceAll('__', '=')
    .replaceAll('-', '&')
    .replaceAll('%5F', '_')
    .replaceAll('%2D', '-')
    .replaceAll('%2E', '.');
  return new URLSearchParams(q);
}

describe('connect link to the Telegram wallet', () => {
  it('is the startapp link verified on Telegram Desktop for Windows', () => {
    expect(
      buildConnectLink({
        universalUrl: 'https://t.me/sendgrams',
        clientId: ID,
        connectRequest: REQ,
        ret: 'back',
      }),
    ).toBe(VERIFIED);
  });

  it('turns an attach link into a direct /start link', () => {
    const link = buildConnectLink({
      universalUrl: 'https://t.me/walt?attach=wallet',
      clientId: ID,
      connectRequest: REQ,
    });
    expect(link.startsWith('https://t.me/walt/start?startapp=tonconnect-')).toBe(true);
    expect(new URL(link).searchParams.has('attach')).toBe(false);
  });

  it('carries v, id and r losslessly, using only characters Telegram allows', () => {
    const req = { manifestUrl: "https://a.example/m(1)!*'~.json", items: REQ.items };
    const link = buildConnectLink({
      universalUrl: 'https://t.me/sendgrams',
      clientId: ID,
      connectRequest: req,
    });
    expect(new URL(link).searchParams.get('startapp')).toMatch(/^[A-Za-z0-9_-]+$/);
    const p = decodeStartapp(link);
    expect(p.get('v')).toBe('2');
    expect(p.get('id')).toBe(ID);
    expect(JSON.parse(p.get('r')!)).toEqual(req);
  });

  it('is left alone by withReturnStrategy (no stray ret outside startapp)', () => {
    expect(withReturnStrategy(VERIFIED, 'back')).toBe(VERIFIED);
  });
});

describe('connect link to a regular wallet (unchanged)', () => {
  it('keeps plain query parameters', () => {
    const link = buildConnectLink({
      universalUrl: 'https://app.tonkeeper.com/ton-connect',
      clientId: ID,
      connectRequest: REQ,
      ret: 'back',
    });
    const u = new URL(link);
    expect(u.searchParams.get('v')).toBe('2');
    expect(u.searchParams.get('id')).toBe(ID);
    expect(JSON.parse(u.searchParams.get('r')!)).toEqual(REQ);
    expect(u.searchParams.get('ret')).toBe('back');
  });
});
