import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PAGE_COLORS } from './tokens';

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `missing ${selector} in index.css`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
}

describe('PAGE_COLORS', () => {
  it.each([
    [':root', 'light'],
    [":root[data-theme='dark']", 'dark'],
    [":root[data-theme='sepia']", 'sepia'],
  ] as const)('%s matches index.css', (selector, theme) => {
    const rules = block(selector);
    expect(rules).toContain(`--bg: ${PAGE_COLORS[theme].bg};`);
    expect(rules).toContain(`--ink: ${PAGE_COLORS[theme].ink};`);
  });
});
