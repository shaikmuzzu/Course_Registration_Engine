'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Mail, Lock, Zap, AlertCircle, Loader2 } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { decodeToken, isAuthenticated, getRole } from '@/lib/auth';

interface LoginResponse {
  success: boolean;
  token: string;
  user: { id: string; name: string; email: string; role: string };
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  // If already logged in, redirect immediately
  useEffect(() => {
    if (isAuthenticated()) {
      const role = getRole();
      router.replace(role === 'ADMIN' ? '/dashboard/admin' : '/dashboard/student');
    }
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await apiRequest<LoginResponse>('/api/auth/login', 'POST', { email, password });
      localStorage.setItem('token', data.token);

      const payload = decodeToken(data.token);
      if (payload?.role === 'ADMIN') {
        router.push('/dashboard/admin');
      } else {
        router.push('/dashboard/student');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 32, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <motion.div
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl glass glow-cyan mb-4"
          >
            <Zap className="w-8 h-8 text-cyan-400" />
          </motion.div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Course Engine</h1>
          <p className="text-slate-400 mt-1 text-sm">Secure Academic Portal — Level 4</p>
        </div>

        {/* Card */}
        <div className="glass rounded-2xl p-8 glow-cyan">
          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@university.edu"
                  required
                  className="input-cyber w-full rounded-xl pl-10 pr-4 py-3 text-sm"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="input-cyber w-full rounded-xl pl-10 pr-4 py-3 text-sm"
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </motion.div>
            )}

            {/* Submit */}
            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full relative overflow-hidden rounded-xl py-3 px-6 font-semibold text-sm
                         bg-gradient-to-r from-cyan-500 to-cyan-400 text-slate-900
                         disabled:opacity-60 disabled:cursor-not-allowed
                         glow-cyan transition-all duration-200"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Authenticating...
                </span>
              ) : (
                'Sign In to Engine'
              )}
            </motion.button>
          </form>

          {/* Demo credentials hint */}
          <div className="mt-6 pt-5 border-t border-white/8">
            <p className="text-xs text-slate-500 text-center mb-3 font-medium">Demo Credentials</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: '🛡️ Admin', email: 'admin@university.edu', pass: 'Admin@123' },
                { label: '👤 Student', email: 'student1@university.edu', pass: 'Student@123' },
              ].map(cred => (
                <button
                  key={cred.label}
                  onClick={() => { setEmail(cred.email); setPassword(cred.pass); }}
                  className="text-left p-2.5 rounded-lg glass hover:bg-white/8 transition-colors text-xs"
                >
                  <div className="font-semibold text-slate-300">{cred.label}</div>
                  <div className="text-slate-500 mt-0.5 truncate">{cred.email}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
