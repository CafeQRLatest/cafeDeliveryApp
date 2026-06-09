// pages/_app.js
import '@/styles/globals.css';
import { CartProvider } from '@/components/CartContext';
import BottomNav       from '@/components/BottomNav';

export default function App({ Component, pageProps }) {
  return (
    <CartProvider>
      <Component {...pageProps} />
      <BottomNav />
    </CartProvider>
  );
}
