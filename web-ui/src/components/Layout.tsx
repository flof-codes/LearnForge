import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import EmailVerificationBanner from './EmailVerificationBanner';

export default function Layout() {
  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      {/* Phone: 1rem gutter that panels break out of, room for the tab bar and the safe areas. */}
      <main className="flex-1 min-w-0 px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:px-12 md:pt-12 md:pb-12 overflow-y-auto overflow-x-hidden md:overflow-x-auto">
        <div className="max-w-[1100px] mx-auto">
          <EmailVerificationBanner />
          <Outlet />
        </div>
      </main>
    </div>
  );
}
