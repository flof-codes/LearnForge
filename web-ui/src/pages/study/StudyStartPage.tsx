import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTopics } from '../../hooks/useTopics';
import { useStudySummary } from '../../hooks/useStudy';
import { useTutorStatus, useTutorPrepare } from '../../hooks/useTutor';
import { dictationSupported } from '../../hooks/useDictation';
import { BLOOM_COLORS } from '../../types';
import type { AnswerMode } from '../../types';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorFallback from '../../components/ErrorFallback';
import SubscriptionBanner from '../../components/SubscriptionBanner';
import { formatPercent } from '../../utils/format';
import {
  HEADSPACE, DIFFICULTY_MIN, DIFFICULTY_MAX, DIFFICULTY_STEP, DIFFICULTY_TICKS,
  bandOf, presetOf, intervalFactor, loadTutorSettings, saveTutorSettings, settingsToParams, type TutorSettings,
} from '../../utils/tutor';

const ANSWER_MODES: AnswerMode[] = ['tap', 'type', 'dictate'];
const sectionLabel = 'flex items-baseline justify-between gap-3 text-[10px] uppercase tracking-wider text-text-muted';
const choice = (on: boolean) =>
  `flex flex-col gap-0.5 text-left rounded-lg border px-3 py-2.5 transition-colors ${on ? 'border-accent-blue bg-accent-blue/10' : 'border-border bg-bg-surface hover:bg-bg-hover'}`;

/** Which question forms a session at these settings will ask. */
function mixKey(settings: TutorSettings): string {
  const typed = settings.answerBy.includes('type') || settings.answerBy.includes('dictate');
  if (!typed) return 'choice';
  if (!settings.answerBy.includes('tap')) return 'typed';
  return { commute: 'choice', desk: 'deskTyped', deep: 'deepTyped' }[bandOf(settings.difficulty)];
}

