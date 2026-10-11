import { useQuery } from '@tanstack/react-query';
import { tutorService } from '../api/tutor';
import type { TutorSettings } from '../utils/tutor';

/** Whether this account gets the tutor in the study view. Asked once per visit; it changes only with the server's setup. */
export const useTutorStatus = () =>
  useQuery({
    queryKey: ['tutor', 'status'],
    queryFn: () => tutorService.status().then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });

/**
 * Starts the question writer for the settings on the start screen and reports
 * how many questions are ready. Asks again every two seconds while it writes.
 */
export const useTutorPrepare = (enabled: boolean, topicId: string | undefined, settings: TutorSettings) =>
  useQuery({
    queryKey: ['tutor', 'prepare', topicId, settings.difficulty, settings.answerBy.join(',')],
    queryFn: () => tutorService.prepare({ topicId, ...settings }).then(r => r.data),
    enabled,
    refetchInterval: q => (q.state.data && q.state.data.writing > 0 ? 2000 : false),
  });
