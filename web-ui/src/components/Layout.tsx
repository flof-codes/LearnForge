import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 px-6 pt-10 pb-24 md:px-12 md:pt-12 md:pb-12 overflow-auto">
        <div className="max-w-[1100px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
