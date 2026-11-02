import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { tutorService } from '../../api/tutor';
import { tutorErrorKey } from '../../utils/tutor';
import type { FeedbackLabel, HelpUsed, QuestionTerm, TutorRewrite } from '../../types';

/** A definition of marked words, shown under the part of the question they came from. */
export interface Lookup {
  term: string;
  region: string;
  status: 'loading' | 'done' | 'saved' | 'error';
  definition?: string;
  error?: string;
}

/** What the session hands a question card for help and feedback. */
export interface HelpProps {
  /** The card's full folder path and the session's count, shown in the card menu. */
  menuInfo?: { path: string; progress: string };
  /** Set when this question was just rewritten from feedback; `used` is the help opened on the question it replaced. */
  rewrite?: { labels: FeedbackLabel[]; used: HelpUsed; onUndo: () => void; busy?: boolean };
  /** The tutor rewrote the question: the session shows the new one in its place. */
  onRewritten: (rewrite: TutorRewrite, labels: FeedbackLabel[], used: HelpUsed) => void;
}

export type HelpSheet = { kind: 'tutorial'; term: string | null } | { kind: 'feedback' } | null;

const rank: Record<HelpUsed, number> = { none: 0, term: 1, tutorial: 2 };

/** A model fault is named; anything else reads as the tutor failing too, since nothing was being saved. */
export function helpErrorKey(err: unknown): string {
  const key = tutorErrorKey(err);
  return key === 'tutor.saveFailed' ? 'tutor.modelError' : key;
}

/**
 * Help on one stored question: definitions of marked words, the tutorial and
 * feedback sheets, and how much help was opened before answering (it caps the
 * suggested rating).
 */
export function useStudyHelp(questionId: string, answered: boolean, usedBefore: HelpUsed = 'none') {
  const { t } = useTranslation('app');
  // A rewrite of the same question keeps what was opened on the old one.
  const [used, setUsed] = useState<HelpUsed>(usedBefore);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [savedTerms, setSavedTerms] = useState<QuestionTerm[]>([]);
  const [sheet, setSheet] = useState<HelpSheet>(null);

  const note = useCallback((help: HelpUsed) => {
    if (!answered) setUsed(u => (rank[help] > rank[u] ? help : u));
  }, [answered]);

  const define = useCallback(async (term: string, region: string) => {
    note('term');
    setLookup({ term, region, status: 'loading' });
    try {
      const { data } = await tutorService.define(questionId, term);
      setLookup(l => (l?.term === term ? { term, region, status: 'done', definition: data.definition } : l));
    } catch (err) {
      setLookup(l => (l?.term === term ? { term, region, status: 'error', error: t(helpErrorKey(err)) } : l));
    }
  }, [questionId, note, t]);

  const save = useCallback(async () => {
    if (!lookup?.definition || lookup.status !== 'done') return;
    const { term, definition } = lookup;
    try {
      await tutorService.saveTerm(questionId, term, definition);
      setSavedTerms(s => [...s.filter(x => x.term.toLowerCase() !== term.toLowerCase()), { term, definition }]);
      setLookup(l => (l?.term === term ? { ...l, status: 'saved' } : l));
    } catch (err) {
      setLookup(l => (l?.term === term ? { ...l, error: t(tutorErrorKey(err)) } : l));
    }
  }, [lookup, questionId, t]);

  return {
    used,
    /** A stored term was tapped open. */
    noteLookup: useCallback(() => note('term'), [note]),
    lookup,
    define,
    save,
    closeLookup: useCallback(() => setLookup(null), []),
    savedTerms,
    sheet,
    openTutorial: useCallback((term: string | null) => { note('tutorial'); setSheet({ kind: 'tutorial', term }); }, [note]),
    openFeedback: useCallback(() => setSheet({ kind: 'feedback' }), []),
    closeSheet: useCallback(() => setSheet(null), []),
  };
}

export type StudyHelp = ReturnType<typeof useStudyHelp>;
