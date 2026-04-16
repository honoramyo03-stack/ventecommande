import React, { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { useOrders, Order } from '../contexts/OrdersContext';
import { useCart } from '../contexts/CartContext';
import { useNotification } from '../contexts/NotificationContext';
import { buildUssdCode, initiateMobileMoneyPayment } from '../lib/paymentApi';
import type { MobileMoneyProvider } from '../lib/paymentApi';

type PaymentMethod = MobileMoneyProvider;

interface OrderPayload {
  cartItems: any[];
  total: number;
  paymentMethod: PaymentMethod;
  customerName: string;
  tableNumber: number;
  notes?: string;
  customerPhone?: string;
}

/* ─── Méta opérateurs ───────────────────────────────────────── */
const PROVIDER = {
  orange_money: { label: 'Orange Money', bg: 'bg-orange-500', light: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-700', logo: '🟠' },
  mvola:        { label: 'Mvola',        bg: 'bg-green-600',  light: 'bg-green-50',  border: 'border-green-300',  text: 'text-green-700',  logo: '🟢' },
  airtel_money: { label: 'Airtel Money', bg: 'bg-red-600',   light: 'bg-red-50',    border: 'border-red-300',    text: 'text-red-700',    logo: '🔴' },
} as const;

/* ─── Steps component ───────────────────────────────────────── */
const Steps = ({ provider }: { provider: keyof typeof PROVIDER }) => {
  const steps = [
    { icon: '📱', text: 'Ouvrez le clavier téléphonique' },
    { icon: '⌨️',  text: `Composez le code USSD ci-dessous ou appuyez sur le bouton` },
    { icon: '✅',  text: `Confirmez avec votre mot de passe ${PROVIDER[provider].label}` },
    { icon: '↩️',  text: `Revenez ici et appuyez sur « J'ai payé »` },
  ];
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
            {i + 1}
          </span>
          <span className="text-sm opacity-90 mt-0.5">{s.icon} {s.text}</span>
        </li>
      ))}
    </ol>
  );
};

