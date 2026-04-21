import { useEffect, useMemo, useState } from "react"
import { Loader2, Package, Search } from "lucide-react"
import { toast } from "sonner"
import { adminAPI } from "@food/api"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table"

const RUPEE = "\u20B9"

const STATUS_OPTIONS = ["pending", "confirmed", "dispatched", "delivered", "cancelled"]

const getStatusClasses = (status) => {
  const palette = {
    pending: "bg-amber-100 text-amber-700",
    confirmed: "bg-sky-100 text-sky-700",
    dispatched: "bg-violet-100 text-violet-700",
    delivered: "bg-emerald-100 text-emerald-700",
    cancelled: "bg-rose-100 text-rose-700",
  }

  return palette[String(status || "").toLowerCase()] || "bg-slate-100 text-slate-700"
}

const formatPartnerName = (partner) => {
  if (!partner) return "Unknown"
  return partner.name || [partner.firstName, partner.lastName].filter(Boolean).join(" ") || "Unknown"
}

export default function StoreOrders() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [updatingOrderId, setUpdatingOrderId] = useState(null)

  const fetchOrders = async () => {
    try {
      setLoading(true)
      const res = await adminAPI.getStoreOrdersAdmin({ limit: 100 })
      const orderList =
        res?.data?.data?.orders ||
        res?.data?.orders ||
        res?.data?.data ||
        res?.data ||
        []

      setOrders(Array.isArray(orderList) ? orderList : [])
    } catch (error) {
      toast.error("Failed to load store orders")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrders()
  }, [])

  const filteredOrders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const list = Array.isArray(orders) ? orders : []
    if (!query) return list

    return list.filter((order) => {
      const partnerName = formatPartnerName(order?.deliveryPartnerId).toLowerCase()
      const phone = String(order?.deliveryPartnerId?.phone || "").toLowerCase()
      const productName = String(order?.productName || "").toLowerCase()
      const variantName = String(order?.variantName || "").toLowerCase()
      return [partnerName, phone, productName, variantName].some((value) => value.includes(query))
    })
  }, [orders, searchQuery])

  const handleStatusChange = async (orderId, orderStatus) => {
    try {
      setUpdatingOrderId(orderId)
      const res = await adminAPI.updateStoreOrderStatusAdmin(orderId, { orderStatus })
      const updatedOrder = res?.data?.data?.order || res?.data?.order || null

      setOrders((prev) =>
        prev.map((order) =>
          order._id === orderId
            ? {
                ...order,
                ...(updatedOrder || {}),
                orderStatus: updatedOrder?.orderStatus || orderStatus,
              }
            : order,
        ),
      )
      toast.success("Order status updated")
    } catch (error) {
      toast.error(error?.response?.data?.error || error?.response?.data?.message || "Failed to update status")
    } finally {
      setUpdatingOrderId(null)
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Store Orders</h1>
            <p className="mt-1 text-sm text-slate-500">Manage delivery partner store purchases in one place.</p>
          </div>

          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by partner or product..."
              className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm text-slate-700 outline-none transition focus:border-blue-400"
            />
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="text-sm font-medium text-slate-500">Loading store orders...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 px-6 text-center">
            <Package className="h-12 w-12 text-slate-300" />
            <p className="text-lg font-semibold text-slate-700">No store orders found</p>
            <p className="text-sm text-slate-500">New store purchases will appear here.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-b border-slate-200 bg-slate-50">
                <TableHead className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Product</TableHead>
                <TableHead className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Delivery Partner</TableHead>
                <TableHead className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Amount</TableHead>
                <TableHead className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Payment</TableHead>
                <TableHead className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Date</TableHead>
                <TableHead className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</TableHead>
                <TableHead className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Update Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.map((order) => (
                <TableRow key={order._id} className="border-b border-slate-100 last:border-b-0">
                  <TableCell className="px-4 py-4 whitespace-normal">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                        {order?.productImage ? (
                          <img src={order.productImage} alt={order.productName || "Product"} className="h-full w-full object-cover" />
                        ) : (
                          <Package className="h-5 w-5 text-slate-400" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{order?.productName || "Product"}</p>
                        <p className="text-xs text-slate-500">
                          {order?.variantName && order.variantName !== "Standard" ? `${order.variantName} x ${order.quantity}` : `Qty: ${order?.quantity || 0}`}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-4 whitespace-normal">
                    <p className="text-sm font-semibold text-slate-900">{formatPartnerName(order?.deliveryPartnerId)}</p>
                    <p className="text-xs text-slate-500">{order?.deliveryPartnerId?.phone || "No phone"}</p>
                  </TableCell>
                  <TableCell className="px-4 py-4">
                    <span className="text-sm font-semibold text-slate-900">{RUPEE}{Number(order?.totalAmount || 0).toFixed(2)}</span>
                  </TableCell>
                  <TableCell className="px-4 py-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium capitalize text-slate-700">{order?.paymentMethod || "-"}</p>
                      <p className="text-xs uppercase tracking-wide text-slate-500">{order?.paymentStatus || "pending"}</p>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-4 whitespace-normal">
                    <p className="text-sm text-slate-700">{order?.createdAt ? new Date(order.createdAt).toLocaleDateString("en-IN") : "-"}</p>
                    <p className="text-xs text-slate-500">{order?.createdAt ? new Date(order.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : ""}</p>
                  </TableCell>
                  <TableCell className="px-4 py-4">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${getStatusClasses(order?.orderStatus)}`}>
                      {order?.orderStatus || "pending"}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-4">
                    <select
                      value={String(order?.orderStatus || "pending").toLowerCase()}
                      onChange={(e) => handleStatusChange(order._id, e.target.value)}
                      disabled={updatingOrderId === order._id}
                      className="min-w-[150px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
