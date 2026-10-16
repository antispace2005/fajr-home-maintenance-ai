import { useState } from 'react';
import { Shield, Wrench, Lock, Mail, AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function AdminLogin({ onLoginSuccess }) {
  const [username, setUsername] = useState('admin@fajrmaintenance.ae');
  const [password, setPassword] = useState('Admin123!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showHintCopied, setShowHintCopied] = useState(false);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username.trim(),
          password: password,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Invalid username or password');
      }

      const data = await response.json();
      const token = data.access_token;

      // Save token to localStorage as required
      localStorage.setItem('admin_token', token);

      if (typeof onLoginSuccess === 'function') {
        onLoginSuccess(token);
      } else {
        // Fallback navigation to /admin
        if (window.history && window.history.pushState) {
          window.history.pushState({}, '', '/admin');
          window.dispatchEvent(new PopStateEvent('popstate'));
        } else {
          window.location.href = '/admin';
        }
      }
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const fillCredentials = () => {
    setUsername('admin@fajrmaintenance.ae');
    setPassword('Admin123!');
    setShowHintCopied(true);
    setTimeout(() => setShowHintCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Branding badge & icon */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-500/25 mb-4">
          <Wrench className="w-8 h-8" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
          Al Fajr Maintenance
        </h2>
        <div className="mt-1 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-200">
          <Shield className="w-3.5 h-3.5" />
          Owner Portal & Management
        </div>
        <p className="mt-2 text-sm text-slate-500">
          Sign in to manage bookings, weekly tech slots, and pricing.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="card-surface p-6 sm:p-8">
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 mt-0.5 shrink-0 text-rose-600" />
              <div className="text-sm font-medium">{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="username"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5"
              >
                Email or Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-5 h-5" />
                </div>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin@fajrmaintenance.ae"
                  className="block w-full pl-10 pr-3.5 py-2.5 text-sm text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all duration-150"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full pl-10 pr-3.5 py-2.5 text-sm text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all duration-150"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full btn-primary py-3 gap-2 text-sm font-semibold cursor-pointer"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to Owner Portal</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Preset hint box */}
          <div className="mt-6 pt-5 border-t border-slate-200/80">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Owner Access Credentials
              </span>
              <button
                type="button"
                onClick={fillCredentials}
                className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors cursor-pointer"
              >
                {showHintCopied ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Applied!
                  </span>
                ) : (
                  'Auto-fill form'
                )}
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-slate-700 space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Email:</span>
                <span className="font-semibold text-slate-800 select-all">admin@fajrmaintenance.ae</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Password:</span>
                <span className="font-semibold text-slate-800 select-all">Admin123!</span>
              </div>
            </div>
          </div>
        </div>

        {/* Security footer disclaimer */}
        <div className="mt-6 text-center text-xs text-slate-400">
          <Shield className="w-3.5 h-3.5 inline mr-1 text-slate-400" />
          Restricted access. Authorized Al Fajr management personnel only.
        </div>
      </div>
    </div>
  );
}
