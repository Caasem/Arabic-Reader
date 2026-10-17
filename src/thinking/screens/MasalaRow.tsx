import type { Desk, DeskItem } from '../../studyDesk/types';
import { wordsOf } from '../labels';
import { ago, citeOf, dateLabel, placeOf } from '../passages';

/**
 * One masʾala as a row: a ؟ mark (✓ once answered), the question, when and where it was asked and its threads, then
 * its answer with Reopen, or Find the answer. It is answered when `answer` (the passage) is given.
 */
export function MasalaRow({
  item,
  answer,
  threads,
  onFind,
  onReopen,
  onOpen,
}: {
  item: DeskItem;
  answer?: DeskItem;
  threads: Desk[];
  onFind(item: DeskItem): void;
  onReopen(item: DeskItem): void;
  onOpen(item: DeskItem): void;
}) {
  const where = citeOf(item);
  return (
    <article className={'th-masala' + (answer ? ' th-masala--answered' : '')}>
      <span className="th-masala__mark" role="img" aria-label={answer ? 'Answered' : 'Open'}>
        {answer ? '✓' : '؟'}
      </span>
      <div className="th-masala__main">
        <p className={item.ar ? 'th-masala__q th-ar' : 'th-masala__q'} dir="auto">
          {wordsOf(item)}
        </p>
        <p className="th-line__meta">
          asked {dateLabel(item.createdAt)} ({ago(item.createdAt)})
          {where && (
            <>
              {' · while reading '}
              <bdi>{where}</bdi>
            </>
          )}
          {threads.map((t) => (
            <span key={t.id} className="th-masala__thread" dir="auto">
              {t.titleAr?.trim() ? <span className="th-ar">{t.titleAr.trim()}</span> : t.title}
            </span>
          ))}
        </p>
        {answer && (
          <div className="th-masala__answer">
            <p className={answer.ar ? 'th-masala__words th-ar' : 'th-masala__words'} dir="auto">
              {wordsOf(answer)}
            </p>
            <p className="th-line__meta">
              {'Answered '}
              {item.answeredAt ? `${dateLabel(item.answeredAt)} ` : ''}
              {citeOf(answer) && (
                <>
                  {'by '}
                  <bdi>{citeOf(answer)}</bdi>
                </>
              )}
              {placeOf(answer) && (
                <button type="button" className="th-link" onClick={() => onOpen(answer)}>
                  Open page ↗
                </button>
              )}
            </p>
          </div>
        )}
        <div className="th-masala__acts">
          {answer ? (
            <button type="button" className="sd-btn" onClick={() => onReopen(item)}>
              Reopen
            </button>
          ) : (
            <button type="button" className="sd-btn sd-btn--pri" onClick={() => onFind(item)}>
              Find the answer
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
