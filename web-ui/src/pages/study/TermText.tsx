import { useMemo, useState, type ReactNode } from 'react';
import type { QuestionTerm } from '../../types';

interface Props {
  text: string;
  terms: QuestionTerm[];
  /** Off: plain text. Before an answer only the question's own terms are open, so an option gives nothing away. */
  active?: boolean;
  onLookup?: () => void;
  /** Rendered in place of the marker, for a gap sentence. */
  marker?: string;
  markerNode?: ReactNode;
}

interface Piece { text: string; term?: QuestionTerm; marker?: boolean }

/** Splits the text at the first occurrence of each term (and at the marker), keeping the original casing. */
function split(text: string, terms: QuestionTerm[], marker?: string): Piece[] {
  let pieces: Piece[] = [{ text }];
  const cut = (needle: string, make: (found: string) => Piece, wholeWord = true) => {
    // Whole words only: a short term must not light up inside a longer word.
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = wholeWord ? new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu') : new RegExp(escaped, 'iu');
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      if (p.term || p.marker) continue;
      const at = p.text.search(pattern);
      if (at < 0) continue;
      const found = p.text.slice(at, at + needle.length);
      pieces = [
        ...pieces.slice(0, i),
        { text: p.text.slice(0, at) },
        make(found),
        { text: p.text.slice(at + needle.length) },
        ...pieces.slice(i + 1),
      ].filter(x => x.text !== '' || x.marker);
      return;
    }
  };
  if (marker) cut(marker, () => ({ text: '', marker: true }), false);
  // Longest first, so "stroke volume" is not split by a shorter term inside it.
  for (const term of [...terms].sort((a, b) => b.term.length - a.term.length)) cut(term.term, found => ({ text: found, term }));
  return pieces;
}

/**
 * Text in which the words that have a stored explanation are underlined.
 * A tap shows the explanation under the text, a second tap closes it.
 */
export default function TermText({ text, terms, active = true, onLookup, marker, markerNode }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const pieces = useMemo(() => split(text, active ? terms : [], marker), [text, terms, active, marker]);
  const shown = active ? terms.find(t => t.term === open) : undefined;

  return (
    <>
      {pieces.map((p, i) => {
        if (p.marker) return <span key={i}>{markerNode}</span>;
        if (!p.term) return <span key={i}>{p.text}</span>;
        const term = p.term;
        return (
          <button
            key={i}
            type="button"
            aria-expanded={open === term.term}
            onClick={(e) => {
              e.stopPropagation();
              if (open !== term.term) onLookup?.();
              setOpen(open === term.term ? null : term.term);
            }}
            className={`underline decoration-dotted decoration-2 underline-offset-4 decoration-accent-purple cursor-help text-left ${open === term.term ? 'text-accent-purple' : ''}`}
            style={{ font: 'inherit' }}
          >
            {p.text}
          </button>
        );
      })}
      {shown && (
        <span className="block mt-2 pl-3 border-l-2 border-accent-purple text-sm font-normal leading-normal text-text-primary">
          <b className="font-semibold">{shown.term}.</b> {shown.definition}
        </span>
      )}
    </>
  );
}
