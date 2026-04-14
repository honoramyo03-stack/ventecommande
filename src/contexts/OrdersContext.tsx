import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CartItem } from './CartContext';
import { apiRequest, createRealtimeStream } from '../lib/api';

export type OrderStatus = 'pending' | 'paid' | 'preparing' | 'ready' | 'completed' | 'cancelled';
export type PaymentMethod = 'orange_money' | 'mvola' | 'airtel_money';

export interface Order {
  id: string;
  tableNumber: number;
  items: CartItem[];
  total: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  createdAt: Date;
  paidAt?: Date;
  validatedAt?: Date;
  customerName?: string;
  notes?: string;
  estimatedMinutes?: number;
  paymentStatus?: 'pending' | 'paid' | 'failed';
  paymentReference?: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image: string;
  quantity?: number;
  estimatedMinutes?: number;
  isActive: boolean;
}

export interface PaymentInfo {
  number: string;
  merchantName: string;
}

export interface PaymentNumbers {
  orange_money: PaymentInfo;
  mvola: PaymentInfo;
  airtel_money: PaymentInfo;
}

export interface SellerAccount {
  id?: string;
  username: string;
  password?: string;
  role: 'admin' | 'seller';
}

export interface Category {
  id: string;
  name: string;
  icon?: string;
  order: number;
}

export interface RestaurantSettings {
  name: string;
  tableCount: number;
  logo: string;
  vatRate: number;
  defaultPrepTime: number;
  currency: string;
  phone: string;
  address: string;
}

interface OrdersContextType {
  orders: Order[];
  addOrder: (order: Omit<Order, 'id' | 'createdAt' | 'status'>) => Promise<Order>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => void;
  getOrdersByTable: (tableNumber: number) => Order[];
  getOrderById: (orderId: string) => Order | undefined;
  getOrdersByCustomer: (customerName: string) => Order[];
  products: Product[];
  addProduct: (product: Omit<Product, 'id' | 'isActive'>) => void;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  decreaseProductStock: (productId: string, quantity: number, productName?: string) => Promise<void>;
  paymentNumbers: PaymentNumbers;
  updatePaymentNumber: (method: keyof PaymentNumbers, info: PaymentInfo) => void;
  sellerAccounts: SellerAccount[];
  addSellerAccount: (account: SellerAccount) => void;
  updateSellerAccount: (username: string, updates: Partial<SellerAccount>) => void;
  deleteSellerAccount: (username: string) => void;
  categories: Category[];
  addCategory: (cat: Omit<Category, 'id'>) => void;
  updateCategory: (id: string, updates: Partial<Category>) => void;
  deleteCategory: (id: string) => void;
  restaurantSettings: RestaurantSettings;
  updateRestaurantSettings: (settings: Partial<RestaurantSettings>) => void;
  isOnline: boolean;
  loading: boolean;
}

const OrdersContext = createContext<OrdersContextType | undefined>(undefined);

const defaultPaymentNumbers: PaymentNumbers = {
  orange_money: { number: '0323943234', merchantName: 'Honora' },
  mvola: { number: '0345861363', merchantName: 'Honora' },
  airtel_money: { number: '0333943234', merchantName: 'Honora' },
};

const defaultSettings: RestaurantSettings = {
  name: 'QuickOrder',
  tableCount: 20,
  logo: '',
  vatRate: 20,
  defaultPrepTime: 20,
  currency: 'Ar',
  phone: '',
  address: '',
};

const mapOrder = (row: any): Order => ({
  id: row.id,
  tableNumber: row.table_number,
  items: row.items || [],
  total: Number(row.total || 0),
  status: row.status,
  paymentMethod: row.payment_method,
  createdAt: new Date(row.created_at),
  paidAt: row.paid_at ? new Date(row.paid_at) : undefined,
  validatedAt: row.validated_at ? new Date(row.validated_at) : undefined,
  customerName: row.client_name || undefined,
  notes: row.notes || undefined,
  estimatedMinutes: row.estimated_minutes ?? undefined,
  paymentStatus: row.payment_status || 'pending',
  paymentReference: row.payment_reference || undefined,
});

const mapProduct = (row: any): Product => ({
  id: row.id,
  name: row.name,
  description: row.description || '',
  price: Number(row.price || 0),
  category: row.category,
  image: row.image || '',
  quantity: row.quantity ?? undefined,
  estimatedMinutes: row.estimated_minutes ?? undefined,
  isActive: Boolean(row.is_active),
});

