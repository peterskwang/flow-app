import { useRouter } from 'next/router';
import React, { useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8100'}/api/admin/users`,
        { headers: { 'X-Admin-Password': password } }
      );
      if (res.status === 401) {
        setError('Incorrect password.');
        return;
      }
      if (!res.ok) throw new Error('Server error');
      sessionStorage.setItem('admin_password', password);
      router.push('/users');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#06121f] flex items-center justify-center">
      <div className="w-full max-w-sm bg-[#0d2034] rounded-2xl p-8 border border-[#1e3a5f]">
        <h1 className="text-3xl font-black text-white text-center mb-2 tracking-wider">Wooverse</h1>
        <p className="text-slate-400 text-center mb-8 text-sm">Admin Panel</p>
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password"
            className="bg-[#06121f] border border-[#26445f] rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-[#1e88e5]"
          />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="bg-[#1e88e5] text-white font-bold py-3 rounded-xl hover:bg-[#1565c0] disabled:opacity-50 transition-colors"
          >
            {loading ? 'Checking...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}
