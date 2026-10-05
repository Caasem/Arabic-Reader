import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePreferences } from '../state/PreferencesContext';
import {
  detectDeviceProfile,
  onboardingPreferences,
  type DeviceProfile,
  type OptionalProviderId,
} from './deviceProfile';
import { applySidebarStart, markOnboardingDone, preloadStarterBooks } from './firstRun';
import './onboarding.css';

const SLIDES: { label: string; title: string; lines: ReactNode[]; tags?: string[]; art: () => ReactNode }[] = [
  {
    label: 'Welcome',
    title: 'Read. Tap. Remember.',
    lines: ['Read Arabic without breaking your flow.', 'Tap, understand, save, remember.'],
    art: () => (
      <div className="ob-hero">
        <div className="ob-hero__mark" aria-hidden="true">ق</div>
        <div className="ob-hero__name">Arabic Reader</div>
      </div>
    ),
  },
  {
    label: 'Look up',
    title: 'Tap a word. Keep reading.',
    lines: ['Tap any word to see its meaning and root.', 'Save it with one tap.'],
    art: () => (
      <div className="ob-demo">
        <div className="ob-read" lang="ar" dir="rtl">
          يَقْرَأُ الطَّالِبُ <span className="ob-w">الكِتَابَ<i className="ob-rip" /></span> كُلَّ يَوْمٍ
        </div>
        <div className="ob-pop">
          <div className="ob-pop__hd"><b lang="ar">كِتَاب</b><span className="ob-root">root ك ت ب</span></div>
          <span>book</span>
          <span className="ob-pop__def">written or printed pages bound together</span>
          <span className="ob-save"><span className="ob-save__1">Save word</span><span className="ob-save__2">Saved</span></span>
        </div>
        <div className="ob-chip">Added to your vocabulary</div>
      </div>
    ),
  },
  {
    label: 'Dictionary search',
    title: 'Search without leaving the page.',
    lines: [<>Press <b>Alt+D</b> to look up a word.</>],
    tags: ['English–Arabic', 'Al-Ṣiḥāḥ', 'Maqāyīs al-Lugha', '+ more'],
    art: () => (
      <>
        <div className="ob-keys" aria-hidden="true"><kbd>Alt</kbd><kbd>D</kbd></div>
        <div className="ob-demo">
          <div className="ob-read ob-read--dim" lang="ar" dir="rtl">فِي المَكْتَبَةِ كُتُبٌ كَثِيرَةٌ</div>
          <div className="ob-sbox">
            <div className="ob-sbox__f" lang="ar" dir="rtl"><span className="ob-type">عِلْم</span></div>
            <div className="ob-sbox__res"><b lang="ar">عِلْم</b> knowledge · root ع ل م</div>
          </div>
        </div>
      </>
    ),
  },
  {
    label: 'Review',
    title: 'Learn it. Remember it.',
    lines: ['Review words just before you forget them.', 'Your streak and vocabulary grow as you read.'],
    art: () => (
      <div className="ob-demo ob-demo--center">
        <div className="ob-rcard"><b lang="ar">كِتَاب</b><span className="ob-rcard__ans">book · root ك ت ب</span></div>
        <div className="ob-revs">
          <span>Again<small>1 min</small></span>
          <span>Hard<small>1 day</small></span>
          <span className="ob-revs__good">Good<small>3 days</small></span>
          <span>Easy<small>7 days</small></span>
        </div>
        <div className="ob-stat">
          <span>7 day streak</span>
          <span className="ob-stat__v"><span className="ob-stat__1">128 words</span><span className="ob-stat__2">129 words</span></span>
        </div>
      </div>
    ),
  },
];

const DEVICES: { id: DeviceProfile; label: string; icon: ReactNode }[] = [
  { id: 'phone', label: 'Phone', icon: <><rect x="11" y="3" width="14" height="30" rx="3.5" /><path d="M16 28h4" /></> },
  { id: 'tablet', label: 'Tablet', icon: <><rect x="5" y="5" width="26" height="26" rx="3.5" /><path d="M16 27h4" /></> },
  { id: 'desktop', label: 'Desktop', icon: <><rect x="3" y="6" width="30" height="20" rx="2.5" /><path d="M12 31h12M18 26v5" /></> },
];

