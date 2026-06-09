// pages/[clientId]/index.js
// Store menu page.
// Shows the full product catalogue for one client (store/tenant),
// grouped into category tabs. Users add items to the cart and
// proceed to checkout via the sticky bottom bar.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { FiArrowLeft, FiShoppingCart, FiPlus, FiMinus, FiWifi } from 'react-icons/fi';
import { apiFetch } from '@/lib/api';
import { useCart } from '@/components/CartContext';

// ---- Helpers ----------------------------------------------------------------

function formatPrice(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', minimumFractionDigits: 0,
  }).format(amount);
}

// ---- Skeleton ---------------------------------------------------------------

function SkeletonItem() {
  return (
    <div className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-stone-100 animate-pulse">
      <div className="w-16 h-16 rounded-xl bg-stone-200 flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-stone-200 rounded-full w-3/5" />
        <div className="h-3 bg-stone-100 rounded-full w-4/5" />
        <div className="h-3 bg-stone-200 rounded-full w-1/4" />
      </div>
    </div>
  );
}

// ---- Image / Initial avatar -------------------------------------------------

function ItemImage({ name, imageUrl }) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
        onError={e => { e.currentTarget.style.display = 'none'; }}
      />
    );
  }
  const colours = ['#F97316','#0EA5E9','#8B5CF6','#10B981','#F59E0B','#EF4444'];
  const bg = colours[(name || '').charCodeAt(0) % colours.length];
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return (
    <div
      className="w-16 h-16 rounded-xl flex items-center justify-center flex-shrink-0 text-white font-bold text-xl"
      style={{ backgroundColor: bg }}
    >
      {initial}
    </div>
  );
}

// ---- Item card --------------------------------------------------------------

