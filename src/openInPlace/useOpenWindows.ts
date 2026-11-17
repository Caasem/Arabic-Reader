import { useEffect, useState } from 'react';
import { getWindowsBridge, type DesktopWindowInfo } from '../sync/desktopBridge';

/** The windows the desktop app has open, kept current. Empty in a browser or on a phone. */
export function useOpenWindows(): DesktopWindowInfo[] {
  const [windows, setWindows] = useState<DesktopWindowInfo[]>([]);
  useEffect(() => {
    const bridge = getWindowsBridge();
    if (!bridge) return;
    let live = true;
    void bridge.list().then((list) => live && setWindows(list));
    const off = bridge.onChange((list) => setWindows(list));
    return () => {
      live = false;
      off();
    };
  }, []);
  return windows;
}
