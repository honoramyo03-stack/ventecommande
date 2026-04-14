import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiRequest, createRealtimeStream } from '../lib/api';

export interface ChatMessage {
  id: string;
  senderType: 'client' | 'seller';
  senderName?: string;
  tableNumber?: number;
  recipientType?: 'client' | 'seller';
  recipientTableNumber?: number;
  message: string;
  timestamp: Date;
  replyToId?: string;
  replyToMessage?: string;
  replyToSender?: string;
}

interface ChatContextType {
  messages: ChatMessage[];
  sendMessage: (
    content: string,
    sender: 'client' | 'seller',
    tableNumber?: number,
    senderName?: string,
    recipientType?: 'client' | 'seller',
    recipientTableNumber?: number,
    replyToId?: string,
    replyToMessage?: string,
    replyToSender?: string,
  ) => Promise<void>;
  getMessagesForTable: (tableNumber: number) => ChatMessage[];
  getMessagesForSeller: () => ChatMessage[];
  getUnreadCount: (role: 'client' | 'seller', tableNumber?: number, customerName?: string) => number;
  markAsRead: () => void;
  isOnline: boolean;
  isChatOpen: boolean;
  toggleChat: () => void;
  currentTableNumber: number | null;
  setCurrentTableNumber: (tableNumber: number | null) => void;
  currentCustomerName: string | null;
  setCurrentCustomerName: (name: string | null) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

const mapMessage = (row: any): ChatMessage => ({
  id: row.id,
  senderType: row.sender_type,
  senderName: row.sender_name || undefined,
  tableNumber: row.sender_table ?? undefined,
  recipientType: row.recipient_type || undefined,
  recipientTableNumber: row.recipient_table ?? undefined,
  message: row.content,
  timestamp: new Date(row.created_at),
  replyToId: row.reply_to_id || undefined,
  replyToMessage: row.reply_to_message || undefined,
  replyToSender: row.reply_to_sender || undefined,
});

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isOnline, setIsOnline] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [currentTableNumber, setCurrentTableNumber] = useState<number | null>(null);
  const [currentCustomerName, setCurrentCustomerName] = useState<string | null>(null);
  const [lastReadTimestamp, setLastReadTimestamp] = useState<number>(Date.now());

  const fetchMessages = useCallback(async () => {
    try {
      const rows = await apiRequest<any[]>('/api/messages');
      setMessages(rows.map(mapMessage));
      setIsOnline(true);
    } catch (error) {
      setIsOnline(false);
      console.error('Erreur chargement messages:', error);
    }
  }, []);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    const stream = createRealtimeStream((evt) => {
      if (evt.type.includes('messages')) {
        fetchMessages();
      }
    });

    const poll = window.setInterval(fetchMessages, 3000);
    return () => {
      stream?.close();
      window.clearInterval(poll);
    };
  }, [fetchMessages]);

  const sendMessage = async (
    content: string,
    sender: 'client' | 'seller',
    tableNumber?: number,
    senderName?: string,
    recipientType?: 'client' | 'seller',
    recipientTableNumber?: number,
    replyToId?: string,
    replyToMessage?: string,
    replyToSender?: string,
  ) => {
    if (!content.trim()) return;

    await apiRequest('/api/messages', {
      method: 'POST',
      body: {
        sender_type: sender,
        sender_name: senderName || (sender === 'seller' ? 'Vendeur' : 'Client'),
        sender_table: tableNumber || null,
        recipient_type: recipientType || 'seller',
        recipient_table: recipientTableNumber || null,
        content: content.trim(),
        reply_to_id: replyToId || null,
        reply_to_message: replyToMessage || null,
        reply_to_sender: replyToSender || null,
      },
    });

    await fetchMessages();
  };

  const getMessagesForTable = (tableNumber: number): ChatMessage[] => {
    return messages.filter((m) => {
      if (m.senderType === 'client' && m.tableNumber === tableNumber) return true;
      if (m.senderType === 'seller' && m.recipientTableNumber === tableNumber) return true;
      if (m.recipientType === 'client' && m.recipientTableNumber === tableNumber) return true;
      if (m.senderType === 'seller' && !m.recipientTableNumber) return true;
      return false;
    });
  };

  const getMessagesForSeller = () => messages;

  const markAsRead = useCallback(() => {
    setLastReadTimestamp(Date.now());
  }, []);

  const getUnreadCount = useCallback((role: 'client' | 'seller', tableNumber?: number, customerName?: string) => {
    return messages.filter((m) => {
      if (new Date(m.timestamp).getTime() <= lastReadTimestamp) return false;
      if (role === 'seller') return m.senderType !== 'seller';
      if (m.senderType === 'client' && m.tableNumber === tableNumber && m.senderName === customerName) return false;
      if (m.senderType === 'seller' && m.recipientTableNumber === tableNumber) return true;
      if (m.senderType === 'seller' && !m.recipientTableNumber) return true;
      if (m.senderType === 'client' && m.recipientType === 'client' && m.recipientTableNumber === tableNumber) return true;
      return false;
    }).length;
  }, [lastReadTimestamp, messages]);

  useEffect(() => {
    if (isChatOpen) markAsRead();
  }, [isChatOpen, markAsRead]);

  const value = useMemo(
    () => ({
      messages,
      sendMessage,
      getMessagesForTable,
      getMessagesForSeller,
      getUnreadCount,
      markAsRead,
      isOnline,
      isChatOpen,
      toggleChat: () => setIsChatOpen((prev) => !prev),
      currentTableNumber,
      setCurrentTableNumber,
      currentCustomerName,
      setCurrentCustomerName,
    }),
    [messages, getUnreadCount, isOnline, isChatOpen, currentTableNumber, currentCustomerName, markAsRead]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export default ChatProvider;
