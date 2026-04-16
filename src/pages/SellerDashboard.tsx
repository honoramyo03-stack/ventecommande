import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, PlusCircle, CreditCard, UserPlus, Save, X, Edit2, Trash2, FileText, Download, Search, Wallet, User, Settings, BarChart3, Clock, TrendingUp, Award, Sun, Moon, Printer, Upload, Eye, Tag, ChevronRight, CheckCircle, AlertCircle, DollarSign, ShoppingBag, Users, Zap, CalendarDays, Bell } from 'lucide-react';
import { useOrders, OrderStatus, Order, AnnouncementReactionButton } from '../contexts/OrdersContext';
import { useCustomer } from '../contexts/CustomerContext';
import { confirmPaymentVendor, rejectPaymentVendor, listPayments } from '../lib/paymentApi';
import type { PaymentTransaction } from '../lib/paymentApi';
import SellerHeader from '../components/SellerHeader';
import { useNotification } from '../contexts/NotificationContext';

const CHART_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

const formatPrice = (price: number) => new Intl.NumberFormat('fr-MG', { style: 'currency', currency: 'MGA', minimumFractionDigits: 0 }).format(price);

const downloadBlob = (blob: Blob, filename: string) => {
  try {
    const url = URL.createObjectURL(blob);
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
      const w = window.open(url, '_blank');
      if (w) {
        w.document.write(`<html><head><title>${filename}</title></head><body style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;background:#f8fafc;"><div style="text-align:center;padding:2rem;background:white;border-radius:1rem;box-shadow:0 4px 6px rgba(0,0,0,0.1);"><div style="font-size:4rem;">📄</div><h2>Votre fichier est prêt</h2><a href="${url}" download="${filename}" style="display:inline-block;padding:12px 32px;background:#6366f1;color:white;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:1rem;">⬇️ Télécharger</a></div></body></html>`);
        w.document.close();
      } else {
        const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
      }
    } else {
      const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) { console.error(e); }
};

const statusLabel: Record<string, string> = {
  pending: 'En attente', paid: 'Payé', preparing: 'En préparation',
  ready: 'Prêt', completed: 'Terminé', cancelled: 'Annulé'
};
const statusColor: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800', paid: 'bg-blue-100 text-blue-800',
  preparing: 'bg-orange-100 text-orange-800', ready: 'bg-emerald-100 text-emerald-800',
  completed: 'bg-green-100 text-green-800', cancelled: 'bg-red-100 text-red-800'
};
const statusIcon: Record<string, React.ReactNode> = {
  pending: <Clock size={14} />, paid: <DollarSign size={14} />,
  preparing: <Zap size={14} />, ready: <CheckCircle size={14} />,
  completed: <CheckCircle size={14} />, cancelled: <AlertCircle size={14} />
};

const chunkBySize = <T,>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
};

type ReportHistoryItem = {
  id: string;
  period: string;
  format: 'pdf' | 'excel';
  generatedAt: string;
  fileName: string;
};

type AutoReportSchedule = {
  enabled: boolean;
  date?: string;
  time: string;
};

const reportPeriods = ['journalier', 'hebdomadaire', 'mensuel', 'trimestriel'] as const;

type SellerTab = 'orders' | 'products' | 'payments' | 'accounts' | 'reports' | 'stats' | 'categories' | 'publication' | 'settings';

const stripAnnouncementHtml = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .trim();

const hasAnnouncementTextContent = (html: string) => stripAnnouncementHtml(html).length > 0;

const hasAnnouncementContent = (text: string, image: string, buttons: AnnouncementReactionButton[] = []) =>
  hasAnnouncementTextContent(text) || image.trim().length > 0 || buttons.length > 0;

