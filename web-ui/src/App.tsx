import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import TopicsPage from './pages/topics/TopicsPage';
import TopicDetailPage from './pages/topics/TopicDetailPage';
import CardBrowserPage from './pages/cards/CardBrowserPage';
import CardCreatorPage from './pages/cards/CardCreatorPage';
import CardDetailPage from './pages/cards/CardDetailPage';
import CardEditorPage from './pages/cards/CardEditorPage';
import StudyStartPage from './pages/study/StudyStartPage';
import StudySessionPage from './pages/study/StudySessionPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ErrorBoundary>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="topics" element={<TopicsPage />} />
              <Route path="topics/:id" element={<TopicDetailPage />} />
              <Route path="cards/browse" element={<CardBrowserPage />} />
              <Route path="cards/new" element={<CardCreatorPage />} />
              <Route path="cards/:id" element={<CardDetailPage />} />
              <Route path="cards/:id/edit" element={<CardEditorPage />} />
              <Route path="study" element={<StudyStartPage />} />
              <Route path="study/session" element={<StudySessionPage />} />
            </Route>
          </Routes>
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  );
}
