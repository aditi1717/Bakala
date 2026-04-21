import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useDeliveryStore } from '@/modules/DeliveryV2/store/useDeliveryStore';
import { useProximityCheck } from '@/modules/DeliveryV2/hooks/useProximityCheck';
import { useOrderManager } from '@/modules/DeliveryV2/hooks/useOrderManager';
import { useDeliveryNotifications } from '@food/hooks/useDeliveryNotifications';
import { writeOrderTracking } from '@food/realtimeTracking';
import { deliveryAPI, uploadAPI } from '@food/api';
import { toast } from 'sonner';
import { BRAND_THEME } from '@/config/brandTheme';

// Components
import LiveMap from '@/modules/DeliveryV2/components/map/LiveMap';
import { NewOrderModal } from '@/modules/DeliveryV2/components/modals/NewOrderModal';
import { PickupActionModal } from '@/modules/DeliveryV2/components/modals/PickupActionModal';
import { DeliveryVerificationModal } from '@/modules/DeliveryV2/components/modals/DeliveryVerificationModal';
import { OrderSummaryModal } from '@/modules/DeliveryV2/components/modals/OrderSummaryModal';
import ActionSlider from '@/modules/DeliveryV2/components/ui/ActionSlider';

// Sub Pages
import PocketV2 from '@/modules/DeliveryV2/pages/PocketV2';
import HistoryV2 from '@/modules/DeliveryV2/pages/HistoryV2';
import ProfileV2 from '@/modules/DeliveryV2/pages/ProfileV2';
import ExploreV2 from '@/modules/DeliveryV2/pages/ExploreV2';
import ShopV2 from '@/modules/DeliveryV2/pages/ShopV2';

// Icons
import {
  Bell, HelpCircle, AlertTriangle,
  Wallet, History, User as UserIcon, LayoutGrid,
  Plus, Minus, Navigation2, Target, Play, CheckCircle2, Clock, ChevronDown,
  Contact, Package, Store, Phone, Camera, Image as ImageIcon, Loader2
} from 'lucide-react';

import { getHaversineDistance, calculateETA, calculateHeading } from '@/modules/DeliveryV2/utils/geo';
import { useCompanyName } from "@food/hooks/useCompanyName";
import { useNavigate } from 'react-router-dom';
import useNotificationInbox from "@food/hooks/useNotificationInbox";

const USER_RESPONSE_WAIT_SECONDS = 10;
const NO_RESPONSE_BACKEND_STATUS = 'cancelled_by_user_unavailable';
const INCOMING_ORDER_STORAGE_KEY = 'delivery_v2_incoming_order';
const INCOMING_ORDER_TTL_MS = 2 * 60 * 1000;

const pickFirstText = (...values) => {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
};

const normalizeDialPhone = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const hasPlusPrefix = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8) return '';
  return hasPlusPrefix ? `+${digits}` : digits;
};

const extractCustomerContact = (order) => {
  const userObj = order?.user || order?.userId || order?.customer || order?.customerId || {};
  const deliveryAddress = order?.deliveryAddress || order?.address || {};

  const name = pickFirstText(
    order?.userName,
    order?.customerName,
    userObj?.name,
    deliveryAddress?.name,
    deliveryAddress?.fullName,
    'Customer',
  );

  const rawPhone = pickFirstText(
    order?.userPhone,
    order?.customerPhone,
    userObj?.phone,
    deliveryAddress?.phone,
    deliveryAddress?.contactNumber,
    deliveryAddress?.mobile,
  );
  const dialPhone = normalizeDialPhone(rawPhone);
  const phone = rawPhone || dialPhone;

  return { name, phone, dialPhone };
};

