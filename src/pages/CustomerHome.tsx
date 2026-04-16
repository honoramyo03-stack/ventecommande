import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutList, LayoutGrid } from 'lucide-react';
import Header from '../components/Header';
import ProductCard from '../components/ProductCard';
import { useOrders } from '../contexts/OrdersContext';
import { useCustomer } from '../contexts/CustomerContext';
import { useChat } from '../contexts/ChatContext';
import { useNotification } from '../contexts/NotificationContext';
import { apiRequest } from '../lib/api';

const stripAnnouncementHtml = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .trim();

const hasAnnouncementContent = (text: string, image: string, reactionButtonsCount: number) =>
  stripAnnouncementHtml(text).length > 0 || image.trim().length > 0 || reactionButtonsCount > 0;

const formatAnnouncementDate = (value?: string) => {
  if (!value) return '';

  try {
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
};

const CustomerHome: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { products, restaurantSettings } = useOrders();
  const { customer, isLoggedIn, isReady } = useCustomer();
  const { setCurrentTableNumber, setCurrentCustomerName } = useChat();
  const { notify } = useNotification();
  const [selectedCategory, setSelectedCategory] = useState('Tous');
  const [showStockBadge, setShowStockBadge] = useState(false);
  const [stockSummary, setStockSummary] = useState('Stock mis a jour');
  const [selectedReactionButtonId, setSelectedReactionButtonId] = useState<string | null>(null);
  const [reactingButtonId, setReactingButtonId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => {
    const saved = localStorage.getItem('quickorder_viewmode');
    return (saved === 'grid' ? 'grid' : 'list') as 'list' | 'grid';
  });

  // Vérifier si le client est connecté
  useEffect(() => {
    if (!isReady) return;

    if (!isLoggedIn) {
      navigate('/', { replace: true });
    } else if (customer) {
      setCurrentTableNumber(customer.tableNumber);
      setCurrentCustomerName(customer.name);
    }
  }, [isReady, isLoggedIn, customer, navigate, setCurrentTableNumber, setCurrentCustomerName]);

  // Sauvegarder la préférence de vue
  useEffect(() => {
    localStorage.setItem('quickorder_viewmode', viewMode);
  }, [viewMode]);

  // Afficher un badge de confirmation quand le stock est mis a jour apres commande.
  useEffect(() => {
    const state = location.state as { stockUpdated?: boolean; stockSummary?: string } | null;
    if (!state?.stockUpdated) return;

    setStockSummary(state.stockSummary || 'Stock mis a jour');
    setShowStockBadge(true);

    const timer = window.setTimeout(() => {
      setShowStockBadge(false);
    }, 4500);

    navigate('/menu', { replace: true, state: {} });

    return () => window.clearTimeout(timer);
  }, [location.state, navigate]);

  useEffect(() => {
    if (!customer || !restaurantSettings.announcementRevision) {
      setSelectedReactionButtonId(null);
      return;
    }

    let cancelled = false;
    const loadReactionStatus = async () => {
      try {
        const response = await apiRequest<{ selectedButtonId: string | null; announcementRevision: string | null }>(
          `/api/announcement/reactions/status?name=${encodeURIComponent(customer.name)}&tableNumber=${customer.tableNumber}`
        );
        if (!cancelled) {
          setSelectedReactionButtonId(response.selectedButtonId ?? null);
        }
      } catch {
        if (!cancelled) {
          setSelectedReactionButtonId(null);
        }
      }
    };

    loadReactionStatus();
    return () => {
      cancelled = true;
    };
  }, [customer, restaurantSettings.announcementRevision]);

  // Extraire les catégories uniques des produits
  const categories = ['Tous', ...Array.from(new Set(products.map(p => p.category)))];

  // Filtrer les produits disponibles uniquement
  // Seul le bouton Actif/Inactif du vendeur contrôle l'affichage
  // La quantité est juste informative (stock disponible)
  const activeProducts = products.filter(p => p.isActive);

  const filteredProducts =
    selectedCategory === 'Tous'
      ? activeProducts
      : activeProducts.filter((p) => p.category === selectedCategory);
  const hasActiveAnnouncement =
    restaurantSettings.announcementEnabled &&
    hasAnnouncementContent(
      restaurantSettings.announcementText,
      restaurantSettings.announcementImage,
      restaurantSettings.announcementReactionButtons.length
    );
  const announcementPublishedAtLabel = formatAnnouncementDate(restaurantSettings.announcementPublishedAt);
  const welcomeHelperText = hasActiveAnnouncement
    ? 'Consultez la publication du vendeur ci-dessous avant de choisir vos produits.'
    : 'Sélectionnez vos produits et validez votre commande. Paiement rapide via Mobile Money.';

  const handleReactToAnnouncement = async (buttonId: string) => {
    if (!customer) return;

    setReactingButtonId(buttonId);
    try {
      const response = await apiRequest<{ selectedButtonId: string | null }>('/api/announcement/reactions', {
        method: 'POST',
        body: {
          buttonId,
          customerName: customer.name,
          tableNumber: customer.tableNumber,
        },
      });
      setSelectedReactionButtonId(response.selectedButtonId ?? null);
      notify(response.selectedButtonId ? 'Réaction enregistrée' : 'Réaction retirée', 'success');
    } catch {
      notify("Impossible d'enregistrer votre réaction pour le moment", 'error');
    } finally {
      setReactingButtonId(null);
    }
  };

  if (!isReady) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-base text-gray-500">
        Chargement de votre session...
      </div>
    );
  }

  if (!isLoggedIn) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header />

      {/* Categories + Toggle vue */}
      <div className="sticky top-[98px] sm:top-[64px] bg-white z-20 border-b border-gray-100 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-4 py-3 flex items-center gap-3">
          {/* Catégories scrollables */}
          <div className="flex gap-2 overflow-x-auto flex-1 scrollbar-hide">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Bouton bascule liste/grille */}
          <div className="flex items-center bg-gray-100 rounded-lg p-1 flex-shrink-0">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-all ${
                viewMode === 'list'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              title="Vue en liste"
            >
              <LayoutList size={18} />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-md transition-all ${
                viewMode === 'grid'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              title="Vue en grille"
            >
              <LayoutGrid size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Banner / Info */}
      <div className="max-w-[1400px] mx-auto px-4 mt-5 sm:mt-6">
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl p-4 sm:p-5 mb-5 sm:mb-6 space-y-4">
          <div>
            <h2 className="font-semibold text-indigo-800 text-base sm:text-lg mb-1">
              👋 Bienvenue {customer?.name} !
            </h2>
            <p className="text-indigo-600 text-sm sm:text-base">
              {welcomeHelperText}
            </p>
          </div>

          {hasActiveAnnouncement && (
            <div className="rounded-3xl border border-indigo-200 bg-white/95 p-4 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-500">
                    Publication du vendeur
                  </p>
                  <p className="mt-1 text-sm text-indigo-600">
                    Cette annonce apparait sous votre message de bienvenue et se met a jour automatiquement.
                  </p>
                  {announcementPublishedAtLabel && (
                    <p className="mt-2 text-xs font-medium text-slate-500">
                      Publiée le {announcementPublishedAtLabel}
                    </p>
                  )}
                </div>
                <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                  En direct
                </span>
              </div>

              <div className="mt-4 rounded-3xl border border-indigo-100 bg-gradient-to-b from-white to-indigo-50/70 p-4">
                {restaurantSettings.announcementText && (
                  <div
                    className="mb-3 whitespace-pre-wrap break-words text-sm text-slate-800 sm:text-base"
                    dangerouslySetInnerHTML={{ __html: restaurantSettings.announcementText }}
                  />
                )}
                {restaurantSettings.announcementImage && (
                  <div className="overflow-hidden rounded-3xl border border-indigo-100 bg-indigo-50">
                    <img
                      src={restaurantSettings.announcementImage}
                      alt="Publication vendeur"
                      className="w-full object-cover max-h-56"
                    />
                  </div>
                )}
                {restaurantSettings.announcementReactionButtons.length > 0 && (
                  <div className="mt-4 border-t border-indigo-100 pt-4">
                    <p className="mb-3 text-sm font-semibold text-slate-700">Réagissez à cette publication</p>
                    <div className="flex flex-wrap gap-2">
                      {restaurantSettings.announcementReactionButtons.map((button) => {
                        const isSelected = selectedReactionButtonId === button.id;
                        const isLoading = reactingButtonId === button.id;
                        const count = restaurantSettings.announcementReactionCounts[button.id] || 0;

                        return (
                          <button
                            key={button.id}
                            type="button"
                            onClick={() => handleReactToAnnouncement(button.id)}
                            disabled={Boolean(reactingButtonId)}
                            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-all ${
                              isSelected
                                ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm'
                                : 'border-indigo-100 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50'
                            } disabled:cursor-not-allowed disabled:opacity-60`}
                          >
                            <span>{button.emoji || '💬'}</span>
                            <span>{button.label}</span>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                              isSelected ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-700'
                            }`}>
                              {isLoading ? '...' : count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {showStockBadge && (
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-800 px-4 py-2 text-sm font-semibold animate-pulse">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-600" />
            Stock mis a jour
            <span className="text-emerald-700 font-medium">({stockSummary})</span>
          </div>
        )}

        {/* Nombre de produits */}
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <p className="text-sm text-gray-500">
            {filteredProducts.length} produit{filteredProducts.length > 1 ? 's' : ''} disponible{filteredProducts.length > 1 ? 's' : ''}
          </p>
          <p className="text-sm text-gray-400 flex items-center gap-1">
            {viewMode === 'list' ? (
              <><LayoutList size={14} /> Vue en liste</>
            ) : (
              <><LayoutGrid size={14} /> Vue en grille</>
            )}
          </p>
        </div>

        {/* Produits */}
        {viewMode === 'list' ? (
          // Vue en liste: 3 colonnes sur grand ecran
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
            {filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} viewMode="list" />
            ))}
          </div>
        ) : (
          // Vue en grille: 5 colonnes sur grand ecran
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
            {filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} viewMode="grid" />
            ))}
          </div>
        )}

        {filteredProducts.length === 0 && (
          <div className="text-center py-16 text-gray-500 text-base">
            Aucun produit disponible dans cette catégorie.
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerHome;
