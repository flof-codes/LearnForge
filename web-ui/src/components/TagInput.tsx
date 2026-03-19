import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  tags: string[];
  onChange: (tags: string[]) => void;
}

export default function TagInput({ tags, onChange }: Props) {
  const { t } = useTranslation('app');
  const [input, setInput] = useState('');

  const addTag = () => {
    const tag = input.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      onChange([...tags, tag]);
    }
    setInput('');
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
    if (e.key === 'Backspace' && !input && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg bg-bg-surface border border-border min-h-[38px]">
      {tags.map(tag => (
        <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-bg-hover text-accent-purple">
          {tag}
          <button type="button" onClick={() => onChange(tags.filter(t => t !== tag))} className="hover:text-danger">
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={addTag}
        className="flex-1 min-w-[80px] bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
        placeholder={tags.length === 0 ? t('cardEditor.tagPlaceholder') : ''}
      />
    </div>
  );
}
