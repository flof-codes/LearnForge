import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import PublicLayout from './components/PublicLayout';
import ErrorBoundary from './components/ErrorBoundary';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import Dashboard from './pages/Dashboard';
import TopicsPage from './pages/topics/TopicsPage';
import TopicDetailPage from './pages/topics/TopicDetailPage';
import CardBrowserPage from './pages/cards/CardBrowserPage';
import CardCreatorPage from './pages/cards/CardCreatorPage';
import CardDetailPage from './pages/cards/CardDetailPage';
import CardEditorPage from './pages/cards/CardEditorPage';
import StudyStartPage from './pages/study/StudyStartPage';
import StudySessionPage from './pages/study/StudySessionPage';
import McpSettingsPage from './pages/settings/McpSettingsPage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import LandingPage from './pages/public/LandingPage';
import ImpressumPage from './pages/public/ImpressumPage';
import DatenschutzPage from './pages/public/DatenschutzPage';
import AGBPage from './pages/public/AGBPage';
import DocsPage from './pages/public/DocsPage';
import SharePage from './pages/SharePage';

function AuthRedirect({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return children;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export function AppRoutes() {
  return (
    <Routes>
      {/* Public marketing pages */}
      <Route element={<PublicLayout />}>
        <Route index element={<AuthRedirect><LandingPage /></AuthRedirect>} />
        <Route path="impressum" element={<ImpressumPage />} />
        <Route path="datenschutz" element={<DatenschutzPage />} />
        <Route path="agb" element={<AGBPage />} />
        <Route path="docs" element={<DocsPage />} />
        <Route path="privacy" element={<DatenschutzPage />} />
        <Route path="terms" element={<AGBPage />} />
        <Route path="imprint" element={<ImpressumPage />} />
      </Route>

      {/* Auth */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Public share accept page */}
      <Route path="/share/:token" element={<SharePage />} />

      {/* Authenticated app */}
      <Route path="/dashboard" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="topics" element={<TopicsPage />} />
        <Route path="topics/:id" element={<TopicDetailPage />} />
        <Route path="cards/browse" element={<CardBrowserPage />} />
        <Route path="cards/new" element={<CardCreatorPage />} />
        <Route path="cards/:id" element={<CardDetailPage />} />
        <Route path="cards/:id/edit" element={<CardEditorPage />} />
        <Route path="study" element={<StudyStartPage />} />
        <Route path="study/session" element={<StudySessionPage />} />
        <Route path="settings" element={<McpSettingsPage />} />
        <Route path="settings/mcp" element={<Navigate to="/dashboard/settings" replace />} />
        <Route path="settings/billing" element={<Navigate to="/dashboard/settings" replace />} />
        <Route path="admin" element={<AdminRoute><AdminDashboardPage /></AdminRoute>} />
      </Route>

      {/* Legacy redirects for bookmarked URLs */}
      <Route path="/topics/*" element={<Navigate to="/dashboard/topics" replace />} />
      <Route path="/cards/*" element={<Navigate to="/dashboard/cards/browse" replace />} />
      <Route path="/study/*" element={<Navigate to="/dashboard/study" replace />} />
      <Route path="/settings/*" element={<Navigate to="/dashboard/settings" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
      <AuthProvider>
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
      </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
