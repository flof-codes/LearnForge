import { useEffect } from 'react';
import { Mic } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDictation } from '../../hooks/useDictation';

interface Props {
  /** The text in the field right now; dictation appends to it. */
  value: string;
  onText: (text: string) => void;
  disabled?: boolean;
}

/**
 * Starts and stops dictation into a text field. Renders nothing where the
 * browser cannot listen; the keyboard's own microphone key still works there.
 */
export default function MicButton({ value, onText, disabled }: Props) {
  const { t, i18n } = useTranslation('app');
  const { supported, listening, error, start, stop } = useDictation({ language: i18n.language, onText: text => { if (!disabled) onText(text); } });
  // Once the field is locked (the answer is on its way), nothing more may be dictated into it.
  useEffect(() => {
    if (disabled && listening) stop();
  }, [disabled, listening, stop]);
  if (!supported) return null;
  const label = error ? t('tutor.dictationFailed') : listening ? t('tutor.stopDictation') : t('tutor.dictate');
  return (
    <button
      type="button"
      onClick={() => (listening ? stop() : start(value))}
      disabled={disabled}
      aria-pressed={listening}
      aria-label={label}
      title={label}
      className={`shrink-0 w-12 grid place-items-center rounded-lg border transition-colors disabled:opacity-50 ${
        listening ? 'bg-danger border-danger text-white animate-pulse' : error ? 'bg-bg-surface border-warning text-warning' : 'bg-bg-surface border-border text-text-primary hover:bg-bg-hover'
      }`}
    >
      <Mic size={20} />
    </button>
  );
}
