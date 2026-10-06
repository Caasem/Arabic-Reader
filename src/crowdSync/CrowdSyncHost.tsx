import { useEffect, useRef } from 'react';
import { usePreferences } from '../state/PreferencesContext';
import { configureConsent } from './consent';
import { CROWD_API_BASE } from './publicKeys';
import { startCrowdSync } from './scheduler';

/**
 * Mounted once at the top of the app. Connects the live "share" setting to the single consent gate, and runs the
 * background sending and ranking refresh only while sharing is on. Renders nothing.
 */
export function CrowdSyncHost() {
  const { prefs } = usePreferences();
  const prefsRef = useRef(prefs);
  useEffect(() => {
    prefsRef.current = prefs;
  });

  useEffect(() => {
    configureConsent({ isSharingOn: () => prefsRef.current.crowdSharing, apiBase: CROWD_API_BASE });
  }, []);

  useEffect(() => {
    if (!prefs.crowdSharing || !CROWD_API_BASE) return;
    return startCrowdSync();
  }, [prefs.crowdSharing]);

  return null;
}
