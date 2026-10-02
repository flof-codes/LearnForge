import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronDown, Pencil, Trash2, Plus, Layers, MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTopic } from '../../hooks/useTopics';
import FocusBadge from '../../components/FocusBadge';
import type { Topic } from '../../types';

interface Props {
  topic: Topic;
  onEdit: (topic: Topic) => void;
  onDelete: (topic: Topic) => void;
  onCreate: (parentId: string) => void;
  depth?: number;
}

export default function TopicTreeNode({ topic, onEdit, onDelete, onCreate, depth = 0 }: Props) {
  const { t } = useTranslation('app');
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { data: topicDetail } = useTopic(expanded ? topic.id : '');
  const hasChildren = topic.childCount > 0;

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [menuOpen]);

  const newCount = topic.newCount ?? 0;
  const dueCount = topic.dueCount ?? 0;

  return (
    <div>
      <div
        className="group flex items-center gap-2 pr-1 py-2 border-b border-border md:border-b-0 md:px-2 md:py-1.5 md:rounded-lg hover:bg-bg-surface transition-colors cursor-pointer"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className={`w-5 h-5 flex items-center justify-center text-text-muted ${hasChildren ? '' : 'invisible'}`}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <div className="flex-1 flex items-center gap-2 min-w-0" onClick={() => navigate(`/dashboard/topics/${topic.id}`)}>
          <Layers size={14} className="hidden md:block text-text-muted shrink-0" />
          {/* A phone wraps long names; from md up there is room to truncate */}
          <span className="text-sm min-w-0 break-words md:truncate">{topic.name}</span>
          <FocusBadge topicId={topic.id} />
        </div>

        <div className="flex items-center gap-1.5 shrink-0 mr-1">
          {newCount > 0 && (
            <span className="text-[11px] tabular-nums px-1.5 py-0.5 rounded bg-accent-blue/15 text-accent-blue" title={t('cards.filterNew')}>
              {newCount}
            </span>
          )}
          {dueCount > 0 && (
            <span className="text-[11px] tabular-nums px-1.5 py-0.5 rounded bg-accent-green/15 text-accent-green" title={t('cards.filterDue')}>
              {dueCount}
            </span>
          )}
          {topic.cardCount > 0 && (
            <span
              className="text-[11px] tabular-nums text-text-muted"
              title={t('topics.cardTotal', { count: topic.cardCount })}
            >
              {topic.cardCount}
            </span>
          )}
        </div>

        {/* Phone: the three actions sit behind one button, which leaves the width to the name */}
        <div className="relative md:hidden shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(o => !o); }}
            className="p-2 text-text-muted"
            aria-label={t('topics.actions')}
            aria-expanded={menuOpen}
          >
            <MoreHorizontal size={18} />
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                aria-label={t('common.close')}
                className="fixed inset-0 z-40 cursor-default"
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }}
              />
              {/* z-50: above the tab bar, which the menu of the last rows would otherwise sit behind */}
              <div className="absolute right-1 top-full z-50 min-w-[13rem] py-1 rounded-lg border border-border bg-bg-surface shadow-lg">
                {[
                  { icon: Plus, label: t('topics.addChild'), run: () => onCreate(topic.id), danger: false },
                  { icon: Pencil, label: t('topics.edit'), run: () => onEdit(topic), danger: false },
                  { icon: Trash2, label: t('topics.delete'), run: () => onDelete(topic), danger: true },
                ].map(({ icon: Icon, label, run, danger }) => (
                  <button
                    key={label}
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); run(); }}
                    className={`flex items-center gap-3 w-full px-3 py-2.5 text-sm text-left ${danger ? 'text-danger' : 'text-text-primary'}`}
                  >
                    <Icon size={16} />
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="hidden md:flex items-center gap-1 shrink-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          <button onClick={(e) => { e.stopPropagation(); onCreate(topic.id); }} className="p-2 text-text-muted hover:text-accent-green" title={t('topics.addChild')}>
            <Plus size={14} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onEdit(topic); }} className="p-2 text-text-muted hover:text-accent-blue" title={t('topics.edit')}>
            <Pencil size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(topic); }}
            className="p-2 text-text-muted hover:text-danger"
            title={t('topics.delete')}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {expanded && topicDetail?.children && (
        <div>
          {topicDetail.children.map((child: Topic) => (
            <TopicTreeNode
              key={child.id}
              topic={child}
              onEdit={onEdit}
              onDelete={onDelete}
              onCreate={onCreate}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
