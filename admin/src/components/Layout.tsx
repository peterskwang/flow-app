import Link from 'next/link';
import { useRouter } from 'next/router';
import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

const NAV_LINKS = [
  { href: '/users', label: 'Users' },
  { href: '/groups', label: 'Groups' },
  { href: '/sos', label: 'SOS Events' },
  { href: '/notify', label: 'Notify' },
];

export default function Layout({ children }: LayoutProps) {
  const router = useRouter();

  const handleLogout = () => {
    sessionStorage.removeItem('admin_password');
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-[#06121f] text-slate-100">
      <nav className="bg-[#0d2034] border-b border-[#1e3a5f] px-6 py-4 flex items-center gap-6">
        <Link href="/users" className="font-black text-xl text-white tracking-wider hover:text-[#64ffda] transition-colors">
          WOOVERSE ADMIN
        </Link>
        <div className="flex gap-4 flex-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-semibold px-3 py-1 rounded-lg transition-colors ${
                router.pathname === link.href
                  ? 'bg-[#1e88e5] text-white'
                  : 'text-slate-400 hover:text-white hover:bg-[#1a3a5c]'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-slate-400 hover:text-white transition-colors"
        >
          Logout
        </button>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}
