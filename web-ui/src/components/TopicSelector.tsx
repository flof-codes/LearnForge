import { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTopics, useTopic, useTopicBreadcrumb } from '../hooks/useTopics';
import type { Topic } from '../types';

interface Props {
  value: string;
  onChange: (id: string) => void;
  /** Hide this topic (and descendants) from the list — used to prevent self-parenting */
  excludeId?: string;
  /** Show a "None (root level)" option at the top */
  allowNone?: boolean;
}

/* ── Recursive tree node inside the dropdown ── */

interface NodeProps {
  topic: Topic;
  depth: number;
  selectedId: string;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  excludeId?: string;
  searchTerm: string;
}

function TopicSelectorNode({
  topic,
  depth,
  selectedId,
  expandedIds,
  onToggle,
  onSelect,
  excludeId,
  searchTerm,
}: NodeProps) {
  const { t } = useTranslation('app');
  const isExpanded = expandedIds.has(topic.id);
  const { data: topicDetail, isLoading } = useTopic(isExpanded ? topic.id : '');
  const hasChildren = topic.childCount > 0;

  // Filter out excluded topic
  if (excludeId && topic.id === excludeId) return null;

  const nameMatches = !searchTerm || topic.name.toLowerCase().includes(searchTerm.toLowerCase());

  // Get children that match search (if expanded)
  const children = (isExpanded && topicDetail?.children) ? topicDetail.children : [];
  const filteredChildren = excludeId
    ? children.filter((c: Topic) => c.id !== excludeId)
    : children;

  // If searching and this node doesn't match and has no expanded children, hide it
  // But always show if it has children that might match (when expanded)
  if (searchTerm && !nameMatches && !isExpanded) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(topic.id)}
        className={`w-full flex items-center gap-1.5 py-1.5 pr-3 text-sm hover:bg-bg-surface transition-colors text-left ${
          topic.id === selectedId ? 'text-accent-blue' : 'text-text-primary'
        }`}
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
      >
        {/* Expand/collapse chevron */}
        <span
          role="button"
          tabIndex={-1}
          onClick={e => {
            e.stopPropagation();
            if (hasChildren) onToggle(topic.id);
          }}
          className={`w-4 h-4 flex items-center justify-center shrink-0 ${
            hasChildren ? 'text-text-muted cursor-pointer' : 'invisible'
          }`}
        >
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>

        <span className="truncate">{topic.name}</span>
      </button>

      {/* Children */}
      {isExpanded && (
        <>
          {isLoading && (
            <div className="flex items-center gap-1.5 py-1 text-xs text-text-muted" style={{ paddingLeft: `${(depth + 1) * 16 + 12}px` }}>
              <Loader2 size={10} className="animate-spin" />
              {t('topicSelector.loadingChildren')}
            </div>
          )}
          {filteredChildren.map((child: Topic) => (
            <TopicSelectorNode
              key={child.id}
              topic={child}
              depth={depth + 1}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onToggle={onToggle}
              onSelect={onSelect}
              excludeId={excludeId}
              searchTerm={searchTerm}
            />
          ))}
        </>
      )}
    </div>
  );
}

/* ── Main TopicSelector ── */

export default function TopicSelector({ value, onChange, excludeId, allowNone }: Props) {
  const { t } = useTranslation('app');
  const { data: topics } = useTopics();
  const { data: breadcrumb } = useTopicBreadcrumb(value || undefined);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const rootTopics = topics ?? [];
  const filteredRoots = excludeId
    ? rootTopics.filter(t => t.id !== excludeId)
    : rootTopics;

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    setSearch('');
  };

  // Build display label: breadcrumb path or fallback
  let displayLabel = '';
  if (value && breadcrumb && breadcrumb.length > 0) {
    displayLabel = breadcrumb.map(b => b.name).join(' › ');
  } else if (value) {
    // Breadcrumb still loading — try to find name from root topics
    const found = rootTopics.find(t => t.id === value);
    displayLabel = found?.name ?? '...';
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-bg-surface border border-border text-sm text-left focus:outline-none focus:border-accent-blue"
      >
        <span className={`truncate ${value ? 'text-text-primary' : 'text-text-muted'}`}>
          {value ? displayLabel : t('topicSelector.selectTopic')}
        </span>
        <ChevronDown size={14} className="text-text-muted shrink-0 ml-2" />
      </button>

      {open && (
        <div className="absolute z-10 mt-1 w-full bg-bg-secondary border border-border rounded-lg shadow-lg max-h-72 overflow-auto">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-2 bg-bg-surface border-b border-border text-sm text-text-primary outline-none placeholder:text-text-muted sticky top-0"
            placeholder={t('topicSelector.searchTopics')}
            autoFocus
          />

          {allowNone && (
            <button
              type="button"
              onClick={() => handleSelect('')}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-bg-surface transition-colors ${
                !value ? 'text-accent-blue' : 'text-text-muted italic'
              }`}
            >
              {t('topicSelector.noneRoot')}
            </button>
          )}

          {filteredRoots.map(topic => (
            <TopicSelectorNode
              key={topic.id}
              topic={topic}
              depth={0}
              selectedId={value}
              expandedIds={expandedIds}
              onToggle={toggleExpand}
              onSelect={handleSelect}
              excludeId={excludeId}
              searchTerm={search}
            />
          ))}

          {filteredRoots.length === 0 && (
            <p className="px-3 py-2 text-sm text-text-muted">{t('topicSelector.noTopicsFound')}</p>
          )}
        </div>
      )}
    </div>
  );
}