/* ═══════════════════════════════════════════════════════════════
   COMPOSANT PRINCIPAL
════════════════════════════════════════════════════════════════ */
const Payment: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { paymentNumbers, orders, addOrder } = useOrders();
  const { clearCart } = useCart();
  const { notify } = useNotification();

  const [order, setOrder] = useState<Order | null>(null);
  const [orderData, setOrderData] = useState<OrderPayload | null>(null);
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [lifecycle, setLifecycle] = useState<'pending' | 'confirming' | 'waiting_vendor' | 'paid' | 'failed'>('pending');
  const [transactionRef, setTransactionRef] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [userTransactionRef, setUserTransactionRef] = useState<string>('');
  const autoDoneRef = useRef(false);

  useEffect(() => {
    if (location.state?.order) {
      // Ancien format avec commande existante
      setOrder(location.state.order as Order);
      setCustomerPhone(location.state.customerPhone ?? '');
    } else if (location.state?.cartItems) {
      // Nouveau format avec données du panier
      setOrderData({
        cartItems: location.state.cartItems,
        total: location.state.total ?? 0,
        paymentMethod: location.state.paymentMethod,
        customerName: location.state.customerName,
        tableNumber: location.state.tableNumber,
        notes: location.state.notes,
        customerPhone: location.state.customerPhone,
      });
      setCustomerPhone(location.state.customerPhone ?? '');
    } else {
      navigate('/');
    }
  }, [location, navigate]);

  /* Surveiller statut ordre via SSE */
  useEffect(() => {
    if (!order) return;
    const latest = orders.find((o) => o.id === order.id);
    if (!latest) return;
    if (latest.paymentStatus === 'paid' || latest.status === 'paid') setLifecycle('paid');
    else if (latest.paymentStatus === 'failed') setLifecycle('failed');
  }, [order, orders]);

  /* Redirection auto après paiement confirmé */
  useEffect(() => {
    if (!order || lifecycle !== 'paid' || autoDoneRef.current) return;
    autoDoneRef.current = true;
    clearCart();
    notify('✅ Paiement confirmé par le vendeur !', 'success');
    setTimeout(() => navigate('/menu', { replace: true, state: { stockUpdated: true } }), 2500);
  }, [lifecycle, order, clearCart, navigate, notify]);

  if (!order && !orderData) return null;

  type PaymentSource = Order | OrderPayload;
  const currentData = (order || orderData) as PaymentSource;
  if (!currentData) return null;
  const items = 'items' in currentData ? currentData.items : currentData.cartItems;
  const itemCount = items.length;
  const computedTotal = items.reduce((sum: number, item: any) => sum + (Number(item.product?.price ?? item.price ?? 0) * Number(item.quantity ?? 0)), 0);
  const totalAmount = Number(currentData.total) > 0 ? Number(currentData.total) : computedTotal;
  const provider = currentData.paymentMethod as MobileMoneyProvider;
  const p = PROVIDER[provider] ?? PROVIDER.orange_money;
  const payInfo = paymentNumbers[provider];
  const ussdCode = buildUssdCode(provider, payInfo.number, totalAmount);

  const formatPrice = (v: number) =>
    new Intl.NumberFormat('fr-MG', { style: 'currency', currency: 'MGA', minimumFractionDigits: 0 }).format(v);

  const handleComposeCode = async () => {
    const telUri = `tel:${encodeURIComponent(ussdCode)}`;
    try {
      await navigator.clipboard.writeText(ussdCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard failures
    }
    window.location.href = telUri;
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(ussdCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // silent
    }
  };

  /* Client confirme avoir composé le code et transféré l'argent */
  const handleClientConfirm = async () => {
    setLifecycle('confirming');
    try {
      // Créer la commande d'abord si elle n'existe pas
      let currentOrder = order;
      if (!currentOrder && orderData) {
        currentOrder = await addOrder({
          tableNumber: orderData.tableNumber,
          items: orderData.cartItems,
          total: orderData.total,
          paymentMethod: orderData.paymentMethod,
          customerName: orderData.customerName,
          notes: orderData.notes,
        });
        setOrder(currentOrder);
        notify('Commande créée avec succès !', 'success');
      }

      if (!userTransactionRef.trim()) {
        notify('Veuillez entrer la référence de transaction avant de valider.', 'error');
        setLifecycle('pending');
        return;
      }

      const res = await initiateMobileMoneyPayment({
        orderId: currentOrder!.id,
        provider,
        customerPhone,
        userReference: userTransactionRef.trim(),
      });
      setTransactionRef(res.externalReference ?? null);
      setLifecycle('waiting_vendor');
      notify('Paiement enregistré. En attente de confirmation du vendeur…', 'info');
    } catch (err) {
      console.error(err);
      // Fallback : créer commande localement si nécessaire
      let fallbackOrder = order;
      if (!fallbackOrder && orderData) {
        fallbackOrder = await addOrder({
          tableNumber: orderData.tableNumber,
          items: orderData.cartItems,
          total: orderData.total,
          paymentMethod: orderData.paymentMethod,
          customerName: orderData.customerName,
          notes: orderData.notes,
        });
        setOrder(fallbackOrder);
      }
      setLifecycle('waiting_vendor');
      notify('Paiement enregistré localement. En attente de confirmation du vendeur…', 'success');
    }
  };

  /* ── Écran : paiement payé / confirmé ─────────────────────── */
  if (lifecycle === 'paid') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header />
        <div className="max-w-md mx-auto px-4 py-16 text-center">
          <div className={`w-24 h-24 ${p.light} rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce`}>
            <svg className="w-14 h-14 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-3xl font-extrabold text-green-800 mb-2">Paiement confirmé !</h2>
          <p className="text-green-600 text-2xl font-bold mb-3">{formatPrice(totalAmount)}</p>
          {transactionRef && <p className="text-xs text-gray-400 mb-2">Réf : {transactionRef}</p>}
          {userTransactionRef && <p className="text-xs text-gray-400 mb-2">Votre réf : {userTransactionRef}</p>}
          <p className="text-sm text-gray-500">Redirection en cours…</p>
        </div>
      </div>
    );
  }

  /* ── Écran : en attente confirmation vendeur ──────────────── */
  if (lifecycle === 'waiting_vendor') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header />
        <div className="max-w-md mx-auto px-4 py-12 text-center">
          <div className={`w-20 h-20 ${p.light} rounded-full flex items-center justify-center mx-auto mb-6`}>
            <div className="animate-spin w-12 h-12 border-4 border-current border-t-transparent rounded-full text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">En attente du vendeur</h2>
          <p className="text-gray-500 text-sm mb-1">Votre paiement a bien été enregistré.</p>
          <p className="text-gray-500 text-sm mb-6">Le vendeur va confirmer la réception dans quelques instants.</p>
          {transactionRef && (
            <div className={`${p.light} border ${p.border} rounded-2xl p-4 inline-block`}>
              <p className={`text-xs ${p.text} font-semibold`}>Référence transaction</p>
              <p className={`text-sm font-mono font-bold ${p.text} mt-1`}>{transactionRef}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── Écran principal (pending) ────────────────────────────── */
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">

        {/* Résumé commande */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h2 className="font-bold text-gray-800 dark:text-white text-sm">Commande #{order ? order.id.slice(0, 8).toUpperCase() : 'Nouvelle'}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{itemCount} article{itemCount > 1 ? 's' : ''}</p>
            </div>
            <span className="text-xl font-extrabold text-indigo-600">{formatPrice(totalAmount)}</span>
          </div>
          <div className="space-y-1">
            {items.map((item: any, i: number) => (
              <div key={i} className="flex justify-between text-xs text-gray-500">
                <span>{item.product?.name || item.name} ×{item.quantity}</span>
                <span>{formatPrice((item.product?.price || item.price) * item.quantity)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Carte opérateur */}
        <div className={`${p.bg} text-white rounded-2xl p-5 shadow-md`}>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl">{p.logo}</span>
            <div>
              <h3 className="font-extrabold text-xl">{p.label}</h3>
              <p className="text-xs opacity-75">Paiement mobile sécurisé</p>
            </div>
          </div>

          {/* Numéro marchand (en gros, bien visible) */}
          <div className="bg-white/15 rounded-xl p-4 mb-3">
            <p className="text-xs opacity-75 mb-1 uppercase tracking-wide">📲 Numéro du marchand</p>
            <p className="text-3xl font-extrabold tracking-widest">{payInfo.number}</p>
            <p className="text-sm opacity-80 mt-0.5">{payInfo.merchantName}</p>
          </div>

          {/* Numéro client */}
          {customerPhone && (
            <div className="bg-white/10 rounded-xl p-3 mb-3">
              <p className="text-xs opacity-75">Votre numéro</p>
              <p className="text-lg font-bold tracking-wider">{customerPhone}</p>
            </div>
          )}

          <div className="flex justify-between items-center">
            <span className="text-sm opacity-80">Montant à transférer</span>
            <span className="text-2xl font-extrabold">{formatPrice(totalAmount)}</span>
          </div>
        </div>

        {/* Code USSD */}
        <div className={`bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border-2 ${p.border}`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
              <span>⌨️</span> Code USSD à composer
            </h3>
            <button
              onClick={handleCopy}
              className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-all ${copied ? 'bg-green-100 text-green-700' : `${p.light} ${p.text}`}`}
            >
              {copied ? '✓ Copié !' : 'Copier'}
            </button>
          </div>

          <div className={`${p.light} border ${p.border} rounded-xl p-4 mb-4 text-center`}>
            <p className={`text-xl font-extrabold tracking-widest font-mono break-all ${p.text}`}>{ussdCode}</p>
          </div>

          <a
            href="#"
            onClick={(e) => { e.preventDefault(); handleComposeCode(); }}
            className={`w-full flex items-center justify-center gap-3 ${p.bg} text-white py-4 rounded-xl font-bold text-base hover:opacity-90 transition-opacity shadow-md`}
          >
            <span className="text-xl">📞</span> Composer le code maintenant
          </a>
          <p className="text-xs text-gray-400 text-center mt-2">
            Le code sera copié automatiquement et l'application téléphone s'ouvrira
          </p>
        </div>

        {/* Instructions */}
        <div className={`${p.bg} text-white rounded-2xl p-5`}>
          <h3 className="font-bold text-base mb-4">📋 Comment payer ?</h3>
          <Steps provider={provider} />
        </div>

        {/* Confirmation client */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="font-bold text-gray-800 dark:text-white mb-2">J'ai effectué le transfert</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Après avoir composé le code USSD et confirmé avec votre PIN {p.label}, entrez la référence et appuyez sur le bouton.
          </p>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Référence de transaction</label>
            <input
              type="text"
              value={userTransactionRef}
              onChange={(e) => setUserTransactionRef(e.target.value.toUpperCase())}
              placeholder="Ex: ABC123456"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white"
            />
            <p className="text-xs text-gray-500 mt-2">Saisissez la référence de transaction reçue après paiement.</p>
          </div>

          <button
            onClick={handleClientConfirm}
            disabled={lifecycle === 'confirming' || !userTransactionRef.trim()}
            className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold text-base hover:from-indigo-700 hover:to-purple-700 disabled:opacity-60 transition-all shadow-lg flex items-center justify-center gap-2"
          >
            {lifecycle === 'confirming'
              ? <><span className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" /> Enregistrement…</>
              : <><span>✅</span> J'ai payé — Notifier le vendeur</>}
          </button>
        </div>

        <button
          onClick={() => navigate(-1)}
          className="w-full py-3 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-200 transition-colors"
        >
          ← Retour
        </button>
      </div>
    </div>
  );
};

export default Payment;
