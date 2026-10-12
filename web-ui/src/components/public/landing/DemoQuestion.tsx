import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Check, RotateCcw, X } from 'lucide-react';

interface DemoReview {
  label: string;
  level: string;
  stem: string;
  options: string[];
  answer: number;
  explain: string;
}

const LEVEL_BADGE = [
  'bg-bloom-0-bg text-bloom-0-text',
  'bg-bloom-1-bg text-bloom-1-text',
  'bg-bloom-2-bg text-bloom-2-text',
] as const;

const LETTERS = ['A', 'B', 'C', 'D'] as const;

// One card asked three ways. The questions are fixtures from landing.json, graded in the browser.
export default function DemoQuestion() {
  const { t } = useTranslation('landing');
  const reviews = t('demo.reviews', { returnObjects: true }) as DemoReview[];
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);

  const nextRef = useRef<HTMLButtonElement>(null);

  // The options stop reacting once answered; move focus on so keyboard users keep their place.
  useEffect(() => {
    if (picked !== null) nextRef.current?.focus({ preventScroll: true });
  }, [picked]);

  const review = reviews[step];
  const answered = picked !== null;
  const isLast = step === reviews.length - 1;

  const goTo = (next: number) => {
    setStep(next);
    setPicked(null);
  };

  const optionClass = (i: number) => {
    if (!answered) return 'hover:bg-subtle-hover cursor-pointer';
    if (i === review.answer) return 'bg-accent-green/10';
    if (i === picked) return 'bg-danger/10';
    return 'opacity-60';
  };

  return (
    <div className="lf-bleed bg-bg-secondary border-y border-border md:rounded-xl md:border md:overflow-hidden lf-glow">
      <div role="group" aria-label={t('demo.stepsLabel')} className="flex border-b border-border">
        {reviews.map((r, i) => (
          <button
            key={r.label}
            type="button"
            aria-current={i === step ? 'step' : undefined}
            onClick={() => goTo(i)}
            className={`flex-1 px-2 py-3 text-sm font-medium border-b-2 transition-colors ${
              i === step
                ? 'border-accent-blue text-text-primary'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="px-4 pt-4 md:px-6 md:pt-5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-text-muted">{t('demo.concept')}</span>
          <span className={`px-2 py-0.5 rounded-full font-medium ${LEVEL_BADGE[step] ?? LEVEL_BADGE[0]}`}>
            {review.level}
          </span>
        </div>
        <p className="mt-3 mb-4 text-base sm:text-lg font-medium text-text-primary leading-snug">{review.stem}</p>
      </div>

      <ul className="border-t border-border divide-y divide-border">
        {review.options.map((option, i) => (
          <li key={option}>
            <button
              type="button"
              aria-disabled={answered}
              onClick={() => !answered && setPicked(i)}
              className={`w-full flex items-start gap-3 px-4 py-3.5 md:px-6 text-left text-sm text-text-primary transition-colors ${optionClass(i)}`}
            >
              <span className="shrink-0 w-6 h-6 rounded-md bg-bg-surface text-text-muted text-xs font-semibold flex items-center justify-center">
                {LETTERS[i]}
              </span>
              <span className="flex-1">{option}</span>
              {answered && i === review.answer && (
                <Check size={18} className="shrink-0 text-accent-green" aria-hidden="true" />
              )}
              {answered && i === picked && i !== review.answer && (
                <X size={18} className="shrink-0 text-danger" aria-hidden="true" />
              )}
            </button>
          </li>
        ))}
      </ul>

      <div aria-live="polite">
        {answered && (
          <div className="border-t border-border px-4 py-4 md:px-6">
            <p className={`text-sm font-semibold ${picked === review.answer ? 'text-bloom-0-text' : 'text-danger'}`}>
              {picked === review.answer ? t('demo.correct') : t('demo.wrong')}
            </p>
            <p className="mt-1 text-sm text-text-muted leading-relaxed">{review.explain}</p>
            <button
              ref={nextRef}
              type="button"
              onClick={() => goTo(isLast ? 0 : step + 1)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-blue text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              {isLast ? t('demo.restart') : t('demo.next')}
              {isLast ? <RotateCcw size={16} aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
