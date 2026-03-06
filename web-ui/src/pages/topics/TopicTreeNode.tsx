import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronDown, Pencil, Trash2, Plus, Layers } from 'lucide-react';
import { useTopic } from '../../hooks/useTopics';
import type { Topic } from '../../types';

interface Props {
  topic: Topic;
  onEdit: (topic: Topic) => void;
  onDelete: (topic: Topic) => void;
  onCreate: (parentId: string) => void;
  depth?: number;
}

export default function TopicTreeNode({ topic, onEdit, onDelete, onCreate, depth = 0 }: Props) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const { data: topicDetail } = useTopic(expanded ? topic.id : '');
  const hasChildren = topic.childCount > 0;

  const newCount = topic.newCount ?? 0;
  const learningCount = topic.learningCount ?? 0;
  const dueCount = topic.dueCount ?? 0;

  return (
    <div>
      <div
        className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-bg-surface transition-colors cursor-pointer"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className={`w-5 h-5 flex items-center justify-center text-text-muted ${hasChildren ? '' : 'invisible'}`}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <div className="flex-1 flex items-center gap-2 min-w-0" onClick={() => navigate(`/topics/${topic.id}`)}>
          <Layers size={14} className="text-text-muted shrink-0" />
          <span className="text-sm truncate">{topic.name}</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 mr-1">
          {newCount > 0 && (
            <span className="text-[11px] tabular-nums px-1.5 py-0.5 rounded bg-accent-blue/15 text-accent-blue" title="New">
              {newCount}
            </span>
          )}
          {learningCount > 0 && (
            <span className="text-[11px] tabular-nums px-1.5 py-0.5 rounded bg-warning/15 text-warning" title="Learning">
              {learningCount}
            </span>
          )}
          {dueCount > 0 && (
            <span className="text-[11px] tabular-nums px-1.5 py-0.5 rounded bg-accent-green/15 text-accent-green" title="Due">
              {dueCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={(e) => { e.stopPropagation(); onCreate(topic.id); }} className="p-1 text-text-muted hover:text-accent-green" title="Add child">
            <Plus size={14} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onEdit(topic); }} className="p-1 text-text-muted hover:text-accent-blue" title="Edit">
            <Pencil size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(topic); }}
            disabled={topic.cardCount > 0}
            className="p-1 text-text-muted hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-text-muted"
            title={topic.cardCount > 0 ? `Delete or move ${topic.cardCount} card(s) first` : 'Delete'}
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