const BOOK = <path d="M4 8c4-2 9-2 13 1v18c-4-3-9-3-13-1zM30 8c-4-2-9-2-13 1v18c4-3 9-3 13-1z" />;
const DICTS: { id: 'aramorph' | OptionalProviderId; label: string; mark: string }[] = [
  { id: 'aramorph', label: 'English–Arabic', mark: 'EN' },
  { id: 'alwasit', label: 'Al-Wasīṭ', mark: 'و' },
  { id: 'alsihah', label: 'Al-Ṣiḥāḥ', mark: 'ص' },
  { id: 'almaqayis', label: 'Maqāyīs al-Lugha', mark: 'م' },
  { id: 'baranov', label: 'Baranov (Arabic–Russian)', mark: 'Р' },
];

const DEVICE_NAME: Record<DeviceProfile, string> = { phone: 'Phone', tablet: 'Tablet', desktop: 'Desktop' };

function Svg({ children, size = 36 }: { children: ReactNode; size?: number }) {
  return (
    <svg viewBox="0 0 36 36" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

/**
 * The first-run welcome: a four-slide showcase, then two choices (device and
 * dictionaries). Local only; skippable at every point; every value stays
 * editable in Settings. Rendered instead of the app until it finishes.
 */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const { updatePrefs } = usePreferences();
  const [detected] = useState(detectDeviceProfile);
  const [phase, setPhase] = useState<'show' | 'setup'>('show');
  const [slide, setSlide] = useState(0);
  const [step, setStep] = useState<1 | 2>(1);
  const [profile, setProfile] = useState<DeviceProfile>(detected);
  const [optional, setOptional] = useState<OptionalProviderId[]>([]);
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [phase, slide, step]);

  async function finish(withProfile: DeviceProfile, withOptional: OptionalProviderId[]) {
    if (busy) return;
    setBusy(true);
    updatePrefs(onboardingPreferences(withProfile, withOptional));
    applySidebarStart(withProfile);
    markOnboardingDone();
    await preloadStarterBooks();
    onDone();
  }

  const useRecommended = () => finish(detected, []);
  const toggleDict = (id: OptionalProviderId) =>
    setOptional((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const current = SLIDES[slide];
  const summary = [DEVICE_NAME[profile], 'English–Arabic', ...DICTS.filter((d) => d.id !== 'aramorph' && optional.includes(d.id as OptionalProviderId)).map((d) => d.label)].join(' · ');

  return (
    <div className="ob" role="dialog" aria-modal="true" aria-label="Welcome to Arabic Reader">
      <section className="ob-panel">
        {phase === 'show' ? (
          <div key={slide} className="ob-slide">
            <div className="ob-art">{current.art()}</div>
            <div className="ob-txt">
              <p className="ob-kicker">{current.label}</p>
              <h1 className="ob-h1" tabIndex={-1} ref={titleRef}>{current.title}</h1>
              <p className="ob-lede">
                {current.lines.map((line, i) => (
                  <span key={i}>{line}{i < current.lines.length - 1 && <br />}</span>
                ))}
              </p>
              {current.tags && (
                <ul className="ob-tags">
                  {current.tags.map((t) => <li key={t} className={t.startsWith('+') ? 'ob-tags__more' : undefined}>{t}</li>)}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="ob-setup">
            <div className="ob-top">
              <span className="ob-mark" aria-hidden="true">ق</span>
              <div className="ob-steps" role="img" aria-label={`Step ${step} of 2`}>
                <i className="on" />
                <i className={step === 2 ? 'on' : ''} />
              </div>
            </div>
            <div key={step} className="ob-step">
              {step === 1 ? (
                <>
                  <h2 className="ob-q" tabIndex={-1} ref={titleRef}>What are you reading on?</h2>
                  <div className="ob-choices" role="radiogroup" aria-label="Device">
                    {DEVICES.map((d) => (
                      <div className="ob-choice" key={d.id}>
                        <input type="radio" name="ob-profile" id={`ob-p-${d.id}`} checked={profile === d.id} onChange={() => setProfile(d.id)} />
                        <label htmlFor={`ob-p-${d.id}`}>
                          <Svg size={40}>{d.icon}</Svg>
                          <strong>{d.label}</strong>
                          {detected === d.id && <span className="ob-rec">Recommended</span>}
                        </label>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <h2 className="ob-q" tabIndex={-1} ref={titleRef}>Which dictionaries would you like?</h2>
                  <div className="ob-dgrid">
                    {DICTS.slice(0, 2).map((d) => (
                      <DictTile key={d.id} d={d} on={d.id === 'aramorph' || optional.includes(d.id as OptionalProviderId)} locked={d.id === 'aramorph'} onToggle={() => toggleDict(d.id as OptionalProviderId)} />
                    ))}
                  </div>
                  <p className="ob-grp">Classical</p>
                  <div className="ob-dgrid">
                    {DICTS.slice(2, 4).map((d) => (
                      <DictTile key={d.id} d={d} on={optional.includes(d.id as OptionalProviderId)} onToggle={() => toggleDict(d.id as OptionalProviderId)} />
                    ))}
                  </div>
                  <p className="ob-grp">Russian</p>
                  <div className="ob-dgrid">
                    {DICTS.slice(4).map((d) => (
                      <DictTile key={d.id} d={d} on={optional.includes(d.id as OptionalProviderId)} onToggle={() => toggleDict(d.id as OptionalProviderId)} />
                    ))}
                  </div>
                  <p className="ob-summary" aria-live="polite"><b>{summary}</b></p>
                </>
              )}
            </div>
          </div>
        )}

        <div className="ob-actions">
          {phase === 'show' ? (
            <>
              <button type="button" className="ob-btn ob-btn--quiet" onClick={() => setPhase('setup')}>Skip intro</button>
              <span className="ob-sp" />
              <div className="ob-dots" role="group" aria-label="Slides">
                {SLIDES.map((s, i) => (
                  <button key={s.label} type="button" aria-label={`Slide ${i + 1}: ${s.label}`} aria-current={i === slide} onClick={() => setSlide(i)} />
                ))}
              </div>
              {slide > 0 && <button type="button" className="ob-btn" onClick={() => setSlide(slide - 1)}>Back</button>}
              <button type="button" className="ob-btn ob-btn--primary" onClick={() => (slide === SLIDES.length - 1 ? setPhase('setup') : setSlide(slide + 1))}>Next</button>
            </>
          ) : (
            <>
              {step === 2 ? (
                <button type="button" className="ob-btn ob-btn--quiet" onClick={() => setStep(1)}>Back</button>
              ) : (
                <button type="button" className="ob-btn ob-btn--quiet" onClick={() => { setPhase('show'); setSlide(SLIDES.length - 1); }}>Back</button>
              )}
              <span className="ob-sp" />
              {step === 1 ? (
                <button type="button" className="ob-btn ob-btn--primary" onClick={() => setStep(2)}>Next</button>
              ) : (
                <button type="button" className="ob-btn ob-btn--primary" disabled={busy} onClick={() => finish(profile, optional)}>
                  {busy ? 'Setting up…' : 'Set up my reading space'}
                </button>
              )}
            </>
          )}
        </div>
        {phase === 'setup' && (
          <div className="ob-alt">
            <button type="button" className="ob-btn ob-btn--quiet" disabled={busy} onClick={useRecommended}>Use recommended settings</button>
            <button type="button" className="ob-btn ob-btn--quiet" disabled={busy} onClick={useRecommended}>Skip for now</button>
          </div>
        )}
      </section>
    </div>
  );
}

function DictTile({ d, on, locked, onToggle }: { d: (typeof DICTS)[number]; on: boolean; locked?: boolean; onToggle(): void }) {
  return (
    <div className={'ob-dtile' + (on ? ' on' : '')}>
      <input type="checkbox" id={`ob-d-${d.id}`} checked={on} disabled={locked} onChange={onToggle} aria-label={d.label} />
      <label htmlFor={`ob-d-${d.id}`}>
        <svg viewBox="0 0 36 36" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {BOOK}
          <circle cx="28" cy="28" r="7" fill="var(--bg-elevated)" stroke="currentColor" />
          <text x="28" y="31.5" textAnchor="middle" fontSize="9.5" fontWeight="700" stroke="none" fill="currentColor">{d.mark}</text>
        </svg>
        <strong>{d.label}</strong>
        <span className="ob-tick" aria-hidden="true">
          <svg viewBox="0 0 14 14" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 7.5l3 3 6-7" /></svg>
        </span>
      </label>
    </div>
  );
}
