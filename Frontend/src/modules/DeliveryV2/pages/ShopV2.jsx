import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { deliveryAPI } from '@food/api';
import { initRazorpayPayment } from '@food/utils/razorpay';
import { toast } from 'sonner';
import {
  ShoppingBag, Search, Package, X, ChevronRight,
  Loader2, ShoppingCart, CheckCircle2, Clock, ListOrdered, Store
} from 'lucide-react';
import { BRAND_THEME } from '@/config/brandTheme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RUPEE = '₹';
const statusColor = (s) => {
  const map = { confirmed: 'bg-blue-50 text-blue-700', delivered: 'bg-green-50 text-green-700', cancelled: 'bg-red-50 text-red-700', pending: 'bg-yellow-50 text-yellow-700' };
  return map[s] || 'bg-gray-100 text-gray-600';
};

// ─── Product Card ──────────────────────────────────────────────────────────────

function ProductCard({ product, onOrder }) {
  const hasStock = (product.variants || []).some(v => v.stock > 0);
  const lowestPrice = (product.variants || []).length > 0
    ? Math.min(...product.variants.map(v => Number(v.price) || 0))
    : 0;

  return (
    <div
      className="bg-white rounded-2xl shadow-[0px_4px_16px_rgba(0,0,0,0.06)] border border-gray-200 overflow-hidden active:bg-gray-50 transition-colors cursor-pointer flex flex-col"
      onClick={() => onOrder(product)}
    >
      <div className="relative h-28 bg-blue-50/50 border-b border-gray-100 shrink-0">
        {product.image ? (
          <img src={product.image} alt={product.name} className="w-full h-full object-cover mix-blend-multiply" onError={e => e.target.style.display = 'none'} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-6 h-6 text-blue-200" />
          </div>
        )}
        {!hasStock && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center">
            <span className="text-gray-600 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 bg-white border border-gray-200 rounded-md shadow-sm">Out of Stock</span>
          </div>
        )}
        {product.category && (
          <span className="absolute top-1.5 left-1.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-white border border-gray-100 text-blue-800 shadow-sm">
            {product.category}
          </span>
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col justify-between">
        <h3 className="font-bold text-gray-900 text-xs leading-snug line-clamp-2 mb-2">{product.name}</h3>
        <div className="flex items-center justify-between gap-1 mt-auto">
          <div className="min-w-0 pr-1">
            {(product.variants || []).length > 0 ? (
              <p className="text-sm font-black text-gray-900 truncate">
                {RUPEE}{(product.variants[0]?.price) || 0}
              </p>
            ) : (
              <p className="text-sm font-black text-gray-900 truncate">
                {RUPEE}{Number(product.price) || 0}
              </p>
            )}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onOrder(product); }}
            disabled={!hasStock}
            className={`shrink-0 flex items-center justify-center w-7 h-7 rounded-lg transition-colors ${
              hasStock ? 'bg-blue-600 text-white shadow-sm active:bg-blue-700' : 'bg-gray-100 text-gray-400'
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Order Modal ───────────────────────────────────────────────────────────────

function OrderModal({ product, onClose, onSuccess }) {
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState('razorpay');
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    if (product) {
      const firstAvailable = (product.variants || []).find(v => v.stock > 0);
      setSelectedVariant(firstAvailable || null);
      setQuantity(1);
      setPaymentMethod('razorpay');
    }
  }, [product]);

  if (!product) return null;

  const totalAmount = selectedVariant ? selectedVariant.price * quantity : 0;
  const maxQty = selectedVariant ? selectedVariant.stock : 0;

  const handlePlace = async () => {
    if (!selectedVariant) { toast.error('Please select a variant'); return; }
    try {
      setPlacing(true);
      const res = await deliveryAPI.placeStoreOrder({
        productId: product._id,
        variantId: selectedVariant._id,
        quantity,
        paymentMethod: 'razorpay'
      });
      
      const sessionData = res?.data?.data || res?.data;
      if (!sessionData?.razorpayOrderId) throw new Error("Could not initialize payment");
      
      const orderData = sessionData.order;

      await initRazorpayPayment({
        key: sessionData.razorpayKeyId,
        amount: sessionData.amount,
        order_id: sessionData.razorpayOrderId,
        name: 'Store Shop',
        description: `Order for ${product.name}`,
        handler: async (response) => {
          try {
            await deliveryAPI.verifyStoreOrder({
              orderId: orderData._id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature
            });
            toast.success('Order placed and payment verified!');
            onSuccess();
            onClose();
          } catch (err) {
            toast.error('Payment verification failed');
          }
        },
        onError: (err) => {
          toast.error(err.description || 'Payment Failed');
          setPlacing(false);
        },
        onClose: () => {
          setPlacing(false);
        }
      });
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to initialize order');
      setPlacing(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[800] flex items-end sm:items-center justify-center px-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
          className="relative w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden mb-10 sm:mb-0"
        >
          {/* Header */}
          <div className="flex items-start justify-between p-4 border-b border-gray-100">
            <div className="pr-4">
              <h2 className="font-bold text-gray-900 text-sm">{product.name}</h2>
              {product.category && <p className="text-xs text-gray-500 mt-0.5">{product.category}</p>}
            </div>
            <button onClick={onClose} className="shrink-0 p-1 bg-gray-50 rounded-lg text-gray-500 hover:bg-gray-100">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Variants */}
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2">Select Variant</p>
              <div className="space-y-1.5">
                {(product.variants || []).map(v => (
                  <button
                    key={v._id}
                    disabled={v.stock === 0}
                    onClick={() => { setSelectedVariant(v); setQuantity(1); }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border transition-all ${
                      selectedVariant?._id === v._id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${selectedVariant?._id === v._id ? 'border-blue-500' : 'border-gray-300'}`}>
                        {selectedVariant?._id === v._id && <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                      </div>
                      <div className="text-left">
                        <p className="font-semibold text-gray-800 text-[13px]">{v.name}</p>
                        <p className="text-[10px] text-gray-400">Stock: {v.stock}</p>
                      </div>
                    </div>
                    <p className="font-bold text-gray-900 text-sm">{RUPEE}{v.price}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Quantity */}
            {selectedVariant && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs font-semibold text-gray-700">Quantity</p>
                <div className="flex items-center gap-3">
                  <button onClick={() => setQuantity(q => Math.max(1, q - 1))} className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center text-gray-600 bg-gray-50 active:bg-gray-100 transition-colors">−</button>
                  <span className="text-sm font-bold text-gray-900 min-w-[1rem] text-center">{quantity}</span>
                  <button onClick={() => setQuantity(q => Math.min(maxQty, q + 1))} disabled={quantity >= maxQty} className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center text-gray-600 bg-gray-50 disabled:opacity-40 active:bg-gray-100 transition-colors">+</button>
                </div>
              </div>
            )}

            {/* Payment Method */}
            <div className="pt-2">
              <p className="text-xs font-semibold text-gray-700 mb-2">Payment</p>
              <div className="w-full flex items-center justify-between p-3 rounded-lg border border-blue-200 bg-blue-50">
                <div className="flex flex-col text-left">
                  <p className="font-bold text-[13px] text-gray-900">Online Payment</p>
                  <p className="text-[10px] text-gray-500">Razorpay Secured</p>
                </div>
                <CheckCircle2 className="w-4 h-4 text-blue-500" />
              </div>
            </div>
          </div>
          
          {/* Footer Action */}
          {selectedVariant && (
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-4">
              <div>
                 <p className="text-[10px] text-gray-500 font-medium">Order Total</p>
                 <p className="text-base font-bold text-gray-900">{RUPEE}{totalAmount}</p>
              </div>
              <button
                onClick={handlePlace}
                disabled={placing}
                className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60 active:bg-blue-700 transition-colors"
              >
                {placing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
                {placing ? 'Processing' : 'Confirm Order'}
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

// ─── Order History Item ────────────────────────────────────────────────────────

function OrderHistoryItem({ order }) {
  const isStandard = order.variantName === "Standard";
  
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-[0px_2px_10px_rgba(0,0,0,0.04)] p-3 flex flex-col gap-2 mb-3">
      <div className="flex gap-3 items-start">
        <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center shrink-0 border border-orange-100 overflow-hidden">
           {order.productImage ? (
             <img src={order.productImage} alt={order.productName} className="w-full h-full object-cover mix-blend-multiply" />
           ) : (
             <Package className="w-5 h-5 text-orange-500" />
           )}
        </div>
        
        <div className="flex-1 min-w-0 pr-1 pt-0.5">
          <p className="font-bold text-gray-900 text-sm leading-tight truncate">{order.productName || 'Store Item'}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${statusColor(order.orderStatus)}`}>
              {order.orderStatus}
            </span>
            <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap">
              {new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
            </span>
          </div>
        </div>
        
        <div className="text-right shrink-0 pt-0.5">
           <p className="font-black text-gray-900 text-[15px]">{RUPEE}{order.totalAmount}</p>
        </div>
      </div>
      
      <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 mt-1">
        <p className="text-xs text-gray-500 flex items-center justify-between">
           <span>Variant: <span className="font-semibold text-gray-800">{order.variantName}</span></span>
           <span>Qty: <span className="font-semibold text-gray-800">{order.quantity}</span></span>
        </p>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function ShopV2() {
  const [activeTab, setActiveTab] = useState('browse'); // 'browse' | 'orders'
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [ordersLoaded, setOrdersLoaded] = useState(false);

  // Fetch products
  const fetchProducts = useCallback(async () => {
    try {
      setLoadingProducts(true);
      const res = await deliveryAPI.getStoreProducts({ limit: 100 });
      const list = res?.data?.data?.products || res?.data?.products || [];
      setProducts(list);
    } catch {
      toast.error('Failed to load products');
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  // Fetch orders
  const fetchOrders = useCallback(async () => {
    try {
      setLoadingOrders(true);
      const res = await deliveryAPI.getMyStoreOrders({ limit: 50 });
      const list = res?.data?.data?.orders || [];
      setOrders(list);
      setOrdersLoaded(true);
    } catch {
      toast.error('Failed to load orders');
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  useEffect(() => {
    if (activeTab === 'orders' && !ordersLoaded) fetchOrders();
  }, [activeTab, ordersLoaded, fetchOrders]);

  const filteredProducts = products.filter(p =>
    !searchQuery ||
    p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-poppins pb-24">
      
      {/* Normal Compact Header */}
      <div className="bg-white border-b border-gray-100 flex items-center px-4 py-3 sticky top-0 z-30">
        <h1 className="text-base font-bold text-gray-900">Partner Shop</h1>
      </div>

      {/* Tabs */}
      <div className="bg-white px-4 flex border-b border-gray-100 sticky top-[49px] z-30">
        {[
          { key: 'browse', label: 'Browse', icon: ShoppingBag },
          { key: 'orders', label: 'My Orders', icon: ListOrdered },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold transition-all border-b-2 relative ${
              activeTab === tab.key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
            {tab.key === 'orders' && orders.length > 0 && (
              <span className={`w-4 h-4 text-[9px] font-bold rounded-full flex items-center justify-center ml-1 ${activeTab === tab.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}>
                {orders.length > 9 ? '9+' : orders.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto w-full pt-3 px-3 relative z-10">
        {activeTab === 'browse' ? (
          <>
            {/* Search */}
            <div className="mb-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search store items..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 bg-white rounded-lg border border-gray-200 text-xs text-gray-800 focus:outline-none focus:border-gray-300"
                />
              </div>
            </div>

            {loadingProducts ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <p className="text-[10px] font-medium uppercase tracking-widest">Loading...</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-400">
                <Package className="w-8 h-8 opacity-50" />
                <p className="text-xs font-semibold text-gray-600">No items found</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 pb-4">
                {filteredProducts.map(p => (
                  <ProductCard key={p._id} product={p} onOrder={setSelectedProduct} />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3 pb-4">
            {loadingOrders ? (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-400">
                <ListOrdered className="w-8 h-8 opacity-50" />
                <p className="text-xs font-semibold text-gray-600">No orders placed</p>
                <button
                  onClick={() => setActiveTab('browse')}
                  className="mt-2 text-blue-600 text-[11px] font-bold underline"
                >
                  Browse Store
                </button>
              </div>
            ) : (
              <>
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex gap-2.5 items-start">
                   <Store className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                   <div>
                     <p className="text-xs font-bold text-blue-900 mb-0.5">Contact Notice</p>
                     <p className="text-[10px] text-blue-800 leading-snug">
                       Keep your payment proof ready. Admin will contact you regarding delivery.
                     </p>
                   </div>
                </div>
                
                <div className="space-y-2">
                  {orders.map(o => <OrderHistoryItem key={o._id} order={o} />)}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Order Modal */}
      {selectedProduct && (
        <OrderModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onSuccess={() => {
            fetchProducts();
            setOrdersLoaded(false); // force refetch on next tab switch
          }}
        />
      )}
    </div>
  );
}
