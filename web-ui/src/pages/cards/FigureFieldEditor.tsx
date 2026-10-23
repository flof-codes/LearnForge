import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import CardHtmlRender from '../../components/CardHtmlRender';
import { imageService } from '../../api/images';
import { extractErrorMessage } from '../../utils/extractErrorMessage';

const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml';

interface Props {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  cardId: string;
}

/**
 * A figure field: upload a picture or paste SVG markup, with a preview.
 * An uploaded file is stored as `<img src="/images/<id>">`; until the note is
 * saved that address needs a login the preview frame does not have, so the
 * preview shows the local file instead.
 */
export default function FigureFieldEditor({ id, name, value, onChange, cardId }: Props) {
  const { t } = useTranslation('app');
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState<Record<string, string>>({});

  const upload = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      const preview = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const res = await imageService.upload(file, cardId);
      setLocal(l => ({ ...l, [res.data.url]: preview }));
      onChange(`<img src="${res.data.url}" alt="">`);
    } catch (err) {
      setError(extractErrorMessage(err) || t('figure.uploadFailed'));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const previewHtml = Object.entries(local).reduce((html, [url, data]) => html.split(`"${url}"`).join(`"${data}"`), value);
  const filled = value.trim() !== '';

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <label htmlFor={id} className="text-sm text-text-muted">{name}</label>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border hover:bg-bg-hover disabled:opacity-50"
          >
            <ImagePlus size={14} /> {busy ? t('figure.uploading') : filled ? t('figure.replace') : t('figure.upload')}
          </button>
          {filled && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="p-1.5 rounded-lg border border-border text-text-muted hover:text-danger hover:bg-bg-hover"
              aria-label={t('figure.remove', { name })}
              title={t('figure.remove', { name })}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
      </div>
      <p className="text-xs text-text-muted mb-2">{t(name === 'Front figure' ? 'figure.frontHint' : 'figure.backHint')}</p>
      {filled && (
        <div className="lf-panel md:p-3 mb-2">
          <CardHtmlRender html={`<div class="lf-figure" style="text-align:center">${previewHtml}</div>`} />
        </div>
      )}
      {error && <p className="text-xs text-danger mb-2">{error}</p>}
      <details>
        <summary className="text-xs text-text-muted cursor-pointer select-none">{t('figure.markup')}</summary>
        <textarea
          id={id}
          value={value}
          onChange={e => onChange(e.target.value)}
          spellCheck={false}
          placeholder={t('figure.markupPlaceholder')}
          className="mt-1 w-full px-3 py-2 rounded-lg bg-bg-surface border border-border text-text-primary text-xs font-mono focus:outline-none focus:border-accent-blue resize-y"
          rows={4}
        />
      </details>
    </div>
  );
}
