import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { adminApi, AdminGroup } from '../api/adminApi';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8100';

function getPassword(): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('admin_password') || '';
}

export default function NotifyPage() {
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi.getGroups().then(setGroups).catch(() => {});
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      setError('Title and message are required.');
      return;
    }
    setError('');
    setResult(null);
    setSending(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': getPassword(),
        },
        body: JSON.stringify({
          group_id: selectedGroupId || undefined,
          title: title.trim(),
          body: body.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult({ ok: true, message: `Sent! ${data.sent ?? ''} devices notified.` });
      setTitle('');
      setBody('');
    } catch (e: any) {
      setResult({ ok: false, message: e.message || 'Failed to send notification' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-xl">
        <h2 className="text-2xl font-bold text-white mb-6">Send Push Notification</h2>
        <form onSubmit={handleSend} className="bg-[#0d2034] rounded-2xl border border-[#1e3a5f] p-6 flex flex-col gap-4">
          <div>
            <label className="block text-slate-400 text-sm font-semibold mb-1 uppercase tracking-wider">Target Group</label>
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              className="w-full bg-[#06121f] border border-[#26445f] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#1e88e5]"
            >
              <option value="">All groups (broadcast)</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name} ({g.invite_code})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-slate-400 text-sm font-semibold mb-1 uppercase tracking-wider">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Notification title"
              className="w-full bg-[#06121f] border border-[#26445f] rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-[#1e88e5]"
            />
          </div>
          <div>
            <label className="block text-slate-400 text-sm font-semibold mb-1 uppercase tracking-wider">Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Notification body text"
              rows={4}
              className="w-full bg-[#06121f] border border-[#26445f] rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-[#1e88e5] resize-none"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          {result && (
            <p className={`text-sm font-semibold ${result.ok ? 'text-green-400' : 'text-red-400'}`}>
              {result.ok ? '✅ ' : '❌ '}{result.message}
            </p>
          )}
          <button
            type="submit"
            disabled={sending}
            className="bg-[#1e88e5] text-white font-bold py-3 rounded-xl hover:bg-[#1565c0] disabled:opacity-50 transition-colors"
          >
            {sending ? 'Sending...' : 'Send Notification'}
          </button>
        </form>
      </div>
    </Layout>
  );
}
