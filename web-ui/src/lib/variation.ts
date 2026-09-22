/** Maps a change rate 0..1 to the word shown on the "Question variation" slider. */
export function variationWord(value: number): 'exact' | 'reworded' | 'newContext' | 'free' {
  if (value === 0) return 'exact';
  if (value <= 0.4) return 'reworded';
  if (value <= 0.8) return 'newContext';
  return 'free';
}
