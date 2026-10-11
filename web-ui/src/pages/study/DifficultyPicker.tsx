import { useTranslation } from 'react-i18next';
import { HEADSPACE, DIFFICULTY_MIN, DIFFICULTY_MAX, DIFFICULTY_STEP, DIFFICULTY_TICKS, presetOf, choiceTile } from '../../utils/tutor';

interface Props {
  value: number;
  onChange: (difficulty: number) => void;
}

/** The session difficulty: three presets as anchor points, and the value itself on a slider. */
export default function DifficultyPicker({ value, onChange }: Props) {
  const { t } = useTranslation('app');
  const preset = presetOf(value);
  const span = DIFFICULTY_MAX - DIFFICULTY_MIN;
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {HEADSPACE.map(h => (
          <button key={h.key} type="button" aria-pressed={preset === h.key} onClick={() => onChange(h.value)} className={choiceTile(preset === h.key)}>
            <b className="font-semibold text-[15px]">{t(`tutor.headspace.${h.key}`)}</b>
            <span className="text-xs text-text-muted leading-snug">{t(`tutor.headspace.${h.key}Hint`)}</span>
          </button>
        ))}
      </div>
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0 px-2">
          <input
            type="range"
            min={DIFFICULTY_MIN}
            max={DIFFICULTY_MAX}
            step={DIFFICULTY_STEP}
            value={value}
            onChange={e => onChange(Number(e.target.value))}
            aria-label={t('tutor.difficulty')}
            className="block w-full accent-accent-blue"
          />
          <div className="relative h-4 mt-1 text-[11px] text-text-muted tabular-nums" aria-hidden="true">
            {DIFFICULTY_TICKS.map(tick => (
              <span key={tick} className="absolute -translate-x-1/2" style={{ left: `${((tick - DIFFICULTY_MIN) / span) * 100}%` }}>{tick.toFixed(tick === 0.85 ? 2 : 1)}</span>
            ))}
          </div>
        </div>
        <output className="shrink-0 w-12 text-right text-xl font-semibold tabular-nums leading-tight">{value.toFixed(2)}</output>
      </div>
    </>
  );
}