const formatAnnouncementDate = (value?: string) => {
  if (!value) return 'Pas encore publiee';

  try {
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
};

const SellerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const {
    orders, updateOrderStatus, products, addProduct, updateProduct, deleteProduct,
    paymentNumbers, updatePaymentNumber, sellerAccounts, addSellerAccount, updateSellerAccount, deleteSellerAccount,
    categories, addCategory, updateCategory, deleteCategory,
    restaurantSettings, updateRestaurantSettings, publishAnnouncement,
  } = useOrders();
  const { connectedCustomers } = useCustomer();
  const { notify } = useNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const productFileRef = useRef<HTMLInputElement>(null);
  const announcementImageFileRef = useRef<HTMLInputElement>(null);
  const announcementEditorRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState<SellerTab>('orders');
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [darkMode, setDarkMode] = useState(() => { try { return localStorage.getItem('seller_dark_mode') === 'true'; } catch { return false; } });

  // Modals
  const [showProductModal, setShowProductModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showMyAccountModal, setShowMyAccountModal] = useState(false);
  const [showClientHistory, setShowClientHistory] = useState(false);
  const [selectedClient, setSelectedClient] = useState<{ name: string; table: number } | null>(null);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [editingPayment, setEditingPayment] = useState<string | null>(null);
  // Local drafts pour les formulaires (évite les appels API à chaque frappe)
  const [paymentDraft, setPaymentDraft] = useState<Record<string, { number: string; merchantName: string }>>({});
  const [settingsDraft, setSettingsDraft] = useState<typeof restaurantSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingPayment, setSavingPayment] = useState<string | null>(null);
  // Paiements en attente de confirmation vendeur
  const [pendingPayments, setPendingPayments] = useState<PaymentTransaction[]>([]);
  const [confirmingPayment, setConfirmingPayment] = useState<string | null>(null);
  const [reportHistory, setReportHistory] = useState<ReportHistoryItem[]>(() => {
    try {
      const raw = localStorage.getItem('seller_report_history');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // Form - Product
  const [pName, setPName] = useState('');
  const [pDesc, setPDesc] = useState('');
  const [pPrice, setPPrice] = useState('');
  const [pCat, setPCat] = useState('');
  const [pImg, setPImg] = useState('');
  const [pQty, setPQty] = useState('');
  const [pEstTime, setPEstTime] = useState('');

  // Form - Account
  const [aUsername, setAUsername] = useState('');
  const [aPassword, setAPassword] = useState('');
  const [myUsername, setMyUsername] = useState('');
  const [myPassword, setMyPassword] = useState('');

  // Form - Category
  const [catName, setCatName] = useState('');
  const [catIcon, setCatIcon] = useState('');
  const sellerUsername = localStorage.getItem('sellerUsername') || '';
  const myAccount = sellerAccounts.find(a => a.username === sellerUsername);

  const [reportSchedules, setReportSchedules] = useState<Record<string, AutoReportSchedule>>(() => {
    try {
      const raw = localStorage.getItem('auto_report_schedules');
      if (raw) return JSON.parse(raw);
    } catch {}
    const today = new Date().toISOString().slice(0, 10);
    return {
      // Journalier: déclenchement quotidien à une heure donnée (sans date)
      journalier: { enabled: false, time: '22:00' },
      hebdomadaire: { enabled: false, date: today, time: '22:00' },
      mensuel: { enabled: false, date: today, time: '22:00' },
      trimestriel: { enabled: false, date: today, time: '22:00' },
    };
  });

  useEffect(() => {
    try { localStorage.setItem('seller_dark_mode', darkMode ? 'true' : 'false'); } catch {}
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  // Stats calculations
  const totalOrders = orders.length;
  const totalRevenue = orders.filter(o => ['paid', 'preparing', 'ready', 'completed'].includes(o.status)).reduce((s, o) => s + o.total, 0);
  const pendingOrders = orders.filter(o => o.status === 'pending' || o.status === 'paid').length;
  const completedOrders = orders.filter(o => o.status === 'completed').length;
  const vatAmount = totalRevenue * (restaurantSettings.vatRate / 100);
  const avgOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // Best sellers
  const bestSellers = products.map(p => {
    const sold = orders.filter(o => ['paid', 'preparing', 'ready', 'completed'].includes(o.status))
      .reduce((sum, o) => sum + (o.items?.filter(i => i.product?.id === p.id).reduce((s, i) => s + i.quantity, 0) || 0), 0);
    return { name: p.name, sold, revenue: sold * p.price };
  }).filter(p => p.sold > 0).sort((a, b) => b.sold - a.sold).slice(0, 8);

  // Peak hours
  const peakHours = Array.from({ length: 24 }, (_, h) => {
    const count = orders.filter(o => { const d = new Date(o.createdAt); return d.getHours() === h; }).length;
    return { hour: `${h}h`, commandes: count };
  }).filter(h => h.commandes > 0);

  // Daily sales (last 7 days)
  const dailySales = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const dateStr = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
    const dayOrders = orders.filter(o => { const od = new Date(o.createdAt); return od.toDateString() === d.toDateString(); });
    const revenue = dayOrders.filter(o => ['paid', 'preparing', 'ready', 'completed'].includes(o.status)).reduce((s, o) => s + o.total, 0);
    return { date: dateStr, ventes: revenue, commandes: dayOrders.length };
  });

  // Category distribution
  const categoryData = categories.map(c => ({
    name: c.name, value: orders.filter(o => ['paid', 'preparing', 'ready', 'completed'].includes(o.status))
      .reduce((sum, o) => sum + (o.items?.filter(i => i.product?.category === c.name).reduce((s, i) => s + i.quantity, 0) || 0), 0)
  })).filter(c => c.value > 0);

  // Filter orders - most recent first
  const filteredOrders = orders.filter(o => {
    if (selectedStatus !== 'all' && o.status !== selectedStatus) return false;
    if (searchQuery && !o.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) && !o.tableNumber.toString().includes(searchQuery)) return false;
    return true;
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Unique clients
  const uniqueClients = Array.from(new Set(orders.map(o => `${o.customerName}|${o.tableNumber}`))).map(s => {
    const [name, table] = s.split('|');
    const clientOrders = orders.filter(o => o.customerName === name && o.tableNumber === parseInt(table));
    return { name, table: parseInt(table), orderCount: clientOrders.length, totalSpent: clientOrders.filter(o => ['paid', 'preparing', 'ready', 'completed'].includes(o.status)).reduce((s, o) => s + o.total, 0) };
  });

  const accountColumns = chunkBySize([...sellerAccounts], 5);

  useEffect(() => {
    try {
      localStorage.setItem('auto_report_schedules', JSON.stringify(reportSchedules));
    } catch {}
  }, [reportSchedules]);

  useEffect(() => {
    try {
      localStorage.setItem('seller_report_history', JSON.stringify(reportHistory));
    } catch {}
  }, [reportHistory]);

  const addReportHistory = (period: string, format: 'pdf' | 'excel', fileName: string) => {
    const item: ReportHistoryItem = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      period,
      format,
      generatedAt: new Date().toISOString(),
      fileName,
    };
    setReportHistory(prev => [item, ...prev].slice(0, 40));
  };

  useEffect(() => {
    const timer = setInterval(async () => {
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);

      for (const period of reportPeriods) {
        const schedule = reportSchedules[period];
        if (!schedule?.enabled || !schedule.time) continue;

        const targetDate = period === 'journalier' ? todayStr : schedule.date;
        if (!targetDate) continue;

        const target = new Date(`${targetDate}T${schedule.time}:00`);
        if (Number.isNaN(target.getTime()) || now < target) continue;

        const runKey = `auto_report_run_${period}_${targetDate}_${schedule.time}`;
        if (localStorage.getItem(runKey) === 'done') continue;

        let pdfDone = false;
        let excelDone = false;
        try {
          await exportPDF(period, true);
          pdfDone = true;
        } catch (error) {
          console.error(`Auto PDF failed (${period})`, error);
        }
        try {
          await exportExcel(period, true);
          excelDone = true;
        } catch (error) {
          console.error(`Auto Excel failed (${period})`, error);
        }

        if (pdfDone || excelDone) {
          localStorage.setItem(runKey, 'done');
          notify(`Rapport auto ${period} ${pdfDone ? 'PDF' : ''}${pdfDone && excelDone ? ' + ' : ''}${excelDone ? 'Excel' : ''} généré`, 'success');
        } else {
          notify(`Échec du rapport automatique (${period})`, 'error');
        }
      }
    }, 30000);

    return () => clearInterval(timer);
  }, [reportSchedules, notify]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => { setPImg(reader.result as string); };
    reader.readAsDataURL(file);
  };

  const openProductModal = (product?: any) => {
    if (product) {
      setEditingProduct(product);
      setPName(product.name); setPDesc(product.description || ''); setPPrice(product.price.toString());
      setPCat(product.category); setPImg(product.image || ''); setPQty(product.quantity?.toString() || '');
      setPEstTime(product.estimatedMinutes?.toString() || '');
    } else {
      setEditingProduct(null);
      setPName(''); setPDesc(''); setPPrice(''); setPCat(categories[0]?.name || 'Pizza'); setPImg(''); setPQty(''); setPEstTime('');
    }
    setShowProductModal(true);
  };

  const saveProduct = () => {
    if (!pName || !pPrice) { notify('Nom et prix obligatoires', 'error'); return; }
    const data = { name: pName, description: pDesc, price: parseFloat(pPrice), category: pCat, image: pImg, quantity: pQty ? parseInt(pQty) : undefined, estimatedMinutes: pEstTime ? parseInt(pEstTime) : undefined };
    if (editingProduct) { updateProduct(editingProduct.id, data); notify('Produit mis à jour', 'info'); }
    else { addProduct(data as any); notify('Produit ajouté', 'success'); }
    setShowProductModal(false);
  };

  const saveCategory = () => {
    if (!catName) { notify('Nom obligatoire', 'error'); return; }
    if (editingCategory) { updateCategory(editingCategory.id, { name: catName, icon: catIcon }); notify('Catégorie modifiée', 'info'); }
    else { addCategory({ name: catName, icon: catIcon, order: categories.length + 1 }); notify('Catégorie ajoutée', 'success'); }
    setShowCategoryModal(false); setCatName(''); setCatIcon(''); setEditingCategory(null);
  };

  const saveAccount = () => {
    if (!aUsername || !aPassword) { notify('Champs obligatoires', 'error'); return; }
    addSellerAccount({ username: aUsername, password: aPassword, role: 'seller' });
    notify('Compte créé', 'success'); setShowAccountModal(false); setAUsername(''); setAPassword('');
  };

  // Validate order with next status
  const validateOrder = (order: Order) => {
    const nextStatus: Record<string, OrderStatus> = {
      pending: 'paid', paid: 'preparing', preparing: 'ready', ready: 'completed'
    };
    const next = nextStatus[order.status];
    if (next) {
      updateOrderStatus(order.id, next);
      notify(`Commande T${order.tableNumber} → ${statusLabel[next]}`, 'info');
    }
  };

  /* ─── Charger les transactions en attente ─────────────────── */
  const loadPendingPayments = useCallback(async () => {
    try {
      const all = await listPayments();
      setPendingPayments(all.filter((t) => t.status === 'pending'));
    } catch { /* silencieux si hors-ligne */ }
  }, []);

  useEffect(() => {
    loadPendingPayments();
  }, [loadPendingPayments, orders]); // se rafraîchit quand les orders changent (SSE)

  /* ─── Vendeur : confirmer un paiement ─────────────────────── */
  const handleConfirmPayment = async (txn: PaymentTransaction) => {
    setConfirmingPayment(txn.id);
    try {
      await confirmPaymentVendor(txn.id);
      notify(`✅ Paiement ${txn.external_reference} confirmé — Commande Table ${txn.table_number}`, 'success');
      await loadPendingPayments();
    } catch (e) {
      notify('Erreur lors de la confirmation', 'error');
    } finally {
      setConfirmingPayment(null);
    }
  };

  const handleRejectPayment = async (txn: PaymentTransaction) => {
    setConfirmingPayment(txn.id);
    try {
      await rejectPaymentVendor(txn.id);
      notify(`Paiement ${txn.external_reference} rejeté`, 'warning');
      await loadPendingPayments();
    } catch {
      notify('Erreur lors du rejet', 'error');
    } finally {
      setConfirmingPayment(null);
    }
  };

  /* ─── Settings : draft local + save ──────────────────────── */
  const openSettingsDraft = () => setSettingsDraft({ ...restaurantSettings });
  const handleSaveSettings = async () => {
    if (!settingsDraft) return;
    setSavingSettings(true);
    try {
      await updateRestaurantSettings(settingsDraft);
      setSettingsDraft(null);
      notify('✅ Paramètres enregistrés', 'success');
    } catch {
      notify('Erreur lors de la sauvegarde', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const setAnnouncementDraft = useCallback((patch: Partial<typeof restaurantSettings>) => {
    setSettingsDraft((prev) => ({ ...(prev ?? restaurantSettings), ...patch }));
  }, [restaurantSettings]);

  const focusAnnouncementEditor = () => {
    window.requestAnimationFrame(() => announcementEditorRef.current?.focus());
  };

  const handleClearAnnouncement = () => {
    setAnnouncementDraft({
      announcementEnabled: false,
      announcementText: '',
      announcementImage: '',
      announcementReactionButtons: [],
    });
    setAnnouncementReactionLabel('');
    setAnnouncementReactionEmoji('');

    const editor = announcementEditorRef.current;
    if (editor) {
      editor.innerHTML = '';
    }
  };

  const handleAddReactionButton = () => {
    const label = announcementReactionLabel.trim();
    const emoji = announcementReactionEmoji.trim();
    if (!label) {
      notify('Ajoutez un libelle pour le bouton de reaction', 'warning');
      return;
    }

    const currentButtons = (settingsDraft ?? restaurantSettings).announcementReactionButtons;
    if (currentButtons.length >= 6) {
      notify('Maximum 6 boutons de reaction par publication', 'warning');
      return;
    }

    setAnnouncementDraft({
      announcementReactionButtons: [
        ...currentButtons,
        {
          id: `reaction-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          label,
          emoji: emoji || undefined,
        },
      ],
    });
    setAnnouncementReactionLabel('');
    setAnnouncementReactionEmoji('');
  };

  const handleRemoveReactionButton = (buttonId: string) => {
    const currentButtons = (settingsDraft ?? restaurantSettings).announcementReactionButtons;
    setAnnouncementDraft({
      announcementReactionButtons: currentButtons.filter((button) => button.id !== buttonId),
    });
  };

  const handlePublishAnnouncement = async () => {
    const draft = settingsDraft ?? restaurantSettings;
    if (!hasAnnouncementContent(draft.announcementText, draft.announcementImage, draft.announcementReactionButtons)) {
      notify('Ajoutez un message, une image ou un bouton de reaction avant de publier', 'warning');
      return;
    }

    setSavingSettings(true);
    try {
      await publishAnnouncement(draft);
      setSettingsDraft(null);
      notify('✅ Publication mise en ligne', 'success');
    } catch {
      notify('Erreur lors de la publication', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const [announcementColor, setAnnouncementColor] = useState('#0f172a');
  const [announcementBgColor, setAnnouncementBgColor] = useState('#ffffff');
  const [announcementSize, setAnnouncementSize] = useState('20');
  const [announcementFont, setAnnouncementFont] = useState('serif');
  const [announcementReactionLabel, setAnnouncementReactionLabel] = useState('');
  const [announcementReactionEmoji, setAnnouncementReactionEmoji] = useState('');

  // Initialiser le contenu de l'éditeur une seule fois au chargement
  useEffect(() => {
    const editor = announcementEditorRef.current;
    if (!editor || editor.innerHTML.trim()) return;
    const initialContent = settingsDraft?.announcementText || restaurantSettings.announcementText || '';
    if (initialContent) {
      editor.innerHTML = initialContent;
    }
  }, []);

  // Réinitialiser quand on change de draft
  useEffect(() => {
    const editor = announcementEditorRef.current;
    if (!editor) return;
    const newContent = settingsDraft?.announcementText || restaurantSettings.announcementText || '';
    if (editor.innerHTML !== newContent && !editor.contains(document.activeElement)) {
      editor.innerHTML = newContent;
    }
  }, [settingsDraft?.announcementText, restaurantSettings.announcementText]);

  const updateAnnouncementHtml = () => {
    const editor = announcementEditorRef.current;
    if (!editor) return;
    const html = editor.innerHTML;
    setAnnouncementDraft({ announcementText: hasAnnouncementTextContent(html) ? html : '' });
  };

  const applyAnnouncementFormat = (command: string, value?: string) => {
    const editor = announcementEditorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand(command, false, value || undefined);
    // Relancer la mise à jour après un petit délai pour laisser le DOM se stabiliser
    setTimeout(() => updateAnnouncementHtml(), 10);
  };

  const wrapSelectionWithSpan = (style: string) => {
    const editor = announcementEditorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (range.collapsed) {
      const span = document.createElement('span');
      span.setAttribute('style', style);
      span.textContent = 'Texte';
      range.insertNode(span);
    } else {
      const span = document.createElement('span');
      span.setAttribute('style', style);
      span.textContent = range.toString();
      range.deleteContents();
      range.insertNode(span);
      selection.removeAllRanges();
      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      selection.addRange(newRange);
    }
    // Relancer la mise à jour après un petit délai
    setTimeout(() => updateAnnouncementHtml(), 10);
  };

  /* ─── Payment numbers : draft local + save ──────────────── */
  const openPaymentDraft = (key: string, info: { number: string; merchantName: string }) => {
    setPaymentDraft((d) => ({ ...d, [key]: { ...info } }));
    setEditingPayment(key);
  };
  const handleSavePayment = async (key: string) => {
    const draft = paymentDraft[key];
    if (!draft) return;
    setSavingPayment(key);
    try {
      await updatePaymentNumber(key as any, draft);
      setEditingPayment(null);
      notify(`✅ ${key === 'orange_money' ? 'Orange Money' : key === 'mvola' ? 'Mvola' : 'Airtel Money'} mis à jour`, 'success');
    } catch {
      notify('Erreur lors de la sauvegarde', 'error');
    } finally {
      setSavingPayment(null);
    }
  };

  // Get estimated time remaining
  const getEstimatedTimeRemaining = (order: Order) => {
    if (!order.estimatedMinutes) return null;
    const orderTime = new Date(order.createdAt).getTime();
    const elapsed = Math.floor((Date.now() - orderTime) / 60000);
    const remaining = order.estimatedMinutes - elapsed;
    return { remaining, elapsed, total: order.estimatedMinutes };
  };

  // Print receipt
  const printReceipt = (order: Order) => {
    const w = window.open('', '_blank', 'width=400,height=600');
    if (!w) return;
    const est = getEstimatedTimeRemaining(order);
    w.document.write(`<html><head><title>Reçu</title><style>body{font-family:Arial,sans-serif;max-width:320px;margin:0 auto;padding:20px;font-size:14px;}h2{text-align:center;border-bottom:2px dashed #000;padding-bottom:10px;font-size:18px;}table{width:100%;border-collapse:collapse;}td,th{text-align:left;padding:4px 0;font-size:13px;}.right{text-align:right;}.total{border-top:2px dashed #000;font-weight:bold;font-size:16px;padding-top:10px;}.info{color:#666;font-size:11px;}</style></head><body>
    <h2>🧾 ${restaurantSettings.name}</h2>
    <p><strong>Date:</strong> ${new Date(order.createdAt).toLocaleString('fr-FR')}</p>
    <p><strong>Table:</strong> ${order.tableNumber} | <strong>Client:</strong> ${order.customerName || '-'}</p>
    <p class="info">Commande: ${order.id.slice(0, 8)}</p>
    ${est ? `<p><strong>⏱ Temps estimé:</strong> ${est.total} min</p>` : ''}
    <hr style="border:1px dashed #000;">
    <table><tr><th>Article</th><th class="right">Qté</th><th class="right">Prix</th></tr>
    ${order.items.map((i: any) => `<tr><td>${i.product?.name || ''}</td><td class="right">${i.quantity}</td><td class="right">${formatPrice((i.product?.price || 0) * i.quantity)}</td></tr>`).join('')}
    </table>
    <div class="total"><span>Total: ${formatPrice(order.total)}</span></div>
    ${restaurantSettings.vatRate > 0 ? `<p style="font-size:11px;color:#666;">TVA ${restaurantSettings.vatRate}%: ${formatPrice(order.total * restaurantSettings.vatRate / (100 + restaurantSettings.vatRate))}</p>` : ''}
    <p style="text-align:center;margin-top:20px;font-size:12px;">Merci de votre visite ! 😊</p>
    <script>window.print();</script></body></html>`);
    w.document.close();
  };

  const getPeriodOrders = (period: string) => {
    const now = new Date();
    const paidOrders = orders.filter(o => ['paid', 'preparing', 'ready', 'completed'].includes(o.status));
    return paidOrders.filter(o => {
      const d = new Date(o.createdAt);
      if (period === 'journalier') return d.toDateString() === now.toDateString();
      if (period === 'hebdomadaire') {
        const start = new Date(now);
        start.setDate(now.getDate() - 7);
        return d >= start;
      }
      if (period === 'mensuel') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (period === 'trimestriel') {
        const quarter = Math.floor(now.getMonth() / 3);
        return Math.floor(d.getMonth() / 3) === quarter && d.getFullYear() === now.getFullYear();
      }
      return true;
    });
  };

  const buildReportFileName = (period: string, format: 'pdf' | 'excel') => {
    const ext = format === 'pdf' ? 'pdf' : 'xlsx';
    return `rapport_${period}_${new Date().toISOString().slice(0, 10)}.${ext}`;
  };

  const generatePDFBlob = async (period: string) => {
    const { default: jsPDF } = await import('jspdf');
    const periodOrders = getPeriodOrders(period);
    const periodRevenue = periodOrders.reduce((sum, o) => sum + o.total, 0);
    const periodVat = periodRevenue * (restaurantSettings.vatRate / 100);

    const pdf = new jsPDF();
    pdf.setFontSize(20); pdf.text(`${restaurantSettings.name}`, 14, 22);
    pdf.setFontSize(14); pdf.text(`Rapport ${period}`, 14, 32);
    pdf.setFontSize(10); pdf.text(`Généré le ${new Date().toLocaleString('fr-FR')}`, 14, 40);
    pdf.setFontSize(11);
    pdf.text(`Commandes: ${periodOrders.length} | CA: ${formatPrice(periodRevenue)} | TVA: ${formatPrice(periodVat)}`, 14, 50);
    let y = 62;
    pdf.setFontSize(9);
    periodOrders.slice(0, 120).forEach(o => {
      if (y > 280) { pdf.addPage(); y = 20; }
      pdf.text(`${new Date(o.createdAt).toLocaleString('fr-FR')} | T${o.tableNumber} | ${o.customerName} | ${formatPrice(o.total)} | ${statusLabel[o.status] || o.status}`, 14, y);
      y += 7;
    });
    return pdf.output('blob');
  };

  const generateExcelBlob = async (period: string) => {
    const XLSX = await import('xlsx');
    const periodOrders = getPeriodOrders(period);
    const periodRevenue = periodOrders.reduce((sum, o) => sum + o.total, 0);
    const periodVat = periodRevenue * (restaurantSettings.vatRate / 100);

    const data = periodOrders.map(o => ({
      Date: new Date(o.createdAt).toLocaleString('fr-FR'), Table: o.tableNumber, Client: o.customerName,
      Articles: o.items?.map((i: any) => `${i.product?.name || i.name} x${i.quantity}`).join(', '),
      Total: o.total, Statut: statusLabel[o.status] || o.status, Paiement: o.paymentMethod,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 20 }, { wch: 8 }, { wch: 15 }, { wch: 40 }, { wch: 12 }, { wch: 15 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Commandes');
    const summaryWs = XLSX.utils.json_to_sheet([{
      Periode: period,
      Total_Commandes: periodOrders.length,
      Chiffre_Affaires: periodRevenue,
      TVA: periodVat,
    }]);
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Résumé');
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([wbout], { type: 'application/octet-stream' });
  };

  const exportPDF = async (period: string, silent = false) => {
    try {
      const blob = await generatePDFBlob(period);
      const fileName = buildReportFileName(period, 'pdf');
      downloadBlob(blob, fileName);
      addReportHistory(period, 'pdf', fileName);
      if (!silent) notify('PDF généré', 'success');
    } catch (e) {
      if (!silent) notify('Erreur PDF', 'error');
      console.error(e);
      throw e;
    }
  };

  const exportExcel = async (period: string, silent = false) => {
    try {
      const blob = await generateExcelBlob(period);
      const fileName = buildReportFileName(period, 'excel');
      downloadBlob(blob, fileName);
      addReportHistory(period, 'excel', fileName);
      if (!silent) notify('Excel généré', 'success');
    } catch (e) {
      if (!silent) notify('Erreur Excel', 'error');
      console.error(e);
      throw e;
    }
  };

  const openReportHistoryItem = async (item: ReportHistoryItem) => {
    if (item.format === 'pdf') {
      const blob = await generatePDFBlob(item.period);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return;
    }
    const blob = await generateExcelBlob(item.period);
    downloadBlob(blob, item.fileName);
  };

  const printReportHistoryItem = async (item: ReportHistoryItem) => {
    if (item.format !== 'pdf') {
      notify('Impression directe disponible uniquement pour PDF', 'warning');
      return;
    }
    const blob = await generatePDFBlob(item.period);
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (w) {
      w.onload = () => {
        w.print();
      };
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const bg = darkMode ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900';
  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textSec = darkMode ? 'text-gray-400' : 'text-gray-500';
  const inputCls = `w-full text-base px-4 py-3 rounded-xl border ${cardBg} focus:ring-2 focus:ring-indigo-500 outline-none`;
  const primaryBtnCls = 'flex items-center gap-2 px-4 h-11 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-sm hover:bg-indigo-700 transition-colors';
  const successBtnCls = 'flex items-center gap-2 px-4 h-11 bg-green-600 text-white rounded-xl text-sm font-bold shadow-sm hover:bg-green-700 transition-colors';
  const cardShellCls = `${cardBg} border rounded-2xl shadow-sm h-full`;

  const tabs = [
    { id: 'orders' as const, label: 'Commandes', icon: Package, badge: pendingOrders },
    { id: 'products' as const, label: 'Produits', icon: Package },
    { id: 'categories' as const, label: 'Catégories', icon: Tag },
    { id: 'publication' as const, label: 'Publication', icon: Bell },
    { id: 'stats' as const, label: 'Statistiques', icon: BarChart3 },
    { id: 'payments' as const, label: 'Paiements', icon: CreditCard },
    { id: 'accounts' as const, label: 'Comptes', icon: User },
    { id: 'reports' as const, label: 'Rapports', icon: FileText },
    { id: 'settings' as const, label: 'Paramètres', icon: Settings },
  ];

  return (
    <div className={`min-h-screen ${bg} transition-colors`}>
      <SellerHeader />

      <div className={`sticky top-[88px] z-40 ${darkMode ? 'bg-gray-900/95' : 'bg-gray-50/95'} backdrop-blur border-b ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
        {/* Top bar: theme + connected clients */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-indigo-500" />
            <span className={`text-sm sm:text-base font-semibold ${textSec}`}>{connectedCustomers.length} client(s) connecté(s)</span>
          </div>
          <button onClick={() => setDarkMode(!darkMode)}
            className={`flex items-center gap-2 px-3 h-10 rounded-xl text-sm font-semibold transition-all ${darkMode ? 'bg-yellow-400 text-gray-900' : 'bg-gray-800 text-yellow-400'}`}>
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            {darkMode ? 'Clair' : 'Sombre'}
          </button>
        </div>

        {/* Global quick stats above tabs */}
        <div className="px-4 pb-2">
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
            <div className={`relative overflow-hidden p-4 min-w-[210px] flex-1 ${cardShellCls} h-[140px]`}>
            <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/10 rounded-full -translate-y-6 translate-x-6" />
            <div className="bg-blue-500 text-white p-2.5 rounded-xl w-fit mb-2"><ShoppingBag size={20} /></div>
            <p className={`text-sm ${textSec} font-medium`}>Commandes</p>
            <p className="text-xl font-bold mt-1">{totalOrders}</p>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">{completedOrders} terminées</span>
            </div>
            <div className={`relative overflow-hidden p-4 min-w-[210px] flex-1 ${cardShellCls} h-[140px]`}>
            <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/10 rounded-full -translate-y-6 translate-x-6" />
            <div className="bg-emerald-500 text-white p-2.5 rounded-xl w-fit mb-2"><Wallet size={20} /></div>
            <p className={`text-sm ${textSec} font-medium`}>Chiffre d'affaires</p>
            <p className="text-lg font-bold mt-1">{formatPrice(totalRevenue)}</p>
            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Panier moy: {formatPrice(avgOrder)}</span>
            </div>
            <div className={`relative overflow-hidden p-4 min-w-[210px] flex-1 ${cardShellCls} h-[140px]`}>
            <div className="absolute top-0 right-0 w-20 h-20 bg-orange-500/10 rounded-full -translate-y-6 translate-x-6" />
            <div className="bg-orange-500 text-white p-2.5 rounded-xl w-fit mb-2"><Clock size={20} /></div>
            <p className={`text-sm ${textSec} font-medium`}>En attente</p>
            <p className="text-xl font-bold mt-1">{pendingOrders}</p>
            {pendingOrders > 0 && (
              <span className="animate-pulse text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 w-fit">
                <Zap size={10} /> Action requise
              </span>
            )}
            </div>
            <div className={`relative overflow-hidden p-4 min-w-[210px] flex-1 ${cardShellCls} h-[140px]`}>
            <div className="absolute top-0 right-0 w-20 h-20 bg-purple-500/10 rounded-full -translate-y-6 translate-x-6" />
            <div className="bg-purple-500 text-white p-2.5 rounded-xl w-fit mb-2"><TrendingUp size={20} /></div>
            <p className={`text-sm ${textSec} font-medium`}>TVA ({restaurantSettings.vatRate}%)</p>
            <p className="text-lg font-bold mt-1">{formatPrice(vatAmount)}</p>
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">{restaurantSettings.currency}</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 pb-3 flex gap-2 overflow-x-auto no-scrollbar">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`h-9 flex items-center gap-2 px-4 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${activeTab === t.id ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 ring-2 ring-indigo-200/70' : darkMode ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'}`}>
              <t.icon size={15} />{t.label}
              {t.badge ? <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">{t.badge}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4">
        {/* ========== ORDERS TAB ========== */}
        {activeTab === 'orders' && (
          <div>
            <div className="flex flex-wrap gap-3 mb-4">
              <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value as any)}
                className={`text-sm px-4 py-3 rounded-xl border ${cardBg} font-medium`}>
                {['all', 'pending', 'paid', 'preparing', 'ready', 'completed', 'cancelled'].map(s => (
                  <option key={s} value={s}>{s === 'all' ? 'Tous les statuts' : statusLabel[s]}</option>
                ))}
              </select>
              <div className="relative flex-1 min-w-[180px]">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" placeholder="Rechercher client ou table..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  className={`w-full text-sm pl-11 pr-4 py-3 rounded-xl border ${cardBg}`} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredOrders.map(order => {
                const nextStatusMap: Record<string, string> = { pending: 'Payé', paid: 'Préparer', preparing: 'Prêt', ready: 'Terminer' };
                const nextStatusLabel: Record<string, string> = { pending: 'Confirmer commande', paid: 'Lancer préparation', preparing: 'Marquer prêt', ready: 'Terminer commande' };
                const nextStatusIcon: Record<string, string> = { pending: '✅', paid: '🍳', preparing: '🔔', ready: '🏁' };
                const nextStatusColor: Record<string, string> = {
                  pending:   'bg-blue-600   hover:bg-blue-700   text-white',
                  paid:      'bg-orange-500 hover:bg-orange-600 text-white',
                  preparing: 'bg-emerald-500 hover:bg-emerald-600 text-white',
                  ready:     'bg-green-600  hover:bg-green-700  text-white',
                };
                const canValidate = !!nextStatusMap[order.status];
                const isLocked = order.status === 'completed' || order.status === 'cancelled';
                // Trouver une transaction mobile money en attente liée à cette commande
                const pendingTxn = pendingPayments.find(t => t.order_id === order.id);
                const compactItems = order.items?.slice(0, 2) || [];
                const hiddenCount = (order.items?.length || 0) - compactItems.length;
                const payMethod = order.paymentMethod;
                const providerLabel = payMethod === 'orange_money' ? 'Orange' : payMethod === 'mvola' ? 'Mvola' : payMethod === 'airtel_money' ? 'Airtel' : null;

                return (
                  <div key={order.id} className={`${cardBg} border-2 rounded-2xl p-4 shadow-sm transition-all ${
                    pendingTxn ? 'border-yellow-400' : isLocked ? 'border-transparent opacity-85' : 'border-transparent'
                  }`}>
                    {/* Badge paiement en attente */}
                    {pendingTxn && (
                      <div className="flex items-center gap-2 mb-3 bg-yellow-50 border border-yellow-300 rounded-xl px-3 py-2">
                        <Bell size={14} className="text-yellow-600 animate-pulse shrink-0" />
                        <span className="text-xs font-bold text-yellow-800 flex-1">
                          Paiement {providerLabel} en attente de confirmation
                          {pendingTxn.customer_phone && <span className="font-normal"> — {pendingTxn.customer_phone}</span>}
                        </span>
                      </div>
                    )}

                    {/* Header */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="text-sm font-bold bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-xl whitespace-nowrap">T{order.tableNumber}</span>
                        <div className="min-w-0">
                          <p className="text-base font-semibold truncate">{order.customerName || 'Client'}</p>
                          <p className={`text-xs ${textSec}`}>{new Date(order.createdAt).toLocaleString('fr-FR')}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => printReceipt(order)} className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors" title="Imprimer">
                          <Printer size={16} />
                        </button>
                        <button onClick={() => navigate(`/seller/orders/${order.id}`)} className="p-2 rounded-xl bg-indigo-100 hover:bg-indigo-200 text-indigo-700 transition-colors">
                          <Eye size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Articles */}
                    <div className={`text-sm ${textSec} mb-3 space-y-1`}>
                      {compactItems.map((i: any, idx: number) => {
                        const itemName = i.product?.name || i.name;
                        const itemPrep = i.product?.estimatedMinutes || products.find(p => p.id === i.product?.id || p.name === itemName)?.estimatedMinutes;
                        return (
                          <p key={idx} className="truncate">
                            {itemName} ×{i.quantity}
                            {itemPrep ? <span className="ml-2 text-indigo-600 font-medium">⏱ {itemPrep} min</span> : null}
                          </p>
                        );
                      })}
                      {hiddenCount > 0 && <p className="text-xs font-semibold text-indigo-600">+{hiddenCount} article(s)</p>}
                    </div>

                    {/* Statut + Prix */}
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 ${statusColor[order.status] || 'bg-gray-100 text-gray-700'}`}>
                          {statusIcon[order.status]}
                          {statusLabel[order.status] || order.status}
                        </span>
                        {providerLabel && (
                          <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
                            order.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' :
                            order.paymentStatus === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-gray-100 text-gray-500'
                          }`}>
                            📱 {providerLabel} {order.paymentStatus === 'paid' ? '✓' : order.paymentStatus === 'pending' ? '⏳' : ''}
                          </span>
                        )}
                      </div>
                      <span className="text-lg font-bold">{formatPrice(order.total)}</span>
                    </div>

                    {/* Boutons d'action */}
                    <div className="space-y-2">
                      {/* Confirmation paiement mobile money (priorité) */}
                      {pendingTxn && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleConfirmPayment(pendingTxn)}
                            disabled={confirmingPayment === pendingTxn.id}
                            className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60 transition-colors shadow-sm"
                          >
                            {confirmingPayment === pendingTxn.id
                              ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                              : <CheckCircle size={16} />}
                            Confirmer paiement reçu
                          </button>
                          <button
                            onClick={() => handleRejectPayment(pendingTxn)}
                            disabled={confirmingPayment === pendingTxn.id}
                            className="px-4 py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 disabled:opacity-60 transition-colors"
                          >
                            <X size={15} /> Rejeter
                          </button>
                        </div>
                      )}

                      {/* Bouton avancement statut commande */}
                      {canValidate && !isLocked && (
                        <button
                          onClick={() => validateOrder(order)}
                          className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-sm ${nextStatusColor[order.status]}`}
                        >
                          <span>{nextStatusIcon[order.status]}</span>
                          {nextStatusLabel[order.status]}
                          <ChevronRight size={16} />
                        </button>
                      )}

                      {isLocked && (
                        <div className="py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-500 text-xs font-semibold text-center">
                          {order.status === 'completed' ? '✅ Commande terminée' : '🚫 Commande annulée'}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {filteredOrders.length === 0 && <p className="text-center py-12 text-gray-400 text-lg">Aucune commande</p>}
            </div>
          </div>
        )}

        {/* ========== PRODUCTS TAB ========== */}
        {activeTab === 'products' && (
          <div>
            <div className="flex flex-wrap gap-3 mb-4 items-center">
              <button onClick={() => openProductModal()} className={primaryBtnCls}>
                <PlusCircle size={18} /> Ajouter un produit
              </button>
              <div className="relative flex-1 min-w-[160px]">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" placeholder="Filtrer les produits..." value={productFilter} onChange={e => setProductFilter(e.target.value)}
                  className={`w-full text-sm pl-11 pr-4 py-3 rounded-xl border ${cardBg}`} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
              {products.filter(p => !productFilter || p.name.toLowerCase().includes(productFilter.toLowerCase())).map(p => (
                <div key={p.id} className={`${cardBg} border rounded-2xl p-4 shadow-sm`}>
                  <div className="flex items-center gap-4">
                    {p.image ? <img src={p.image} alt={p.name} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" /> :
                      <div className="w-14 h-14 rounded-xl bg-gray-200 flex items-center justify-center flex-shrink-0"><Package size={20} className="text-gray-400" /></div>}
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-bold truncate">{p.name}</p>
                      <p className={`text-sm ${textSec}`}>{p.category} • {formatPrice(p.price)}</p>
                      <p className={`text-sm ${textSec}`}>
                        Stock: <span className={p.quantity !== undefined && p.quantity !== null && p.quantity <= 5 ? 'text-red-500 font-bold' : 'font-semibold'}>
                          {p.quantity !== undefined && p.quantity !== null ? p.quantity : 'Illimité'}
                        </span>
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 items-end">
                      {p.quantity === undefined || p.quantity === null ? (
                        <button onClick={() => updateProduct(p.id, { isActive: !p.isActive })}
                          className={`text-sm px-4 py-2 rounded-xl font-bold transition-all ${p.isActive ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}>
                          {p.isActive ? '✅ Actif' : '❌ Inactif'}
                        </button>
                      ) : p.quantity <= 0 ? (
                        <span className="text-sm px-4 py-2 rounded-xl bg-red-100 text-red-700 font-bold">Rupture</span>
                      ) : (
                        <span className="text-sm px-4 py-2 rounded-xl bg-blue-100 text-blue-700 font-bold">Auto</span>
                      )}
                      <div className="flex gap-2">
                        <button onClick={() => openProductModal(p)} className="p-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors"><Edit2 size={16} /></button>
                        <button onClick={() => { deleteProduct(p.id); notify('Produit supprimé', 'warning'); }} className="p-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 transition-colors"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========== CATEGORIES TAB ========== */}
        {activeTab === 'categories' && (
          <div>
            <button onClick={() => { setEditingCategory(null); setCatName(''); setCatIcon(''); setShowCategoryModal(true); }}
              className={`${primaryBtnCls} mb-4`}>
              <PlusCircle size={18} /> Nouvelle Catégorie
            </button>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {[...categories].sort((a, b) => a.order - b.order).map(c => (
                <div key={c.id} className={`${cardBg} border rounded-2xl p-4 flex items-center justify-between shadow-sm`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-2xl">{c.icon || '📦'}</span>
                    <div className="min-w-0">
                      <p className="text-base font-semibold truncate">{c.name}</p>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                        {products.filter(p => p.category === c.name).length} produits
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingCategory(c); setCatName(c.name); setCatIcon(c.icon || ''); setShowCategoryModal(true); }}
                      className="p-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors"><Edit2 size={16} /></button>
                    <button onClick={() => { deleteCategory(c.id); notify('Catégorie supprimée', 'warning'); }}
                      className="p-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 transition-colors"><Trash2 size={16} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========== STATS TAB ========== */}
        {activeTab === 'stats' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Best Sellers */}
            <div className={`${cardBg} border rounded-2xl p-5 shadow-sm`}>
              <h3 className="text-lg font-bold flex items-center gap-2 mb-4"><Award size={20} className="text-yellow-500" /> 🏆 Best-Sellers</h3>
              {bestSellers.length > 0 ? (
                <div className="space-y-3">
                  {bestSellers.map((p, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className={`text-sm font-bold w-8 h-8 rounded-full flex items-center justify-center ${i === 0 ? 'bg-yellow-400 text-yellow-900' : i === 1 ? 'bg-gray-300 text-gray-700' : i === 2 ? 'bg-orange-400 text-orange-900' : 'bg-gray-100 text-gray-600'}`}>{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{p.name}</p>
                        <div className="w-full bg-gray-200 rounded-full h-2.5 mt-1">
                          <div className="bg-indigo-500 h-full rounded-full transition-all" style={{ width: `${Math.min(100, (p.sold / (bestSellers[0]?.sold || 1)) * 100)}%` }} />
                        </div>
                      </div>
                      <span className="text-sm font-bold text-indigo-600">{p.sold} vendus</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-base text-gray-400 text-center py-6">Aucune donnée disponible</p>}
            </div>

            {/* Daily Sales Chart */}
            <div className={`${cardBg} border rounded-2xl p-5 shadow-sm`}>
              <h3 className="text-lg font-bold flex items-center gap-2 mb-4"><TrendingUp size={20} className="text-green-500" /> 📈 Ventes (7 jours)</h3>
              <div className="space-y-2.5">
                {dailySales.map((d, i) => {
                  const maxVal = Math.max(...dailySales.map(x => x.ventes), 1);
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-sm w-16 text-right text-gray-500 truncate font-medium">{d.date}</span>
                      <div className="flex-1 bg-gray-200 rounded-full h-6 relative overflow-hidden">
                        <div className="bg-gradient-to-r from-indigo-500 to-indigo-400 h-full rounded-full transition-all" style={{ width: `${(d.ventes / maxVal) * 100}%` }} />
                        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white drop-shadow">{d.commandes} cmd</span>
                      </div>
                      <span className="text-sm w-24 text-right font-bold">{formatPrice(d.ventes)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Peak Hours */}
            <div className={`${cardBg} border rounded-2xl p-5 shadow-sm`}>
              <h3 className="text-lg font-bold flex items-center gap-2 mb-4"><Clock size={20} className="text-blue-500" /> ⏰ Heures de pointe</h3>
              {peakHours.length > 0 ? (
                <div className="flex items-end gap-2 h-40">
                  {peakHours.map((h, i) => {
                    const maxVal = Math.max(...peakHours.map(x => x.commandes), 1);
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-xs font-bold">{h.commandes}</span>
                        <div className="w-full bg-gradient-to-t from-amber-500 to-amber-300 rounded-t-lg transition-all" style={{ height: `${(h.commandes / maxVal) * 100}%`, minHeight: '6px' }} />
                        <span className="text-xs text-gray-500 font-medium">{h.hour}</span>
                      </div>
                    );
                  })}
                </div>
              ) : <p className="text-base text-gray-400 text-center py-6">Aucune donnée disponible</p>}
            </div>

            {/* Client History */}
            <div className={`${cardBg} border rounded-2xl p-5 shadow-sm`}>
              <h3 className="text-lg font-bold flex items-center gap-2 mb-4"><User size={20} className="text-indigo-500" /> 👥 Historique clients</h3>
              <div className="space-y-2">
                {uniqueClients.slice(0, 20).map((c, i) => (
                  <div key={i} className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}
                    onClick={() => { setSelectedClient(c); setShowClientHistory(true); }}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-base font-bold text-indigo-700">{c.name?.[0]?.toUpperCase() || '?'}</div>
                      <div>
                        <p className="text-base font-semibold">{c.name}</p>
                        <p className={`text-sm ${textSec}`}>Table {c.table}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-bold">{formatPrice(c.totalSpent)}</p>
                      <p className={`text-sm ${textSec}`}>{c.orderCount} commande(s)</p>
                    </div>
                    <ChevronRight size={18} className="text-gray-400" />
                  </div>
                ))}
              </div>
            </div>
            </div>

            {/* Category Distribution */}
            <div className={`${cardBg} border rounded-2xl p-5 shadow-sm max-w-3xl mx-auto`}>
              <h3 className="text-lg font-bold flex items-center gap-2 mb-4"><BarChart3 size={20} className="text-purple-500" /> 📊 Par catégorie</h3>
              {categoryData.length > 0 ? (
                <div className="space-y-3">
                  {categoryData.map((c, i) => {
                    const total = categoryData.reduce((s, x) => s + x.value, 0);
                    const pct = total > 0 ? ((c.value / total) * 100).toFixed(0) : 0;
                    return (
                      <div key={i} className="flex items-center gap-3 justify-center">
                        <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-sm w-36 font-medium text-center">{c.name}</span>
                        <div className="w-24 bg-gray-200 rounded-full h-3">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        </div>
                        <span className="text-sm font-bold w-12 text-right">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-base text-gray-400 text-center py-6">Aucune donnée par catégorie pour le moment</p>
              )}
            </div>

          </div>
        )}

        {/* ========== PAYMENTS TAB ========== */}
        {activeTab === 'payments' && (
          <div className="space-y-6">

            {/* ── Paiements en attente de confirmation vendeur ─── */}
            {pendingPayments.length > 0 && (
              <div className={`${cardBg} border-2 border-yellow-400 rounded-2xl p-5 shadow-md`}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 bg-yellow-100 rounded-full flex items-center justify-center">
                    <Bell size={18} className="text-yellow-600 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base">Paiements en attente</h3>
                    <p className={`text-xs ${textSec}`}>{pendingPayments.length} transfert{pendingPayments.length > 1 ? 's' : ''} à confirmer</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {pendingPayments.map((txn) => {
                    const provLabel = txn.provider === 'orange_money' ? 'Orange Money' : txn.provider === 'mvola' ? 'Mvola' : 'Airtel Money';
                    const provBg = txn.provider === 'orange_money' ? 'bg-orange-500' : txn.provider === 'mvola' ? 'bg-green-600' : 'bg-red-600';
                    const isProcessing = confirmingPayment === txn.id;
                    return (
                      <div key={txn.id} className={`${darkMode ? 'bg-gray-700' : 'bg-gray-50'} rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs text-white px-2 py-0.5 rounded-full font-bold ${provBg}`}>{provLabel}</span>
                            <span className={`text-xs ${textSec} font-mono`}>{txn.external_reference}</span>
                          </div>
                          <p className="font-bold text-sm">Table {txn.table_number} — {txn.client_name}</p>
                          <p className={`text-xs ${textSec}`}>
                            {txn.customer_phone && <span>📱 {txn.customer_phone} · </span>}
                            Montant : <strong>{new Intl.NumberFormat('fr-MG',{style:'currency',currency:'MGA',minimumFractionDigits:0}).format(txn.amount)}</strong>
                          </p>
                          <p className={`text-xs ${textSec} mt-0.5`}>{new Date(txn.created_at).toLocaleString('fr-FR')}</p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => handleConfirmPayment(txn)}
                            disabled={isProcessing}
                            className="flex items-center gap-1.5 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-bold disabled:opacity-60 transition-colors shadow-sm"
                          >
                            {isProcessing ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <CheckCircle size={16} />}
                            Confirmer reçu
                          </button>
                          <button
                            onClick={() => handleRejectPayment(txn)}
                            disabled={isProcessing}
                            className="flex items-center gap-1.5 px-3 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-sm font-bold disabled:opacity-60 transition-colors"
                          >
                            <X size={16} /> Rejeter
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {pendingPayments.length === 0 && (
              <div className={`${cardBg} border rounded-2xl p-5 text-center ${textSec}`}>
                <p className="text-2xl mb-2">✅</p>
                <p className="font-semibold">Aucun paiement en attente</p>
                <p className="text-xs mt-1">Les transferts mobile money apparaîtront ici</p>
              </div>
            )}

            {/* ── Numéros de paiement par opérateur ──────────── */}
            <div>
              <h3 className="font-bold text-base mb-3">Numéros marchands</h3>
              <div className="flex flex-nowrap gap-4 overflow-x-auto no-scrollbar pb-1">
                {Object.entries(paymentNumbers).map(([key, info]) => {
                  const provider = key === 'orange_money' ? 'Orange Money' : key === 'mvola' ? 'Mvola' : 'Airtel Money';
                  const color = key === 'orange_money' ? 'from-orange-500 to-orange-400' : key === 'mvola' ? 'from-green-600 to-green-500' : 'from-red-600 to-red-500';
                  const icon = key === 'orange_money' ? '🟠' : key === 'mvola' ? '🟢' : '🔴';
                  const draft = paymentDraft[key] ?? info;
                  const isEditing = editingPayment === key;
                  const isSaving = savingPayment === key;
                  return (
                    <div key={key} className={`${cardBg} border rounded-2xl p-5 shadow-sm min-w-[320px] flex-1`}>
                      {/* En-tête opérateur */}
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`bg-gradient-to-r ${color} text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-1.5`}>
                          {icon} {provider}
                        </div>
                        {!isEditing && (
                          <button onClick={() => openPaymentDraft(key, info)} className="ml-auto p-2.5 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
                            <Edit2 size={18} />
                          </button>
                        )}
                      </div>

                      {/* Affichage actuel */}
                      {!isEditing && (
                        <div className="space-y-2">
                          <div className={`${darkMode ? 'bg-gray-700' : 'bg-gray-50'} rounded-xl p-3`}>
                            <p className={`text-xs ${textSec} mb-0.5`}>Numéro marchand</p>
                            <p className="font-mono font-bold text-xl tracking-widest">{info.number}</p>
                          </div>
                          <div className={`${darkMode ? 'bg-gray-700' : 'bg-gray-50'} rounded-xl p-3`}>
                            <p className={`text-xs ${textSec} mb-0.5`}>Nom marchand</p>
                            <p className="font-semibold">{info.merchantName}</p>
                          </div>
                        </div>
                      )}

                      {/* Formulaire d'édition avec état local */}
                      {isEditing && (
                        <div className="space-y-3">
                          <div>
                            <label className={`text-xs font-semibold ${textSec} block mb-1`}>Numéro marchand</label>
                            <input
                              type="tel"
                              value={draft.number}
                              onChange={e => setPaymentDraft(d => ({ ...d, [key]: { ...draft, number: e.target.value } }))}
                              className={inputCls}
                              placeholder="03X XXX XXXX"
                            />
                          </div>
                          <div>
                            <label className={`text-xs font-semibold ${textSec} block mb-1`}>Nom marchand</label>
                            <input
                              type="text"
                              value={draft.merchantName}
                              onChange={e => setPaymentDraft(d => ({ ...d, [key]: { ...draft, merchantName: e.target.value } }))}
                              className={inputCls}
                              placeholder="Nom affiché au client"
                            />
                          </div>
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => handleSavePayment(key)}
                              disabled={isSaving}
                              className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-bold disabled:opacity-60 transition-colors shadow-sm"
                            >
                              {isSaving ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Save size={16} />}
                              Enregistrer
                            </button>
                            <button
                              onClick={() => { setEditingPayment(null); setPaymentDraft(d => { const n = { ...d }; delete n[key]; return n; }); }}
                              className={`px-4 py-3 rounded-xl text-sm font-bold ${darkMode ? 'bg-gray-600 hover:bg-gray-500' : 'bg-gray-100 hover:bg-gray-200'} transition-colors`}
                            >
                              Annuler
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ========== ACCOUNTS TAB ========== */}
        {activeTab === 'accounts' && (
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <button onClick={() => setShowAccountModal(true)}
                className={primaryBtnCls}>
                <UserPlus size={18} /> Nouveau Compte
              </button>
              {myAccount ? (
                <button
                  onClick={() => {
                    setMyUsername(myAccount.username);
                    setMyPassword('');
                    setShowMyAccountModal(true);
                  }}
                  className={successBtnCls}
                >
                  <Edit2 size={16} /> Modifier mon compte ({myAccount.username})
                </button>
              ) : null}
            </div>
            <div className="flex flex-nowrap gap-3 overflow-x-auto no-scrollbar pb-1">
              {accountColumns.map((column, colIdx) => (
                <div key={colIdx} className="min-w-[280px] space-y-3">
                  {column.map(a => (
                    <div key={a.username} className={`${cardBg} border rounded-2xl p-4 flex items-center justify-between shadow-sm`}>
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center"><User size={20} className="text-indigo-700" /></div>
                        <div>
                          <p className="text-base font-semibold">{a.username}</p>
                          <p className={`text-sm ${textSec}`}>{a.role || 'vendeur'}</p>
                        </div>
                      </div>
                      {sellerUsername === 'admin' && a.username !== 'admin' && (
                        <button onClick={() => { deleteSellerAccount(a.username); notify('Compte supprimé', 'warning'); }}
                          className="p-2.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-colors"><Trash2 size={16} /></button>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========== REPORTS TAB ========== */}
        {activeTab === 'reports' && (
          <div className="space-y-4">
            <div className="flex flex-nowrap gap-4 overflow-x-auto no-scrollbar pb-1">
              {reportPeriods.map(period => (
                <div key={period} className={`${cardBg} border rounded-2xl p-5 shadow-sm min-w-[300px] flex-1`}>
                  <p className="text-lg font-bold mb-3">📊 Rapport {period}</p>
                  <div className="flex gap-3">
                    <button onClick={() => exportPDF(period)} className="flex items-center gap-2 px-4 py-3 bg-red-600 text-white rounded-xl text-sm font-bold shadow-sm">
                      <Download size={16} /> PDF
                    </button>
                    <button onClick={() => exportExcel(period)} className="flex items-center gap-2 px-4 py-3 bg-green-600 text-white rounded-xl text-sm font-bold shadow-sm">
                      <Download size={16} /> Excel
                    </button>
                  </div>
                  <div className={`mt-4 p-3 rounded-xl border ${darkMode ? 'border-gray-700 bg-gray-900/40' : 'border-gray-200 bg-gray-50'}`}>
                    <p className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <CalendarDays size={14} />
                      {period === 'journalier' ? 'Déclenchement automatique (heure)' : 'Déclenchement automatique (date + heure)'}
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      {period !== 'journalier' && (
                        <input
                          type="date"
                          value={reportSchedules[period]?.date || ''}
                          onChange={(e) => setReportSchedules(prev => ({
                            ...prev,
                            [period]: { ...(prev[period] || { enabled: false, date: '', time: '22:00' }), date: e.target.value },
                          }))}
                          className={inputCls}
                        />
                      )}
                      <input
                        type="time"
                        value={reportSchedules[period]?.time || '22:00'}
                        onChange={(e) => setReportSchedules(prev => ({
                          ...prev,
                          [period]: { ...(prev[period] || { enabled: false, time: '22:00' }), time: e.target.value },
                        }))}
                        className={inputCls}
                      />
                      <label className="flex items-center gap-2 text-sm font-medium whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={reportSchedules[period]?.enabled || false}
                          onChange={(e) => setReportSchedules(prev => ({
                            ...prev,
                            [period]: { ...(prev[period] || { enabled: false, time: '22:00' }), enabled: e.target.checked },
                          }))}
                        />
                        Activer l'auto rapport {period}
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className={`${cardBg} border rounded-2xl p-5 shadow-sm`}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-lg font-bold">🗂️ Historique des rapports</p>
                {reportHistory.length > 0 && (
                  <button
                    onClick={() => setReportHistory([])}
                    className="text-sm px-3 py-2 rounded-lg bg-red-50 text-red-600 font-semibold"
                  >
                    Vider
                  </button>
                )}
              </div>

              {reportHistory.length === 0 ? (
                <p className={`text-sm ${textSec}`}>Aucun rapport généré pour le moment.</p>
              ) : (
                <div className="flex flex-nowrap gap-3 overflow-x-auto no-scrollbar pb-1">
                  {reportHistory.map((item) => (
                    <div key={item.id} className={`min-w-[320px] rounded-xl border p-3 ${darkMode ? 'border-gray-700 bg-gray-900/40' : 'border-gray-200 bg-gray-50'}`}>
                      <div className="mb-3">
                        <p className="text-sm font-bold">
                          {item.format.toUpperCase()} - {item.period}
                        </p>
                        <p className={`text-xs ${textSec}`}>{new Date(item.generatedAt).toLocaleString('fr-FR')}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openReportHistoryItem(item)}
                          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold"
                        >
                          <Eye size={14} /> Visualiser
                        </button>
                        <button
                          onClick={() => printReportHistoryItem(item)}
                          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-gray-800 text-white text-xs font-semibold"
                        >
                          <Printer size={14} /> Imprimer
                        </button>
                        <button
                          onClick={() => item.format === 'pdf' ? exportPDF(item.period, true) : exportExcel(item.period, true)}
                          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                        >
                          <Download size={14} /> Re-générer
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========== PUBLICATION TAB ========== */}
        {activeTab === 'publication' && (() => {
          const sd = settingsDraft ?? restaurantSettings;
          const isDirty = settingsDraft !== null;
          const setSD = (patch: Partial<typeof restaurantSettings>) =>
            setSettingsDraft(prev => ({ ...(prev ?? restaurantSettings), ...patch }));
          const draftHasContent = hasAnnouncementContent(sd.announcementText, sd.announcementImage, sd.announcementReactionButtons);
          const liveHasContent = hasAnnouncementContent(
            restaurantSettings.announcementText,
            restaurantSettings.announcementImage,
            restaurantSettings.announcementReactionButtons
          );
          const liveIsVisible = restaurantSettings.announcementEnabled && liveHasContent;
          const livePublishedAt = formatAnnouncementDate(restaurantSettings.announcementPublishedAt);
          const liveReactionButtons = restaurantSettings.announcementReactionButtons;
          const liveReactionCounts = restaurantSettings.announcementReactionCounts;
          const previewStatusClass = sd.announcementEnabled && draftHasContent
            ? 'bg-emerald-100 text-emerald-800'
            : draftHasContent
              ? 'bg-amber-100 text-amber-800'
              : 'bg-slate-100 text-slate-600';

          return (
            <div className="space-y-4">
              {isDirty && (
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-2xl bg-indigo-600 px-5 py-3 text-white shadow-lg">
                  <p className="text-sm font-semibold">Publication modifiee - pensez a enregistrer pour l'envoyer au client.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSettingsDraft(null)}
                      className="rounded-xl bg-white/20 px-4 py-2 text-sm font-bold transition-colors hover:bg-white/30"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={handleSaveSettings}
                      disabled={savingSettings}
                      className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-indigo-700 shadow-sm transition-colors hover:bg-indigo-50 disabled:opacity-60"
                    >
                      {savingSettings
                        ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                        : <Save size={15} />}
                      Enregistrer
                    </button>
                  </div>
                </div>
              )}

              <div className={`${cardBg} border rounded-2xl p-5 shadow-sm`}>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="max-w-2xl">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-500">Publication client</p>
                    <h3 className="mt-2 text-2xl font-bold">Controle de diffusion</h3>
                    <p className={`mt-2 text-sm ${textSec}`}>
                      Cette publication apparait juste sous le message de bienvenue du client. Le contenu est visible cote client apres enregistrement et activation de la diffusion.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-medium text-slate-500">
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                        <CalendarDays size={13} /> Derniere publication : {livePublishedAt}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-indigo-700">
                        <Bell size={13} /> {restaurantSettings.announcementReactionsTotal} reaction{restaurantSettings.announcementReactionsTotal > 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold ${previewStatusClass}`}>
                      {sd.announcementEnabled && draftHasContent
                        ? 'Diffusion active'
                        : draftHasContent
                          ? 'Brouillon hors ligne'
                          : 'Aucune publication'}
                    </span>
                    <button
                      type="button"
                      onClick={handlePublishAnnouncement}
                      disabled={savingSettings || !draftHasContent}
                      className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Publier maintenant
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!isDirty) openSettingsDraft();
                        focusAnnouncementEditor();
                      }}
                      className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                        darkMode
                          ? 'bg-gray-700 text-gray-100 hover:bg-gray-600'
                          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      onClick={() => setSD({ announcementEnabled: !sd.announcementEnabled })}
                      className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors ${
                        sd.announcementEnabled ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-600 hover:bg-emerald-700'
                      }`}
                    >
                      {sd.announcementEnabled ? 'Desactiver diffusion' : 'Activer diffusion'}
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAnnouncement}
                      disabled={!draftHasContent && !sd.announcementEnabled}
                      className="rounded-xl bg-rose-100 px-4 py-2 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Editeur</p>
                        <p className="text-xs text-slate-500">Le panneau de droite se met a jour automatiquement.</p>
                      </div>
                      <button
                        type="button"
                        onClick={focusAnnouncementEditor}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Placer le curseur
                      </button>
                    </div>

                    <label className="mb-4 flex items-center gap-3 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={sd.announcementEnabled}
                        onChange={(e) => setSD({ announcementEnabled: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      Diffuser cette publication aux clients
                    </label>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">Message de la publication</label>

                      <div className="mb-2 flex flex-wrap items-center gap-1">
                        <button type="button" onClick={() => applyAnnouncementFormat('bold')} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">B</button>
                        <button type="button" onClick={() => applyAnnouncementFormat('italic')} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm italic text-slate-700 hover:bg-slate-50">I</button>
                        <button type="button" onClick={() => applyAnnouncementFormat('underline')} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm underline text-slate-700 hover:bg-slate-50">U</button>
                        <div className="h-6 w-px bg-slate-200" />

                        <select value={announcementFont} onChange={(e) => { setAnnouncementFont(e.target.value); applyAnnouncementFormat('fontName', e.target.value); }} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-slate-700">
                          <option value="serif">Serif</option>
                          <option value="sans-serif">Sans-serif</option>
                          <option value="monospace">Monospace</option>
                          <option value="Georgia">Georgia</option>
                          <option value="Verdana">Verdana</option>
                          <option value="Comic Sans MS">Comic Sans</option>
                        </select>

                        <div className="h-6 w-px bg-slate-200" />

                        <button type="button" onClick={() => applyAnnouncementFormat('justifyLeft')} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50" title="Aligner a gauche">L</button>
                        <button type="button" onClick={() => applyAnnouncementFormat('justifyCenter')} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50" title="Centrer">C</button>
                        <button type="button" onClick={() => applyAnnouncementFormat('justifyRight')} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50" title="Aligner a droite">R</button>
                        <button type="button" onClick={() => applyAnnouncementFormat('justifyFull')} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50" title="Justifier">J</button>

                        <div className="h-6 w-px bg-slate-200" />

                        <button type="button" onClick={() => applyAnnouncementFormat('insertUnorderedList')} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50" title="Liste a puces">-</button>
                        <button type="button" onClick={() => applyAnnouncementFormat('insertOrderedList')} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50" title="Liste numerotee">1.</button>

                        <div className="h-6 w-px bg-slate-200" />

                        <label className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                          <span className="text-xs font-medium">A</span>
                          <input type="color" value={announcementColor} onChange={(e) => setAnnouncementColor(e.target.value)} className="h-6 w-8 cursor-pointer rounded border-0 p-0" />
                        </label>
                        <button type="button" onClick={() => wrapSelectionWithSpan(`color: ${announcementColor};`)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Couleur</button>

                        <label className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                          <span className="text-xs font-medium">Bg</span>
                          <input type="color" value={announcementBgColor} onChange={(e) => setAnnouncementBgColor(e.target.value)} className="h-6 w-8 cursor-pointer rounded border-0 p-0" />
                        </label>
                        <button type="button" onClick={() => wrapSelectionWithSpan(`background-color: ${announcementBgColor};`)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Fond</button>

                        <div className="h-6 w-px bg-slate-200" />

                        <select value={announcementSize} onChange={(e) => setAnnouncementSize(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-slate-700">
                          {['14','16','18','20','22','24','28','32','36'].map((size) => (
                            <option key={size} value={size}>{size}px</option>
                          ))}
                        </select>
                        <button type="button" onClick={() => wrapSelectionWithSpan(`font-size: ${announcementSize}px;`)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Taille</button>
                      </div>

                      <div
                        ref={announcementEditorRef}
                        contentEditable
                        suppressContentEditableWarning
                        onInput={updateAnnouncementHtml}
                        className={`${inputCls} min-h-[220px] overflow-auto rounded-2xl border border-slate-200 bg-white p-3 whitespace-pre-wrap break-words focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                      />
                      <p className="mt-2 text-xs text-slate-500">
                        Ecrivez ou collez votre message ici. Selectionnez du texte pour appliquer la mise en forme.
                      </p>
                    </div>

                    <div className="mt-4">
                      <label className="mb-1 block text-sm font-semibold text-slate-700">Image / GIF (URL ou upload)</label>
                      <div className="grid gap-2">
                        <input
                          type="text"
                          value={sd.announcementImage}
                          onChange={(e) => setSD({ announcementImage: e.target.value })}
                          className={inputCls}
                          placeholder="https://..."
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => announcementImageFileRef.current?.click()}
                            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
                          >
                            Telecharger une image
                          </button>
                          {sd.announcementImage && (
                            <button
                              type="button"
                              onClick={() => setSD({ announcementImage: '' })}
                              className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700"
                            >
                              Retirer l'image
                            </button>
                          )}
                        </div>
                        <input
                          ref={announcementImageFileRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            const reader = new FileReader();
                            reader.onloadend = () => setSD({ announcementImage: reader.result as string });
                            reader.readAsDataURL(f);
                          }}
                        />
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Boutons de reaction</p>
                          <p className="text-xs text-slate-500">Ajoutez des boutons sur lesquels les clients peuvent reagir.</p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                          {sd.announcementReactionButtons.length}/6
                        </span>
                      </div>

                      <div className="mt-3 grid gap-2 md:grid-cols-[90px,1fr,auto]">
                        <input
                          type="text"
                          value={announcementReactionEmoji}
                          onChange={(e) => setAnnouncementReactionEmoji(e.target.value)}
                          className={inputCls}
                          placeholder="🔥"
                          maxLength={4}
                        />
                        <input
                          type="text"
                          value={announcementReactionLabel}
                          onChange={(e) => setAnnouncementReactionLabel(e.target.value)}
                          className={inputCls}
                          placeholder="Ex: J'aime, Promo, Je viens"
                          maxLength={24}
                        />
                        <button
                          type="button"
                          onClick={handleAddReactionButton}
                          className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white"
                        >
                          Ajouter
                        </button>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {sd.announcementReactionButtons.length > 0 ? (
                          sd.announcementReactionButtons.map((button) => (
                            <div key={button.id} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                              <span>{button.emoji || '💬'}</span>
                              <span className="font-medium">{button.label}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveReactionButton(button.id)}
                                className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                              >
                                Retirer
                              </button>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-slate-500">Aucun bouton ajoute pour le moment.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-sky-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Visualisation</p>
                        <p className="text-xs text-slate-500">Simulation de l'emplacement sur l'espace client.</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${liveIsVisible ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {liveIsVisible ? 'Publication live' : 'Pas encore diffuse'}
                      </span>
                    </div>

                    <div className="mt-4 rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-500">Simulation client</p>
                      <h4 className="mt-2 text-lg font-bold text-indigo-900">Bienvenue Client !</h4>
                      <p className="text-sm text-indigo-600">
                        {draftHasContent
                          ? "Voici le bloc qui apparaitra sous le message de bienvenue."
                          : "Ajoutez un texte, une image ou des boutons pour preparer la publication."}
                      </p>

                      {draftHasContent ? (
                        <div className="mt-4 rounded-3xl border border-indigo-100 bg-gradient-to-b from-white to-indigo-50/70 p-4 shadow-sm">
                          {!sd.announcementEnabled && (
                            <div className="mb-3 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                              Diffusion desactivee - le client ne voit pas encore ce contenu
                            </div>
                          )}
                          {sd.announcementText && (
                            <div
                              className="mb-3 whitespace-pre-wrap break-words text-sm text-slate-800"
                              dangerouslySetInnerHTML={{ __html: sd.announcementText }}
                            />
                          )}
                          {sd.announcementImage && (
                            <div className="overflow-hidden rounded-3xl border border-indigo-100 bg-white">
                              <img src={sd.announcementImage} alt="Apercu publication" className="max-h-72 w-full object-cover" />
                            </div>
                          )}
                          {sd.announcementReactionButtons.length > 0 && (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {sd.announcementReactionButtons.map((button) => (
                                <div key={button.id} className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm">
                                  <span>{button.emoji || '💬'}</span>
                                  <span>{button.label}</span>
                                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                                    {liveReactionCounts[button.id] || 0}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="mt-4 rounded-3xl border border-dashed border-slate-300 bg-white/80 p-8 text-center text-sm text-slate-500">
                          Le contenu de l'editeur s'affichera ici en temps reel.
                        </div>
                      )}
                    </div>

                    <div className="mt-4 rounded-3xl border border-indigo-100 bg-white/90 p-4 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Reactions en direct</p>
                          <p className="text-xs text-slate-500">Suivi des clics clients sur la publication actuellement diffusee.</p>
                        </div>
                        <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                          {restaurantSettings.announcementReactionsTotal} total
                        </span>
                      </div>

                      {liveReactionButtons.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {liveReactionButtons.map((button) => (
                            <div key={button.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                <span>{button.emoji || '💬'}</span>
                                <span>{button.label}</span>
                              </div>
                              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                                {liveReactionCounts[button.id] || 0} reaction{(liveReactionCounts[button.id] || 0) > 1 ? 's' : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-slate-500">Ajoutez des boutons de reaction pour permettre aux clients de repondre.</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                  <p className={`text-sm ${textSec}`}>
                    Astuce : enregistrez apres chaque modification importante pour mettre a jour les clients deja connectes.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {isDirty && (
                      <button
                        onClick={() => setSettingsDraft(null)}
                        className={`rounded-xl px-6 py-3 text-sm font-bold transition-colors ${darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'}`}
                      >
                        Annuler les modifications
                      </button>
                    )}
                    <button
                      onClick={isDirty ? handleSaveSettings : openSettingsDraft}
                      disabled={savingSettings}
                      className={`flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white shadow-sm transition-colors disabled:opacity-60 ${
                        isDirty ? 'bg-green-600 hover:bg-green-700' : 'bg-indigo-600 hover:bg-indigo-700'
                      }`}
                    >
                      {savingSettings
                        ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        : <Save size={16} />}
                      {isDirty ? 'Enregistrer la publication' : 'Preparer une publication'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ========== SETTINGS TAB ========== */}
        {activeTab === 'settings' && (() => {
          // Draft local : on édite settingsDraft, on enregistre en une fois
          const sd = settingsDraft ?? restaurantSettings;
          const isDirty = settingsDraft !== null;
          const setSD = (patch: Partial<typeof restaurantSettings>) =>
            setSettingsDraft(prev => ({ ...(prev ?? restaurantSettings), ...patch }));

          return (
            <div className="space-y-4">
              {/* Barre d'action flottante quand il y a des modifications */}
              {isDirty && (
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-indigo-600 text-white rounded-2xl px-5 py-3 shadow-lg">
                  <p className="text-sm font-semibold">⚠️ Modifications non enregistrées</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSettingsDraft(null)}
                      className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-bold transition-colors"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={handleSaveSettings}
                      disabled={savingSettings}
                      className="flex items-center gap-2 px-4 py-2 bg-white text-indigo-700 hover:bg-indigo-50 rounded-xl text-sm font-bold disabled:opacity-60 transition-colors shadow-sm"
                    >
                      {savingSettings
                        ? <span className="animate-spin w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full" />
                        : <Save size={15} />}
                      Enregistrer
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Infos restaurant */}
                <div className={`${cardBg} border rounded-2xl p-5 shadow-sm`}>
                  <h3 className="text-lg font-bold mb-4">🏪 Restaurant</h3>
                  <div className="space-y-4">
                    <div>
                      <label className={`text-sm font-semibold ${textSec} block mb-1`}>Nom du restaurant</label>
                      <input type="text" value={sd.name} onChange={e => setSD({ name: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                      <label className={`text-sm font-semibold ${textSec} block mb-1`}>Nombre de tables</label>
                      <input type="number" value={sd.tableCount} onChange={e => setSD({ tableCount: parseInt(e.target.value) || 20 })} className={inputCls} />
                    </div>
                    <div>
                      <label className={`text-sm font-semibold ${textSec} block mb-1`}>Téléphone</label>
                      <input type="text" value={sd.phone ?? ''} onChange={e => setSD({ phone: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                      <label className={`text-sm font-semibold ${textSec} block mb-1`}>Adresse</label>
                      <input type="text" value={sd.address ?? ''} onChange={e => setSD({ address: e.target.value })} className={inputCls} />
                    </div>
                  </div>
                </div>

                {/* TVA & Prix */}
                <div className={`${cardBg} border rounded-2xl p-5 shadow-sm`}>
                  <h3 className="text-lg font-bold mb-4">💰 TVA & Prix</h3>
                  <div className="space-y-4">
                    <div>
                      <label className={`text-sm font-semibold ${textSec} block mb-1`}>Taux TVA (%)</label>
                      <input type="number" value={sd.vatRate} onChange={e => setSD({ vatRate: parseFloat(e.target.value) || 0 })} className={inputCls} />
                    </div>
                    <div>
                      <label className={`text-sm font-semibold ${textSec} block mb-1`}>Temps de préparation par défaut (min)</label>
                      <input type="number" value={sd.defaultPrepTime} onChange={e => setSD({ defaultPrepTime: parseInt(e.target.value) || 20 })} className={inputCls} />
                    </div>
                    <div>
                      <label className={`text-sm font-semibold ${textSec} block mb-1`}>Devise</label>
                      <input type="text" value={sd.currency} onChange={e => setSD({ currency: e.target.value })} className={inputCls} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Logo */}
              <div className={`${cardBg} border rounded-2xl p-5 shadow-sm`}>
                <h3 className="text-lg font-bold mb-4">🖼️ Logo</h3>
                <div className="flex items-center gap-4">
                  {sd.logo
                    ? <img src={sd.logo} alt="Logo" className="w-20 h-20 rounded-2xl object-cover shadow-sm" />
                    : <div className="w-20 h-20 rounded-2xl bg-gray-200 flex items-center justify-center text-3xl">🏪</div>}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-sm"
                  >
                    <Upload size={16} /> {sd.logo ? 'Changer' : 'Uploader'}
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => {
                    const f = e.target.files?.[0]; if (!f) return;
                    const r = new FileReader();
                    r.onloadend = () => setSD({ logo: r.result as string });
                    r.readAsDataURL(f);
                  }} />
                </div>
              </div>

              <div className={`${cardBg} border rounded-2xl p-5 shadow-sm`}>
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-lg font-bold">Publication client</h3>
                    <p className={`mt-1 text-sm ${textSec}`}>
                      La creation, la diffusion et la suppression de la publication se gerent maintenant dans l'onglet Publication.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('publication')}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700"
                  >
                    <Bell size={16} /> Ouvrir l'onglet publication
                  </button>
                </div>
              </div>

              {/* Bouton d'enregistrement principal (en bas) */}
              <div className="flex justify-end gap-3">
                {isDirty && (
                  <button
                    onClick={() => setSettingsDraft(null)}
                    className={`px-6 py-3 rounded-xl text-sm font-bold ${darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'} transition-colors`}
                  >
                    Annuler les modifications
                  </button>
                )}
                <button
                  onClick={isDirty ? handleSaveSettings : openSettingsDraft}
                  disabled={savingSettings}
                  className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold disabled:opacity-60 shadow-sm transition-colors ${
                    isDirty
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  }`}
                >
                  {savingSettings
                    ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    : <Save size={16} />}
                  {isDirty ? 'Enregistrer les paramètres' : 'Modifier les paramètres'}
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ========== MODALS ========== */}

      {/* Product Modal */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowProductModal(false)}>
          <div className={`${cardBg} rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl`} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold">{editingProduct ? 'Modifier' : 'Ajouter'} un produit</h3>
              <button onClick={() => setShowProductModal(false)} className="p-2 rounded-xl hover:bg-gray-100"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <input type="text" placeholder="Nom du produit *" value={pName} onChange={e => setPName(e.target.value)} className={inputCls} />
              <textarea placeholder="Description" value={pDesc} onChange={e => setPDesc(e.target.value)} className={inputCls} rows={2} />
              <div className="grid grid-cols-2 gap-3">
                <input type="number" placeholder="Prix *" value={pPrice} onChange={e => setPPrice(e.target.value)} className={inputCls} />
                <input type="number" placeholder="Quantité (vide = illimité)" value={pQty} onChange={e => setPQty(e.target.value)} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select value={pCat} onChange={e => setPCat(e.target.value)} className={inputCls}>
                  {categories.map(c => <option key={c.id} value={c.name}>{c.icon} {c.name}</option>)}
                </select>
                <input type="number" placeholder="Temps estimé (min)" value={pEstTime} onChange={e => setPEstTime(e.target.value)} className={inputCls} />
              </div>
              <input type="text" placeholder="URL de l'image" value={pImg} onChange={e => setPImg(e.target.value)} className={inputCls} />
              <button onClick={() => productFileRef.current?.click()} className="flex items-center gap-2 text-sm text-indigo-600 font-semibold">
                <Upload size={14} /> Ou uploader une image
              </button>
              <input ref={productFileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              {pImg && <img src={pImg} alt="Preview" className="w-full h-40 object-cover rounded-xl" />}
              <button onClick={saveProduct} className="w-full py-3.5 bg-indigo-600 text-white rounded-xl text-base font-bold shadow-sm">
                <Save size={16} className="inline mr-2" />{editingProduct ? 'Mettre à jour' : 'Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Account Modal */}
      {showAccountModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowAccountModal(false)}>
          <div className={`${cardBg} rounded-2xl p-6 w-full max-w-sm shadow-2xl`} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold">Nouveau compte vendeur</h3>
              <button onClick={() => setShowAccountModal(false)} className="p-2 rounded-xl hover:bg-gray-100"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <input type="text" placeholder="Nom d'utilisateur *" value={aUsername} onChange={e => setAUsername(e.target.value)} className={inputCls} />
              <input type="password" placeholder="Mot de passe *" value={aPassword} onChange={e => setAPassword(e.target.value)} className={inputCls} />
              <button onClick={saveAccount} className="w-full py-3.5 bg-indigo-600 text-white rounded-xl text-base font-bold shadow-sm">
                <UserPlus size={16} className="inline mr-2" />Créer le compte
              </button>
            </div>
          </div>
        </div>
      )}

      {/* My Account Modal */}
      {showMyAccountModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowMyAccountModal(false)}>
          <div className={`${cardBg} rounded-2xl p-6 w-full max-w-sm shadow-2xl`} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold">Modifier mon compte</h3>
              <button onClick={() => setShowMyAccountModal(false)} className="p-2 rounded-xl hover:bg-gray-100"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <input type="text" placeholder="Mon nom d'utilisateur" value={myUsername} onChange={e => setMyUsername(e.target.value)} className={inputCls} />
              <input type="password" placeholder="Nouveau mot de passe" value={myPassword} onChange={e => setMyPassword(e.target.value)} className={inputCls} />
              <button
                onClick={() => {
                  if (!sellerUsername || !myUsername.trim()) {
                    notify('Nom utilisateur invalide', 'error');
                    return;
                  }
                  updateSellerAccount(sellerUsername, {
                    username: myUsername.trim(),
                    ...(myPassword ? { password: myPassword } : {}),
                  });
                  localStorage.setItem('sellerUsername', myUsername.trim());
                  notify('Mon compte a été mis à jour', 'success');
                  setShowMyAccountModal(false);
                }}
                className="w-full py-3.5 bg-emerald-600 text-white rounded-xl text-base font-bold shadow-sm"
              >
                <Save size={16} className="inline mr-2" />Enregistrer mes informations
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowCategoryModal(false)}>
          <div className={`${cardBg} rounded-2xl p-6 w-full max-w-sm shadow-2xl`} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold">{editingCategory ? 'Modifier' : 'Nouvelle'} catégorie</h3>
              <button onClick={() => setShowCategoryModal(false)} className="p-2 rounded-xl hover:bg-gray-100"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <input type="text" placeholder="Nom de la catégorie *" value={catName} onChange={e => setCatName(e.target.value)} className={inputCls} />
              <input type="text" placeholder="Emoji (ex: 🍕)" value={catIcon} onChange={e => setCatIcon(e.target.value)} className={inputCls} />
              <button onClick={saveCategory} className="w-full py-3.5 bg-indigo-600 text-white rounded-xl text-base font-bold shadow-sm">
                <Save size={16} className="inline mr-2" />{editingCategory ? 'Modifier' : 'Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Client History Modal */}
      {showClientHistory && selectedClient && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowClientHistory(false)}>
          <div className={`${cardBg} rounded-2xl p-6 w-full max-w-md max-h-[80vh] overflow-y-auto shadow-2xl`} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold">📋 {selectedClient.name} (Table {selectedClient.table})</h3>
              <button onClick={() => setShowClientHistory(false)} className="p-2 rounded-xl hover:bg-gray-100"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              {orders.filter(o => o.customerName === selectedClient.name && o.tableNumber === selectedClient.table)
                .map(o => (
                  <div key={o.id} className={`p-4 rounded-xl border ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                    <div className="flex justify-between items-center mb-2">
                      <span className={`text-sm ${textSec}`}>{new Date(o.createdAt).toLocaleString('fr-FR')}</span>
                      <span className={`text-sm px-3 py-1 rounded-full font-bold ${statusColor[o.status] || 'bg-gray-100 text-gray-700'}`}>{statusLabel[o.status] || o.status}</span>
                    </div>
                    <p className="text-base font-bold">{formatPrice(o.total)}</p>
                    <div className={`text-sm ${textSec} mt-1`}>
                      {o.items?.map((i: any, idx: number) => <span key={idx}>{i.product?.name || i.name} ×{i.quantity}{idx < o.items.length - 1 ? ', ' : ''}</span>)}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SellerDashboard;
