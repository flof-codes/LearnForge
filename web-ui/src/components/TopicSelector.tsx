import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTopics } from '../hooks/useTopics';

interface Props {
  value: string;
  onChange: (id: string) => void;
}

export default function TopicSelector({ value, onChange }: Props) {
  const { data: topics } = useTopics();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const allTopics = topics ?? [];
  const filtered = search
    ? allTopics.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    : allTopics;
  const selected = allTopics.find(t => t.id === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-bg-surface border border-border text-sm text-left focus:outline-none focus:border-accent-blue"
      >
        <span className={selected ? 'text-text-primary' : 'text-text-muted'}>
          {selected ? selected.name : 'Select topic...'}
        </span>
        <ChevronDown size={14} className="text-text-muted" />
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-full bg-bg-secondary border border-border rounded-lg shadow-lg max-h-60 overflow-auto">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-2 bg-bg-surface border-b border-border text-sm text-text-primary outline-none placeholder:text-text-muted"
            placeholder="Search topics..."
            autoFocus
          />
          {filtered.map(t => (
            <button
              type="button"
              key={t.id}
              onClick={() => { onChange(t.id); setOpen(false); setSearch(''); }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-bg-surface transition-colors ${
                t.id === value ? 'text-accent-blue' : 'text-text-primary'
              }`}
            >
              {t.name}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-2 text-sm text-text-muted">No topics found</p>
          )}
        </div>
      )}
    </div>
  );
}
