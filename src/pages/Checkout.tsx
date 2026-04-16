import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CreditCard, Check, User, Phone, Info } from 'lucide-react';
import { useCart } from '../contexts/CartContext';
import { useOrders, PaymentMethod } from '../contexts/OrdersContext';
import { useCustomer } from '../contexts/CustomerContext';
import Header from '../components/Header';
import { useNotification } from '../contexts/NotificationContext';

/* ─── Logos opérateurs ─────────────────────────────────────────── */
const PROVIDER_META: Record<
  PaymentMethod,
  { label: string; color: string; border: string; ring: string; text: string; bg: string; logo: string }
> = {
  orange_money: {
    label: 'Orange Money',
    color: '#FF6600',
    border: 'border-orange-300',
    ring: 'ring-orange-500',
    text: 'text-orange-700',
    bg: 'bg-orange-50',
    logo: '🟠',
  },
  mvola: {
    label: 'Mvola',
    color: '#00963A',
    border: 'border-green-400',
    ring: 'ring-green-500',
    text: 'text-green-700',
    bg: 'bg-green-50',
    logo: '🟢',
  },
  airtel_money: {
    label: 'Airtel Money',
    color: '#E2001A',
    border: 'border-red-400',
    ring: 'ring-red-500',
    text: 'text-red-700',
    bg: 'bg-red-50',
    logo: '🔴',
  },
};

/* ─── Validation numéro MG ──────────────────────────────────────── */
function validateMgPhone(value: string, provider: PaymentMethod): string | null {
  const clean = value.replace(/\s+/g, '');
  if (!clean) return null;
  if (!/^\d{10}$/.test(clean)) return 'Le numéro doit comporter 10 chiffres (ex : 034XXXXXXX)';
  const prefix = clean.slice(0, 3);
  if (provider === 'orange_money' && !['032', '037'].includes(prefix))
    return 'Orange Money : numéro 032 ou 037 attendu';
  if (provider === 'mvola' && !['034', '038'].includes(prefix))
    return 'Mvola : numéro 034 ou 038 attendu';
  if (provider === 'airtel_money' && prefix !== '033')
    return 'Airtel Money : numéro 033 attendu';
  return null;
}

