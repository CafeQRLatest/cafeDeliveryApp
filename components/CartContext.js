// components/CartContext.js
// Global cart state for the Cafe QR Delivery App.
//
// The cart is always scoped to ONE client (store) at a time.
// Switching to a different clientId should be confirmed by the caller
// before calling setClient() with the new id -- this file will clear
// the existing items automatically when the clientId changes.
//
// Persisted to localStorage under key 'cafeqr_cart'.
//
// Exports:
//   CartProvider  -- wrap _app.js with this
//   useCart()     -- hook, returns cart state + actions

import { createContext, useContext, useReducer, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'cafeqr_cart';

const initialState = {
  clientId:   null,   // UUID of the active store
  clientName: '',     // Display name of the active store
  items:      [],     // Array of CartItem
};

// CartItem shape:
// {
//   id:        string   (productId)
//   variantId: string | null
//   name:      string
//   price:     number   (unit price, INR)
//   quantity:  number   (>= 1)
// }

function cartReducer(state, action) {
  switch (action.type) {

    // Set (or switch) the active client.
    // Clears items if clientId changes.
    case 'SET_CLIENT': {
      const { clientId, clientName } = action.payload;
      if (state.clientId === clientId) {
        // Same store -- just update name in case it changed
        return { ...state, clientName: clientName || state.clientName };
      }
      return { clientId, clientName: clientName || '', items: [] };
    }

    // Add an item or increment its quantity if already in cart.
    case 'ADD_ITEM': {
      const incoming = action.payload; // CartItem
      const key = itemKey(incoming);
      const existing = state.items.find(i => itemKey(i) === key);
      if (existing) {
        return {
          ...state,
          items: state.items.map(i =>
            itemKey(i) === key
              ? { ...i, quantity: i.quantity + (incoming.quantity || 1) }
              : i
          ),
        };
      }
      return {
        ...state,
        items: [
          ...state.items,
          { ...incoming, quantity: incoming.quantity || 1 },
        ],
      };
    }

    // Remove an item completely.
    case 'REMOVE_ITEM': {
      const key = itemKey(action.payload);
      return { ...state, items: state.items.filter(i => itemKey(i) !== key) };
    }

    // Set a specific quantity. Removes the item if qty <= 0.
    case 'UPDATE_QTY': {
      const { id, variantId, quantity } = action.payload;
      const key = itemKey({ id, variantId });
      if (quantity <= 0) {
        return { ...state, items: state.items.filter(i => itemKey(i) !== key) };
      }
      return {
        ...state,
        items: state.items.map(i =>
          itemKey(i) === key ? { ...i, quantity } : i
        ),
      };
    }

    // Wipe the cart entirely (keep clientId).
    case 'CLEAR_CART':
      return { ...state, items: [] };

    // Rehydrate from localStorage on mount.
    case 'HYDRATE':
      return action.payload;

    default:
      return state;
  }
}

// Stable key for deduplication: productId + optional variantId
function itemKey({ id, variantId }) {
  return `${id}::${variantId ?? ''}`;
}

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [cart, dispatch] = useReducer(cartReducer, initialState);

  // Rehydrate from localStorage once on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && saved.clientId) {
          dispatch({ type: 'HYDRATE', payload: saved });
        }
      }
    } catch {}
  }, []);

  // Persist to localStorage on every cart change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch {}
  }, [cart]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const setClient = useCallback((clientId, clientName) => {
    dispatch({ type: 'SET_CLIENT', payload: { clientId, clientName } });
  }, []);

  const addItem = useCallback((item) => {
    dispatch({ type: 'ADD_ITEM', payload: item });
  }, []);

  const removeItem = useCallback(({ id, variantId = null }) => {
    dispatch({ type: 'REMOVE_ITEM', payload: { id, variantId } });
  }, []);

  const updateQty = useCallback(({ id, variantId = null, quantity }) => {
    dispatch({ type: 'UPDATE_QTY', payload: { id, variantId, quantity } });
  }, []);

  const clearCart = useCallback(() => {
    dispatch({ type: 'CLEAR_CART' });
  }, []);

  // ── Derived values ─────────────────────────────────────────────────────────

  const totalItems = cart.items.reduce((sum, i) => sum + i.quantity, 0);

  const totalAmount = cart.items.reduce(
    (sum, i) => sum + i.price * i.quantity,
    0
  );

  const value = {
    // State
    clientId:    cart.clientId,
    clientName:  cart.clientName,
    items:       cart.items,
    totalItems,
    totalAmount,
    // Actions
    setClient,
    addItem,
    removeItem,
    updateQty,
    clearCart,
  };

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}

// Convenience hook
export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
}
