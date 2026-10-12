import { describe, expect, it } from 'vitest';
import { hansWehrFormLine } from './hansWehrForms';

describe('hansWehrFormLine', () => {
  it('reads the form a line opens with', () => {
    expect(hansWehrFormLine('VI to envy each other')).toEqual({ label: 'VI', forms: [6] });
    expect(hansWehrFormLine('VIII احتسد iḥtasada')).toEqual({ label: 'VIII', forms: [8] });
    expect(hansWehrFormLine('X to ask')).toEqual({ label: 'X', forms: [10] });
  });
  it('reads a shared line', () => {
    expect(hansWehrFormLine('V and XII احدودب iḥaudaba to be crooked')).toEqual({ label: 'V and XII', forms: [5, 12] });
  });
  it('leaves other lines alone', () => {
    expect(hansWehrFormLine('حسد ḥasada u (ḥasad) to envy')).toBeNull();
    expect(hansWehrFormLine('Victory is near')).toBeNull();
    expect(hansWehrFormLine('IVORY')).toBeNull();
    expect(hansWehrFormLine('')).toBeNull();
  });
});
