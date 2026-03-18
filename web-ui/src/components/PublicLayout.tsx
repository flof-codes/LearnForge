import { Outlet } from 'react-router-dom';
import PublicHeader from './public/PublicHeader';
import PublicFooter from './public/PublicFooter';

export default function PublicLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-bg-primary">
      <PublicHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  );
}
