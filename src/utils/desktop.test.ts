import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fullscreen, hideScrollbarsIn, isDesktopApp } from './desktop';

type G = { window?: unknown; document?: unknown };
const g = globalThis as unknown as G;

function desktopWindow() {
  return { setFullScreen: vi.fn(async () => {}), toggleFullScreen: vi.fn(async () => {}) };
}

function fakeDoc() {
  const appended: { id: string; textContent: string }[] = [];
  return {
    appended,
    getElementById: (id: string) => appended.find((s) => s.id === id) ?? null,
    createElement: () => ({ id: '', textContent: '' }),
    head: { appendChild: (el: { id: string; textContent: string }) => void appended.push(el) },
    fullscreenElement: null as unknown,
    exitFullscreen: vi.fn(async () => {}),
  };
}

beforeEach(() => {
  g.window = {};
  g.document = fakeDoc();
});
afterEach(() => {
  delete g.window;
  delete g.document;
});

describe('in the desktop app', () => {
  it('uses the OS window for fullscreen, so the title bar goes away', () => {
    const win = desktopWindow();
    g.window = { arabicReaderDesktop: { window: win } };
    const element = { requestFullscreen: vi.fn(async () => {}) };

    expect(isDesktopApp()).toBe(true);
    fullscreen.enter(element as unknown as Element);
    fullscreen.exit();
    fullscreen.toggle(element as unknown as Element);

    expect(win.setFullScreen.mock.calls).toEqual([[true], [false]]);
    expect(win.toggleFullScreen).toHaveBeenCalledTimes(1);
    expect(element.requestFullscreen).not.toHaveBeenCalled(); // the web API is not used
  });

  it('hides scrollbars inside a book page once, and not elsewhere', () => {
    g.window = { arabicReaderDesktop: { window: desktopWindow() } };
    const doc = fakeDoc();
    hideScrollbarsIn(doc as unknown as Document);
    hideScrollbarsIn(doc as unknown as Document); // a section is injected on every render
    expect(doc.appended).toHaveLength(1);
    expect(doc.appended[0].textContent).toContain('scrollbar-width:none');
  });
});

describe('in a browser', () => {
  it('falls back to the web Fullscreen API on the element', () => {
    const element = { requestFullscreen: vi.fn(async () => {}) };
    expect(isDesktopApp()).toBe(false);
    fullscreen.enter(element as unknown as Element);
    fullscreen.toggle(element as unknown as Element);
    expect(element.requestFullscreen).toHaveBeenCalledTimes(2);

    const doc = g.document as ReturnType<typeof fakeDoc>;
    doc.fullscreenElement = {};
    fullscreen.toggle(element as unknown as Element);
    expect(doc.exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it('leaves scrollbars alone', () => {
    const doc = fakeDoc();
    hideScrollbarsIn(doc as unknown as Document);
    expect(doc.appended).toHaveLength(0);
  });

  it('does nothing, and does not throw, when there is no element to fullscreen', () => {
    expect(() => {
      fullscreen.enter(null);
      fullscreen.exit();
    }).not.toThrow();
  });
});
