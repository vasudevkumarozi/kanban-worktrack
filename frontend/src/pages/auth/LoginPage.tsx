import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderKanban } from 'lucide-react';
import { GoogleLogin } from '@react-oauth/google';
import api from '../../api/client';
import { useAuthStore } from '../../store/auth.store';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth, token } = useAuthStore();
  const navigate = useNavigate();

  if (token) { navigate('/dashboard'); return null; }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      setAuth(data.user, data.token);
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) return;
    setLoading(true);
    try {
      const { data } = await api.post('/auth/google', { credential: credentialResponse.credential });
      setAuth(data.user, data.token);
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Google login failed');
    } finally {
      setLoading(false);
    }
  };

  const demoLogin = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-600 to-primary-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl mb-4 shadow-lg">
            <FolderKanban size={32} className="text-primary-600" />
          </div>
          <h1 className="text-3xl font-bold text-white">WorkTrack</h1>
          <p className="text-primary-100 mt-2">Employee Task Management System</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold mb-6">Sign in to your account</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="input" placeholder="you@company.com" required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="input" placeholder="••••••••" required
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6">
            <div className="relative flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400 font-medium whitespace-nowrap">or sign in with</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => toast.error('Google sign-in failed')}
                text="signin_with"
                shape="rectangular"
                size="large"
                width="340"
              />
            </div>
            <p className="text-xs text-center text-gray-400 mt-3">
              Only <span className="font-semibold text-gray-500">@ozi.in</span> accounts are allowed
            </p>
          </div>

          <div className="mt-4 pt-4 border-t">
            <p className="text-xs text-gray-500 mb-3 text-center font-medium">Demo Accounts</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Super Admin', email: 'admin@company.com', pass: 'admin123', color: 'bg-red-50 text-red-700 hover:bg-red-100' },
                { label: 'Manager', email: 'manager@company.com', pass: 'manager123', color: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
                { label: 'Employee', email: 'emp1@company.com', pass: 'emp123', color: 'bg-green-50 text-green-700 hover:bg-green-100' },
              ].map(d => (
                <button key={d.email} onClick={() => demoLogin(d.email, d.pass)}
                  className={`text-xs py-2 px-2 rounded-lg font-medium transition-colors ${d.color}`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
