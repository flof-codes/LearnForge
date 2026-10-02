import { useSyncExternalStore } from 'react';

// Same boundary as Tailwind's `md` (48rem): below it the app uses the phone layout.
const QUERY = '(width < 48rem)';

function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

/**
 * True below the `md` breakpoint. For the cases CSS cannot cover: content that must not be
 * mounted at all on a phone (card preview iframes), or markup inside the card
 * frame, which has its own viewport.
 */
export function useIsPhone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
