import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import { toast } from 'sonner';
import { API_BASE_URL } from '@food/api/config';
import { userAPI } from '@food/api';
import { dispatchNotificationInboxRefresh } from '@food/hooks/useNotificationInbox';

const debugLog = (...args) => {
  if (import.meta.env.DEV) {
    console.log('📬 [UserSocket]', ...args);
  }
};

/**
 * Hook for user to receive real-time order notifications.
 * Dispatches 'orderStatusNotification' custom event for OrderTrackingCard.
 */
export const useUserNotifications = () => {
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [userId, setUserId] = useState(null);

  // Fetch current user ID
  useEffect(() => {
    const fetchUserId = async () => {
      try {
        const response = await userAPI.getProfile();
        if (response.data?.success && response.data.data?.user) {
          const user = response.data.data.user;
          const id = user._id?.toString() || user.userId || user.id;
          setUserId(id);
        }
      } catch (error) {
        // Not logged in or error
      }
    };
    fetchUserId();
  }, []);

  useEffect(() => {
    if (!API_BASE_URL || !String(API_BASE_URL).trim()) {
      setIsConnected(false);
      return;
    }
    if (!userId) {
      return;
    }

    // Normalize backend URL
    let backendUrl = API_BASE_URL;
    try {
      backendUrl = new URL(backendUrl).origin;
    } catch {
      backendUrl = String(backendUrl || "")
        .replace(/\/api\/v\d+\/?$/i, "")
        .replace(/\/api\/?$/i, "")
        .replace(/\/+$/, "");
    }

    const socketUrl = `${backendUrl}`;
    
    // Auth token
    const token = localStorage.getItem('user_accessToken') || localStorage.getItem('accessToken');
    if (!token) return;

    debugLog('🔌 Connecting to User Socket.IO:', socketUrl);

    socketRef.current = io(socketUrl, {
      path: '/socket.io/',
      transports: ['polling', 'websocket'],
      reconnection: true,
      auth: { token }
    });

    socketRef.current.on('connect', () => {
      debugLog('✅ User Socket connected, userId:', userId);
      setIsConnected(true);
      if (typeof window !== 'undefined') window.orderSocketConnected = true;
      // Backend auto-joins 'user:userId' room based on role/token in config/socket.js
    });

    socketRef.current.on('order_status_update', (data) => {
      debugLog('🔔 Order status update received:', data);
      
      const title = data.title || `Order #${data.orderId || 'Update'}`;
      const message = data.message || `Your order status is now ${String(data.orderStatus || '').replace(/_/g, ' ')}`;
      const statusText = String(data?.orderStatus || data?.status || '').toLowerCase();
      const isCancellationStatus = statusText.includes('cancel');
      const incomingOrderKeys = [
        data?.orderMongoId,
        data?.orderId,
        data?.order_mongo_id,
        data?.order_id,
      ]
        .filter(Boolean)
        .map((value) => String(value).trim())
        .filter(Boolean);

      // Skip duplicate cancel toast right after user cancels from OrderTracking.
      let shouldSuppressCancelToast = false;
      if (isCancellationStatus && typeof window !== 'undefined') {
        const suppressMeta = window.__suppressUserCancelToast;
        const suppressAt = Number(suppressMeta?.at || 0);
        const suppressKeys = Array.isArray(suppressMeta?.keys)
          ? suppressMeta.keys.map((value) => String(value).trim()).filter(Boolean)
          : [];
        const withinSuppressWindow = Date.now() - suppressAt < 15000;
        const keyMatches = incomingOrderKeys.some((key) => suppressKeys.includes(key));
        shouldSuppressCancelToast = withinSuppressWindow && keyMatches;
        if (!withinSuppressWindow && suppressMeta) {
          delete window.__suppressUserCancelToast;
        }
      }

      // Optional: Show toast for important updates (Cancel, Ready, etc.)
      const isImportant = isCancellationStatus || ['ready_for_pickup', 'ready', 'confirmed'].includes(data.orderStatus);
      if (isImportant && !shouldSuppressCancelToast) {
        toast.message(title, {
          description: message,
          duration: 10000
        });
      }

      // Dispatch custom event for OrderTrackingCard and other listeners
      const event = new CustomEvent('orderStatusNotification', {
        detail: {
          orderMongoId: data.orderMongoId,
          orderId: data.orderId,
          status: data.orderStatus,
          orderStatus: data.orderStatus, // Ensure compatibility with different UI checks
          title,
          message,
          deliveryState: data.deliveryState,
          deliveryVerification: data.deliveryVerification,
          timestamp: new Date().toISOString()
        }
      });
      window.dispatchEvent(event);
    });
    // Intentionally ignore delivery_drop_otp for user app:
    // customer OTP should not be shown as toast or notification.

    socketRef.current.on('admin_notification', (payload) => {
      toast.message(payload?.title || 'Notification', {
        description: payload?.message || 'New broadcast notification received.',
        duration: 8000
      });
      dispatchNotificationInboxRefresh();
    });

    socketRef.current.on('connect_error', (error) => {
      if (import.meta.env.DEV) {
        // debugLog('❌ Socket connection error:', error.message);
      }
      setIsConnected(false);
      if (typeof window !== 'undefined') window.orderSocketConnected = false;
    });

    socketRef.current.on('disconnect', (reason) => {
      debugLog('🔌 Socket disconnected:', reason);
      setIsConnected(false);
      if (typeof window !== 'undefined') window.orderSocketConnected = false;
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [userId]);

  return { isConnected };
};

