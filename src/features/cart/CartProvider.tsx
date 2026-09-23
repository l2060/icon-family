import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { App } from 'antd';
import { api } from '../../api';
import type { CartItem, CheckoutResult, Project, RemoteIcon } from '../../types';
import { IconfontDrawer } from '../icons/IconfontDrawer';
import { CartDrawer } from './CartDrawer';

interface CartContextValue {
  items: CartItem[];
  ids: Set<string>;
  pending: Set<string>;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  add: (item: RemoteIcon) => Promise<void>;
  remove: (ids: number[]) => Promise<void>;
  checkout: (ids: number[], projects: number[]) => Promise<CheckoutResult>;
  openShop: () => void;
  openCart: () => void;
}
const CartContext = createContext<CartContextValue>(null!);
export const useCart = () => useContext(CartContext);

export function CartProvider({
  projects,
  activeId,
  onImported,
  children,
}: {
  projects: Project[];
  activeId?: number;
  onImported: () => Promise<void>;
  children: ReactNode;
}) {
  const { message } = App.useApp();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(new Set<string>());
  const [shop, setShop] = useState(false);
  const [cart, setCart] = useState(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setItems((await api<{ items: CartItem[] }>('/cart')).items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const add = useCallback(
    (item: RemoteIcon) => {
      const id = String(item.remoteId);
      setPending((previous) => new Set(previous).add(id));
      const operation = queue.current.then(async () => {
        try {
          const result = await api<{ item: CartItem }>('/cart', 'POST', {
            item: { ...item, remoteId: id },
          });
          setItems((previous) => [
            result.item,
            ...previous.filter((row) => row.id !== result.item.id),
          ]);
        } catch (e) {
          message.error((e as Error).message);
        } finally {
          setPending((previous) => {
            const next = new Set(previous);
            next.delete(id);
            return next;
          });
        }
      });
      queue.current = operation;
      return operation;
    },
    [message],
  );
  const remove = useCallback(async (ids: number[]) => {
    await queue.current;
    setItems((await api<{ items: CartItem[] }>('/cart/remove', 'POST', { itemIds: ids })).items);
  }, []);
  const checkout = useCallback(
    async (ids: number[], projectIds: number[]) => {
      await queue.current;
      const result = await api<CheckoutResult>('/cart/checkout', 'POST', {
        itemIds: ids,
        projectIds,
      });
      setItems(result.items);
      void onImported().catch((e) => message.error(e.message));
      return result;
    },
    [onImported, message],
  );
  const value = useMemo(
    () => ({
      items,
      ids: new Set(items.map((item) => String(item.remoteId))),
      pending,
      loading,
      error,
      refresh,
      add,
      remove,
      checkout,
      openShop: () => setShop(true),
      openCart: () => setCart(true),
    }),
    [items, pending, loading, error, refresh, add, remove, checkout],
  );
  return (
    <CartContext.Provider value={value}>
      {children}
      {shop && <IconfontDrawer onClose={() => setShop(false)} />}
      {cart && (
        <CartDrawer projects={projects} activeId={activeId} onClose={() => setCart(false)} />
      )}
    </CartContext.Provider>
  );
}
