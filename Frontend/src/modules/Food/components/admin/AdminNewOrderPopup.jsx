
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import io from "socket.io-client"
import { Clock, Package, ReceiptText, Store, X } from "lucide-react"
import { adminAPI } from "@food/api"
import { API_BASE_URL } from "@food/api/config"

const getOrderKey = (order = {}) =>
  String(
    order?.orderMongoId ||
      order?.order_mongo_id ||
      order?._id ||
      order?.id ||
      order?.orderId ||
      order?.order_id ||
      "",
  ).trim()

const getDisplayOrderId = (order = {}) =>
  String(order?.orderId || order?.order_id || order?.displayOrderId || getOrderKey(order) || "New").trim()

const formatMoney = (value) => {
  const amount = Number(value || 0)
  return Number.isFinite(amount) && amount > 0 ? `Rs ${amount.toFixed(2)}` : "Amount pending"
}

const getAdminSocketToken = () => {
  if (typeof localStorage === "undefined") return ""
  return (
    localStorage.getItem("auth_admin") ||
    localStorage.getItem("admin_accessToken") ||
    localStorage.getItem("token") ||
    ""
  )
}

export default function AdminNewOrderPopup() {
  const navigate = useNavigate()
  const [orderAlert, setOrderAlert] = useState(null)
  const recentOrderRef = useRef(new Map())
  const seenOrderIdsRef = useRef(new Set())
  const firstPollRef = useRef(true)
  const hideTimerRef = useRef(null)

  const socketUrl = useMemo(() => {
    if (!API_BASE_URL) return ""
    try {
      return new URL(API_BASE_URL, window.location.origin).origin
    } catch {
      return String(API_BASE_URL || "")
        .replace(/\/api\/v\d+\/?$/i, "")
        .replace(/\/api\/?$/i, "")
        .replace(/\/+$/, "")
    }
  }, [])

  const showOrderPopup = useCallback((payload = {}) => {
    const orderKey = getOrderKey(payload) || `unknown-${Date.now()}`
    const lastShownAt = recentOrderRef.current.get(orderKey) || 0
    if (Date.now() - lastShownAt < 8000) return
    recentOrderRef.current.set(orderKey, Date.now())

    setOrderAlert({
      ...payload,
      orderKey,
      shownAt: Date.now(),
    })

    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      setOrderAlert((current) => (current?.orderKey === orderKey ? null : current))
    }, 60000) // Increased to 1 minute as requested
  }, [])

  useEffect(() => {
    if (!socketUrl || !socketUrl.startsWith("http")) return undefined
    const token = getAdminSocketToken()
    if (!token) return undefined

    const socket = io(socketUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      auth: { token },
      query: { token },
    })

    socket.on("connect", () => {
      socket.emit("join-admin-orders")
    })

    socket.on("admin_new_order", showOrderPopup)
    socket.on("play_notification_sound", showOrderPopup)

    return () => {
      socket.off("admin_new_order", showOrderPopup)
      socket.off("play_notification_sound", showOrderPopup)
      socket.disconnect()
    }
  }, [showOrderPopup, socketUrl])

  useEffect(() => {
    let cancelled = false

    const pollLatestOrders = async () => {
      try {
        const response = await adminAPI.getOrders({ page: 1, limit: 20 })
        const rawOrders =
          response?.data?.data?.orders ??
          response?.data?.orders ??
          response?.data?.data?.docs ??
          response?.data?.data
        const orders = Array.isArray(rawOrders) ? rawOrders : []
        if (cancelled || !response?.data?.success) return

        const nextIds = new Set(orders.map(getOrderKey).filter(Boolean))
        if (firstPollRef.current) {
          seenOrderIdsRef.current = nextIds
          firstPollRef.current = false
          return
        }

        const newOrder = orders.find((order) => {
          const key = getOrderKey(order)
          return key && !seenOrderIdsRef.current.has(key)
        })

        seenOrderIdsRef.current = nextIds
        if (newOrder) showOrderPopup(newOrder)
      } catch {
        // Socket is the primary path; polling failures should not disturb admin work.
      }
    }

    pollLatestOrders()
    const intervalId = setInterval(pollLatestOrders, 5000)
    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [showOrderPopup])

  useEffect(() => () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
  }, [])

  if (!orderAlert) return null

  const orderId = getDisplayOrderId(orderAlert)
  const orderDetailId = getOrderKey(orderAlert) || orderId
  const restaurantName =
    orderAlert.restaurantName ||
    orderAlert.restaurant?.restaurantName ||
    orderAlert.restaurant?.name ||
    "Restaurant"
  const total = orderAlert.pricing?.total ?? orderAlert.total ?? orderAlert.amount

  return (
    <div 
      className="fixed right-4 top-24 z-[9999] w-[calc(100vw-2rem)] max-w-sm"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="overflow-hidden rounded-lg border border-emerald-100 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.18)]">
        <div className="flex items-start gap-3 border-b border-slate-100 bg-emerald-50 px-4 py-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <Package className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-slate-950">New order received</p>
            <p className="mt-0.5 truncate text-xs font-semibold text-emerald-700">Order #{orderId}</p>
          </div>
          <button
            type="button"
            onClick={() => setOrderAlert(null)}
            className="rounded-md p-1 text-slate-500 hover:bg-white hover:text-slate-900"
            aria-label="Close new order popup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2 px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <Store className="h-3.5 w-3.5 text-slate-400" />
            <span className="truncate">{restaurantName}</span>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <ReceiptText className="h-3.5 w-3.5 text-slate-400" />
            <span>{formatMoney(total)}</span>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <span>Just now</span>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            onClick={() => {
              setOrderAlert(null)
              navigate(`/admin/food/order-detect-delivery`)
            }}
            className="flex-1 rounded-md bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700"
          >
            Order Detail
          </button>
          <button
            type="button"
            onClick={() => setOrderAlert(null)}
            className="rounded-md border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  )
}
