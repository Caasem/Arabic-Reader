import './hansWehrForms.css';
import { hansWehrFormLine } from './hansWehrForms';
import { SenseText, type WordPicking } from './SenseText';

/**
 * A Hans Wehr line: when it is a derived form's, its Roman numeral becomes a small pill and the rest follows,
 * with its Arabic and transliteration set apart; any other line is just set the same way. Built as elements,
 * never as HTML. With `picking`, the words after the pill can be picked.
 */
export function HansWehrMeaning({ gloss, picking }: { gloss: string; picking?: WordPicking }) {
  const form = hansWehrFormLine(gloss);
  if (!form) return <SenseText text={gloss} style="hanswehr" picking={picking} />;
  const rest = gloss.trimStart().slice(form.label.length).trimStart();
  return (
    <>
      <span className="dict-hw-form" title={`Form ${form.forms.join(' and ')}`}>
        {form.label}
      </span>
      <SenseText text={gloss} style="hanswehr" from={gloss.length - rest.length} picking={picking} />
    </>
  );
}
