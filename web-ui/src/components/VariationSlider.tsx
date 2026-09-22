import { useTranslation } from 'react-i18next';
import { variationWord } from '../lib/variation';

interface Props {
  /** The value set here, or null when inheriting. */
  value: number | null;
  /** What the item inherits when its own value is empty. */
  inheritedValue: number;
  /** Name of the topic the inherited value comes from; null means the default. */
  inheritedFrom: string | null;
  onChange: (value: number | null) => void;
  idPrefix: string;
}

const HINT_KEY = { exact: 'hintExact', reworded: 'hintReworded', newContext: 'hintNewContext', free: 'hintFree' } as const;

/**
 * "Question variation": how far the tutor may drift from a card's original question.
 * Words instead of numbers; the number is stored as 0..1.
 */
export default function VariationSlider({ value, inheritedValue, inheritedFrom, onChange, idPrefix }: Props) {
  const { t } = useTranslation('app');
  const inherits = value === null;
  const shown = inherits ? inheritedValue : value;
  const word = variationWord(shown);
  const inheritedWord = t(`variation.${variationWord(inheritedValue)}`);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label htmlFor={`${idPrefix}-variation`} className="text-sm text-text-muted">{t('variation.variation')}</label>
        <span className="text-sm font-medium">{t(`variation.${word}`)}</span>
      </div>
      <input
        id={`${idPrefix}-variation`}
        type="range"
        min={0}
        max={1}
        step={0.1}
        value={shown}
        disabled={inherits}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-accent-blue disabled:opacity-50"
      />
      <div className="flex justify-between text-xs text-text-muted">
        <span>{t('variation.exact')}</span>
        <span>{t('variation.reworded')}</span>
        <span>{t('variation.newContext')}</span>
        <span>{t('variation.free')}</span>
      </div>
      <p className="text-xs text-text-muted">{t(`variation.${HINT_KEY[word]}`)}</p>
      <label className="flex items-center gap-2 text-sm">
        <input
          id={`${idPrefix}-variation-inherit`}
          type="checkbox"
          checked={inherits}
          onChange={e => onChange(e.target.checked ? null : inheritedValue)}
        />
        <span>
          {inheritedFrom
            ? t('variation.sameAs', { name: inheritedFrom, word: inheritedWord })
            : t('variation.sameAsDefault', { word: inheritedWord })}
        </span>
      </label>
    </div>
  );
}
