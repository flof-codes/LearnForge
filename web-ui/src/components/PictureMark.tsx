import { Image } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../api/client';

const API_BASE = (api.defaults.baseURL ?? '').replace(/\/+$/, '');

interface Props {
  /** The card's first stored image as the list API sends it: a CSS `url(/media/<id>/<sig>)`. */
  thumbnail?: string | null;
  hasPicture?: boolean;
}

/**
 * Marks a list row whose card shows a picture: a thumbnail of its stored
 * image, or an icon when the picture is drawn (inline SVG) and has no file.
 */
export default function PictureMark({ thumbnail, hasPicture }: Props) {
  const { t } = useTranslation('app');
  if (thumbnail) {
    return (
      <span
        role="img"
        aria-label={t('figure.hasFigure')}
        title={t('figure.hasFigure')}
        className="block w-10 h-10 shrink-0 rounded-md border border-border bg-white bg-cover bg-center"
        style={{ backgroundImage: thumbnail.replace(/url\(\s*(["']?)\/media\//, `url($1${API_BASE}/media/`) }}
      />
    );
  }
  if (!hasPicture) return null;
  return (
    <span title={t('figure.hasFigure')} className="w-10 h-10 shrink-0 rounded-md border border-border grid place-items-center text-text-muted">
      <Image size={18} aria-label={t('figure.hasFigure')} />
    </span>
  );
}
