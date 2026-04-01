import { useState, useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { html } from '@codemirror/lang-html';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorState } from '@codemirror/state';
import { useTranslation } from 'react-i18next';
import TopicSelector from '../../components/TopicSelector';
import TagInput from '../../components/TagInput';
import CardHtmlRender from '../../components/CardHtmlRender';
import type { CardWithState, CreateCardInput, UpdateCardInput } from '../../types';

interface Props {
  initialData?: CardWithState;
  onSubmit: (data: CreateCardInput | UpdateCardInput) => void;
  isPending?: boolean;
  onDirty?: () => void;
}

function useCodeMirror(initialValue: string, onChange: (value: string) => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          basicSetup,
          html(),
          oneDark,
          EditorView.updateListener.of(update => {
            if (update.docChanged) onChange(update.state.doc.toString());
          }),
          EditorView.theme({
            '&': { fontSize: '13px', maxHeight: '300px' },
            '.cm-scroller': { overflow: 'auto' },
          }),
        ],
      }),
      parent: containerRef.current,
    });
    viewRef.current = view;
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return containerRef;
}

export default function CardEditor({ initialData, onSubmit, isPending, onDirty }: Props) {
  const { t } = useTranslation('app');
  const [concept, setConcept] = useState(initialData?.concept ?? '');
  const [topicId, setTopicId] = useState(initialData?.topicId ?? '');
  const [frontHtml, setFrontHtml] = useState(initialData?.frontHtml ?? '');
  const [backHtml, setBackHtml] = useState(initialData?.backHtml ?? '');
  const [tags, setTags] = useState<string[]>(initialData?.tags ?? []);
  const [previewSide, setPreviewSide] = useState<'front' | 'back'>('front');

  const frontEditorRef = useCodeMirror(initialData?.frontHtml ?? '', setFrontHtml);
  const backEditorRef = useCodeMirror(initialData?.backHtml ?? '', setBackHtml);

  useEffect(() => {
    if (initialData) {
      setConcept(initialData.concept); // eslint-disable-line react-hooks/set-state-in-effect
      setTopicId(initialData.topicId);
      setTags(initialData.tags);
    }
  }, [initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (initialData) {
      onSubmit({
        concept,
        front_html: frontHtml,
        back_html: backHtml,
        tags,
        topic_id: topicId,
      } as UpdateCardInput);
    } else {
      onSubmit({
        topic_id: topicId,
        concept,
        front_html: frontHtml,
        back_html: backHtml,
        tags,
      } as CreateCardInput);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col lg:flex-row gap-6">
      {/* Left column - form fields */}
      <div className="flex-[3] min-w-0 space-y-4">
        <div>
          <label htmlFor="card-concept" className="block text-sm text-text-muted mb-1">{t('cardEditor.concept')}</label>
          <textarea
            id="card-concept"
            value={concept}
            onChange={e => { setConcept(e.target.value); onDirty?.(); }}
            className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-border text-text-primary text-sm focus:outline-none focus:border-accent-blue resize-none"
            rows={2}
            placeholder={t('cardEditor.conceptPlaceholder')}
            required
          />
        </div>

        <label className="block">
          <span className="block text-sm text-text-muted mb-1">{t('cardEditor.topic')}</span>
          <TopicSelector value={topicId} onChange={setTopicId} />
        </label>

        <label className="block">
          <span className="block text-sm text-text-muted mb-1">{t('cardEditor.frontHtml')}</span>
          <div className="rounded-lg border border-border overflow-hidden" ref={frontEditorRef} />
        </label>

        <label className="block">
          <span className="block text-sm text-text-muted mb-1">{t('cardEditor.backHtml')}</span>
          <div className="rounded-lg border border-border overflow-hidden" ref={backEditorRef} />
        </label>

        <label className="block">
          <span className="block text-sm text-text-muted mb-1">{t('cardEditor.tags')}</span>
          <TagInput tags={tags} onChange={setTags} />
        </label>

        <button
          type="submit"
          disabled={!concept.trim() || !topicId || !frontHtml.trim() || !backHtml.trim() || isPending}
          className="px-6 py-2.5 rounded-lg text-sm font-medium bg-accent-blue text-white hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isPending ? t('cardEditor.saving') : initialData ? t('cardEditor.saveChanges') : t('cardEditor.createCard')}
        </button>
      </div>

      {/* Right column - live preview */}
      <div className="flex-[2] min-w-0 space-y-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-text-muted">{t('cardEditor.preview')}</label>
          <div className="flex rounded-lg overflow-hidden border border-border">
            <button
              type="button"
              onClick={() => setPreviewSide('front')}
              className={`px-3 py-1 text-xs ${previewSide === 'front' ? 'bg-accent-blue text-white' : 'bg-bg-surface text-text-muted'}`}
            >
              {t('cardEditor.front')}
            </button>
            <button
              type="button"
              onClick={() => setPreviewSide('back')}
              className={`px-3 py-1 text-xs ${previewSide === 'back' ? 'bg-accent-blue text-white' : 'bg-bg-surface text-text-muted'}`}
            >
              {t('cardEditor.back')}
            </button>
          </div>
        </div>
        <div className="bg-bg-secondary rounded-xl border border-border p-5 min-h-[200px]">
          <CardHtmlRender html={previewSide === 'front' ? frontHtml : backHtml} />
        </div>
      </div>
    </form>
  );
}
