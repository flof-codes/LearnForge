import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';

export default function SubscriptionBanner() {
  const { t } = useTranslation('app');
  const { isActive, user } = useAuth();
  if (isActive || !user) return null;
  return (
    <div className="bg-yellow-900/30 border border-yellow-600/30 rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2 text-yellow-500 text-sm">
        <AlertTriangle size={16} />
        <span>{t('subscriptionBanner.message')}</span>
      </div>
      <Link to="/dashboard/settings/billing" className="text-accent-blue text-sm hover:underline shrink-0">
        {t('subscriptionBanner.subscribe')}
      </Link>
    </div>
  );
}
