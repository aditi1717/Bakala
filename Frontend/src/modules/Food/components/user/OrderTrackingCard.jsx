import { useState, useEffect, useMemo, useRef, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import BRAND_THEME from "@/config/brandTheme";

import { useOrders } from "@food/context/OrdersContext";
import { orderAPI } from "@food/api";

const getOrderKey = (order) => order?.orderId || order?._id || order?.id || null;
const getCustomerToken = () =>
  localStorage.getItem("auth_customer") ||
  localStorage.getItem("user_accessToken") ||
  localStorage.getItem("accessToken") ||
  null;

const getOrderStatus = (order) =>
  String(order?.orderStatus || order?.status || order?.deliveryState?.status || "").toLowerCase();

const getOrderPhase = (order) =>
  String(order?.deliveryState?.currentPhase || "").toLowerCase();

const ACTIVE_PHASES = new Set([
  "created",
  "confirmed",
  "preparing",
  "accepted",
  "ready",
  "ready_for_pickup",
  "reached_pickup",
  "picked_up",
  "out_for_delivery",
  "en_route_to_delivery",
  "at_pickup",
  "at_drop",
]);

const TERMINAL_STATUSES = new Set([
  "delivered",
  "cancelled",
  "completed",
  "failed",
  "cancelled_by_user",
  "cancelled_by_restaurant",
  "cancelled_by_admin",
  "cancelled_by_delivery",
]);

const isActiveOrder = (order) => {
  if (!order) return false;
  const status = getOrderStatus(order);
  const phase = getOrderPhase(order);
  if (TERMINAL_STATUSES.has(status)) return false;
  if (phase === "completed" || phase === "delivered") return false;
  if (!status && phase) return ACTIVE_PHASES.has(phase);
  if (!status) return false;
  return true;
};

/** Cheap fingerprint so we skip setState when list content is unchanged. */
function ordersFingerprint(orders) {
  if (!Array.isArray(orders) || orders.length === 0) return "";
  return orders
    .map((o) => `${getOrderKey(o)}:${getOrderStatus(o)}`)
    .join("|");
}

function OrderTrackingCardInner({ hasBottomNav = true }) {
  const navigate = useNavigate();
  const { orders: contextOrders } = useOrders();
  const hasCustomerAuth = !!getCustomerToken();
  const [apiOrders, setApiOrders] = useState([]);
  const [hasFetchedApi, setHasFetchedApi] = useState(false);
  const lastApiFingerprintRef = useRef("");
  const [invalidOrderIds, setInvalidOrderIds] = useState(new Set());
  const [dismissedKeys, setDismissedKeys] = useState(new Set());

  const fetchOrders = useCallback(async () => {
    if (!getCustomerToken()) {
      if (lastApiFingerprintRef.current !== "") {
        lastApiFingerprintRef.current = "";
        setApiOrders([]);
      }
      setHasFetchedApi(true);
      return;
    }
    try {
      const response = await orderAPI.getOrders({ limit: 10, page: 1 });
      let nextOrders = [];

      if (response?.data?.success && response?.data?.data?.orders) {
        nextOrders = response.data.data.orders;
      } else if (response?.data?.orders) {
        nextOrders = response.data.orders;
      } else if (response?.data?.data?.data && Array.isArray(response.data.data.data)) {
        nextOrders = response.data.data.data;
      } else if (response?.data?.data?.docs && Array.isArray(response.data.data.docs)) {
        nextOrders = response.data.data.docs;
      } else if (response?.data?.data && Array.isArray(response.data.data)) {
        nextOrders = response.data.data;
      }

      const list = Array.isArray(nextOrders) ? nextOrders : [];
      const fp = ordersFingerprint(list);
      if (fp !== lastApiFingerprintRef.current) {
        lastApiFingerprintRef.current = fp;
        setApiOrders(list);
      }
    } catch (error) {
      if (lastApiFingerprintRef.current !== "") {
        lastApiFingerprintRef.current = "";
        setApiOrders([]);
      }
    } finally {
      setHasFetchedApi(true);
    }
  }, []);

  useEffect(() => {
    if (!hasCustomerAuth) return;
    fetchOrders();
    const interval = setInterval(fetchOrders, 30000);
    return () => clearInterval(interval);
  }, [fetchOrders, hasCustomerAuth]);

  const activeOrders = useMemo(() => {
    const isMongoObjectId = (value) => /^[a-f0-9]{24}$/i.test(String(value || ""));
    const serverKeys = new Set(
      (apiOrders || []).map((o) => String(getOrderKey(o) || "")).filter(Boolean),
    );
    const seen = new Set();

    const unique = [...apiOrders, ...contextOrders].filter((order) => {
      const key = getOrderKey(order);
      if (!key || seen.has(key) || invalidOrderIds.has(key) || dismissedKeys.has(key)) {
        return false;
      }
      if (hasFetchedApi && isMongoObjectId(key) && !serverKeys.has(String(key))) {
        return false;
      }
      seen.add(key);
      return isActiveOrder(order);
    });

    return unique.slice(0, 2); // Show up to 2 active orders
  }, [contextOrders, apiOrders, invalidOrderIds, hasFetchedApi, dismissedKeys]);

  if (!hasCustomerAuth || activeOrders.length === 0) {
    return null;
  }

  const handleDismiss = (e) => {
    e.stopPropagation();
    const keysToDismiss = new Set(dismissedKeys);
    activeOrders.forEach(order => keysToDismiss.add(getOrderKey(order)));
    setDismissedKeys(keysToDismiss);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className={`fixed ${hasBottomNav ? "bottom-20" : "bottom-6"} left-4 right-4 z-[9999]`}
      >
        <div 
          onClick={() => navigate("/food/orders")}
          className="relative bg-white/95 dark:bg-[#1a1a1a]/95 backdrop-blur-xl rounded-full px-6 py-3 shadow-[0_8px_30px_rgba(41,121,251,0.16)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)] border border-brand-100/70 dark:border-white/10 flex items-center justify-between cursor-pointer group"
        >
          <div className="flex items-center gap-2 overflow-hidden flex-1">
            <span className="text-gray-900 dark:text-white font-bold text-sm whitespace-nowrap">
              {activeOrders.length} {activeOrders.length > 1 ? 'Orders' : 'Order'} Active
            </span>
          </div>

          <div className="flex items-center gap-3 ml-4 shrink-0">
            <div className="flex items-center gap-1 text-brand-600 font-bold text-xs uppercase">
              View Detail <ChevronRight className="w-4 h-4" />
            </div>
            <button 
               onClick={handleDismiss}
               className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

const OrderTrackingCard = memo(OrderTrackingCardInner);
export default OrderTrackingCard;