export const useOrders = () => {
  const context = useContext(OrdersContext);
  if (!context) {
    throw new Error('useOrders must be used within an OrdersProvider');
  }
  return context;
};

export const OrdersProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [paymentNumbers, setPaymentNumbers] = useState<PaymentNumbers>(defaultPaymentNumbers);
  const [sellerAccounts, setSellerAccounts] = useState<SellerAccount[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [restaurantSettings, setRestaurantSettings] = useState<RestaurantSettings>(defaultSettings);
  const [isOnline, setIsOnline] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadOrders = useCallback(async () => {
    const data = await apiRequest<any[]>('/api/orders');
    setOrders(data.map(mapOrder));
  }, []);

  const loadProducts = useCallback(async () => {
    const data = await apiRequest<any[]>('/api/products');
    setProducts(data.map(mapProduct));
  }, []);

  const loadPaymentNumbers = useCallback(async () => {
    const rows = await apiRequest<any[]>('/api/payment-numbers');
    const next: PaymentNumbers = { ...defaultPaymentNumbers };
    rows.forEach((p) => {
      if (p.provider in next) {
        next[p.provider as keyof PaymentNumbers] = {
          number: p.number,
          merchantName: p.merchant_name,
        };
      }
    });
    setPaymentNumbers(next);
  }, []);

  const loadSellerAccounts = useCallback(async () => {
    const rows = await apiRequest<any[]>('/api/seller-accounts');
    setSellerAccounts(
      rows.map((a) => ({ id: a.id, username: a.username, password: a.password, role: a.role || 'seller' }))
    );
  }, []);

  const loadCategories = useCallback(async () => {
    const rows = await apiRequest<any[]>('/api/categories');
    setCategories(rows.map((c) => ({ id: c.id, name: c.name, icon: c.icon || undefined, order: c.sort_order ?? 0 })));
  }, []);

  const loadSettings = useCallback(async () => {
    const row = await apiRequest<any>('/api/settings');
    setRestaurantSettings({
      name: row.name,
      tableCount: row.table_count,
      logo: row.logo || '',
      vatRate: row.vat_rate,
      defaultPrepTime: row.default_prep_time,
      currency: row.currency,
      phone: row.phone || '',
      address: row.address || '',
    });
  }, []);

  const syncAll = useCallback(async () => {
    try {
      await Promise.all([
        loadOrders(),
        loadProducts(),
        loadPaymentNumbers(),
        loadSellerAccounts(),
        loadCategories(),
        loadSettings(),
      ]);
      setIsOnline(true);
    } catch {
      setIsOnline(false);
    } finally {
      setLoading(false);
    }
  }, [loadOrders, loadProducts, loadPaymentNumbers, loadSellerAccounts, loadCategories, loadSettings]);

  useEffect(() => {
    syncAll();
  }, [syncAll]);

  useEffect(() => {
    const stream = createRealtimeStream((evt) => {
      if (evt.type.includes('orders')) loadOrders();
      if (evt.type.includes('products')) loadProducts();
      if (evt.type.includes('payment_numbers')) loadPaymentNumbers();
      if (evt.type.includes('seller_accounts')) loadSellerAccounts();
      if (evt.type.includes('categories')) loadCategories();
      if (evt.type.includes('settings')) loadSettings();
    });

    const polling = setInterval(() => {
      syncAll();
    }, 4000);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') syncAll();
    };

    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stream?.close();
      clearInterval(polling);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [loadCategories, loadOrders, loadPaymentNumbers, loadProducts, loadSellerAccounts, loadSettings, syncAll]);

  const addOrder = async (orderData: Omit<Order, 'id' | 'createdAt' | 'status'>): Promise<Order> => {
    const row = await apiRequest<any>('/api/orders', {
      method: 'POST',
      body: {
        tableNumber: orderData.tableNumber,
        clientName: orderData.customerName,
        items: orderData.items,
        total: orderData.total,
        paymentMethod: orderData.paymentMethod,
        notes: orderData.notes,
        estimatedMinutes: orderData.estimatedMinutes ?? restaurantSettings.defaultPrepTime,
      },
    });
    const created = mapOrder(row);
    setOrders((prev) => [created, ...prev]);
    await loadProducts();
    return created;
  };

  const updateOrderStatus = async (orderId: string, status: OrderStatus) => {
    await apiRequest(`/api/orders/${orderId}/status`, { method: 'PATCH', body: { status } });
    await loadOrders();
  };

  const addProduct = async (product: Omit<Product, 'id' | 'isActive'>) => {
    await apiRequest('/api/products', {
      method: 'POST',
      body: {
        ...product,
        estimated_minutes: product.estimatedMinutes ?? restaurantSettings.defaultPrepTime,
        is_active: true,
      },
    });
    await loadProducts();
  };

  const updateProduct = async (id: string, updates: Partial<Product>) => {
    await apiRequest(`/api/products/${id}`, {
      method: 'PATCH',
      body: {
        name: updates.name,
        description: updates.description,
        price: updates.price,
        category: updates.category,
        image: updates.image,
        quantity: updates.quantity,
        estimated_minutes: updates.estimatedMinutes,
        is_active: updates.isActive,
      },
    });
    await loadProducts();
  };

  const deleteProduct = async (id: string) => {
    await apiRequest(`/api/products/${id}`, { method: 'DELETE' });
    await loadProducts();
  };

  const decreaseProductStock = async (productId: string, quantity: number) => {
    const product = products.find((p) => p.id === productId);
    if (!product || product.quantity === undefined) return;
    await updateProduct(productId, { quantity: Math.max(0, product.quantity - quantity) });
  };

  const updatePaymentNumber = async (method: keyof PaymentNumbers, info: PaymentInfo) => {
    await apiRequest(`/api/payment-numbers/${method}`, {
      method: 'PUT',
      body: { number: info.number, merchantName: info.merchantName },
    });
    await loadPaymentNumbers();
  };

  const addSellerAccount = async (account: SellerAccount) => {
    await apiRequest('/api/seller-accounts', { method: 'POST', body: account });
    await loadSellerAccounts();
  };

  const updateSellerAccount = async (username: string, updates: Partial<SellerAccount>) => {
    await apiRequest(`/api/seller-accounts/${username}`, {
      method: 'PATCH',
      body: { nextUsername: updates.username, password: updates.password },
    });
    await loadSellerAccounts();
  };

  const deleteSellerAccount = async (username: string) => {
    await apiRequest(`/api/seller-accounts/${username}`, { method: 'DELETE' });
    await loadSellerAccounts();
  };

  const addCategory = async (cat: Omit<Category, 'id'>) => {
    await apiRequest('/api/categories', {
      method: 'POST',
      body: { name: cat.name, icon: cat.icon, sort_order: cat.order },
    });
    await loadCategories();
  };

  const updateCategory = async (id: string, updates: Partial<Category>) => {
    await apiRequest(`/api/categories/${id}`, {
      method: 'PATCH',
      body: { name: updates.name, icon: updates.icon, sort_order: updates.order },
    });
    await loadCategories();
  };

  const deleteCategory = async (id: string) => {
    await apiRequest(`/api/categories/${id}`, { method: 'DELETE' });
    await loadCategories();
  };

  const updateRestaurantSettings = async (settings: Partial<RestaurantSettings>) => {
    await apiRequest('/api/settings', {
      method: 'PATCH',
      body: {
        name: settings.name,
        table_count: settings.tableCount,
        logo: settings.logo,
        vat_rate: settings.vatRate,
        default_prep_time: settings.defaultPrepTime,
        currency: settings.currency,
        phone: settings.phone,
        address: settings.address,
      },
    });
    await loadSettings();
  };

  const value = useMemo<OrdersContextType>(
    () => ({
      orders,
      addOrder,
      updateOrderStatus,
      getOrdersByTable: (tableNumber) => orders.filter((o) => o.tableNumber === tableNumber),
      getOrderById: (orderId) => orders.find((o) => o.id === orderId),
      getOrdersByCustomer: (customerName) => orders.filter((o) => o.customerName === customerName),
      products,
      addProduct,
      updateProduct,
      deleteProduct,
      decreaseProductStock,
      paymentNumbers,
      updatePaymentNumber,
      sellerAccounts,
      addSellerAccount,
      updateSellerAccount,
      deleteSellerAccount,
      categories,
      addCategory,
      updateCategory,
      deleteCategory,
      restaurantSettings,
      updateRestaurantSettings,
      isOnline,
      loading,
    }),
    [orders, products, paymentNumbers, sellerAccounts, categories, restaurantSettings, isOnline, loading]
  );

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
};
