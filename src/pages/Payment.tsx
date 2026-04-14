import React, { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { useOrders, Order } from '../contexts/OrdersContext';
import { useCart } from '../contexts/CartContext';
import { useNotification } from '../contexts/NotificationContext';
import {
  initiateMobileMoneyPayment,
  isPaymentApiConfigured,
  getPaymentStatus,
} from '../lib/paymentApi';

const Payment: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { updateOrderStatus, paymentNumbers, orders } = useOrders();
  const { clearCart } = useCart();
  const { notify } = useNotification();
  const [order, setOrder] = useState<Order | null>(null);
  const [paymentLifecycle, setPaymentLifecycle] = useState<'idle' | 'initiating' | 'pending' | 'paid' | 'failed'>('idle');
  const [paymentRef, setPaymentRef] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoDoneRef = useRef(false);

  useEffect(() => {
    if (location.state?.order) {
      setOrder(location.state.order);
    } else {
      navigate('/');
    }
  }, [location, navigate]);

  // Initier le paiement automatiquement
  useEffect(() => {
    if (!order || paymentLifecycle !== 'idle') return;

    if (!isPaymentApiConfigured()) {
      // Pas d'API configurée → mode manuel
      setPaymentLifecycle('pending');
      return;
    }

    let cancelled = false;
    const startPayment = async () => {
      setPaymentLifecycle('initiating');
      try {
        const response = await initiateMobileMoneyPayment({
          orderId: order.id,
          provider: order.paymentMethod,
        });
        if (cancelled) return;
        setPaymentLifecycle('pending');
        setPaymentRef(response.externalReference || null);
        setTransactionId(response.transactionId);
        setCountdown(30);
        notify('Paiement initié. En attente de confirmation...', 'info');
      } catch (error) {
        if (cancelled) return;
        console.error('Init payment error:', error);
        setPaymentLifecycle('pending');
        notify('Mode validation manuelle actif.', 'warning');
      }
    };

    startPayment();
    return () => { cancelled = true; };
  }, [order, paymentLifecycle, notify]);

  // Polling du statut de paiement
  useEffect(() => {
    if (!transactionId || paymentLifecycle === 'paid' || paymentLifecycle === 'failed') return;

    pollingRef.current = setInterval(async () => {
      try {
        const status = await getPaymentStatus(transactionId);
        if (status.status === 'paid') {
          setPaymentLifecycle('paid');
          clearInterval(pollingRef.current!);
        } else if (status.status === 'failed') {
          setPaymentLifecycle('failed');
          clearInterval(pollingRef.current!);
        }
      } catch {
        // Ignore polling errors
      }
    }, 2000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [transactionId, paymentLifecycle]);

  // Surveiller les changements d'ordres (via SSE/polling du contexte)
  useEffect(() => {
    if (!order) return;
    const latest = orders.find((o) => o.id === order.id);
    if (!latest) return;
    if (latest.paymentStatus === 'paid' || latest.status === 'paid') {
      setPaymentLifecycle('paid');
    } else if (latest.paymentStatus === 'failed') {
      setPaymentLifecycle('failed');
    }
    if (latest.paymentReference) {
      setPaymentRef(latest.paymentReference);
    }
  }, [order, orders]);

  // Countdown
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // Auto-redirect après paiement réussi
  useEffect(() => {
    if (!order || paymentLifecycle !== 'paid' || autoDoneRef.current) return;
    autoDoneRef.current = true;
    clearCart();
    notify('Paiement confirmé avec succès !', 'success');
    const timer = setTimeout(() => {
      navigate('/menu', {
        replace: true,
        state: {
          stockUpdated: true,
          stockSummary: `${order.items.length} produit${order.items.length > 1 ? 's' : ''} mis a jour`,
        },
      });
    }, 2000);
    return () => clearTimeout(timer);
  }, [paymentLifecycle, order, clearCart, navigate, notify]);

  if (!order) return null;

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('fr-MG', { style: 'currency', currency: 'MGA', minimumFractionDigits: 0 }).format(price);

  const handleManualConfirm = () => {
    updateOrderStatus(order.id, 'paid');
    clearCart();
    notify('Paiement confirmé avec succès !', 'success');
    navigate('/menu', {
      replace: true,
      state: {
        stockUpdated: true,
        stockSummary: `${order.items.length} produit${order.items.length > 1 ? 's' : ''} mis a jour`,
      },
    });
  };

  const providerName =
    order.paymentMethod === 'orange_money' ? 'Orange Money' :
    order.paymentMethod === 'mvola' ? 'Mvola' : 'Airtel Money';

  const providerColor =
    order.paymentMethod === 'orange_money' ? 'bg-orange-500' :
    order.paymentMethod === 'mvola' ? 'bg-green-600' : 'bg-red-500';

  const payInfo = paymentNumbers[order.paymentMethod];

  const ussdCode =
    order.paymentMethod === 'orange_money' ? `#144*1*${payInfo?.number}*${order.total}#` :
    order.paymentMethod === 'mvola' ? `*111*1*${payInfo?.number}*${order.total}#` :
    `*444*1*${payInfo?.number}*${order.total}#`;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Statut du paiement */}
        <div className="mb-6">
          {paymentLifecycle === 'initiating' && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 text-center">
              <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
              <h2 className="text-lg font-bold text-blue-800">Initialisation du paiement...</h2>
              <p className="text-sm text-blue-600 mt-2">Connexion au service {providerName}</p>
            </div>
          )}

          {paymentLifecycle === 'paid' && (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-green-800">Paiement réussi !</h2>
              <p className="text-green-600 mt-2 text-lg font-semibold">{formatPrice(order.total)}</p>
              {paymentRef && <p className="text-sm text-green-500 mt-2">Réf: {paymentRef}</p>}
              <p className="text-sm text-green-600 mt-4">Redirection en cours...</p>
            </div>
          )}

          {paymentLifecycle === 'failed' && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-red-800">Échec du paiement</h2>
              <p className="text-sm text-red-600 mt-2">Le paiement n'a pas pu être traité.</p>
              <button
                onClick={() => { setPaymentLifecycle('idle'); autoDoneRef.current = false; setTransactionId(null); }}
                className="mt-4 px-6 py-2 bg-red-600 text-white rounded-full font-semibold hover:bg-red-700 transition-colors"
              >
                Réessayer
              </button>
            </div>
          )}

          {paymentLifecycle === 'pending' && (
            <div className="space-y-4">
              {/* Info commande */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border">
                <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-3">Commande #{order.id.slice(0, 8)}</h2>
                <div className="space-y-2">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-300">{item.product.name} ×{item.quantity}</span>
                      <span className="font-medium">{formatPrice(item.product.price * item.quantity)}</span>
                    </div>
                  ))}
                  <div className="border-t pt-2 mt-2 flex justify-between font-bold text-base">
                    <span>Total</span>
                    <span className="text-indigo-600">{formatPrice(order.total)}</span>
                  </div>
                </div>
              </div>

              {/* Provider info */}
              <div className={`${providerColor} text-white rounded-2xl p-5 shadow-sm`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                    <span className="text-xl">📱</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">{providerName}</h3>
                    <p className="text-sm opacity-90">{payInfo?.merchantName || 'Marchand'} • {payInfo?.number}</p>
                  </div>
                </div>
                <p className="text-2xl font-bold text-center my-3">{formatPrice(order.total)}</p>
                {paymentRef && (
                  <p className="text-xs text-center opacity-80">Réf: {paymentRef}</p>
                )}
                {countdown > 0 && (
                  <div className="mt-3 text-center">
                    <div className="inline-flex items-center gap-2 bg-white/20 rounded-full px-4 py-2">
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      <span className="text-sm">Confirmation en cours ({countdown}s)</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Appel USSD */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border">
                <h3 className="font-bold text-gray-800 dark:text-white mb-3">Payer par téléphone</h3>
                <a
                  href={`tel:${ussdCode}`}
                  className={`w-full flex items-center justify-center gap-2 ${providerColor} text-white py-3 rounded-xl font-semibold text-base hover:opacity-90 transition-opacity`}
                >
                  <span>📞</span> Appeler pour payer
                </a>
                <p className="text-xs text-gray-500 text-center mt-2">Code USSD: {ussdCode}</p>
              </div>

              {/* Confirmation manuelle */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border">
                <h3 className="font-bold text-gray-800 dark:text-white mb-3">Confirmation manuelle</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                  Si vous avez déjà effectué le paiement, cliquez ci-dessous pour confirmer.
                </p>
                <button
                  onClick={handleManualConfirm}
                  className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold text-base hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg"
                >
                  ✅ J'ai effectué le paiement
                </button>
              </div>

              {/* Retour */}
              <button
                onClick={() => navigate(-1)}
                className="w-full py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                ← Retour
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Payment;
