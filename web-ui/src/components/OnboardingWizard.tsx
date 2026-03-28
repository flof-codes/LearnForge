import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, FolderTree, Layers, GraduationCap, ArrowRight, ArrowLeft, Zap, Copy, Check, Settings } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { useCreateTopic } from '../hooks/useTopics';
import { useCreateCard } from '../hooks/useCards';
import { generateFrontHtml, generateBackHtml } from '../utils/cardTemplates';
import LogoIcon from './public/LogoIcon';

type Step = 'welcome' | 'choose' | 'claude-setup' | 'topic' | 'card' | 'done';
type Path = 'claude' | 'manual' | null;

const STEP_ICONS: Record<Step, typeof Sparkles> = {
  welcome: Sparkles,
  choose: ArrowRight,
  'claude-setup': Zap,
  topic: FolderTree,
  card: Layers,
  done: GraduationCap,
};

function getSteps(path: Path): Step[] {
  if (path === 'claude') return ['welcome', 'choose', 'claude-setup', 'done'];
  if (path === 'manual') return ['welcome', 'choose', 'topic', 'card', 'done'];
  return ['welcome', 'choose'];
}

export default function OnboardingWizard() {
  const { t } = useTranslation('app');
  const navigate = useNavigate();
  const createTopic = useCreateTopic();
  const createCard = useCreateCard();

  const [step, setStep] = useState<Step>('welcome');
  const [path, setPath] = useState<Path>(null);
  const [topicName, setTopicName] = useState('');
  const [topicDescription, setTopicDescription] = useState('');
  const [createdTopicId, setCreatedTopicId] = useState<string | null>(null);
  const [concept, setConcept] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const steps = useMemo(() => getSteps(path), [path]);
  const stepIndex = steps.indexOf(step);
  const mcpUrl = `${window.location.origin}/mcp`;

  const handleChooseClaude = () => {
    setPath('claude');
    setStep('claude-setup');
  };

  const handleChooseManual = () => {
    setPath('manual');
    setStep('topic');
  };

  const handleCopyUrl = async () => {
    await navigator.clipboard.writeText(mcpUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateTopic = () => {
    if (!topicName.trim()) return;
    setError(null);
    createTopic.mutate(
      { name: topicName.trim(), description: topicDescription.trim() || undefined },
      {
        onSuccess: (topic) => {
          setCreatedTopicId(topic.id);
          setStep('card');
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : String(err));
        },
      },
    );
  };

  const handleCreateCard = () => {
    if (!concept.trim() || !question.trim() || !answer.trim() || !createdTopicId) return;
    setError(null);
    createCard.mutate(
      {
        topic_id: createdTopicId,
        concept: concept.trim(),
        front_html: generateFrontHtml(question.trim()),
        back_html: generateBackHtml(answer.trim()),
      },
      {
        onSuccess: () => {
          setStep('done');
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : String(err));
        },
      },
    );
  };

  const handleStartStudying = () => {
    navigate('/dashboard/study');
  };

  const handleGoToSettings = () => {
    navigate('/dashboard/settings');
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
      <div className="w-full max-w-lg">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-8">
          {steps.map((s, i) => (
            <div
              key={s}
              className={`w-2.5 h-2.5 rounded-full transition-colors ${
                i <= stepIndex ? 'bg-accent-blue' : 'bg-border'
              }`}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="bg-bg-secondary rounded-2xl border border-border p-8 space-y-6">
          {/* Step icon */}
          <div className="flex justify-center">
            {(() => {
              const Icon = STEP_ICONS[step];
              return (
                <div className="w-14 h-14 rounded-2xl bg-bg-surface border border-border flex items-center justify-center">
                  <Icon size={24} className="text-accent-blue" />
                </div>
              );
            })()}
          </div>

          {/* Welcome */}
          {step === 'welcome' && (
            <>
              <div className="text-center space-y-2">
                <div className="flex justify-center mb-4">
                  <LogoIcon size={32} />
                </div>
                <h2 className="text-xl font-medium">{t('onboarding.welcomeTitle')}</h2>
                <p className="text-sm text-text-muted">{t('onboarding.welcomeDescription')}</p>
              </div>
              <div className="flex justify-center">
                <button
                  onClick={() => setStep('choose')}
                  className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium bg-accent-blue text-white hover:opacity-90 transition-opacity"
                >
                  {t('onboarding.getStarted')} <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}

          {/* Choose Path */}
          {step === 'choose' && (
            <>
              <div className="text-center space-y-2">
                <h2 className="text-xl font-medium">{t('onboarding.chooseTitle')}</h2>
                <p className="text-sm text-text-muted">{t('onboarding.chooseDescription')}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Claude option */}
                <button
                  onClick={handleChooseClaude}
                  className="relative flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-accent-blue bg-bg-surface text-center hover:bg-bg-primary transition-colors"
                >
                  <span className="absolute top-2 right-2 text-[10px] font-semibold uppercase tracking-wider text-accent-blue bg-accent-blue/10 px-2 py-0.5 rounded-full">
                    {t('onboarding.claudeOptionRecommended')}
                  </span>
                  <div className="w-10 h-10 rounded-xl bg-accent-blue/10 flex items-center justify-center mt-2">
                    <Zap size={20} className="text-accent-blue" />
                  </div>
                  <span className="text-sm font-medium text-text-primary">{t('onboarding.claudeOption')}</span>
                  <span className="text-xs text-text-muted leading-relaxed">{t('onboarding.claudeOptionDesc')}</span>
                </button>
                {/* Manual option */}
                <button
                  onClick={handleChooseManual}
                  className="flex flex-col items-center gap-3 p-5 rounded-xl border border-border bg-bg-surface text-center hover:bg-bg-primary transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-bg-primary flex items-center justify-center mt-4">
                    <Layers size={20} className="text-text-muted" />
                  </div>
                  <span className="text-sm font-medium text-text-primary">{t('onboarding.manualOption')}</span>
                  <span className="text-xs text-text-muted leading-relaxed">{t('onboarding.manualOptionDesc')}</span>
                </button>
              </div>
              <div className="flex justify-start">
                <button
                  onClick={() => setStep('welcome')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm text-text-muted hover:text-text-primary transition-colors"
                >
                  <ArrowLeft size={16} /> {t('common.back')}
                </button>
              </div>
            </>
          )}

          {/* Claude Setup */}
          {step === 'claude-setup' && (
            <>
              <div className="text-center space-y-2">
                <h2 className="text-xl font-medium">{t('onboarding.claudeSetupTitle')}</h2>
                <p className="text-sm text-text-muted">{t('onboarding.claudeSetupDesc')}</p>
              </div>
              <ol className="text-text-muted text-sm space-y-3 list-decimal list-inside">
                <li><Trans i18nKey="onboarding.claudeStep1" ns="app" components={{ 1: <a href="https://claude.ai" target="_blank" rel="noopener noreferrer" className="text-accent-blue hover:underline" />, bold: <strong className="text-text-primary" /> }} /></li>
                <li><Trans i18nKey="onboarding.claudeStep2" ns="app" components={{ bold: <strong className="text-text-primary" /> }} /></li>
                <li>{t('onboarding.claudeStep3')}</li>
              </ol>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-bg-primary px-4 py-2.5 rounded-lg text-sm text-text-primary font-mono break-all border border-border">
                  {mcpUrl}
                </code>
                <button
                  onClick={handleCopyUrl}
                  className="shrink-0 p-2.5 bg-bg-primary border border-border rounded-lg hover:bg-bg-surface transition-colors"
                  title="Copy"
                >
                  {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} className="text-text-muted" />}
                </button>
              </div>
              <ol start={4} className="text-text-muted text-sm space-y-3 list-decimal list-inside">
                <li>{t('onboarding.claudeStep4')}</li>
              </ol>
              <p className="text-xs text-text-muted">{t('onboarding.claudeNote')}</p>
              <p className="text-xs text-text-muted">{t('onboarding.claudeOtherAi')}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setStep('choose')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm text-text-muted hover:text-text-primary transition-colors"
                >
                  <ArrowLeft size={16} /> {t('common.back')}
                </button>
                <button
                  onClick={() => setStep('done')}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium bg-accent-blue text-white hover:opacity-90 transition-opacity"
                >
                  {t('onboarding.claudeConnected')} <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}

          {/* Create Topic */}
          {step === 'topic' && (
            <>
              <div className="text-center space-y-2">
                <h2 className="text-xl font-medium">{t('onboarding.topicTitle')}</h2>
                <p className="text-sm text-text-muted">{t('onboarding.topicDescription')}</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-text-muted mb-1">{t('topics.name')}</label>
                  <input
                    type="text"
                    value={topicName}
                    onChange={(e) => setTopicName(e.target.value)}
                    placeholder={t('topics.namePlaceholder')}
                    className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-border text-text-primary text-sm focus:outline-none focus:border-accent-blue"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-muted mb-1">{t('topics.descriptionOptional')}</label>
                  <input
                    type="text"
                    value={topicDescription}
                    onChange={(e) => setTopicDescription(e.target.value)}
                    placeholder={t('topics.descriptionPlaceholder')}
                    className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-border text-text-primary text-sm focus:outline-none focus:border-accent-blue"
                  />
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setStep('choose')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm text-text-muted hover:text-text-primary transition-colors"
                >
                  <ArrowLeft size={16} /> {t('common.back')}
                </button>
                <button
                  onClick={handleCreateTopic}
                  disabled={!topicName.trim() || createTopic.isPending}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium bg-accent-blue text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {createTopic.isPending ? t('topics.creating') : t('onboarding.createAndContinue')}
                  {!createTopic.isPending && <ArrowRight size={16} />}
                </button>
              </div>
            </>
          )}

          {/* Create Card */}
          {step === 'card' && (
            <>
              <div className="text-center space-y-2">
                <h2 className="text-xl font-medium">{t('onboarding.cardTitle')}</h2>
                <p className="text-sm text-text-muted">{t('onboarding.cardDescription')}</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-text-muted mb-1">{t('onboarding.conceptLabel')}</label>
                  <input
                    type="text"
                    value={concept}
                    onChange={(e) => setConcept(e.target.value)}
                    placeholder={t('onboarding.conceptPlaceholder')}
                    className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-border text-text-primary text-sm focus:outline-none focus:border-accent-blue"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-muted mb-1">{t('onboarding.questionLabel')}</label>
                  <textarea
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder={t('onboarding.questionPlaceholder')}
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-border text-text-primary text-sm focus:outline-none focus:border-accent-blue resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-muted mb-1">{t('onboarding.answerLabel')}</label>
                  <textarea
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder={t('onboarding.answerPlaceholder')}
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-border text-text-primary text-sm focus:outline-none focus:border-accent-blue resize-none"
                  />
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setStep('topic')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm text-text-muted hover:text-text-primary transition-colors"
                >
                  <ArrowLeft size={16} /> {t('common.back')}
                </button>
                <button
                  onClick={handleCreateCard}
                  disabled={!concept.trim() || !question.trim() || !answer.trim() || createCard.isPending}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium bg-accent-blue text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {createCard.isPending ? t('cardEditor.saving') : t('onboarding.createCardAndFinish')}
                  {!createCard.isPending && <ArrowRight size={16} />}
                </button>
              </div>
            </>
          )}

          {/* Done — Claude path */}
          {step === 'done' && path === 'claude' && (
            <>
              <div className="text-center space-y-3">
                <h2 className="text-xl font-medium">{t('onboarding.doneClaudeTitle')}</h2>
                <p className="text-sm text-text-muted">{t('onboarding.doneClaudeDesc')}</p>
                <blockquote className="bg-bg-surface border border-border rounded-lg px-4 py-3 text-sm text-text-primary italic">
                  &ldquo;{t('onboarding.doneClaudePrompt')}&rdquo;
                </blockquote>
              </div>
              <button
                onClick={handleGoToSettings}
                className="flex items-center justify-center gap-2 w-full px-6 py-2.5 rounded-lg text-sm font-medium bg-accent-blue text-white hover:opacity-90 transition-opacity"
              >
                <Settings size={16} /> {t('onboarding.doneClaudeGoToSettings')}
              </button>
            </>
          )}

          {/* Done — Manual path */}
          {step === 'done' && path === 'manual' && (
            <>
              <div className="text-center space-y-2">
                <h2 className="text-xl font-medium">{t('onboarding.doneTitle')}</h2>
                <p className="text-sm text-text-muted">{t('onboarding.doneDescription')}</p>
                <p className="text-xs text-text-muted">{t('onboarding.doneConnectTip')}</p>
              </div>
              <button
                onClick={handleStartStudying}
                className="flex items-center justify-center gap-2 w-full px-6 py-2.5 rounded-lg text-sm font-medium bg-accent-blue text-white hover:opacity-90 transition-opacity"
              >
                <GraduationCap size={16} /> {t('onboarding.startStudying')}
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
