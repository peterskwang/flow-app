import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { adminApi, AdminGroup } from '../api/adminApi';

export default function GroupsPage() {
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadGroups = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await adminApi.getGroups();
      setGroups(data);
    } catch (e: any) {
      setError(e.message || 'Failed to load groups');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, []);

  const handleDelete = async (group: AdminGroup) => {
    if (!confirm(`Delete group "${group.name}"? This removes all members and location data.`)) return;
    setDeleting(group.id);
    try {
      await adminApi.deleteGroup(group.id);
      setGroups((prev) => prev.filter((g) => g.id !== group.id));
    } catch (e: any) {
      setError(`Failed to delete group: ${e.message}`);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Groups <span className="text-slate-400 text-lg font-normal">({groups.length})</span></h2>
        <button
          onClick={loadGroups}
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
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Code</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Members</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Created</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Status</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group, i) => (
                <tr
                  key={group.id}
                  className={`border-t border-[#1e3a5f] ${i % 2 === 0 ? 'bg-[#06121f]' : 'bg-[#081a2c]'}`}
                >
                  <td className="px-4 py-3 text-white font-semibold">{group.name}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono font-bold text-[#64ffda] tracking-widest">{group.invite_code}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{group.member_count} / {group.max_members}</td>
                  <td className="px-4 py-3 text-slate-400">{new Date(group.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    {group.closed_at ? (
                      <span className="bg-slate-700/50 text-slate-400 px-2 py-1 rounded text-xs font-semibold">Closed</span>
                    ) : (
                      <span className="bg-green-900/40 text-green-400 px-2 py-1 rounded text-xs font-semibold">Active</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(group)}
                      disabled={deleting === group.id}
                      className="text-xs bg-red-900/50 hover:bg-red-700 text-red-300 hover:text-white px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {deleting === group.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {groups.length === 0 && (
            <p className="text-slate-400 text-center py-8">No groups found.</p>
          )}
        </div>
      )}
    </Layout>
  );
}
