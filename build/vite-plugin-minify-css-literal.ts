/**
 * Vite plugin: minify CSS template literals marked with `/*@tbridge-css*\/`.
 *
 * Applied only during `vite build` (not dev/serve) so source stays readable.
 * Zero dependencies — deterministic whitespace/comment stripper safe for
 * TBridge’s controlled stylesheet (no external CSS toolchain required).
 *
 */

import type { Plugin } from 'vite';

const MARKER = '/*@tbridge-css*/';

/**
 * Conservative CSS minify for known-safe stylesheets:
 * - strip block comments
 * - collapse whitespace outside of strings
 * - trim around `{ } : ; ,`
 *
 * Does not rewrite values, selectors, or @-rules beyond whitespace.
 */
export function minifyCssBasic(input: string): string {
  let out = '';
  let i = 0;
  const n = input.length;
  let inStr: '"' | "'" | null = null;

  while (i < n) {
    const c = input[i]!;

    // String literals — copy verbatim
    if (inStr) {
      out += c;
      if (c === '\\' && i + 1 < n) {
        out += input[i + 1]!;
        i += 2;
        continue;
      }
      if (c === inStr) inStr = null;
      i += 1;
      continue;
    }

    if (c === '"' || c === "'") {
      inStr = c;
      out += c;
      i += 1;
      continue;
    }

    // Block comment /* ... */
    if (c === '/' && input[i + 1] === '*') {
      i += 2;
      while (i < n && !(input[i] === '*' && input[i + 1] === '/')) i += 1;
      i += 2; // skip */
      // Keep a single space if comment sat between tokens
      if (out.length > 0 && !/[\s{};:,]$/.test(out) && i < n && !/[\s{};:,]/.test(input[i]!)) {
        out += ' ';
      }
      continue;
    }

    // Whitespace collapse
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f') {
      while (i < n && /[\s]/.test(input[i]!)) i += 1;
      const prev = out[out.length - 1];
      const next = input[i];
      if (prev && next && needsCssSpace(prev, next)) {
        out += ' ';
      }
      continue;
    }

    // Drop space before delimiter; skip whitespace after
    if (c === '}' || c === '{' || c === ';' || c === ',' || c === ':') {
      if (out.endsWith(' ')) out = out.slice(0, -1);
      out += c;
      i += 1;
      while (i < n && /[\s]/.test(input[i]!)) i += 1;
      continue;
    }

    out += c;
    i += 1;
  }

  out = out.replace(/;}/g, '}');
  return out.trim();
}

/**
 * Whether a single space is required between two adjacent non-whitespace chars.
 *
 * Critical cases for TBridge UI:
 * - `@media (hover: hover) and (pointer: fine)` — spaces around `and` / `or` / `not`
 * - `.a:hover .b` — descendant combinator
 * - `0 10px 22px` — multi-value properties
 *
 * Without spaces around media-query logical ops the whole `@media` rule is
 * invalid and hover styles silently never match.
 */
function needsCssSpace(prev: string, next: string): boolean {
  // `) and` / `) or` / `) not` — must not become `)and`
  if (prev === ')' && /[a-zA-Z_]/.test(next)) return true;
  // `var(--a) - 8px` — calc() `+` / `-` must stay whitespace-surrounded, or the
  // whole declaration is invalid and silently dropped
  if (prev === ')' && (next === '-' || next === '+')) return true;
  // `and (` / `or (` / `not (` — must not become `and(`
  if (next === '(' && /[a-zA-Z0-9_-]/.test(prev)) return true;
  // Token–token: values, selectors, combinators (`.a .b`, `0 10px`)
  if (!/[{};:,()\s]/.test(prev) && !/[{};:,()\s]/.test(next)) return true;
  return false;
}

export interface MinifyCssLiteralOptions {
  /** Substring that must appear in the module id (path). Default: styles.ts */
  include?: string | RegExp;
}

/**
 * Minify CSS template literals in matched modules during production build.
 */
export function minifyCssLiteral(options: MinifyCssLiteralOptions = {}): Plugin {
  const include = options.include ?? /[/\\]ui[/\\]styles\.ts$/;

  return {
    name: 'tbridge-minify-css-literal',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const pathOnly = id.split('?')[0] ?? id;
      const matched =
        typeof include === 'string' ? pathOnly.includes(include) : include.test(pathOnly);
      if (!matched) return null;
      if (!code.includes(MARKER) && !code.includes('const CSS =')) return null;

      let mutated = false;
      const next = code.replace(
        /(?:(\/\*@tbridge-css\*\/)\s*)?(`)([^`]*)(`)/g,
        (full, marker: string | undefined, tick1: string, body: string, tick2: string) => {
          const isMarked = Boolean(marker);
          const looksLikeCss =
            body.includes('{') &&
            body.includes('}') &&
            (body.includes('.tbridge-') || body.includes('@media') || body.includes('@keyframes'));
          if (!isMarked && !looksLikeCss) return full;

          mutated = true;
          const minified = minifyCssBasic(body);
          const prefix = marker ? `${marker} ` : '';
          return `${prefix}${tick1}${minified}${tick2}`;
        },
      );

      if (!mutated) return null;
      return { code: next, map: null };
    },
  };
}

export default minifyCssLiteral;
