import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, ArrowLeft } from 'lucide-react';
import { authService } from '../api/auth';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await authService.login(email, password);
      login(data.token);
      navigate('/dashboard', { replace: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-bg-primary">
      <div className="w-full max-w-sm">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors mb-4">
          <ArrowLeft size={16} />
          Back to home
        </Link>
      <form onSubmit={handleSubmit} className="w-full bg-bg-secondary rounded-xl border border-border p-8 space-y-6">
        <div className="text-center">
          <Lock size={32} className="mx-auto text-accent-blue mb-3" />
          <h1 className="text-xl font-medium text-text-primary">LearnForge</h1>
          <p className="text-text-muted text-sm mt-1">Sign in to continue</p>
        </div>

        {error && (
          <div className="bg-danger/10 text-danger text-sm rounded-lg px-4 py-2">{error}</div>
        )}

        <div className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoFocus
            autoComplete="email"
            className="w-full px-4 py-2.5 bg-bg-primary border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue"
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            className="w-full px-4 py-2.5 bg-bg-primary border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !email || !password}
          className="w-full py-2.5 bg-accent-blue text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>

        <p className="text-center text-text-muted text-sm">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="text-accent-blue hover:underline">Sign up</Link>
        </p>
      </form>
      </div>
    </div>
  );
}
