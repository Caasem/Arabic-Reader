import { stackFor } from '../readerFont/fontStack';
import type { ReaderPreferences } from '../types';

/** Which kind of screen the person reads on. First-run onboarding picks one,
 * and it only sets starting preferences: every value stays editable in Settings. */
export type DeviceProfile = 'phone' | 'tablet' | 'desktop';

export const DEVICE_PROFILES: DeviceProfile[] = ['phone', 'tablet', 'desktop'];

/** Dictionaries the person can add during onboarding, besides the essential
 * offline one (AraMorph), which is always on. Ids are the provider ids. */
export const ESSENTIAL_PROVIDER_ID = 'aramorph';
export type OptionalProviderId = 'alwasit' | 'alsihah' | 'almaqayis' | 'baranov';
export const OPTIONAL_PROVIDER_IDS: OptionalProviderId[] = ['alwasit', 'alsihah', 'almaqayis', 'baranov'];

interface DetectEnv {
  userAgent: string;
  maxTouchPoints: number;
  /** `(pointer: coarse)` is the primary input. */
  coarsePointer: boolean;
  /** The smaller side of the physical screen, in CSS pixels. */
  screenShortSide: number;
}

/**
 * Recognises the device, not the window: a narrow desktop window is still a
 * desktop. The user agent comes first, then the primary pointer; an iPad that
 * asks for the desktop site reports as a Mac with a touch screen.
 */
export function detectDeviceProfileFrom(env: DetectEnv): DeviceProfile {
  const ua = env.userAgent;
  const android = /Android/.test(ua);
  if (/iPhone|iPod/.test(ua) || (android && /Mobile/.test(ua))) return 'phone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && env.maxTouchPoints > 1) || (android && !/Mobile/.test(ua))) return 'tablet';
  if (env.coarsePointer) return env.screenShortSide < 600 ? 'phone' : 'tablet';
  return 'desktop';
}

export function detectDeviceProfile(): DeviceProfile {
  let coarse = false;
  try {
    coarse = window.matchMedia('(pointer: coarse)').matches;
  } catch {
    // no matchMedia: treat as a mouse device
  }
  return detectDeviceProfileFrom({
    userAgent: navigator.userAgent || '',
    maxTouchPoints: navigator.maxTouchPoints || 0,
    coarsePointer: coarse,
    screenShortSide: Math.min(window.screen?.width || 9999, window.screen?.height || 9999),
  });
}

/** Preferences a profile starts from. Scroll all (one continuous scroll through
 * the book), single-column Amiri on all three. */
export function profilePreferences(profile: DeviceProfile): Partial<ReaderPreferences> {
  const shared: Partial<ReaderPreferences> = {
    readingFlow: 'scrolled',
    continuousScrollEnabled: true,
    twoColumnEnabled: false,
    fontFamily: stackFor('Amiri'),
  };
  if (profile === 'desktop') {
    return {
      ...shared,
      quietReaderEnabled: true,
      cleanReaderEnabled: false,
      readingWidthPct: 65,
      hoverPreviewEnabled: true,
    };
  }
  return {
    ...shared,
    quietReaderEnabled: false,
    cleanReaderEnabled: true,
    readingWidthPct: profile === 'tablet' ? 80 : 100,
    hoverPreviewEnabled: false,
    touchGestures: { singleTap: 'openDictionary', doubleTap: 'quickSave', hold: 'none' },
  };
}

/** The sidebar starts expanded on desktop and collapsed on touch devices. */
export function sidebarStartsCollapsed(profile: DeviceProfile): boolean {
  return profile !== 'desktop';
}

export function enabledProvidersFor(optional: readonly OptionalProviderId[]): string[] {
  return [ESSENTIAL_PROVIDER_ID, ...OPTIONAL_PROVIDER_IDS.filter((id) => optional.includes(id))];
}

/** Everything onboarding writes, as one preferences patch. */
export function onboardingPreferences(profile: DeviceProfile, optional: readonly OptionalProviderId[]): Partial<ReaderPreferences> {
  return { ...profilePreferences(profile), theme: 'dark', enabledProviderIds: enabledProvidersFor(optional) };
}
