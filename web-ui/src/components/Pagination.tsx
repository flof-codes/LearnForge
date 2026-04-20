import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

function buildPageList(current: number, last: number): Array<number | 'ellipsis'> {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
  const pages: Array<number | 'ellipsis'> = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(last - 1, current + 1);
  if (left > 2) pages.push('ellipsis');
  for (let p = left; p <= right; p++) pages.push(p);
  if (right < last - 1) pages.push('ellipsis');
  pages.push(last);
  return pages;
}

export default function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100],
}: Props) {
  const { t } = useTranslation('app');
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), lastPage);
  const from = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, total);

  const pageList = useMemo(() => buildPageList(currentPage, lastPage), [currentPage, lastPage]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <div className="text-text-muted">
        {total === 0
          ? t('pagination.empty')
          : t('pagination.showing', { from, to, total })}
      </div>

      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <label className="flex items-center gap-2 text-text-muted">
            <span className="text-xs">{t('pagination.perPage')}</span>
            <select
              value={pageSize}
              onChange={e => onPageSizeChange(Number(e.target.value))}
              className="text-xs bg-bg-surface border border-border rounded-lg px-2 py-1 text-text-primary focus:outline-none focus:border-accent-blue"
            >
              {pageSizeOptions.map(size => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
        )}

        <nav className="flex items-center gap-1" aria-label={t('pagination.navLabel')}>
          <button
            type="button"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            aria-label={t('pagination.previous')}
            className="p-1.5 rounded-lg bg-bg-surface border border-border text-text-muted hover:text-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={14} />
          </button>

          {pageList.map((item, idx) =>
            item === 'ellipsis' ? (
              <span key={`e-${idx}`} className="px-2 text-text-muted">…</span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => onPageChange(item)}
                aria-current={item === currentPage ? 'page' : undefined}
                className={`min-w-[2rem] h-8 px-2 rounded-lg text-xs font-medium border transition-colors ${
                  item === currentPage
                    ? 'bg-accent-blue text-white border-accent-blue'
                    : 'bg-bg-surface text-text-muted border-border hover:text-text'
                }`}
              >
                {item}
              </button>
            ),
          )}

          <button
            type="button"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= lastPage}
            aria-label={t('pagination.next')}
            className="p-1.5 rounded-lg bg-bg-surface border border-border text-text-muted hover:text-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        </nav>
      </div>
    </div>
  );
}
