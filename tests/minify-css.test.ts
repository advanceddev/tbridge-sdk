import { describe, expect, it } from 'vitest';
import { minifyCssBasic } from '../build/vite-plugin-minify-css-literal';

describe('minifyCssBasic', () => {
  it('strips comments and collapses whitespace', () => {
    const input = `
      /* header */
      .tbridge-item {
        color:  #fff;
        margin: 0  auto;
      }
    `;
    expect(minifyCssBasic(input)).toBe('.tbridge-item{color:#fff;margin:0 auto}');
  });

  it('preserves strings with spaces and special chars', () => {
    const input = `.x{content:"a /* not comment */ b";font-family:'Open Sans'}`;
    expect(minifyCssBasic(input)).toBe(
      `.x{content:"a /* not comment */ b";font-family:'Open Sans'}`,
    );
  });

  it('preserves @media and selectors', () => {
    const input = `
      @media (min-width: 520px) {
        .tbridge-modal { width: 420px; }
      }
    `;
    // Space before `(` is kept (same rule that protects `and (` / `or (` in media queries).
    expect(minifyCssBasic(input)).toBe('@media (min-width:520px){.tbridge-modal{width:420px}}');
  });

  // CSS Values: `+` / `-` inside calc() MUST be surrounded by whitespace, else the
  // whole declaration is dropped (here: max-height → none, the modal overflows).
  it('keeps the spaces around + and - after a closing parenthesis in calc()', () => {
    expect(minifyCssBasic('.a { max-height: calc(100vh - var(--x) - 8px); }')).toBe(
      '.a{max-height:calc(100vh - var(--x) - 8px)}',
    );
    expect(minifyCssBasic('.a { --y: calc(var(--a, 0px) + var(--b, 0px)); }')).toBe(
      '.a{--y:calc(var(--a,0px) + var(--b,0px))}',
    );
  });

  it('preserves spaces around media-query logical operators (and/or/not)', () => {
    const input = `
      @media (hover: hover) and (pointer: fine) {
        .tbridge-item:hover { transform: translateY(-3px); }
        .tbridge-item:hover .tbridge-item-icon { transform: scale(1.06); }
      }
    `;
    const out = minifyCssBasic(input);
    // Must NOT collapse to `)and(` — that invalidates the whole rule
    expect(out).toContain(') and (');
    expect(out).not.toContain(')and(');
    expect(out).toContain('.tbridge-item:hover .tbridge-item-icon');
    expect(out).toContain('translateY(-3px)');
  });

  it('preserves multi-value property spaces', () => {
    expect(minifyCssBasic('.x{box-shadow: 0 10px 22px -6px rgba(0, 0, 0, 0.35)}')).toBe(
      '.x{box-shadow:0 10px 22px -6px rgba(0,0,0,0.35)}',
    );
  });

  it('is idempotent on already-minified CSS', () => {
    const min = '.a{color:red}.b{margin:0}';
    expect(minifyCssBasic(min)).toBe(min);
  });
});
