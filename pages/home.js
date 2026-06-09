// pages/home.js
// Store / Business listing page.
// Fetches all clients with delivery enabled from /api/clients and
// renders them as tappable cards. Tapping navigates to /[clientId].

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { FiSearch, FiX, FiLogOut, FiClock, FiShoppingBag, FiWifi } from 'react-icons/fi';
import { apiFetch } from '@/lib/api';

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-stone-100 p-4 flex items-center gap-4 animate-pulse">
      <div className="w-14 h-14 rounded-xl bg-stone-200 flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-stone-200 rounded-full w-3/5" />
        <div className="h-3 bg-stone-100 rounded-full w-2/5" />
        <div className="flex gap-2 mt-1">
          <div className="h-3 bg-stone-100 rounded-full w-16" />
          <div className="h-3 bg-stone-100 rounded-full w-16" />
        </div>
      </div>
    </div>
  );
}

function LogoAvatar({ name, logoUrl }) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
        onError={e => { e.currentTarget.style.display = 'none'; }}
      />
    );
  }
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  const colours = ['#F97316','#0EA5E9','#8B5CF6','#10B981','#F59E0B','#EF4444'];
  const bg = colours[(name || '').charCodeAt(0) % colours.length];
  return (
    <div
      className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 text-white font-bold text-xl"
      style={{ backgroundColor: bg }}
    >
      {initial}
    </div>
  );
}

function ClientCard({ client, onClick }) {
  return (
    <button
      onClick={onClick}
      className={[
        'w-full bg-white rounded-2xl border border-stone-100 p-4',
        'flex items-center gap-4 text-left shadow-sm',
        'active:scale-[0.98] transition-transform duration-100',
        !client.isOpen && 'opacity-60',
      ].filter(Boolean).join(' ')}
    >
      <LogoAvatar name={client.name} logoUrl={client.logoUrl} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-bold text-stone-900 text-sm truncate">{client.name}</span>
          {!client.isOpen && (
            <span className="text-[10px] font-semibold bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded-full whitespace-nowrap">
              Closed
            </span>
          )}
        </div>

        {client.category && (
          <span className="inline-block text-[11px] font-medium bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full mb-1.5">
            {client.category}
          </span>
        )}

        <div className="flex items-center gap-3 text-[11px] text-stone-400">
          {client.deliveryTimeMinutes != null && (
            <span className="flex items-center gap-1">
              <FiClock size={11} />
              {client.deliveryTimeMinutes} min
            </span>
          )}
          {client.minOrderAmount != null && (
            <span className="flex items-center gap-1">
              <FiShoppingBag size={11} />
              Min &#x20B9;{client.minOrderAmount}
            </span>
          )}
        </div>
      </div>

      <svg className="w-4 h-4 text-stone-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

export default function HomePage() {
  const router = useRouter();

  const [clients,  setClients]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [search,   setSearch]   = useState('');
  const [userName, setUserName] = useState('');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('cafeqr_user');
      if (stored) {
        const u = JSON.parse(stored);
        setUserName(u.name || '');
      }
    } catch {}
  }, []);

  async function fetchClients() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch('/clients');
      setClients(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load stores');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchClients(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.trim().toLowerCase();
    return clients.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.category?.toLowerCase().includes(q)
    );
  }, [clients, search]);

  async function handleLogout() {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
    router.replace('/login');
  }

  return (
    <>
      <Head><title>Cafe QR Delivery - Browse Stores</title></Head>

      <div className="min-h-screen bg-stone-50 pb-24">

        {/* Header */}
        <div className="bg-white border-b border-stone-100 px-5 pt-12 pb-4 sticky top-0 z-10">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold text-stone-900">Cafe QR Delivery</h1>
              {userName && (
                <p className="text-xs text-stone-400 mt-0.5">Hello, {userName.split(' ')[0]} &#x1F44B;</p>
              )}
            </div>
            <button
              onClick={handleLogout}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-stone-100 text-stone-500 active:bg-stone-200"
              aria-label="Logout"
            >
              <FiLogOut size={16} />
            </button>
          </div>

          {/* Search bar */}
          <div className="flex items-center gap-2 bg-stone-100 rounded-xl px-3.5 py-2.5">
            <FiSearch size={15} className="text-stone-400 flex-shrink-0" />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search stores or categories..."
              className="bg-transparent flex-1 text-sm text-stone-800 outline-none placeholder-stone-400"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-stone-400">
                <FiX size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="px-4 pt-4 space-y-3">

          {loading && (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
              <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center">
                <FiWifi size={24} className="text-red-400" />
              </div>
              <div>
                <p className="font-semibold text-stone-700 text-sm">Could not load stores</p>
                <p className="text-stone-400 text-xs mt-1">{error}</p>
              </div>
              <button
                onClick={fetchClients}
                className="bg-brand-orange text-white text-sm font-semibold px-5 py-2.5 rounded-xl"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && filtered.length === 0 && clients.length > 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-2 text-center">
              <span className="text-4xl">&#x1F50D;</span>
              <p className="font-semibold text-stone-700 text-sm">No stores found</p>
              <p className="text-stone-400 text-xs">Try a different search term</p>
            </div>
          )}

          {!loading && !error && clients.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-2 text-center">
              <span className="text-4xl">&#x1F3EA;</span>
              <p className="font-semibold text-stone-700 text-sm">No stores available yet</p>
              <p className="text-stone-400 text-xs">Check back soon</p>
            </div>
          )}

          {!loading && !error && filtered.map(client => (
            <ClientCard
              key={client.id}
              client={client}
              onClick={() => router.push(`/${client.id}`)}
            />
          ))}
        </div>
      </div>
    </>
  );
}
