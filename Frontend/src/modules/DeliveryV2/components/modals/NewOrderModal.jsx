import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, MapPin, FastForward, Clock, Phone, ChefHat, ChevronDown, ShoppingBag } from 'lucide-react';
import { ActionSlider } from '@/modules/DeliveryV2/components/ui/ActionSlider';
import { useDeliveryStore } from '@/modules/DeliveryV2/store/useDeliveryStore';
import { getHaversineDistance, calculateETA } from '@/modules/DeliveryV2/utils/geo';
import { BRAND_THEME } from '@/config/brandTheme';

/**
 * NewOrderModal - Ported to Original 1:1 Theme with Slider Accept.
 * Matches the Zomato/Swiggy style Green Header + White Card.
 */
export const NewOrderModal = ({ order, onAccept, onReject, onMinimize }) => {
  const { riderLocation } = useDeliveryStore();
  const [timeLeft, setTimeLeft] = useState(30);

  useEffect(() => {
    if (timeLeft <= 0) {
      onReject(order, 'timeout');
      return;
    }
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, onReject, order]);

  const { distanceKm, etaMins } = useMemo(() => {
    if (!order) return { distanceKm: null, etaMins: null };

    // A. Use provided data if available (Direct distance from socket)
    const rawDist = order.pickupDistanceKm || order.distanceKm;
    const rawEta = order.estimatedTime || order.duration || order.eta;
    
    if (rawDist != null) {
      return { 
        distanceKm: Number(rawDist).toFixed(1), 
        etaMins: rawEta && rawEta > 0 ? Math.ceil(rawEta) : Math.ceil((rawDist * 1000) / 416) + 5
      };
    }

    // B. Calculate from locations (Local calculation fallback)
    const rest = order.restaurantLocation || order.restaurantId?.location || {};
    const resLat = parseFloat(order.restaurant_lat || order.restaurantLat || rest.latitude || rest.lat);
    const resLng = parseFloat(order.restaurant_lng || order.restaurantLng || rest.longitude || rest.lng);

    if (riderLocation && !isNaN(resLat) && !isNaN(resLng)) {
      const distM = getHaversineDistance(
        riderLocation.lat, riderLocation.lng,
        resLat, resLng
      );
      const km = distM / 1000;
      // Assume 25km/h avg for initial estimate (roughly 416m/min)
      const mins = Math.ceil(distM / 416) + (order.prepTime || 5);
      
      return { 
        distanceKm: km.toFixed(1), 
        etaMins: mins 
      };
    }

    return { distanceKm: '??', etaMins: order.prepTime || 15 };
  }, [order, riderLocation]);

  if (!order) return null;

  const earnings = order.earnings || order.riderEarning || (order.orderAmount ? order.orderAmount * 0.1 : 0);
  const restaurantName = order.restaurantName || order.restaurant_name || (order.restaurantId?.name) || 'Restaurant';
  const restaurantAddress = order.restaurantAddress || order.restaurant_address || (order.restaurantId?.location?.address) || 'Address not available';
  const deliveryAddress = order?.deliveryAddress || {};

  const geoCoords =
    Array.isArray(deliveryAddress?.location?.coordinates) &&
    deliveryAddress.location.coordinates.length >= 2
      ? {
          lng: deliveryAddress.location.coordinates[0],
          lat: deliveryAddress.location.coordinates[1],
        }
      : null;

  const customerLocation = order.customerLocation || order.deliveryLocation || geoCoords || null;

  const addressPartsFromSchema = [
    deliveryAddress.street,
    deliveryAddress.additionalDetails,
    deliveryAddress.city,
    deliveryAddress.state,
    deliveryAddress.zipCode,
  ]
    .map((v) => String(v || '').trim())
    .filter(Boolean);

  const customerAddress =
    order.customerAddress ||
    order.customer_address ||
    (addressPartsFromSchema.length ? addressPartsFromSchema.join(', ') : '') ||
    (customerLocation?.lat != null && customerLocation?.lng != null
      ? `Lat ${Number(customerLocation.lat).toFixed(5)}, Lng ${Number(customerLocation.lng).toFixed(5)}`
      : 'Location not available');

  const mapsLink =
    customerLocation?.lat != null && customerLocation?.lng != null
      ? `https://www.google.com/maps?q=${encodeURIComponent(
          `${customerLocation.lat},${customerLocation.lng}`,
        )}`
      : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-x-0 bottom-0 h-full z-150 bg-black/60 flex items-end justify-center p-0"
    >
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        className="w-full max-w-lg bg-white rounded-t-[2.5rem] overflow-x-hidden overflow-y-auto shadow-[0_-20px_60px_rgba(0,0,0,0.5)] flex flex-col pt-1 max-h-[90vh]"
      >
        {/* Handle / Minimize */}
        <div className="w-full flex justify-center pb-1.5 pt-1 bg-white relative z-10 rounded-t-[2.5rem] -mb-[4px]">
          <button onClick={onMinimize} className="p-1 hover:bg-gray-100 active:scale-95 transition-all rounded-full flex flex-col items-center">
             <ChevronDown className="w-6 h-6 text-gray-300 stroke-3" />
          </button>
        </div>

        {/* Header Ribbon (Brand Theme) */}
        <div 
          className="p-6 flex justify-between items-center text-white border-b border-black/10"
          style={{ background: BRAND_THEME.gradients.primary }}
        >
          <div>
            <p className="text-white/80 text-[8px] font-bold uppercase tracking-widest mb-1">Incoming Request</p>
            <h2 className="text-3xl font-bold tracking-tighter">₹{Number(earnings || 0).toFixed(2)}</h2>
          </div>
          <div className="bg-white/20 border border-white/30 rounded-2xl px-5 py-2.5 text-white font-bold text-xl shadow-inner tabular-nums">
            {timeLeft}s
          </div>
        </div>

        {/* Info Body */}
        <div className="p-6 pb-8 space-y-7">
          <div className="flex gap-5">
            <div className="flex flex-col items-center gap-1.5 mt-2 py-1">
              <div 
                className="w-5 h-5 rounded-full border-4 shadow-lg" 
                style={{ 
                  backgroundColor: BRAND_THEME.colors.semantic.success,
                  borderColor: BRAND_THEME.colors.semantic.successSoft,
                  boxShadow: `0 10px 15px -3px ${BRAND_THEME.colors.semantic.success}33`
                }}
              />
              <div className="w-0.5 h-16 bg-dashed border-l-2 border-gray-100" />
              <div 
                className="w-5 h-5 rounded-full border-4 shadow-lg"
                style={{ 
                  backgroundColor: BRAND_THEME.colors.brand.primary,
                  borderColor: BRAND_THEME.colors.brand.primarySoft,
                  boxShadow: `0 10px 15px -3px ${BRAND_THEME.colors.brand.primary}33`
                }}
              />
            </div>
            <div className="flex-1 space-y-7">
              <div>
                <div 
                  className="flex items-center gap-2 mb-2 font-bold text-[10px] uppercase tracking-widest"
                  style={{ color: BRAND_THEME.colors.semantic.success }}
                >
                  <ChefHat className="w-4 h-4" />
                  <span>Restaurant Pickup</span>
                </div>
                <p className="text-gray-950 font-extrabold text-xl leading-tight">{restaurantName}</p>
                <p className="text-gray-500 text-sm font-medium leading-relaxed">{restaurantAddress}</p>
              </div>
              <div>
                <div 
                  className="flex items-center gap-2 mb-2 font-bold text-[10px] uppercase tracking-widest"
                  style={{ color: BRAND_THEME.colors.brand.primary }}
                >
                  <MapPin className="w-4 h-4" />
                  <span>Customer Drop</span>
                </div>
                <p className="text-gray-950 font-extrabold text-xl leading-tight">Customer Location</p>
                <p className="text-gray-500 text-sm font-medium line-clamp-2">{customerAddress}</p>
                {mapsLink && (
                  <a
                    href={mapsLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex mt-2 text-[10px] font-bold uppercase tracking-widest hover:opacity-80 transition-opacity"
                    style={{ color: BRAND_THEME.colors.brand.primary }}
                  >
                    Open in Google Maps
                  </a>
                )}
              </div>
            </div>
          </div>
          
          {/* Order Items Section - Refined for Neat & Clean Look */}
          {order.items && order.items.length > 0 && (
            <div className="bg-gray-50/50 rounded-2xl p-4 border border-gray-100/50">
              <div 
                className="flex items-center gap-2 mb-3 font-bold text-[10px] uppercase tracking-widest"
                style={{ color: BRAND_THEME.colors.brand.primary }}
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Order Items ({order.items.length})</span>
              </div>
              
              <div className="space-y-3 max-h-[140px] overflow-y-auto pr-1 custom-scrollbar">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center py-0.5">
                    <div className="flex items-center gap-3">
                      {item.isVeg !== undefined && (
                        <div className={`w-3.5 h-3.5 border ${item.isVeg ? "border-green-600" : "border-red-600"} flex items-center justify-center p-[1px]`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${item.isVeg ? "bg-green-600" : "bg-red-600"}`} />
                        </div>
                      )}
                      <span className="text-sm font-bold text-gray-800">
                        {item.quantity || item.qty || 1} <span className="text-gray-400 mx-1">×</span> {item.name || item.foodName}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
             <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center gap-3">
               <Clock className="w-4 h-4 text-orange-500" />
               <div className="flex flex-col">
                  <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Time</span>
                  <span className="text-xs font-bold text-gray-900">{etaMins} MINS</span>
               </div>
             </div>
             <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center gap-3">
               <MapPin className="w-4 h-4 text-gray-400" />
               <div className="flex flex-col">
                  <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Distance</span>
                  <span className="text-xs font-bold text-gray-900">{distanceKm} KM</span>
               </div>
             </div>
          </div>

          {/* Action Area */}
          <div className="space-y-4">
            <ActionSlider 
              label="Slide to Accept" 
              onConfirm={() => onAccept(order)} 
              containerStyle={{ backgroundColor: BRAND_THEME.colors.brand.primarySoft }}
              style={{ background: BRAND_THEME.gradients.primary }}
              successLabel="Order Accepted"
            />

            <button 
              onClick={() => onReject(order, 'passed')}
              className="w-full text-gray-400 font-bold text-[9px] uppercase tracking-widest hover:text-red-500 transition-colors py-1 active:scale-95"
            >
              Pass this task
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
