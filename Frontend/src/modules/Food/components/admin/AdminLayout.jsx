import { useState, useEffect, useRef, useCallback } from "react"
import { Outlet, useLocation } from "react-router-dom"
import io from "socket.io-client"
import AdminSidebar from "./AdminSidebar"
import AdminNavbar from "./AdminNavbar"
import { adminAPI } from "@food/api"
import { API_BASE_URL } from "@food/api/config"
import alertSound from "@food/assets/audio/alert.mp3"
import originalSound from "@food/assets/audio/original.mp3"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


export default function AdminLayout() {
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const globalAudioRef = useRef(null)
  const globalSocketRef = useRef(null)
  const recentOrderRef = useRef(new Map())
  const seenOrderIdsRef = useRef(new Set())
  const pollInitializedRef = useRef(false)
  const pollInFlightRef = useRef(false)

  const playGlobalOrderRing = useCallback(async () => {
    try {
      const selectedSound = localStorage.getItem("delivery_alert_sound") || "zomato_tone"
      const soundFile = selectedSound === "original" ? originalSound : alertSound

      if (!globalAudioRef.current) {
        globalAudioRef.current = new Audio(soundFile)
        globalAudioRef.current.preload = "auto"
        globalAudioRef.current.volume = 1
      } else if (!globalAudioRef.current.src.includes(soundFile.split("/").pop())) {
        globalAudioRef.current.pause()
        globalAudioRef.current.src = soundFile
        globalAudioRef.current.load()
      }

      globalAudioRef.current.muted = false
      globalAudioRef.current.currentTime = 0
      await globalAudioRef.current.play()
    } catch (_) {}
  }, [])

  // Get initial collapsed state from localStorage to set initial margin
  useEffect(() => {
    try {
      const saved = localStorage.getItem('admin_sidebar_state')
      if (saved !== null) {
        const state = JSON.parse(saved)
        if (state && typeof state.isCollapsed !== 'undefined') {
          setIsSidebarCollapsed(state.isCollapsed)
        }
      }
    } catch (e) {
      debugError('Error loading sidebar collapsed state:', e)
    }
  }, [])

  const handleCollapseChange = (collapsed) => {
    setIsSidebarCollapsed(collapsed)
  }

  // Force light mode for admin panel and restore on unmount
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    root.classList.remove('dark');
    
    return () => {
      if (wasDark) {
        root.classList.add('dark');
      }
    };
  }, []);

  // Global admin new-order ring on all admin pages except orders pages
  useEffect(() => {
    const isOrdersPage = location.pathname.startsWith("/admin/food/orders")
    if (isOrdersPage) return undefined

    const backendUrl = API_BASE_URL.replace(/\/api\/?$/, "")
    if (!API_BASE_URL || !backendUrl || !backendUrl.startsWith("http")) {
      return undefined
    }

    const socket = io(backendUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    })
    globalSocketRef.current = socket

    const handleIncomingOrder = (payload = {}) => {
      const orderId = String(payload?.orderId || payload?.orderMongoId || "").trim()
      const dedupeKey = orderId || "admin-global-order"
      const now = Date.now()
      const last = recentOrderRef.current.get(dedupeKey) || 0
      if (now - last < 8000) return
      recentOrderRef.current.set(dedupeKey, now)
      playGlobalOrderRing()
    }

    socket.on("connect", () => {
      socket.emit("join-admin-orders")
    })
    socket.on("admin_new_order", handleIncomingOrder)
    socket.on("play_notification_sound", handleIncomingOrder)

    return () => {
      socket.off("admin_new_order", handleIncomingOrder)
      socket.off("play_notification_sound", handleIncomingOrder)
      socket.disconnect()
      globalSocketRef.current = null
    }
  }, [location.pathname, playGlobalOrderRing])

  // Fallback polling for new orders on all admin pages except orders routes.
  useEffect(() => {
    const isOrdersPage = location.pathname.startsWith("/admin/food/orders")
    if (isOrdersPage) return undefined

    let isMounted = true

    const extractOrders = (response) =>
      response?.data?.data?.orders ||
      response?.data?.orders ||
      []

    const getOrderId = (order) =>
      String(order?._id || order?.id || order?.orderId || "").trim()

    const checkNewOrders = async () => {
      if (!isMounted || pollInFlightRef.current) return
      pollInFlightRef.current = true
      try {
        const response = await adminAPI.getOrders({ page: 1, limit: 20 })
        const list = Array.isArray(extractOrders(response)) ? extractOrders(response) : []
        const currentIds = list.map(getOrderId).filter(Boolean)

        if (!pollInitializedRef.current) {
          seenOrderIdsRef.current = new Set(currentIds)
          pollInitializedRef.current = true
          return
        }

        let foundNew = false
        for (const id of currentIds) {
          if (!seenOrderIdsRef.current.has(id)) {
            foundNew = true
            break
          }
        }

        if (foundNew) {
          playGlobalOrderRing()
        }

        seenOrderIdsRef.current = new Set(currentIds)
      } catch (_) {
        // Ignore poll errors to keep UI uninterrupted.
      } finally {
        pollInFlightRef.current = false
      }
    }

    checkNewOrders()
    const pollId = setInterval(checkNewOrders, 5000)

    return () => {
      isMounted = false
      clearInterval(pollId)
    }
  }, [location.pathname, playGlobalOrderRing])

  return (
    <div className="h-screen bg-neutral-200 flex overflow-hidden">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-gray-900/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <AdminSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onCollapseChange={handleCollapseChange}
      />

      {/* Main Content Area */}
      <div className={`
        flex-1 flex min-h-0 flex-col transition-all duration-300 ease-in-out min-w-0
        ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-80'}
      `}>
        {/* Top Navbar */}
        <AdminNavbar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />

        {/* Backend disconnected banner */}
        {!API_BASE_URL && (
          <div className="w-full bg-amber-100 border-b border-amber-300 px-4 py-2 text-center text-sm text-amber-900">
            Backend disconnected. Data is not live.
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 min-h-0 w-full max-w-full overflow-x-hidden overflow-y-auto bg-neutral-100">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

