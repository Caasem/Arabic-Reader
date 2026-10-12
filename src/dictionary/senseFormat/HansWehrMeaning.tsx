import './hansWehrForms.css';
import { hansWehrFormLine } from './hansWehrForms';

/**
 * A Hans Wehr line: when it is a derived form's, its Roman numeral becomes a small label and the rest
 * follows; otherwise `children` (the line as it is). Built as elements, never as HTML.
 */
export function HansWehrMeaning({ gloss, children }: { gloss: string; children: React.ReactNode }) {
  const form = hansWehrFormLine(gloss);
  if (!form) return <>{children}</>;
  const rest = gloss.trimStart().slice(form.label.length).trimStart();
  return (
    <>
      <span className="dict-hw-form" title={`Form ${form.forms.join(' and ')}`}>
        {form.label}
      </span>
      {rest}
    </>
  );
}