function ItemCard({ item, qtyInCart, onAdd, onIncrease, onDecrease }) {
  return (
    <div className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-stone-100 shadow-sm">
      <ItemImage name={item.name} imageUrl={item.imageUrl} />

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-stone-900 text-sm leading-tight">{item.name}</p>
        {item.description && (
          <p className="text-stone-400 text-xs mt-0.5 line-clamp-2">{item.description}</p>
        )}
        <p className="text-brand-orange font-bold text-sm mt-1.5">
          {formatPrice(item.price)}
        </p>
        {item.hasVariants && (
          <p className="text-[10px] text-stone-400 mt-0.5">Customisable</p>
        )}
      </div>

      {/* Add / qty controls */}
      <div className="flex-shrink-0">
        {qtyInCart === 0 ? (
          <button
            onClick={() => onAdd(item)}
            className="w-8 h-8 bg-brand-orange text-white rounded-full flex items-center justify-center shadow active:scale-95 transition-transform"
          >
            <FiPlus size={16} strokeWidth={2.5} />
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => onDecrease(item)}
              className="w-7 h-7 bg-stone-100 text-stone-700 rounded-full flex items-center justify-center active:bg-stone-200"
            >
              <FiMinus size={13} strokeWidth={2.5} />
            </button>
            <span className="text-sm font-bold text-stone-900 w-4 text-center">{qtyInCart}</span>
            <button
              onClick={() => onIncrease(item)}
              className="w-7 h-7 bg-brand-orange text-white rounded-full flex items-center justify-center active:scale-95"
            >
              <FiPlus size={13} strokeWidth={2.5} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Main page --------------------------------------------------------------

export default function MenuPage() {
  const router   = useRouter();
  const { clientId } = router.query;

  const { clientId: cartClientId, items: cartItems, totalItems, totalAmount,
          setClient, addItem, updateQty } = useCart();

  const [menu,           setMenu]           = useState(null);  // { sections }
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);
  const [clientName,     setClientName]     = useState('');

  // Refs for category section scroll-spy
  const sectionRefs = useRef({});
  const tabsRef     = useRef(null);

  // ---- Resolve clientName from router query or localStorage ----------------
  useEffect(() => {
    const name = router.query.name || '';
    setClientName(decodeURIComponent(name));
  }, [router.query.name]);

  // ---- Cart client switch --------------------------------------------------
  // Called once we know clientId. If a different store is in the cart,
  // ask the user before clearing.
  useEffect(() => {
    if (!clientId) return;
    if (cartClientId && cartClientId !== clientId && cartItems.length > 0) {
      const ok = window.confirm(
        'Your cart has items from another store.\nSwitch stores and clear your cart?'
      );
      if (!ok) { router.back(); return; }
    }
    setClient(clientId, clientName);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  // ---- Fetch menu ----------------------------------------------------------
  const fetchMenu = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`/menu/${clientId}`);
      setMenu(data);
      if (data.sections?.length > 0) {
        setActiveCategory(data.sections[0].category);
      }
    } catch (err) {
      setError(err.message || 'Failed to load menu');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { fetchMenu(); }, [fetchMenu]);

  // ---- Cart helpers --------------------------------------------------------
  function getQty(itemId) {
    return cartItems.find(i => i.id === itemId)?.quantity ?? 0;
  }

  function handleAdd(item) {
    addItem({
      id:       item.id,
      name:     item.name,
      price:    item.price,
      quantity: 1,
      variantId: null,
    });
  }

  function handleIncrease(item) {
    const qty = getQty(item.id);
    updateQty({ id: item.id, variantId: null, quantity: qty + 1 });
  }

  function handleDecrease(item) {
    const qty = getQty(item.id);
    updateQty({ id: item.id, variantId: null, quantity: qty - 1 });
  }

  // ---- Scroll to category --------------------------------------------------
  function scrollToCategory(cat) {
    setActiveCategory(cat);
    const el = sectionRefs.current[cat];
    if (el) {
      const offset = 56 + 44; // header + tab bar height
      const top = el.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  }

  const sections = menu?.sections || [];

  return (
    <>
      <Head>
        <title>{clientName ? `${clientName} - Menu` : 'Menu'} | Cafe QR Delivery</title>
      </Head>

      <div className="min-h-screen bg-stone-50 pb-32">

        {/* Header */}
        <div className="bg-white border-b border-stone-100 px-4 pt-12 pb-3 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-stone-100 text-stone-600"
            >
              <FiArrowLeft size={18} />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-stone-900 text-base truncate">
                {clientName || 'Menu'}
              </h1>
              {!loading && !error && (
                <p className="text-xs text-stone-400">
                  {sections.reduce((s, sec) => s + sec.items.length, 0)} items
                </p>
              )}
            </div>
          </div>

          {/* Category tab strip */}
          {!loading && !error && sections.length > 0 && (
            <div
              ref={tabsRef}
              className="flex gap-2 overflow-x-auto scrollbar-hide mt-3 -mx-4 px-4"
            >
              {sections.map(sec => (
                <button
                  key={sec.category}
                  onClick={() => scrollToCategory(sec.category)}
                  className={[
                    'flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors',
                    activeCategory === sec.category
                      ? 'bg-brand-orange text-white'
                      : 'bg-stone-100 text-stone-500',
                  ].join(' ')}
                >
                  {sec.category}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="px-4 pt-4 space-y-6">

          {/* Loading */}
          {loading && (
            <div className="space-y-3">
              {[1,2,3,4,5].map(n => <SkeletonItem key={n} />)}
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
              <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center">
                <FiWifi size={24} className="text-red-400" />
              </div>
              <div>
                <p className="font-semibold text-stone-700 text-sm">Could not load menu</p>
                <p className="text-stone-400 text-xs mt-1">{error}</p>
              </div>
              <button
                onClick={fetchMenu}
                className="bg-brand-orange text-white text-sm font-semibold px-5 py-2.5 rounded-xl"
              >
                Retry
              </button>
            </div>
          )}

          {/* Empty menu */}
          {!loading && !error && sections.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-2 text-center">
              <span className="text-4xl">&#x1F37D;&#xFE0F;</span>
              <p className="font-semibold text-stone-700 text-sm">No items available</p>
              <p className="text-stone-400 text-xs">This store has no active menu items yet</p>
            </div>
          )}

          {/* Menu sections */}
          {!loading && !error && sections.map(section => (
            <div
              key={section.category}
              ref={el => { sectionRefs.current[section.category] = el; }}
            >
              <h2 className="font-bold text-stone-800 text-sm mb-3 px-1">
                {section.category}
              </h2>
              <div className="space-y-3">
                {section.items.map(item => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    qtyInCart={getQty(item.id)}
                    onAdd={handleAdd}
                    onIncrease={handleIncrease}
                    onDecrease={handleDecrease}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Sticky bottom cart bar */}
        {totalItems > 0 && (
          <div className="fixed bottom-16 left-0 right-0 px-4 z-30">
            <button
              onClick={() => router.push(`/${clientId}/checkout`)}
              className="w-full bg-brand-orange text-white rounded-2xl p-4 flex items-center justify-between shadow-lg active:scale-[0.98] transition-transform"
            >
              <div className="flex items-center gap-2">
                <span className="bg-white bg-opacity-20 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
                  {totalItems}
                </span>
                <span className="font-semibold text-sm">View Cart</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm">{formatPrice(totalAmount)}</span>
                <FiShoppingCart size={16} />
              </div>
            </button>
          </div>
        )}
      </div>
    </>
  );
}
