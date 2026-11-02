import { Fragment } from 'react';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import FocusBadge from '../../components/FocusBadge';
import { useFolderPath } from '../../hooks/useTopics';

/**
 * The card's folder in the study header, after its focus star: the full path
 * on desktop, the last folder on a phone (the card menu shows the rest).
 */
export default function StudyFolder({ topicId, full }: { topicId: string | undefined; full: boolean }) {
  const { t } = useTranslation('app');
  const path = useFolderPath(topicId);
  const shown = full ? path : path.slice(-1);
  return (
    <div className="flex items-center gap-2 min-w-0" title={path.join(' › ')}>
      <FocusBadge topicId={topicId} size="md" />
      <span className="sr-only">{t('tutor.help.folder')}: </span>
      <span className="flex items-center gap-1.5 min-w-0 text-[15px] md:text-sm text-text-muted">
        {shown.map((name, i) => (
          <Fragment key={i}>
            {i > 0 && <ChevronRight size={12} className="shrink-0 opacity-60" aria-hidden="true" />}
            <span className={i === shown.length - 1 ? 'truncate font-medium text-text-primary' : 'truncate shrink-[2]'}>{name}</span>
          </Fragment>
        ))}
      </span>
    </div>
  );
}