export default function StudyStartPage() {
  const { t, i18n } = useTranslation('app');
  const [topicId, setTopicId] = useState('');
  const [settings, setSettings] = useState<TutorSettings>(loadTutorSettings);
  const { data: topics, isError: topicsError, error: topicsErr, refetch: refetchTopics } = useTopics();
  const { data: summary, isLoading, isError: summaryError, error: summaryErr, refetch: refetchSummary } = useStudySummary(topicId || undefined);
  const { data: tutor } = useTutorStatus();
  const tutorOn = tutor?.available === true;
  const waiting = (summary?.dueCount ?? 0) + (summary?.newCount ?? 0);
  // The writer starts for settings that have stood still for a moment, not for every step of the slider.
  const [settled, setSettled] = useState(settings);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(settings), 600);
    return () => clearTimeout(timer);
  }, [settings]);
  const { data: prepared } = useTutorPrepare(tutorOn && waiting > 0, topicId || undefined, settled);
  const navigate = useNavigate();

  const change = (next: TutorSettings) => {
    setSettings(next);
    saveTutorSettings(next);
  };
  const toggleMode = (mode: AnswerMode) => {
    const answerBy = settings.answerBy.includes(mode) ? settings.answerBy.filter(m => m !== mode) : [...settings.answerBy, mode];
    // One way to answer always stays on.
    change({ ...settings, answerBy: answerBy.length > 0 ? answerBy : ['tap'] });
  };

  const handleStart = () => {
    const params = new URLSearchParams();
    if (topicId) params.set('topicId', topicId);
    if (tutorOn) settingsToParams(settings, params);
    navigate(`/dashboard/study/session?${params.toString()}`);
  };

  if (isLoading) return <LoadingSpinner />;

  if (summaryError || topicsError) {
    const err = summaryErr || topicsErr;
    return <ErrorFallback message={(err as Error).message} onReset={() => { refetchSummary(); refetchTopics(); }} />;
  }

  const totalBloom = summary ? Object.values(summary.bloomLevels).reduce((a, b) => a + b, 0) : 0;
  const preset = presetOf(settings.difficulty);
  const span = DIFFICULTY_MAX - DIFFICULTY_MIN;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <SubscriptionBanner />
      <h1 className="text-2xl font-medium">{t('study.title')}</h1>

      {/* What to study: everything that is due unless a topic narrows it */}
      <div className="lf-panel space-y-4">
        <div className="space-y-2">
          <div className={sectionLabel}>
            <label htmlFor="study-topic">{t('study.whatToStudy')}</label>
            <span className="normal-case tracking-normal text-xs">{t('study.optionalFilter')}</span>
          </div>
          <select
            id="study-topic"
            value={topicId}
            onChange={e => setTopicId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-border text-sm text-text-primary focus:outline-none focus:border-accent-blue"
          >
            <option value="">{t('study.everythingDue')}</option>
            {(topics ?? []).map(tp => (
              <option key={tp.id} value={tp.id}>{tp.name}</option>
            ))}
          </select>
        </div>

        {summary && (
          <>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <p className="text-2xl font-light tabular-nums">{summary.totalCards}</p>
                <p className="text-xs text-text-muted">{t('study.total')}</p>
              </div>
              <div>
                <p className="text-2xl font-light tabular-nums text-accent-blue">{summary.newCount}</p>
                <p className="text-xs text-text-muted">{t('study.new')}</p>
              </div>
              <div>
                <p className="text-2xl font-light tabular-nums text-warning">{summary.dueCount}</p>
                <p className="text-xs text-text-muted">{t('study.due')}</p>
              </div>
              <div>
                <p className="text-2xl font-light tabular-nums">{summary.accuracy7d != null ? formatPercent(summary.accuracy7d, i18n.language) : '--'}</p>
                <p className="text-xs text-text-muted">{t('study.accuracy7d')}</p>
              </div>
            </div>
            {totalBloom > 0 && (
              <div className="flex h-3 rounded-full overflow-hidden">
                {[0, 1, 2, 3, 4, 5].map(level => {
                  const count = summary.bloomLevels[String(level)] ?? 0;
                  const pct = (count / totalBloom) * 100;
                  if (pct === 0) return null;
                  return (
                    <div
                      key={level}
                      className="h-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: BLOOM_COLORS[level].text }}
                      title={`${t(BLOOM_COLORS[level].labelKey)}: ${count}`}
                    />
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {tutorOn && (
        <>
          {/* Headspace: three presets on the difficulty, and the value itself */}
          <div className="lf-panel space-y-3">
            <div className={sectionLabel}>
              <span>{t('tutor.headspace.title')}</span>
              <span className="normal-case tracking-normal text-xs">{t('tutor.difficultyRange')}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {HEADSPACE.map(h => (
                <button key={h.key} type="button" aria-pressed={preset === h.key} onClick={() => change({ ...settings, difficulty: h.value })} className={choice(preset === h.key)}>
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
                  value={settings.difficulty}
                  onChange={e => change({ ...settings, difficulty: Number(e.target.value) })}
                  aria-label={t('tutor.difficulty')}
                  className="block w-full accent-accent-blue"
                />
                <div className="relative h-4 mt-1 text-[11px] text-text-muted tabular-nums" aria-hidden="true">
                  {DIFFICULTY_TICKS.map(tick => (
                    <span key={tick} className="absolute -translate-x-1/2" style={{ left: `${((tick - DIFFICULTY_MIN) / span) * 100}%` }}>{tick.toFixed(tick === 0.85 ? 2 : 1)}</span>
                  ))}
                </div>
              </div>
              <output className="shrink-0 w-12 text-right text-xl font-semibold tabular-nums leading-tight">{settings.difficulty.toFixed(2)}</output>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm">
              <dt className="text-text-muted">{t('tutor.setting.questions')}</dt>
              <dd>{t(`tutor.mix.${mixKey(settings)}`)}</dd>
              <dt className="text-text-muted">{t('tutor.setting.wrongOptions')}</dt>
              <dd>{t(`tutor.distractors.${bandOf(settings.difficulty)}`)}</dd>
              <dt className="text-text-muted">{t('tutor.setting.interval')}</dt>
              <dd className="tabular-nums">× {intervalFactor(settings.difficulty).toFixed(2)}</dd>
            </dl>
          </div>

          {/* Answer by: any combination, tapping alone by default */}
          <div className="lf-panel space-y-3">
            <div className={sectionLabel}>
              <span>{t('tutor.answerBy.title')}</span>
              <span className="normal-case tracking-normal text-xs">{t('tutor.answerBy.pickAny')}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {ANSWER_MODES.map(mode => (
                <button key={mode} type="button" aria-pressed={settings.answerBy.includes(mode)} onClick={() => toggleMode(mode)} className={choice(settings.answerBy.includes(mode))}>
                  <b className="font-semibold text-[15px]">{t(`tutor.answerBy.${mode}`)}</b>
                  <span className="text-xs text-text-muted leading-snug">{t(`tutor.answerBy.${mode}Hint`)}</span>
                </button>
              ))}
            </div>
            {settings.answerBy.includes('dictate') && !dictationSupported() && (
              <p className="text-sm text-text-muted">{t('tutor.answerBy.noDictation')}</p>
            )}
          </div>
        </>
      )}

      {/* Start */}
      <div className="space-y-2">
        <button
          onClick={handleStart}
          disabled={!summary || waiting === 0}
          className="w-full flex items-center justify-center gap-3 py-4 rounded-xl text-lg font-semibold bg-accent-blue text-white hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          <GraduationCap size={24} />
          {waiting === 0 ? t('study.noCardsDue') : tutorOn ? t('study.startWaiting', { count: waiting }) : t('study.startSession', { count: waiting })}
        </button>
        {tutorOn && waiting > 0 && (
          <p className="text-sm text-text-muted text-center">
            {t('tutor.runsUntil')}{' '}
            {prepared?.paused
              ? t(prepared.paused === 'credits' ? 'tutor.pausedCredits' : 'tutor.pausedError')
              : prepared
                ? t(prepared.writing > 0 ? 'tutor.readyWriting' : 'tutor.ready', { count: prepared.ready })
                : ''}
          </p>
        )}
      </div>
    </div>
  );
}
