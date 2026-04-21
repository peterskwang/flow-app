import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { adminApi, AdminUser } from '../api/adminApi';

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [banning, setBanning] = useState<string | null>(null);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await adminApi.getUsers();
      setUsers(data);
    } catch (e: any) {
      setError(e.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleBan = async (user: AdminUser) => {
    if (!confirm(`Ban ${user.name}? This disconnects them immediately.`)) return;
    setBanning(user.id);
    try {
      await adminApi.banUser(user.id);
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, banned_at: new Date().toISOString() } : u))
      );
    } catch (e: any) {
      setError(`Failed to ban user: ${e.message}`);
    } finally {
      setBanning(null);
    }
  };

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Users <span className="text-slate-400 text-lg font-normal">({users.length})</span></h2>
        <button
          onClick={loadUsers}
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
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Name</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Device ID</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Registered</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Status</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, i) => (
                <tr
                  key={user.id}
                  className={`border-t border-[#1e3a5f] ${i % 2 === 0 ? 'bg-[#06121f]' : 'bg-[#081a2c]'}`}
                >
                  <td className="px-4 py-3 text-white font-semibold">{user.name}</td>
                  <td className="px-4 py-3 text-slate-400 font-mono text-xs">{user.device_id.slice(0, 16)}...</td>
                  <td className="px-4 py-3 text-slate-400">{new Date(user.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    {user.banned_at ? (
                      <span className="bg-red-900/40 text-red-400 px-2 py-1 rounded text-xs font-semibold">Banned</span>
                    ) : (
                      <span className="bg-green-900/40 text-green-400 px-2 py-1 rounded text-xs font-semibold">Active</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {!user.banned_at && (
                      <button
                        onClick={() => handleBan(user)}
                        disabled={banning === user.id}
                        className="text-xs bg-red-900/50 hover:bg-red-700 text-red-300 hover:text-white px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {banning === user.id ? 'Banning...' : 'Ban'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <p className="text-slate-400 text-center py-8">No users found.</p>
          )}
        </div>
      )}
    </Layout>
  );
}
