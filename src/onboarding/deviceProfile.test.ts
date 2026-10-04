import { describe, expect, it } from 'vitest';
import {
  detectDeviceProfileFrom,
  enabledProvidersFor,
  onboardingPreferences,
  profilePreferences,
  sidebarStartsCollapsed,
} from './deviceProfile';

const base = { userAgent: '', maxTouchPoints: 0, coarsePointer: false, screenShortSide: 1080 };

describe('detectDeviceProfileFrom', () => {
  it('recognises phones from the user agent', () => {
    expect(detectDeviceProfileFrom({ ...base, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' })).toBe('phone');
    expect(detectDeviceProfileFrom({ ...base, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari' })).toBe('phone');
  });

  it('recognises tablets, including an iPad that reports as a Mac', () => {
    expect(detectDeviceProfileFrom({ ...base, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0)' })).toBe('tablet');
    expect(detectDeviceProfileFrom({ ...base, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', maxTouchPoints: 5 })).toBe('tablet');
    expect(detectDeviceProfileFrom({ ...base, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-X900) Safari' })).toBe('tablet');
  });

  it('falls back to the primary pointer and screen size', () => {
    expect(detectDeviceProfileFrom({ ...base, coarsePointer: true, screenShortSide: 420 })).toBe('phone');
    expect(detectDeviceProfileFrom({ ...base, coarsePointer: true, screenShortSide: 800 })).toBe('tablet');
  });

  it('keeps a desktop a desktop, however narrow its window', () => {
    expect(detectDeviceProfileFrom({ ...base, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' })).toBe('desktop');
    expect(detectDeviceProfileFrom({ ...base, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', maxTouchPoints: 0 })).toBe('desktop');
  });
});

describe('profilePreferences', () => {
  it('gives each device its starting layout', () => {
    expect(profilePreferences('phone')).toMatchObject({ quietReaderEnabled: false, cleanReaderEnabled: true, readingWidthPct: 100, hoverPreviewEnabled: false });
    expect(profilePreferences('tablet')).toMatchObject({ cleanReaderEnabled: true, readingWidthPct: 80, hoverPreviewEnabled: false });
    expect(profilePreferences('desktop')).toMatchObject({ quietReaderEnabled: true, cleanReaderEnabled: false, readingWidthPct: 65, hoverPreviewEnabled: true });
  });

  it('opens the floating popup on a tap for touch devices only', () => {
    expect(profilePreferences('phone').touchGestures?.singleTap).toBe('openDictionary');
    expect(profilePreferences('tablet').touchGestures?.singleTap).toBe('openDictionary');
    expect(profilePreferences('desktop').touchGestures).toBeUndefined();
  });

  it('scrolls all, single-column, in Amiri everywhere', () => {
    for (const p of ['phone', 'tablet', 'desktop'] as const) {
      const prefs = profilePreferences(p);
      expect(prefs.readingFlow).toBe('scrolled');
      expect(prefs.continuousScrollEnabled).toBe(true);
      expect(prefs.twoColumnEnabled).toBe(false);
      expect(prefs.fontFamily).toMatch(/^'Amiri'/);
    }
  });

  it('collapses the sidebar off desktop', () => {
    expect(sidebarStartsCollapsed('phone')).toBe(true);
    expect(sidebarStartsCollapsed('tablet')).toBe(true);
    expect(sidebarStartsCollapsed('desktop')).toBe(false);
  });
});

describe('dictionaries', () => {
  it('always keeps the essential offline dictionary', () => {
    expect(enabledProvidersFor([])).toEqual(['aramorph']);
    expect(enabledProvidersFor(['almaqayis', 'alwasit'])).toEqual(['aramorph', 'alwasit', 'almaqayis']);
    expect(onboardingPreferences('desktop', ['alsihah']).enabledProviderIds).toEqual(['aramorph', 'alsihah']);
  });
});
