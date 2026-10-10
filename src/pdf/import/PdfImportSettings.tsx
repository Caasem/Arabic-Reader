import { Note, SettingsSection, ToggleRow } from '../../components/shared/settings/controls';
import { usePreferences } from '../../state/PreferencesContext';

/** Settings → PDF: whether adding a PDF tries to turn its text into a reflowable book. */
export function PdfImportSettings() {
  const { prefs, updatePrefs } = usePreferences();
  return (
    <SettingsSection title="PDF">
      <Note>
        A PDF is added as its pages, exactly as printed, and opens straight away. Turn this on to have the app read each PDF's text when you add it and
        make a reflowable book from it as well (slower; scanned PDFs and PDFs with damaged text still open as pages). It applies to PDFs added from now on.
      </Note>
      <ToggleRow label="Convert PDFs to text when adding" checked={prefs.pdfConvertToText} onChange={(value) => updatePrefs({ pdfConvertToText: value })} />
    </SettingsSection>
  );
}
