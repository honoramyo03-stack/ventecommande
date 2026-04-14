import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { apiRequest, createRealtimeStream } from '../lib/api';

export interface CustomerSession {
  name: string;
  tableNumber: number;
  connectedAt: string;
}

export interface ConnectedCustomer {
  id?: string;
  name: string;
  tableNumber: number;
  connectedAt: Date;
  lastActive: Date;
}

interface CustomerContextType {
  customer: CustomerSession | null;
  connectedCustomers: ConnectedCustomer[];
  login: (name: string, tableNumber: number) => Promise<void>;
  logout: () => Promise<void>;
  isLoggedIn: boolean;
  isReady: boolean;
  sessionRestored: boolean;
  updateActivity: () => void;
}

const CUSTOMER_SESSION_KEY = 'customer_session';
const HEARTBEAT_INTERVAL = 30000;

const CustomerContext = createContext<CustomerContextType | undefined>(undefined);

export const useCustomer = () => {
  const context = useContext(CustomerContext);
  if (!context) {
    throw new Error('useCustomer must be used within a CustomerProvider');
  }
  return context;
};

export const CustomerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [customer, setCustomer] = useState<CustomerSession | null>(null);
  const [connectedCustomers, setConnectedCustomers] = useState<ConnectedCustomer[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [sessionRestored, setSessionRestored] = useState(false);
  const heartbeatRef = useRef<number | null>(null);

  const loadConnectedCustomers = useCallback(async () => {
    const rows = await apiRequest<any[]>('/api/connected-clients');
    setConnectedCustomers(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        tableNumber: r.table_number,
        connectedAt: new Date(r.connected_at),
        lastActive: new Date(r.last_seen),
      }))
    );
  }, []);

  const reserveTable = useCallback(async (name: string, tableNumber: number) => {
    try {
      await apiRequest('/api/connected-clients/reserve', {
        method: 'POST',
        body: { name, tableNumber },
      });
    } catch (error: any) {
      if (error?.message === 'TABLE_OCCUPIED') {
        throw new Error('TABLE_OCCUPIED');
      }
      throw new Error('DB_UNREACHABLE');
    }
  }, []);

  const updateActivity = useCallback(async () => {
    if (!customer) return;
    try {
      await apiRequest('/api/connected-clients/activity', {
        method: 'PATCH',
        body: { name: customer.name, tableNumber: customer.tableNumber },
      });
    } catch {
      // Silent heartbeat failure.
    }
  }, [customer]);

  useEffect(() => {
    let mounted = true;
    const bootstrap = async () => {
      try {
        const raw = localStorage.getItem(CUSTOMER_SESSION_KEY);
        if (raw) {
          const session = JSON.parse(raw) as CustomerSession;
          await reserveTable(session.name, session.tableNumber);
          if (mounted) {
            setCustomer(session);
            setSessionRestored(true);
          }
        }
      } catch {
        localStorage.removeItem(CUSTOMER_SESSION_KEY);
      }

      try {
        await loadConnectedCustomers();
      } catch {
        // Ignore bootstrap list errors.
      }

      if (mounted) setIsReady(true);
    };

    bootstrap();
    return () => {
      mounted = false;
    };
  }, [loadConnectedCustomers, reserveTable]);

  useEffect(() => {
    if (!customer) {
      if (heartbeatRef.current) {
        window.clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      return;
    }

    if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
    heartbeatRef.current = window.setInterval(() => {
      updateActivity();
    }, HEARTBEAT_INTERVAL);

    return () => {
      if (heartbeatRef.current) {
        window.clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [customer, updateActivity]);

  useEffect(() => {
    const stream = createRealtimeStream((evt) => {
      if (evt.type.includes('connected_clients')) {
        loadConnectedCustomers();
      }
    });

    const poll = window.setInterval(() => {
      loadConnectedCustomers();
    }, 4000);

    return () => {
      stream?.close();
      window.clearInterval(poll);
    };
  }, [loadConnectedCustomers]);

  const login = useCallback(async (name: string, tableNumber: number) => {
    await reserveTable(name, tableNumber);
    const session: CustomerSession = {
      name,
      tableNumber,
      connectedAt: new Date().toISOString(),
    };
    localStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify(session));
    setCustomer(session);
    await loadConnectedCustomers();
  }, [reserveTable, loadConnectedCustomers]);

  const logout = useCallback(async () => {
    if (customer) {
      try {
        await apiRequest(`/api/connected-clients/${customer.tableNumber}?name=${encodeURIComponent(customer.name)}`, {
          method: 'DELETE',
        });
      } catch {
        // Ignore logout network errors.
      }
    }
    localStorage.removeItem(CUSTOMER_SESSION_KEY);
    setCustomer(null);
    setSessionRestored(false);
    await loadConnectedCustomers();
  }, [customer, loadConnectedCustomers]);

  const value = useMemo(
    () => ({
      customer,
      connectedCustomers,
      login,
      logout,
      isLoggedIn: Boolean(customer),
      isReady,
      sessionRestored,
      updateActivity,
    }),
    [customer, connectedCustomers, login, logout, isReady, sessionRestored, updateActivity]
  );

  return <CustomerContext.Provider value={value}>{children}</CustomerContext.Provider>;
};
