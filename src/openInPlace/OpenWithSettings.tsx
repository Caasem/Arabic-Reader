import { Note, SettingsSection } from '../components/shared/settings/controls';
import { getFilesBridge } from '../sync/desktopBridge';

/** Settings → Library & data, desktop only: how files from the computer reach the app, and the one thing the app cannot do for you. */
export function OpenWithSettings() {
  if (!getFilesBridge()) return null;
  return (
    <SettingsSection title="Open files from your computer">
      <Note>
        Double-click a PDF or EPUB, or right-click it and choose Open with, then Arabic Reader. It opens in its own window and is
        not added to your library until you choose Add to library. In the Library, Open file… (Ctrl+O) does the same.
      </Note>
      <Note>
        Windows does not let an app make itself the default for PDFs. To make Arabic Reader the default, choose it under Open with
        once and tick “Always use this app”.
      </Note>
    </SettingsSection>
  );
}
