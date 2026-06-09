// components/BottomNav.js
// Fixed mobile bottom navigation bar.
// Tabs: Home | Orders | Account
// Hidden on /login and /signup (auth pages).
// Shows a cart item count badge when there are items in the cart.

import { useRouter } from 'next/router';
import Link from 'next/link';
import { FiHome, FiList, FiUser } from 'react-icons/fi';
import { useCart } from '@/components/CartContext';

// Pages where the bottom nav should NOT appear
const HIDDEN_ON = ['/login', '/signup'];

export default function BottomNav() {
  const router   = useRouter();
  const { totalItems } = useCart();
  const pathname = router.pathname;

  // Hide on auth pages
  if (HIDDEN_ON.some(p => pathname.startsWith(p))) return null;

  const tabs = [
    {
      href:    '/home',
      label:   'Home',
      icon:    FiHome,
      // Active on /home and dynamic store/checkout routes
      active:  pathname === '/home' || pathname.startsWith('/[clientId]'),
    },
    {
      href:    '/orders',
      label:   'Orders',
      icon:    FiList,
      active:  pathname.startsWith('/orders'),
      badge:   totalItems > 0 ? totalItems : 0,
    },
    {
      href:    '/account',
      label:   'Account',
      icon:    FiUser,
      active:  pathname === '/account',
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-stone-100 pb-safe">
      <div className="flex items-center justify-around px-2 h-16">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-col items-center justify-center gap-0.5 flex-1 py-2 relative"
            >
              {/* Badge */}
              {tab.badge > 0 && (
                <span className="absolute top-1 right-1/4 min-w-[16px] h-4 bg-brand-orange text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">
                  {tab.badge > 99 ? '99+' : tab.badge}
                </span>
              )}

              <Icon
                size={22}
                className={tab.active ? 'text-brand-orange' : 'text-stone-400'}
                strokeWidth={tab.active ? 2.5 : 1.8}
              />
              <span
                className={[
                  'text-[10px] font-medium',
                  tab.active ? 'text-brand-orange' : 'text-stone-400',
                ].join(' ')}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
