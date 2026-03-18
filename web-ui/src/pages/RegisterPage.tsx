import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { authService } from '../api/auth';
import { useAuth } from '../contexts/AuthContext';

export default function RegisterPage() {
  const [name, setName] = useState('');
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
      const { data } = await authService.register(email, password, name);
      login(data.token);
      navigate('/dashboard', { replace: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-bg-primary">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-bg-secondary rounded-xl border border-border p-8 space-y-6">
        <div className="text-center">
          <UserPlus size={32} className="mx-auto text-accent-blue mb-3" />
          <h1 className="text-xl font-medium text-text-primary">Create Account</h1>
          <p className="text-text-muted text-sm mt-1">Start your 30-day free trial</p>
        </div>

        {error && (
          <div className="bg-danger/10 text-danger text-sm rounded-lg px-4 py-2">{error}</div>
        )}

        <div className="space-y-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            autoFocus
            autoComplete="name"
            className="w-full px-4 py-2.5 bg-bg-primary border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue"
          />

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="email"
            className="w-full px-4 py-2.5 bg-bg-primary border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue"
          />

          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="new-password"
              className="w-full px-4 py-2.5 bg-bg-primary border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue"
            />
            <p className="text-text-muted text-xs mt-1.5">At least 8 characters</p>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !name || !email || !password}
          className="w-full py-2.5 bg-accent-blue text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? 'Creating account...' : 'Sign up'}
        </button>

        <p className="text-center text-text-muted text-sm">
          Already have an account?{' '}
          <Link to="/login" className="text-accent-blue hover:underline">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
