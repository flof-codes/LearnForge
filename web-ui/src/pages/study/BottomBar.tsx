import type { ReactNode } from 'react';

/** The bar at the bottom of the screen, same place and width as the rating buttons of a plain card. */
export default function BottomBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-bg-primary/90 backdrop-blur-sm border-t border-border pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] px-4 z-40">
      <div className="max-w-2xl mx-auto space-y-2">{children}</div>
    </div>
  );
}