/** Minimal bottom-sheet popup (Restored from legacy FeedNavbar) */
function BottomPopup({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[600] flex items-end">
      <div className="absolute inset-0 bg-[#2979FB]/30" onClick={onClose} />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="relative w-full bg-white rounded-t-3xl shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
            <AlertTriangle className="w-4 h-4" />
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

/**
 * DeliveryHomeV2 - Premium 1:1 Match with Original App UI.
 * Featuring logical tab switching for Feed, Pocket, History, and Profile.
 */
export default function DeliveryHomeV2({ tab = 'feed' }) {
  const navigate = useNavigate();
  const { isOnline, toggleOnline, activeOrder, tripStatus, setRiderLocation, setActiveOrder, updateTripStatus, clearActiveOrder } = useDeliveryStore();
  const { isWithinRange, distanceToTarget } = useProximityCheck();
  const { acceptOrder, rejectOrder, reachPickup, pickUpOrder, reachDrop, completeDelivery, resetTrip } = useOrderManager();
  const { newOrder, clearNewOrder, orderStatusUpdate, clearOrderStatusUpdate, isConnected: isSocketConnected, emitLocation } = useDeliveryNotifications();
  const companyName = useCompanyName();
  const { unreadCount: notificationUnreadCount } = useNotificationInbox("delivery", { limit: 20 });

  const [incomingOrder, setIncomingOrder] = useState(null);
  const [currentTab, setCurrentTab] = useState(tab);

  // Track URL changes (Prop changes) to update sub-page content
  useEffect(() => {
    setCurrentTab(tab);
  }, [tab]);

  const [showVerification, setShowVerification] = useState(false);
  const [showEmergencyPopup, setShowEmergencyPopup] = useState(false);
  const [profileImage, setProfileImage] = useState(null);
  const [emergencyNumbers, setEmergencyNumbers] = useState({
    medicalEmergency: "",
    accidentHelpline: "",
    contactPolice: "",
    insurance: "",
  });

  const [isModalMinimized, setIsModalMinimized] = useState(false);
  const [eta, setEta] = useState(null);
  const lastLocationSentAt = useRef(0);
  const lastCoordRef = useRef(null);
  const rollingSpeedRef = useRef([]);
  const lastAutoArrivalRef = useRef({ PICKING_UP: false, PICKED_UP: false });

  const [zoom, setZoom] = useState(14);
  const [isSimMode, setIsSimMode] = useState(false);
  const [simPath, setSimPath] = useState([]);
  const [simIndex, setSimIndex] = useState(0);
  const [simProgress, setSimProgress] = useState(0); // 0 to 1 between points
  const [activePolyline, setActivePolyline] = useState(null);
  const [customerContact, setCustomerContact] = useState(() => ({ name: 'Customer', phone: '', dialPhone: '' }));
  const [isCustomerContactLoading, setIsCustomerContactLoading] = useState(false);
  const [hasContactAttempted, setHasContactAttempted] = useState(false);
  const [responseWaitEndsAt, setResponseWaitEndsAt] = useState(null);
  const [responseWaitSecondsLeft, setResponseWaitSecondsLeft] = useState(0);
  const [noResponseProofUrl, setNoResponseProofUrl] = useState('');
  const [isUploadingNoResponseProof, setIsUploadingNoResponseProof] = useState(false);
  const [isSubmittingNoResponse, setIsSubmittingNoResponse] = useState(false);
  const mapRef = useRef(null);
  const noResponseProofInputRef = useRef(null);
  const lastContactFetchOrderIdRef = useRef(null);

  const isLoggingOut = useRef(false);
  const getOrderIdentity = useCallback((orderLike) => (
    String(
      orderLike?.orderMongoId ||
      orderLike?._id ||
      orderLike?.orderId ||
      orderLike?.id ||
      ''
    ).trim()
  ), []);

  const persistIncomingOrder = useCallback((orderLike) => {
    const orderId = getOrderIdentity(orderLike);
    if (!orderId) return;
    try {
      localStorage.setItem(
        INCOMING_ORDER_STORAGE_KEY,
        JSON.stringify({
          savedAt: Date.now(),
          order: orderLike,
        }),
      );
    } catch {
      // Ignore storage errors.
    }
  }, [getOrderIdentity]);

  const clearPersistedIncomingOrder = useCallback(() => {
    try {
      localStorage.removeItem(INCOMING_ORDER_STORAGE_KEY);
    } catch {
      // Ignore storage errors.
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(INCOMING_ORDER_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      const savedAt = Number(parsed?.savedAt || 0);
      const savedOrder = parsed?.order || null;
      if (!savedOrder || Date.now() - savedAt > INCOMING_ORDER_TTL_MS) {
        clearPersistedIncomingOrder();
        return;
      }

      if (!activeOrder) {
        setIncomingOrder(savedOrder);
      }
    } catch {
      clearPersistedIncomingOrder();
    }
  }, [activeOrder, clearPersistedIncomingOrder]);

  const handleLogout = useCallback(() => {
    if (isLoggingOut.current) return;
    isLoggingOut.current = true;

    // 1. Clear tokens and state
    localStorage.removeItem('delivery_accessToken');
    localStorage.removeItem('delivery_refreshToken');
    localStorage.removeItem('delivery_authenticated');
    localStorage.removeItem('delivery_user');
    localStorage.removeItem(INCOMING_ORDER_STORAGE_KEY);

    // 2. Alert user and redirect
    toast.error("Session Expired", { description: "Please log in again." });
    navigate("/food/delivery/login", { replace: true });

    // Optional: Full refresh after delay ONLY if we're not already on login
    setTimeout(() => {
      if (!window.location.pathname.includes('/login')) {
        window.location.reload();
      }
    }, 1500);
  }, [navigate]);

  useEffect(() => {
    const onAuthFailure = (e) => {
      if (e.detail?.module === 'delivery') {
        handleLogout();
      }
    };
    window.addEventListener('authRefreshFailed', onAuthFailure);
    return () => window.removeEventListener('authRefreshFailed', onAuthFailure);
  }, [handleLogout]);

  // 0. Auto-Simulation Effect (High-Precision Smooth Glide)
  const lastSimUpdateSentAt = useRef(0);
  useEffect(() => {
    let interval;
    if (isSimMode && simPath.length > 1 && simIndex < simPath.length - 1) {
      console.log('[SimAuto] Glide Active √');

      interval = setInterval(() => {
        setSimProgress(prev => {
          const nextProgress = prev + 0.08; // 8% movement per tick

          if (nextProgress >= 1) {
            setSimIndex(idx => idx + 1);
            return 0; // Move to next segment
          }

          const currentPoint = simPath[simIndex];
          const nextPoint = simPath[simIndex + 1];

          if (currentPoint && nextPoint) {
            // Linear Interpolation (LERP)
            const lat = currentPoint.lat + (nextPoint.lat - currentPoint.lat) * nextProgress;
            const lng = currentPoint.lng + (nextPoint.lng - currentPoint.lng) * nextProgress;
            const heading = calculateHeading(currentPoint.lat, currentPoint.lng, nextPoint.lat, nextPoint.lng);

            setRiderLocation({ lat, lng, heading });

            if (mapRef.current) {
              mapRef.current.panTo({ lat, lng });
            }

            // Sync with backend every 2.5 seconds during simulation so customer sees it
            const now = Date.now();
            if (now - lastSimUpdateSentAt.current >= 2000) { // Reduced to 2s to match backend throttle
              lastSimUpdateSentAt.current = now;
              const payload = {
                lat,
                lng,
                heading,
                orderId: activeOrder?.orderId || activeOrder?._id,
                status: 'on_the_way',
                polyline: activePolyline // Include polyline in every stream update for resilience
              };
              // A. HTTP Backup
              deliveryAPI.updateLocation(lat, lng, true, { heading }).catch(() => { });

              // B. SOCKET LIVE (SILKY SMOOTH)
              if (payload.orderId) emitLocation(payload);

              // C. FIREBASE REALTIME DB (Persistent Route for Customer Map)
              if (payload.orderId) {
                writeOrderTracking(payload.orderId, {
                  lat,
                  lng,
                  heading,
                  polyline: activePolyline,
                  status: tripStatus,
                  eta: eta // Publish live ETA to Firebase
                }).catch(() => { });
              }
            }
          }
          return nextProgress;
        });
      }, 50); // 20 FPS movement
    }
    return () => clearInterval(interval);
  }, [isSimMode, simPath, simIndex, activeOrder, emitLocation, activePolyline, eta, tripStatus]);

  // Fetch Emergency numbers and Profile (Restored logic)
  useEffect(() => {
    (async () => {
      try {
        const [emergencyRes, profileRes] = await Promise.all([
          deliveryAPI.getEmergencyHelp(),
          deliveryAPI.getProfile()
        ]);
        if (emergencyRes?.data?.success && emergencyRes.data.data) {
          setEmergencyNumbers(emergencyRes.data.data);
        }
        if (profileRes?.data?.success && profileRes.data.data?.profile) {
          const profile = profileRes.data.data.profile;
          setProfileImage(profile.profileImage?.url || profile.documents?.photo || null);
        }
      } catch (err) { console.warn('Navbar Data Fetch Error:', err); }
    })();
  }, []);

  const emergencyOptions = [
    { title: "Medical Emergency", subtitle: "Call an ambulance", icon: <AlertTriangle className="text-red-600" />, phone: emergencyNumbers.medicalEmergency },
    { title: "Accident Helpline", subtitle: "Report an accident", icon: <AlertTriangle className="text-orange-600" />, phone: emergencyNumbers.accidentHelpline },
    { title: "Contact Police", subtitle: "Nearest police support", icon: <AlertTriangle className="text-blue-600" />, phone: emergencyNumbers.contactPolice },
    { title: "Insurance", subtitle: "Policy & claim help", icon: <AlertTriangle className="text-green-600" />, phone: emergencyNumbers.insurance },
  ];

  // Reset simulation when path, order or mode changes
  useEffect(() => {
    if (isSimMode) {
      console.log('[SimAuto] Resetting simulation playhead...');
      setSimIndex(0);
      setSimProgress(0);
    }
  }, [simPath, tripStatus, isSimMode]);

  // Auto-restore modal when status or content changes

  // Auto-restore modal when status or content changes
  useEffect(() => {
    setIsModalMinimized(false);
  }, [tripStatus, showVerification, incomingOrder]);

  useEffect(() => {
    const orderId = String(activeOrder?.orderId || activeOrder?._id || '').trim();
    if (!orderId || !['PICKED_UP', 'REACHED_DROP'].includes(tripStatus)) {
      setHasContactAttempted(false);
      setResponseWaitEndsAt(null);
      setResponseWaitSecondsLeft(0);
      setNoResponseProofUrl('');
      setIsUploadingNoResponseProof(false);
      setIsSubmittingNoResponse(false);
    }
  }, [activeOrder?.orderId, activeOrder?._id, tripStatus]);

  useEffect(() => {
    if (!responseWaitEndsAt) {
      setResponseWaitSecondsLeft(0);
      return;
    }

    const syncTime = () => {
      const seconds = Math.max(0, Math.ceil((responseWaitEndsAt - Date.now()) / 1000));
      setResponseWaitSecondsLeft(seconds);
    };

    syncTime();
    const intervalId = setInterval(syncTime, 1000);
    return () => clearInterval(intervalId);
  }, [responseWaitEndsAt]);

  useEffect(() => {
    const orderId = String(activeOrder?.orderId || activeOrder?._id || '').trim();
    if (!orderId) {
      setCustomerContact({ name: 'Customer', phone: '', dialPhone: '' });
      setIsCustomerContactLoading(false);
      lastContactFetchOrderIdRef.current = null;
      return;
    }

    const localContact = extractCustomerContact(activeOrder);
    setCustomerContact(localContact);

    const shouldFetch =
      ['PICKED_UP', 'REACHED_DROP'].includes(tripStatus) && !localContact.dialPhone;

    if (!shouldFetch || lastContactFetchOrderIdRef.current === orderId) return;

    lastContactFetchOrderIdRef.current = orderId;
    setIsCustomerContactLoading(true);

    let cancelled = false;
    deliveryAPI
      .getOrderDetails(orderId)
      .then((response) => {
        if (cancelled) return;
        const remoteOrder =
          response?.data?.data?.order ||
          response?.data?.data?.activeOrder ||
          response?.data?.data ||
          null;

        if (!remoteOrder) return;

        const remoteContact = extractCustomerContact(remoteOrder);
        if (remoteContact.dialPhone || remoteContact.phone) {
          setCustomerContact((prev) => ({
            name: remoteContact.name || prev.name || 'Customer',
            phone: remoteContact.phone || prev.phone,
            dialPhone: remoteContact.dialPhone || prev.dialPhone,
          }));
        }
      })
      .catch((error) => {
        console.warn('[DeliveryHomeV2] Customer contact fetch failed:', error);
      })
      .finally(() => {
        if (!cancelled) setIsCustomerContactLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeOrder, tripStatus]);

  const activeOrderForVerification = activeOrder
    ? {
        ...activeOrder,
        userName: customerContact.name || activeOrder.userName,
        userPhone: customerContact.phone || activeOrder.userPhone,
      }
    : activeOrder;

  const startResponseWaitTimer = useCallback(() => {
    setHasContactAttempted(true);
    setResponseWaitEndsAt((current) => {
      if (current && current > Date.now()) return current;
      return Date.now() + USER_RESPONSE_WAIT_SECONDS * 1000;
    });
  }, []);

  const handleContactUserCall = useCallback(() => {
    if (!customerContact.dialPhone) {
      toast.error('Customer phone not available');
      return;
    }
    startResponseWaitTimer();
    toast.success('Call marked as connected. 10-second timer started');
  }, [customerContact.dialPhone, startResponseWaitTimer]);

  const cancelNoResponseFlow = useCallback(() => {
    if (isSubmittingNoResponse) return;
    setHasContactAttempted(false);
    setResponseWaitEndsAt(null);
    setResponseWaitSecondsLeft(0);
    setNoResponseProofUrl('');
    toast.success('No-response flow cancelled. Back to normal handover.');
  }, [isSubmittingNoResponse]);

  const isResponseWaitActive = !!responseWaitEndsAt && responseWaitSecondsLeft > 0;
  const isResponseWaitCompleted = hasContactAttempted && !!responseWaitEndsAt && responseWaitSecondsLeft <= 0;
  const isDropArrivalLockedByWait =
    ['PICKED_UP', 'REACHED_DROP'].includes(tripStatus) && hasContactAttempted && isResponseWaitActive;
  const isDropArrivalSlideDisabled = !isWithinRange || isDropArrivalLockedByWait;
  const waitMinutes = String(Math.floor(responseWaitSecondsLeft / 60)).padStart(2, '0');
  const waitSeconds = String(responseWaitSecondsLeft % 60).padStart(2, '0');
  const deliveryInstructionText = pickFirstText(
    activeOrder?.note,
    activeOrder?.customerNote,
    activeOrder?.instructions,
    activeOrder?.specialInstructions,
    activeOrder?.deliveryInstructions,
  );

  useEffect(() => {
    const shouldLockScroll =
      ['PICKED_UP', 'REACHED_DROP'].includes(tripStatus) && hasContactAttempted && isResponseWaitActive;
    if (!shouldLockScroll) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previousTouchAction = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.touchAction = previousTouchAction;
    };
  }, [hasContactAttempted, isResponseWaitActive, tripStatus]);

  const handleNoResponseProofSelect = useCallback(async (file) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error('Proof image must be under 8MB');
      return;
    }

    setIsUploadingNoResponseProof(true);
    try {
      const response = await uploadAPI.uploadMedia(file, { folder: 'appzeto/delivery/no-response-proof' });
      const uploadedUrl = response?.data?.data?.url || response?.data?.data?.secure_url || '';
      if (!uploadedUrl) throw new Error('Upload failed');
      setNoResponseProofUrl(uploadedUrl);
      toast.success('Proof uploaded');
    } catch (error) {
      console.error('[DeliveryHomeV2] No-response proof upload failed:', error);
      toast.error('Failed to upload proof');
    } finally {
      setIsUploadingNoResponseProof(false);
    }
  }, []);

  const submitNoResponseCancellation = useCallback(async () => {
    const orderId = String(activeOrder?.orderId || activeOrder?._id || '').trim();
    if (!orderId) {
      toast.error('Order not found');
      return;
    }
    if (!isResponseWaitCompleted) {
      toast.error('Please wait for timer completion');
      return;
    }
    if (!noResponseProofUrl) {
      toast.error('Upload proof photo first');
      return;
    }

    setIsSubmittingNoResponse(true);
    try {
      const payload = {
        orderStatus: NO_RESPONSE_BACKEND_STATUS,
        reasonType: 'user_unavailable',
        reason: 'User not responding at drop location',
        noResponseProofImage: noResponseProofUrl,
        callAttempted: hasContactAttempted,
        waitTimerCompletedAt: new Date().toISOString(),
      };

      try {
        await deliveryAPI.updateOrderStatus(orderId, payload);
      } catch (primaryError) {
        const fallbackPayload = { orderStatus: NO_RESPONSE_BACKEND_STATUS };
        await deliveryAPI.updateOrderStatus(orderId, fallbackPayload);
      }
      toast.success('Order marked as user unavailable');
      clearActiveOrder();
      setShowVerification(false);
    } catch (error) {
      console.error('[DeliveryHomeV2] No-response status update failed:', error);
      const apiMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error?.message ||
        error?.response?.data?.errors?.[0]?.message ||
        error?.message;
      toast.error(apiMessage ? `Failed to mark user unavailable: ${apiMessage}` : 'Failed to mark user unavailable');
    } finally {
      setIsSubmittingNoResponse(false);
    }
  }, [activeOrder?.orderId, activeOrder?._id, clearActiveOrder, hasContactAttempted, isResponseWaitCompleted, noResponseProofUrl]);

  // 1. Initial Sync (Force sync with server to avoid 'stuck' persistent state)
  useEffect(() => {
    const syncWithServer = async () => {
      try {
        const response = await deliveryAPI.getCurrentDelivery();
        const rawData = response?.data?.data?.activeOrder || response?.data?.data;
        const serverData = (rawData && (rawData._id || rawData.orderId)) ? rawData : null;

        if (serverData) {
          // Robust location mapping (Same as acceptOrder logic)
          const getLoc = (ref, keysLat, keysLng) => {
            if (!ref) return null;
            if (ref.location) {
              if (Array.isArray(ref.location.coordinates) && ref.location.coordinates.length >= 2) {
                return {
                  lat: ref.location.coordinates[1],
                  lng: ref.location.coordinates[0]
                };
              }
              return {
                lat: ref.location.latitude || ref.location.lat,
                lng: ref.location.longitude || ref.location.lng
              };
            }
            for (const k of keysLat) { if (ref[k] != null) return { lat: ref[k], lng: ref[keysLng[keysLat.indexOf(k)]] }; }
            return null;
          };

          const resLoc = getLoc(serverData.restaurantId, ['latitude', 'lat'], ['longitude', 'lng']) ||
            getLoc(serverData, ['restaurant_lat', 'restaurantLat', 'latitude'], ['restaurant_lng', 'restaurantLng', 'longitude']);

          const cusLoc = getLoc(serverData.deliveryAddress, ['latitude', 'lat'], ['longitude', 'lng']) ||
            getLoc(serverData, ['customer_lat', 'customerLat', 'latitude'], ['customer_lng', 'customerLng', 'longitude']);

          const syncedOrder = {
            ...serverData,
            restaurantLocation: resLoc,
            customerLocation: cusLoc
          };

          setActiveOrder(syncedOrder);

          const backendStatus = serverData.deliveryStatus || serverData.orderState?.status || serverData.orderStatus || serverData.status;
          const currentPhase = serverData.deliveryState?.currentPhase;

          if (['delivered', 'completed', 'DELIVERED'].includes(backendStatus)) {
            updateTripStatus('COMPLETED');
          } else if (currentPhase === 'at_drop' || ['reached_drop', 'REACHED_DROP'].includes(backendStatus)) {
            updateTripStatus('REACHED_DROP');
          } else if (['picked_up', 'PICKED_UP', 'delivering'].includes(backendStatus)) {
            updateTripStatus('PICKED_UP');
          } else if (currentPhase === 'at_pickup' || ['reached_pickup', 'REACHED_PICKUP'].includes(backendStatus)) {
            updateTripStatus('REACHED_PICKUP');
          } else if (['confirmed', 'preparing', 'ready_for_pickup'].includes(backendStatus)) {
            updateTripStatus('PICKING_UP');
          }
        } else {
          clearActiveOrder();
        }
      } catch (err) {
        console.error('Order Sync Failed:', err);
        clearActiveOrder();
      }
    };
    syncWithServer();
  }, []); // Only on mount to stabilize state

  // 1.5 Professional Unified ETA Calculation Hook
  useEffect(() => {
    // If we have distance, calculate ETA. Fallback to 8m/s (28km/h) avg if GPS speed is unknown.
    if (distanceToTarget != null && distanceToTarget !== Infinity) {
      const avgSpeed = rollingSpeedRef.current.length > 0
        ? rollingSpeedRef.current.reduce((a, b) => a + b, 0) / rollingSpeedRef.current.length
        : 8;

      setEta(calculateETA(distanceToTarget, avgSpeed));
    } else {
      setEta(null);
    }
  }, [distanceToTarget]);

  // 2. Online/Offline Status Sync (Low Frequency)
  useEffect(() => {
    deliveryAPI.updateOnlineStatus(isOnline).catch(() => { });
  }, [isOnline]);

  // 3. Location logic (Smart Frequency Tracking)
  useEffect(() => {
    if (!isOnline) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition((pos) => {
      // CRITICAL: In Simulation Mode, we disable actual GPS to prevent overwriting our test position
      if (isSimMode) return;

      const { latitude: lat, longitude: lng, heading, speed } = pos.coords;
      const now = Date.now();

      const currentRiderPos = { lat, lng, heading: heading || 0 };
      setRiderLocation(currentRiderPos);

      // Calculate Rolling Average Speed for Smart ETA
      if (speed && speed > 0) {
        rollingSpeedRef.current = [...rollingSpeedRef.current.slice(-4), speed]; // keep last 5 points
      }

      const avgSpeed = rollingSpeedRef.current.length > 0
        ? rollingSpeedRef.current.reduce((a, b) => a + b, 0) / rollingSpeedRef.current.length
        : speed || 0;

      // ETA update is now handled by a separate globally-synchronized effect

      // Phase 11: Geo-fencing Auto-arrival (within 100m) - Disabled in DEV so UI steps can be tested manually
      if (!isSimMode && !import.meta.env.DEV && distanceToTarget && distanceToTarget <= 100 && !lastAutoArrivalRef.current[tripStatus]) {
        if (tripStatus === 'PICKING_UP') {
          lastAutoArrivalRef.current[tripStatus] = true;
          reachPickup().catch(() => { lastAutoArrivalRef.current[tripStatus] = false; });
          // toast.success('Auto-arrived at Restaurant');
        } else if (tripStatus === 'PICKED_UP') {
          lastAutoArrivalRef.current[tripStatus] = true;
          reachDrop().catch(() => { lastAutoArrivalRef.current[tripStatus] = false; });
          // toast.success('Auto-arrived at Customer');
        }
      }

      // Reset auto-arrival flag if we move away or status resets (usually handled by component mount, but for safety)
      if (distanceToTarget > 200) {
        lastAutoArrivalRef.current[tripStatus] = false;
      }

      // Check threshold for Sync (distance-based or 7s time-based)
      const distMoved = lastCoordRef.current
        ? getHaversineDistance(lat, lng, lastCoordRef.current.lat, lastCoordRef.current.lng)
        : 1000; // assume huge distance if first update

      if (distMoved >= 25 || (now - lastLocationSentAt.current >= 7000)) {
        lastLocationSentAt.current = now;
        lastCoordRef.current = { lat, lng };

        const payload = {
          lat,
          lng,
          heading: heading || 0,
          speed: speed || 0,
          accuracy: pos.coords.accuracy,
          orderId: activeOrder?.orderId || activeOrder?._id,
          status: 'on_the_way',
          polyline: activePolyline
        };

        // A. HTTP Backup
        deliveryAPI.updateLocation(lat, lng, true, {
          heading: heading || 0,
          speed: speed || 0,
          accuracy: pos.coords.accuracy
        }).catch(() => { });

        // B. SOCKET LIVE (SILKY SMOOTH)
        if (payload.orderId) emitLocation(payload);

        // C. FIREBASE REALTIME DB (Persistent)
        if (payload.orderId) {
          writeOrderTracking(payload.orderId, {
            lat,
            lng,
            heading: heading || 0,
            polyline: activePolyline,
            status: tripStatus,
            eta: eta // Publish live ETA to Firebase for customer
          }).catch(() => { });
        }
      }
    }, () => toast.error('GPS Needed!'), {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 5000
    });

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isOnline, setRiderLocation, isSimMode]);

  // 3.5. Background Ping / Heartbeat
  // If watchPosition stops firing (e.g. app in background or device stationary),
  // this ensures we ping the backend periodically. This keeps the token fresh (via 401 interceptor)
  // and keeps the Delivery Partner "online" in the backend.
  useEffect(() => {
    if (!isOnline) return;

    const pingInterval = setInterval(() => {
      const now = Date.now();
      // If no natural GPS update happened in the last 15 seconds, force a ping
      if (now - lastLocationSentAt.current >= 15000 && lastCoordRef.current) {
        lastLocationSentAt.current = now;
        deliveryAPI.updateLocation(
          lastCoordRef.current.lat,
          lastCoordRef.current.lng,
          true,
          { heading: 0, speed: 0, accuracy: null }
        ).catch(() => { });
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(pingInterval);
  }, [isOnline]);

  useEffect(() => {
    if (!newOrder) return;
    setIncomingOrder(newOrder);
    persistIncomingOrder(newOrder);
  }, [newOrder, persistIncomingOrder]);

  useEffect(() => {
    if (activeOrder && incomingOrder) {
      setIncomingOrder(null);
      clearPersistedIncomingOrder();
    }
  }, [activeOrder, incomingOrder, clearPersistedIncomingOrder]);

  useEffect(() => {
    if (!isOnline) return;
    if (currentTab !== 'feed') return;
    if (activeOrder) return;

    let cancelled = false;

    const hydrateAvailableOrder = async () => {
      try {
        const currentResponse = await deliveryAPI.getCurrentDelivery();
        const currentPayload =
          currentResponse?.data?.data?.activeOrder ||
          currentResponse?.data?.data ||
          null;

        if (!cancelled && currentPayload && (currentPayload._id || currentPayload.orderId)) {
          setActiveOrder(currentPayload);
          return;
        }

        const availableResponse = await deliveryAPI.getOrders({ limit: 20, page: 1 });
        const availablePayload =
          availableResponse?.data?.data ||
          availableResponse?.data ||
          {};
        const availableOrders = Array.isArray(availablePayload?.docs)
          ? availablePayload.docs
          : Array.isArray(availablePayload?.items)
            ? availablePayload.items
            : Array.isArray(availablePayload)
              ? availablePayload
              : [];

        const nextIncomingOrder = availableOrders.find((order) => {
          const dispatchStatus = String(order?.dispatch?.status || '').toLowerCase();
          const orderStatus = String(order?.orderStatus || order?.status || '').toLowerCase();
          return (
            ['unassigned', 'assigned'].includes(dispatchStatus) &&
            ['confirmed', 'preparing', 'ready_for_pickup'].includes(orderStatus)
          );
        });

        if (!cancelled && nextIncomingOrder) {
          persistIncomingOrder(nextIncomingOrder);
          setIncomingOrder((prev) => {
            const prevId = prev?.orderId || prev?._id || prev?.orderMongoId;
            const nextId =
              nextIncomingOrder?.orderId ||
              nextIncomingOrder?._id ||
              nextIncomingOrder?.orderMongoId;
            return prevId === nextId && prev ? prev : nextIncomingOrder;
          });
        }
      } catch (error) {
        console.warn('[DeliveryHomeV2] Available order fallback sync failed:', error?.message || error);
      }
    };

    void hydrateAvailableOrder();
    const poller = window.setInterval(() => {
      if (!document.hidden) {
        void hydrateAvailableOrder();
      }
    }, isSocketConnected ? 12000 : 5000);

    return () => {
      cancelled = true;
      window.clearInterval(poller);
    };
  }, [activeOrder, currentTab, isOnline, isSocketConnected, setActiveOrder, persistIncomingOrder]);

  useEffect(() => {
    if (orderStatusUpdate) {
      if (orderStatusUpdate.status === 'cancelled') {
        toast.error('Order cancelled');
        setIncomingOrder(null);
        clearPersistedIncomingOrder();
        resetTrip();
      }
      clearOrderStatusUpdate();
    }
  }, [orderStatusUpdate, resetTrip, clearOrderStatusUpdate, clearPersistedIncomingOrder]);


  const handleCenterMap = () => {
    if (mapRef.current && useDeliveryStore.getState().riderLocation) {
      const loc = useDeliveryStore.getState().riderLocation;
      mapRef.current.panTo({
        lat: parseFloat(loc.lat || loc.latitude),
        lng: parseFloat(loc.lng || loc.longitude)
      });
    }
  };

  const handleMapClick = (lat, lng) => {
    if (activeOrder || incomingOrder || showVerification) {
      setIsModalMinimized(true);
    }
  };

  return (
    <div className="relative h-screen w-full bg-white text-gray-900 overflow-hidden flex flex-col">
      {/* ─── 1. TOP HEADER (Neat & Clean) ─── */}
      {currentTab !== 'history' && currentTab !== 'shop' && (
        <div className="absolute top-0 inset-x-0 bg-white/95 backdrop-blur-md z-[200] safe-top border-b border-gray-100">
          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-3">
              <div
                onClick={() => navigate('/food/delivery/profile')}
                className="w-10 h-10 rounded-full border border-gray-200 overflow-hidden bg-gray-50 cursor-pointer active:bg-gray-100 transition-colors shrink-0"
              >
                <img src={profileImage || "https://i.ibb.co/3m2Yh7r/Appzeto-Brand-Image.png"} alt="Profile" className="w-full h-full object-cover" />
              </div>
              <button
                onClick={async () => {
                  const nextState = !isOnline;
                  toggleOnline(); 
                  if (nextState) {
                    navigator.geolocation.getCurrentPosition((pos) => {
                      deliveryAPI.updateLocation(pos.coords.latitude, pos.coords.longitude, true).catch(() => { });
                    }, (err) => console.warn('Online sync pos failed', err), { enableHighAccuracy: true });
                  } else {
                    deliveryAPI.updateOnlineStatus(false).catch(() => { });
                  }
                }}
                className={`relative w-[86px] h-8 rounded-full p-1 transition-all duration-300 flex items-center shadow-sm border ${isOnline ? 'border-green-500 bg-green-500' : 'border-gray-200 bg-gray-100'}`}
              >
                <div className={`flex items-center justify-between w-full px-2 text-[9px] font-bold uppercase tracking-wider ${isOnline ? 'text-white' : 'text-gray-500'}`}>
                  <span>{isOnline ? 'On' : ''}</span>
                  <span>{!isOnline ? 'Off' : ''}</span>
                </div>
                <motion.div animate={{ x: isOnline ? 54 : 0 }} className="absolute left-1 w-6 h-6 bg-white rounded-full shadow-sm" />
              </button>
            </div>
            
            <div className="flex items-center gap-2">
              <button onClick={() => setShowEmergencyPopup(true)} className="w-[38px] h-[38px] rounded-full bg-red-50 flex items-center justify-center text-red-500 active:bg-red-100 transition-colors border border-red-100"><AlertTriangle className="w-[18px] h-[18px]" /></button>
              <button onClick={() => navigate('/food/delivery/help/id-card')} className="w-[38px] h-[38px] rounded-full bg-blue-50 flex items-center justify-center text-blue-600 active:bg-blue-100 transition-colors border border-blue-100"><Contact className="w-[18px] h-[18px]" /></button>
              <button onClick={() => navigate('/food/delivery/notifications')} className="relative w-[38px] h-[38px] rounded-full bg-blue-50 flex items-center justify-center text-blue-600 active:bg-blue-100 transition-colors border border-blue-100">
                 <Bell className="w-[18px] h-[18px]" />
                 {notificationUnreadCount > 0 && <span className="absolute top-1 right-1 border-2 border-white w-2 h-2 rounded-full bg-red-500" />}
              </button>
            </div>
          </div>

          {/* ─── LIVE STATUS / PROGRESS BADGE (MATCHED PRO) ─── */}
          <AnimatePresence>
            {currentTab === 'feed' && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="px-4 mt-1"
              >
                {activeOrder ? (
                  <div className="grid grid-cols-2 gap-3 w-full">
                    {/* LEFT: DISTANCE (Vibrant Orange Card) */}
                    <div
                      className="rounded-lg p-2 shadow-md flex items-center justify-between"
                      style={{ background: BRAND_THEME.gradients.primary }}
                    >
                      <div className="flex flex-col z-10">
                        <span className="text-[8px] text-white/70 font-bold uppercase tracking-widest mb-0.5">Distance</span>
                        <div className="flex items-end gap-1">
                          <span className="text-xl font-bold text-white leading-none tracking-tight">
                            {distanceToTarget && distanceToTarget !== Infinity ? (distanceToTarget / 1000).toFixed(1) : '--'}
                          </span>
                          <span className="text-[10px] text-white/80 font-medium mb-0.5">KM</span>
                        </div>
                      </div>
                      <div className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center z-10">
                        <Navigation2 className="w-3.5 h-3.5 rotate-45 text-white" />
                      </div>
                    </div>

                    {/* RIGHT: TIME (Emerald PRO Content) */}
                    <div
                      className="rounded-lg p-2 shadow-md flex items-center justify-between"
                      style={{ backgroundColor: BRAND_THEME.colors.semantic.success }}
                    >
                      <div className="flex flex-col z-10">
                        <span className="text-[8px] text-white/70 font-bold uppercase tracking-widest mb-0.5">Arrival</span>
                        <div className="flex items-end gap-1">
                          <span className="text-xl font-bold text-white leading-none tracking-tight">
                            {eta ? String(eta) : '--'}
                          </span>
                          <span className="text-[10px] text-white/80 font-medium mb-0.5">MIN</span>
                        </div>
                      </div>
                      <div className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center z-10">
                        <Clock className="w-3.5 h-3.5 text-white" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white/5 rounded-2xl p-4 flex items-center border border-white/5 shadow-sm backdrop-blur-md">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-green-500/10 rounded-full flex items-center justify-center">
                        <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
                      </div>
                      <div>
                        <h3 className="text-white font-black text-[11px] uppercase tracking-widest leading-none mb-1">{isOnline ? 'System Online' : 'System Offline'}</h3>
                        <p className="text-gray-400 text-[10px] font-bold uppercase tracking-tight">{isOnline ? 'Waiting for order requests' : 'Go online to receive jobs'}</p>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ─── 2. MAIN CONTENT ─── */}
      <div className={`flex-1 relative overflow-y-auto ${currentTab === 'feed' ? 'pt-[120px]' : (currentTab === 'history' || currentTab === 'shop') ? 'pt-0' : 'pt-[64px]'}`}>
        {currentTab === 'feed' ? (
          <div className="absolute inset-0 top-[-120px]">
            <LiveMap
              onMapLoad={(m) => mapRef.current = m}
              onMapClick={handleMapClick}
              onPathReceived={setSimPath}
              onPolylineReceived={(poly) => {
                setActivePolyline(poly);
                // If we have an order, push the INITIAL polyline to Firebase immediately for the customer
                const orderId = activeOrder?.orderId || activeOrder?._id;
                if (orderId && poly) {
                  writeOrderTracking(orderId, { polyline: poly, status: tripStatus, eta: eta }).catch(() => { });
                }
              }}
              zoom={zoom}
            />

            {/* SIMULATION INDICATOR */}
            {isSimMode && (
              <div className="absolute top-[180px] left-4 right-4 z-[100] bg-[#2979FB]/70 backdrop-blur-md rounded-xl p-4 border border-white/20 flex items-center justify-between shadow-2xl">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center animate-pulse">
                    <Play className="w-4 h-4 text-white fill-current" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-orange-500 text-[10px] font-bold uppercase tracking-widest">Auto Navigation Active</span>
                    <span className="text-white text-[11px] font-medium">Following actual road path...</span>
                  </div>
                </div>
                <button onClick={() => setIsSimMode(false)} className="bg-white/10 text-white/50 hover:text-white px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest border border-white/10">Stop</button>
              </div>
            )}

            <div className="absolute right-4 bottom-28 md:bottom-32 flex flex-col gap-4 z-[120]">
              <div className="flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
                <button onClick={() => setZoom(z => Math.min(22, z + 1))} className="p-3 hover:bg-gray-50 border-b border-gray-100 text-gray-900 active:scale-90 transition-all" aria-label="Zoom in"><Plus className="w-5 h-5 stroke-[2.75]" /></button>
                <button onClick={() => setZoom(z => Math.max(8, z - 1))} className="p-3 hover:bg-gray-50 text-gray-900 active:scale-90 transition-all" aria-label="Zoom out"><Minus className="w-5 h-5 stroke-[2.75]" /></button>
              </div>
              <button
                onClick={() => {
                  const nextSimState = !isSimMode;
                  setIsSimMode(nextSimState);

                  if (nextSimState) {
                    toast.warning('Simulation Mode Active');
                    // Initialize position if null
                    if (!useDeliveryStore.getState().riderLocation && activeOrder) {
                      const target = activeOrder.restaurantLocation || activeOrder.customerLocation;
                      if (target) {
                        setRiderLocation({
                          lat: parseFloat(target.lat || target.latitude) + 0.001,
                          lng: parseFloat(target.lng || target.longitude) + 0.001,
                          heading: 0
                        });
                      }
                    }
                  }
                }}
                className={`w-14 h-14 rounded-full shadow-2xl flex items-center justify-center border border-gray-100 transition-all ${isSimMode ? 'bg-orange-500 text-white' : 'bg-white text-green-500'}`}
              >
                <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${isSimMode ? 'border-white' : 'border-green-500'}`}>
                  <Play className={`w-4 h-4 fill-current ml-0.5 ${isSimMode ? 'animate-pulse' : ''}`} />
                </div>
              </button>
              <button
                onClick={() => mapRef.current?.setOptions({ gestureHandling: 'greedy' })}
                className="w-14 h-14 bg-white rounded-full shadow-2xl flex items-center justify-center text-blue-600 border border-gray-100 active:scale-90 transition-all"
              >
                <div className="w-8 h-8 rounded-full border-2 border-blue-600 flex items-center justify-center"><Navigation2 className="w-4 h-4" /></div>
              </button>
              <button
                onClick={handleCenterMap}
                className="w-14 h-14 bg-white rounded-full shadow-2xl flex items-center justify-center text-gray-900 border border-gray-100 group active:scale-90 transition-all"
              >
                <Target className="w-7 h-7" />
              </button>
            </div>
          </div>
        ) : currentTab === 'pocket' ? (
          <PocketV2 />
        ) : currentTab === 'history' ? (
          <HistoryV2 />
        ) : currentTab === 'shop' ? (
          <ShopV2 />
        ) : (
          <ProfileV2 />
        )}

        {/* OVERLAYS (Persistent if active) */}
      </div>

      {/* OVERLAYS (Persistent if active) - Outside flex container to avoid clipping and z-index issues */}
      {(currentTab === 'feed' || activeOrder) && (
        <AnimatePresence>
          {!isModalMinimized && (
            <motion.div
              key="modal-container"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-x-0 top-0 bottom-[92px] z-[300] pointer-events-none flex items-end"
            >
              <div className="w-full pointer-events-auto relative">
                {incomingOrder && (
                  <NewOrderModal
                    order={incomingOrder}
                    onAccept={async (o) => {
                      try {
                        await acceptOrder(o);
                        setIncomingOrder(null);
                        clearPersistedIncomingOrder();
                        clearNewOrder();
                      } catch {
                        // Keep modal open so rider can retry before auto-timeout unassign.
                      }
                    }}
                    onReject={(o, reasonType) => {
                      const orderToReject = o || incomingOrder;
                      if (orderToReject) {
                        rejectOrder(orderToReject, reasonType);
                      }
                      setIncomingOrder(null);
                      clearPersistedIncomingOrder();
                      clearNewOrder();
                    }}
                    onMinimize={() => setIsModalMinimized(true)}
                  />
                )}
                {(tripStatus === 'PICKING_UP' || tripStatus === 'REACHED_PICKUP') && (
                  <PickupActionModal
                    order={activeOrder}
                    status={tripStatus}
                    isWithinRange={isWithinRange}
                    distanceToTarget={distanceToTarget}
                    eta={eta}
                    onReachedPickup={reachPickup}
                    onPickedUp={(billImageUrl) => pickUpOrder(billImageUrl)}
                    onMinimize={() => setIsModalMinimized(true)}
                  />
                )}
                {(tripStatus === 'PICKED_UP' || tripStatus === 'REACHED_DROP') && (
                  <div className="absolute bottom-4 inset-x-0 z-[120] px-4">
                    {tripStatus === 'PICKED_UP' ? (
                      <div className="bg-white rounded-[2.5rem] p-6 shadow-[0_-20px_80px_rgba(0,0,0,0.4)] border border-gray-100 flex flex-col items-center">
                        {/* Handle / Minimize */}
                        <div className="w-full flex justify-center pb-2 pt-0 -mt-2">
                          <button onClick={() => setIsModalMinimized(true)} className="p-1 hover:bg-gray-100 active:scale-95 transition-all rounded-full flex flex-col items-center">
                            <ChevronDown className="w-6 h-6 text-gray-400 stroke-[3]" />
                          </button>
                        </div>
                        <div className="flex justify-between w-full items-center mb-4 px-1 text-left">
                          <div className="flex items-center gap-3">
                            <div className="w-14 h-14 rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
                              <img
                                src={activeOrder?.user?.logo || activeOrder?.user?.profileImage || 'https://cdn-icons-png.flaticon.com/512/1275/1275302.png'}
                                className="w-full h-full object-cover"
                                alt="User"
                              />
                            </div>
                            <div>
                              <h3 className="text-gray-950 text-lg font-bold">Handover Drop</h3>
                              <p className={`text-[10px] font-bold uppercase tracking-widest mt-0.5 ${isWithinRange ? 'text-green-600' : 'text-orange-500'}`}>
                                {isWithinRange ? 'Ready - Confirm Drop Arrival' : `${(distanceToTarget / 1000).toFixed(1)} km • ${eta || '--'} min to drop`}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="w-full mb-4 rounded-3xl border border-blue-100 bg-blue-50/70 p-3.5">
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 mb-2">Contact User</p>
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-gray-900 truncate">{customerContact.name || 'Customer'}</p>
                              <p className="text-xs font-semibold text-gray-600">
                                {isCustomerContactLoading ? 'Fetching phone...' : (customerContact.phone || 'Phone not available')}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={handleContactUserCall}
                              disabled={!customerContact.dialPhone}
                              className={`shrink-0 inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all ${customerContact.dialPhone
                                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 active:scale-95'
                                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                }`}
                            >
                              <Phone className="w-3.5 h-3.5" />
                              {hasContactAttempted ? 'Call Attempted' : 'Contact Customer'}
                            </button>
                          </div>
                        </div>

                        <div className="w-full mb-4 rounded-3xl border border-amber-100 bg-amber-50 p-3.5">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">Waiting Timer</p>
                            <p className="text-sm font-black text-amber-800">
                              {isResponseWaitActive ? `${waitMinutes}:${waitSeconds}` : (isResponseWaitCompleted ? 'Completed' : 'Not Started')}
                            </p>
                          </div>
                          <p className="text-xs font-semibold text-amber-800/90 mt-2">
                            {isResponseWaitCompleted
                              ? 'Wait time complete. Next step: reach drop location to continue.'
                              : hasContactAttempted
                                ? 'Please wait here until countdown completes.'
                                : 'Tap after calling the customer to start the 10-second wait timer.'}
                          </p>
                          {hasContactAttempted && (
                            <button
                              type="button"
                              onClick={cancelNoResponseFlow}
                              disabled={isSubmittingNoResponse}
                              className="mt-3 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest bg-white border border-amber-200 text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                            >
                              Cancel
                            </button>
                          )}
                        </div>

                        {isResponseWaitCompleted && (
                          <div className="w-full mb-4 rounded-2xl border border-green-100 bg-green-50 p-3.5">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-green-700 mb-1">
                              Next Step Unlocked
                            </p>
                            <p className="text-xs font-semibold text-green-800/90">
                              Slide to confirm drop arrival. Immediately after that, you can upload proof and mark the user as not responding.
                            </p>
                          </div>
                        )}

                        {/* Customer Instructions Panel */}
                        {deliveryInstructionText && (
                          <div className="w-full bg-orange-50 border border-orange-100 rounded-3xl p-3.5 mb-4 flex gap-3 items-start shadow-sm">
                            <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center text-orange-500 shadow-sm shrink-0 border border-orange-50">
                              <Package className="w-4 h-4" />
                            </div>
                            <div className="flex-1">
                              <p className="text-[10px] font-black text-orange-600 uppercase tracking-[0.2em] mb-1 opacity-80">Delivery Instruction</p>
                              <p className="text-sm font-bold text-gray-950 leading-relaxed capitalize">"{deliveryInstructionText}"</p>
                            </div>
                          </div>
                        )}
                        {isDropArrivalLockedByWait && (
                          <p className="w-full mb-3 text-center text-[10px] font-black uppercase tracking-[0.14em] text-amber-700">
                            Complete waiting timer to unlock arrival confirmation
                          </p>
                        )}
                        <ActionSlider
                          label="Slide to Confirm Arrival"
                          successLabel="Drop Reached"
                          disabled={isDropArrivalSlideDisabled}
                          onConfirm={reachDrop}
                          containerStyle={{ backgroundColor: BRAND_THEME.colors.brand.primarySoft }}
                          style={{ background: BRAND_THEME.gradients.primary }}
                        />
                      </div>
                    ) : (
                      <div className="w-full bg-white rounded-[2rem] p-5 shadow-[0_-20px_60px_rgba(0,0,0,0.25)] border border-gray-100">
                        {!hasContactAttempted ? (
                          <button
                            type="button"
                            onClick={() => setShowVerification(true)}
                            className="w-full rounded-2xl py-3.5 font-black text-[10px] tracking-[0.2em] uppercase flex items-center justify-center gap-2 transition-all bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-200 active:scale-95 mb-4"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            Verify & Complete
                          </button>
                        ) : (
                          <>
                            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 mb-4">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">Waiting Timer</p>
                                <p className="text-sm font-black text-amber-800">
                                  {isResponseWaitActive ? `${waitMinutes}:${waitSeconds}` : (isResponseWaitCompleted ? 'Completed' : 'Not Started')}
                                </p>
                              </div>
                              <p className="text-xs font-semibold text-amber-800/90 mt-2">
                                {isResponseWaitCompleted
                                  ? 'Wait time complete. Upload proof and mark user not responding.'
                                  : 'Please wait full 10 seconds before proceeding.'}
                              </p>
                              <button
                                type="button"
                                onClick={cancelNoResponseFlow}
                                disabled={isSubmittingNoResponse}
                                className="mt-3 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest bg-white border border-amber-200 text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                              >
                                Cancel
                              </button>
                            </div>

                            <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 mb-4">
                              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-700 mb-2">User Not Responding</p>
                              <p className="text-xs font-semibold text-rose-800/90 mb-3">
                                After the timer completes, upload a proof photo and mark this order as user not responding.
                              </p>
                              <div className="flex items-center gap-2 mb-3">
                                <button
                                  type="button"
                                  onClick={() => noResponseProofInputRef.current?.click()}
                                  disabled={isUploadingNoResponseProof}
                                  className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest bg-white border border-rose-200 text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                                >
                                  {isUploadingNoResponseProof ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
                                  {isUploadingNoResponseProof ? 'Uploading...' : (noResponseProofUrl ? 'Replace Proof' : 'Upload Proof')}
                                </button>
                                {noResponseProofUrl && (
                                  <span className="text-[10px] font-bold text-green-700 bg-green-100 px-2.5 py-1 rounded-lg">Proof Added</span>
                                )}
                              </div>
                              <input
                                ref={noResponseProofInputRef}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                onChange={(e) => handleNoResponseProofSelect(e.target.files?.[0])}
                              />
                              <button
                                type="button"
                                onClick={submitNoResponseCancellation}
                                disabled={!isResponseWaitCompleted || !noResponseProofUrl || isSubmittingNoResponse}
                                className={`w-full rounded-2xl py-3.5 font-black text-[10px] tracking-[0.2em] uppercase flex items-center justify-center gap-2 transition-all ${!isResponseWaitCompleted || !noResponseProofUrl || isSubmittingNoResponse
                                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                  : 'bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-200 active:scale-95'
                                  }`}
                              >
                                {isSubmittingNoResponse ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                                {isSubmittingNoResponse ? 'Submitting...' : 'Mark User Not Responding'}
                              </button>
                            </div>
                          </>
                        )}

                      </div>
                    )}
                  </div>
                )}
                {showVerification && tripStatus !== 'COMPLETED' && (
                  <DeliveryVerificationModal
                    order={activeOrderForVerification}
                    onComplete={async (otp) => {
                      const res = await completeDelivery(otp);
                      setShowVerification(false);
                      return res;
                    }}
                    onClose={() => setShowVerification(false)}
                  />
                )}
                {tripStatus === 'COMPLETED' && <OrderSummaryModal order={activeOrder} onDone={resetTrip} />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* ─── MODALS RESTORED FROM OLD UI ─── */}
      <BottomPopup isOpen={showEmergencyPopup} title="Emergency Help" onClose={() => setShowEmergencyPopup(false)}>
        <div className="grid gap-4 py-2">
          {emergencyOptions.map((opt, i) => (
            <button
              key={i}
              onClick={() => {
                const num = opt.phone?.replace(/\D/g, '');
                if (num) window.location.href = `tel:${num}`;
                else toast.error('Number not configured');
              }}
              className="flex items-center gap-5 p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 active:scale-95 transition-all text-left"
            >
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm text-xl">{opt.icon}</div>
              <div>
                <h4 className="font-bold text-gray-900">{opt.title}</h4>
                <p className="text-xs text-gray-500 font-medium">{opt.subtitle}</p>
              </div>
            </button>
          ))}
        </div>
      </BottomPopup>

      {/* Floating Minimize/Restore Toggle - Above navbar */}
      {isModalMinimized && (activeOrder || incomingOrder || showVerification) && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="fixed bottom-[100px] inset-x-0 z-[300] px-6"
        >
          <button
            onClick={() => setIsModalMinimized(false)}
            className="w-full bg-gray-900/90 text-white rounded-2xl py-4 flex items-center justify-between px-6 shadow-2xl backdrop-blur-md border border-white/10"
          >
            <div className="flex flex-col items-start gap-0.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Order Action Pending</span>
              <span className="text-xs font-bold uppercase tracking-wider">Tap to open delivery panel</span>
            </div>
            <div className="bg-orange-500 p-2 rounded-xl text-white">
              <Plus className="w-5 h-5" />
            </div>
          </button>
        </motion.div>
      )}

      {/* ─── 3. BOTTOM NAV (Clean & Uniform) ─── */}
      <div className="bg-white border-t border-gray-100 flex justify-between items-center z-[200] safe-bottom shadow-sm">
        <button onClick={() => navigate('/food/delivery/feed')} className={`flex flex-col items-center justify-center gap-1 pt-3 pb-2 transition-all flex-1 ${currentTab === 'feed' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
          <LayoutGrid className="w-5 h-5" /><span className="text-[10px] font-semibold">Feed</span>
        </button>
        <button onClick={() => navigate('/food/delivery/pocket')} className={`flex flex-col items-center justify-center gap-1 pt-3 pb-2 transition-all flex-1 ${currentTab === 'pocket' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
          <Wallet className="w-5 h-5" /><span className="text-[10px] font-semibold">Pocket</span>
        </button>
        <button onClick={() => navigate('/food/delivery/history')} className={`flex flex-col items-center justify-center gap-1 pt-3 pb-2 transition-all flex-1 ${currentTab === 'history' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
          <History className="w-5 h-5" /><span className="text-[10px] font-semibold">History</span>
        </button>
        <button onClick={() => navigate('/food/delivery/shop')} className={`flex flex-col items-center justify-center gap-1 pt-3 pb-2 transition-all flex-1 ${currentTab === 'shop' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
          <Store className="w-5 h-5" /><span className="text-[10px] font-semibold">Shop</span>
        </button>
        <button onClick={() => navigate('/food/delivery/profile')} className={`flex flex-col items-center justify-center gap-1 pt-3 pb-2 transition-all flex-1 ${currentTab === 'profile' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
          <UserIcon className="w-5 h-5" /><span className="text-[10px] font-semibold">Profile</span>
        </button>
      </div>
    </div>
  );
}

