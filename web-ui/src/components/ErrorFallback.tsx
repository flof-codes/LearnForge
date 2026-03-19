import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function ErrorFallback({ message, onReset }: { message: string; onReset: () => void }) {
  const { t } = useTranslation('app');
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <AlertTriangle size={40} className="text-danger mb-4" />
      <h2 className="text-lg font-semibold mb-2">{t('errorBoundary.title')}</h2>
      <p className="text-text-muted text-sm mb-4">{message}</p>
      <button
        onClick={onReset}
        className="px-4 py-2 bg-accent-blue text-white rounded-lg text-sm hover:opacity-90 transition-opacity"
      >
        {t('errorBoundary.tryAgain')}
      </button>
    </div>
  );
}
