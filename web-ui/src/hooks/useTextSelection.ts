import { useCallback, useEffect, useState, type RefObject } from 'react';

export interface TextSelection {
  text: string;
  /** The `data-select-region` the selection lies in. */
  region: string;
  /** Where the selection is on screen, for a popover next to it. */
  rect: DOMRect;
}

const elementOf = (node: Node) => (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement);

/**
 * Words the learner selected inside one `[data-select-region]` under `root`.
 * A selection across regions, outside `root`, shorter than two or longer than
 * 80 characters counts as none. Read after the selection settles, so a drag
 * does not flicker a popover.
 */
export function useTextSelection(root: RefObject<HTMLElement | null>, enabled: boolean) {
  const [selection, setSelection] = useState<TextSelection | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = () => {
      const s = window.getSelection();
      if (!s || s.isCollapsed || s.rangeCount === 0) { setSelection(null); return; }
      const text = s.toString().replace(/\s+/g, ' ').trim();
      const range = s.getRangeAt(0);
      const start = elementOf(range.startContainer)?.closest('[data-select-region]');
      const end = elementOf(range.endContainer)?.closest('[data-select-region]');
      if (text.length < 2 || text.length > 80 || !start || start !== end || !root.current?.contains(start)) { setSelection(null); return; }
      setSelection({ text, region: start.getAttribute('data-select-region') ?? '', rect: range.getBoundingClientRect() });
    };
    const onChange = () => { clearTimeout(timer); timer = setTimeout(read, 250); };
    // A popover pinned to the old place would float over other text.
    const onScroll = () => setSelection(null);
    document.addEventListener('selectionchange', onChange);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('selectionchange', onChange);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [enabled, root]);

  const clear = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }, []);

  return { selection: enabled ? selection : null, clear };
}