/* ═══════════════════════════════════════════════════════════════════
   COMPOSANT PRINCIPAL
══════════════════════════════════════════════════════════════════════ */
const Checkout: React.FC = () => {
  const { items, getTotal } = useCart();
  const { notify } = useNotification();
  const { paymentNumbers, products } = useOrders();
  const { customer, isLoggedIn, isReady } = useCustomer();
  const navigate = useNavigate();

  const [notes, setNotes] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>('orange_money');
  const [customerPhone, setCustomerPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isReady) return;
    if (!isLoggedIn) navigate('/');
  }, [isReady, isLoggedIn, navigate]);

  /* Validation téléphone à la volée */
  const handlePhoneChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 10);
    setCustomerPhone(digits);
    setPhoneError(digits.length > 0 ? validateMgPhone(digits, selectedPayment) : null);
  };

  /* Re-valider si l'opérateur change */
  useEffect(() => {
    if (customerPhone.length > 0) {
      setPhoneError(validateMgPhone(customerPhone, selectedPayment));
    }
  }, [selectedPayment, customerPhone]);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('fr-MG', { style: 'currency', currency: 'MGA', minimumFractionDigits: 0 }).format(price);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (items.length === 0) { notify('Votre panier est vide', 'error'); return; }
    if (!customer) { notify('Veuillez vous connecter', 'error'); navigate('/'); return; }
    if (!customerPhone || customerPhone.length < 10) {
      notify('Veuillez saisir votre numéro mobile money', 'error');
      return;
    }
    const err = validateMgPhone(customerPhone, selectedPayment);
    if (err) { notify(err, 'error'); return; }

    const invalidItem = items.find((item) => {
      const cur = products.find((p) => p.id === item.product.id);
      if (!cur || !cur.isActive) return true;
      return cur.quantity !== undefined && item.quantity > cur.quantity;
    });

    if (invalidItem) {
      const cur = products.find((p) => p.id === invalidItem.product.id);
      notify(
        cur?.quantity !== undefined
          ? `Stock insuffisant pour ${invalidItem.product.name} : ${cur.quantity} disponible(s)`
          : `${invalidItem.product.name} n'est plus disponible`,
        'error',
      );
      return;
    }

    setIsSubmitting(true);
    try {
      // Ne pas créer la commande encore, passer les données à Payment
      notify('Préparation du paiement...', 'info');
      setTimeout(() => {
        navigate('/payment', { 
          state: { 
            cartItems: items, 
            total: getTotal(), 
            paymentMethod: selectedPayment, 
            customerName: customer.name.trim(),
            tableNumber: customer.tableNumber,
            notes: notes?.trim() || undefined,
            customerPhone 
          } 
        });
        setIsSubmitting(false);
      }, 500);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Impossible de créer la commande', 'error');
      setIsSubmitting(false);
    }
  };

  if (!isReady) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-sm text-gray-500">
        Chargement de votre session...
      </div>
    );
  }
  if (!isLoggedIn) return null;

  const total = getTotal();
  const meta = PROVIDER_META[selectedPayment];
  const payInfo = paymentNumbers[selectedPayment];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />

      <main className="container mx-auto px-4 py-6 pb-28">
        <div className="mb-5">
          <Link to="/cart" className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-800 text-sm">
            <ArrowLeft size={18} />
            Retour au panier
          </Link>
        </div>

        <div className="max-w-5xl mx-auto">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Finaliser votre commande</h1>
            <p className="text-gray-500 text-sm mt-1">Choisissez votre opérateur et entrez votre numéro</p>
          </div>

          {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* ── Colonne gauche ──────────────────────────────── */}
              <div className="space-y-5">

                {/* Infos client */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                  <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <User className="text-indigo-500" size={18} /> Informations client
                  </h2>
                  {customer && (
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
                        <span className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Nom</span>
                        <span className="font-semibold text-gray-900 dark:text-white text-sm">{customer.name}</span>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
                        <span className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Table</span>
                        <span className="font-semibold text-gray-900 dark:text-white text-sm">N° {customer.tableNumber}</span>
                      </div>
                    </div>
                  )}
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Notes (optionnel)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm bg-white dark:bg-gray-700 dark:text-white"
                    placeholder="Ex : sans oignons, sauce à part…"
                  />
                </div>

                {/* Articles */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                  <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Check className="text-indigo-500" size={18} /> Articles ({items.length})
                  </h2>
                  <div className="space-y-2">
                    {items.map((item) => (
                      <div key={item.product.id} className="flex items-center gap-3 p-2.5 bg-gray-50 dark:bg-gray-700 rounded-xl">
                        <img src={item.product.image} alt={item.product.name} className="w-11 h-11 object-cover rounded-lg" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{item.product.name}</p>
                          <p className="text-xs text-gray-500">{item.quantity}× {formatPrice(item.product.price)}</p>
                        </div>
                        <span className="font-bold text-gray-900 dark:text-white text-sm shrink-0">
                          {formatPrice(item.product.price * item.quantity)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-600 flex justify-between text-base font-bold">
                    <span className="dark:text-white">Total</span>
                    <span className="text-indigo-600">{formatPrice(total)}</span>
                  </div>
                </div>
              </div>

              {/* ── Colonne droite ──────────────────────────────── */}
              <div className="space-y-5">

                {/* Sélection opérateur */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                  <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <CreditCard className="text-indigo-500" size={18} /> Moyen de paiement
                  </h2>

                  <div className="space-y-3">
                    {(Object.keys(PROVIDER_META) as PaymentMethod[]).map((id) => {
                      const m = PROVIDER_META[id];
                      const info = paymentNumbers[id];
                      const isSelected = selectedPayment === id;
                      return (
                        <label
                          key={id}
                          className={`flex items-start gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                            isSelected
                              ? `${m.bg} ${m.border} ring-2 ${m.ring}`
                              : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:border-gray-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="paymentMethod"
                            value={id}
                            checked={isSelected}
                            onChange={() => setSelectedPayment(id)}
                            className="sr-only"
                          />
                          {/* Logo */}
                          <span className="text-2xl mt-0.5">{m.logo}</span>

                          {/* Infos */}
                          <div className="flex-1 min-w-0">
                            <p className={`font-bold text-sm ${isSelected ? m.text : 'text-gray-800 dark:text-white'}`}>
                              {m.label}
                            </p>
                            {/* Numéro marchand visible */}
                            <div className="mt-1.5 flex items-center gap-1.5">
                              <span className="text-xs text-gray-500 dark:text-gray-400">Marchand :</span>
                              <span
                                className={`text-sm font-bold tracking-wider ${
                                  isSelected ? m.text : 'text-gray-700 dark:text-gray-200'
                                }`}
                              >
                                {info.number}
                              </span>
                            </div>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{info.merchantName}</p>
                          </div>

                          {isSelected && (
                            <div
                              className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5`}
                              style={{ backgroundColor: m.color }}
                            >
                              <Check size={14} className="text-white" />
                            </div>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Numéro du client */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                  <h2 className="text-base font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                    <Phone className="text-indigo-500" size={18} /> Votre numéro {meta.label}
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    Le numéro depuis lequel vous allez effectuer le transfert
                  </p>

                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium text-sm">+261</span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      value={customerPhone}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                      placeholder="03X XXX XXXX"
                      className={`w-full pl-14 pr-4 py-3 border-2 rounded-xl text-sm font-mono transition-colors ${
                        phoneError
                          ? 'border-red-400 focus:ring-red-400'
                          : customerPhone.length === 10
                          ? 'border-green-400 focus:ring-green-400'
                          : 'border-gray-200 dark:border-gray-600 focus:ring-indigo-400'
                      } focus:outline-none focus:ring-2 bg-white dark:bg-gray-700 dark:text-white`}
                    />
                    {customerPhone.length === 10 && !phoneError && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500">✓</span>
                    )}
                  </div>

                  {phoneError && (
                    <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
                      <span>⚠</span> {phoneError}
                    </p>
                  )}

                  {/* Rappel numéro marchand */}
                  <div
                    className={`mt-4 rounded-xl p-3 ${meta.bg} border ${meta.border} flex items-start gap-2`}
                  >
                    <Info size={16} className={`${meta.text} shrink-0 mt-0.5`} />
                    <div>
                      <p className={`text-xs font-semibold ${meta.text}`}>Vous allez transférer vers :</p>
                      <p className={`text-base font-bold tracking-widest mt-0.5 ${meta.text}`}>
                        {payInfo.number}
                      </p>
                      <p className={`text-xs ${meta.text} opacity-75`}>{payInfo.merchantName} — {meta.label}</p>
                    </div>
                  </div>
                </div>

                {/* Bouton commander */}
                <button
                  type="submit"
                  disabled={isSubmitting || items.length === 0 || !customerPhone || customerPhone.length < 10 || !!phoneError}
                  className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 px-6 rounded-2xl hover:from-indigo-700 hover:to-purple-700 transition-all font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                >
                  {isSubmitting ? 'Traitement…' : `Payer ${formatPrice(total)}`}
                </button>
                <p className="text-center text-xs text-gray-400">
                  En validant, vous acceptez nos conditions générales de vente.
                </p>
              </div>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
};

export default Checkout;
