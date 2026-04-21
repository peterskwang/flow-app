import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { adminApi, AdminSosEvent } from '../api/adminApi';

export default function SosPage() {
  const [events, setEvents] = useState<AdminSosEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadEvents = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await adminApi.getSosEvents();
      setEvents(data);
    } catch (e: any) {
      setError(e.message || 'Failed to load SOS events');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const activeCount = events.filter((e) => !e.resolved_at).length;

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">
          SOS Events{' '}
          <span className="text-slate-400 text-lg font-normal">({events.length})</span>
          {activeCount > 0 && (
            <span className="ml-3 bg-red-900/60 text-red-400 text-sm font-bold px-3 py-1 rounded-full animate-pulse">
              {activeCount} ACTIVE
            </span>
          )}
        </h2>
        <button
          onClick={loadEvents}
          className="text-sm bg-[#1e3a5f] hover:bg-[#1e88e5] text-white px-4 py-2 rounded-lg transition-colors"
        >
          Refresh
        </button>
      </div>
      {loading && <p className="text-slate-400">Loading...</p>}
      {error && <p className="text-red-400">{error}</p>}
      {!loading && !error && (
        <div className="overflow-x-auto rounded-xl border border-[#1e3a5f]">
          <table className="w-full text-sm">
            <thead className="bg-[#0d2034]">
              <tr>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">User</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Coordinates</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Triggered</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event, i) => (
                <tr
                  key={event.id}
                  className={`border-t border-[#1e3a5f] ${i % 2 === 0 ? 'bg-[#06121f]' : 'bg-[#081a2c]'}`}
                >
                  <td className="px-4 py-3 text-white font-semibold">{event.user_name}</td>
                  <td className="px-4 py-3 font-mono text-[#64ffda] text-xs">
                    {event.lat != null && event.lng != null
                      ? `${Number(event.lat).toFixed(5)}, ${Number(event.lng).toFixed(5)}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {new Date(event.triggered_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    {event.resolved_at ? (
                      <span className="bg-green-900/40 text-green-400 px-2 py-1 rounded text-xs font-semibold">
                        Resolved {new Date(event.resolved_at).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="bg-red-900/50 text-red-400 px-2 py-1 rounded text-xs font-semibold animate-pulse">
                        ACTIVE
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {events.length === 0 && (
            <p className="text-slate-400 text-center py-8">No SOS events recorded.</p>
          )}
        </div>
      )}
    </Layout>
  );
}
