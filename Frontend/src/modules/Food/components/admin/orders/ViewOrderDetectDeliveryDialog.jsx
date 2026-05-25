import { useEffect, useMemo, useState } from "react"
import { X, Clock, CheckCircle, XCircle, User, Phone, Package, MapPin, Loader2 } from "lucide-react"
import { formatOrderAddressWithLabels } from "@food/utils/orderAddressFormatter"
import { adminAPI } from "@food/api"
import { toast } from "sonner"

const getStatusColor = (status) => {
  const colors = {
    "Ordered": "bg-brand-100 text-brand-700 border-brand-200",
    "Restaurant Accepted": "bg-green-100 text-green-700 border-green-200",
    "Accepted": "bg-green-100 text-green-700 border-green-200", // Keep for backward compatibility
    "Rejected": "bg-red-100 text-red-700 border-red-200",
    "Delivery Boy Assigned": "bg-purple-100 text-purple-700 border-purple-200",
    "Delivery Boy Reached Pickup": "bg-orange-100 text-orange-700 border-orange-200",
    "Reached Pickup": "bg-orange-100 text-orange-700 border-orange-200", // Keep for backward compatibility
    "Order ID Accepted": "bg-indigo-100 text-indigo-700 border-indigo-200",
    "Reached Drop": "bg-amber-100 text-amber-700 border-amber-200",
    "Ordered Delivered": "bg-emerald-100 text-emerald-700 border-emerald-200",
  }
  return colors[status] || "bg-slate-100 text-slate-700 border-slate-200"
}

const getStatusIcon = (status) => {
  if (status === "Rejected") return XCircle
  if (status === "Ordered Delivered") return CheckCircle
  return Clock
}

export default function ViewOrderDetectDeliveryDialog({
  isOpen,
  onOpenChange,
  order,
  onAcceptOrder,
  onRejectOrder,
  onAdminStatusChange,
  actionLoadingKey,
  onRefresh,
}) {
  if (!isOpen || !order) return null

  const StatusIcon = getStatusIcon(order.status)
  const sourceOrder = order.originalOrder || order
  const rawAddress =
    sourceOrder.deliveryAddress ||
    sourceOrder.address ||
    sourceOrder.customerAddress ||
    null
  const formattedAddress = rawAddress
    ? formatOrderAddressWithLabels(rawAddress)
    : "Address not available"
  const userAddress = formattedAddress === "Address not available" ? "N/A" : formattedAddress
  const rawStatus = String(order?.rawOrderStatus || "").toLowerCase()
  const dispatchStatus = String(order?.dispatchStatus || "").toLowerCase()
  const isCompletedOrCancelled =
    rawStatus === "delivered" ||
    rawStatus === "completed" ||
    rawStatus === "rejected" ||
    rawStatus === "cancelled" ||
    rawStatus === "cancelled_by_user" ||
    rawStatus === "cancelled_by_restaurant" ||
    rawStatus === "cancelled_by_admin"
  const isRejectedOrCancelled =
    rawStatus === "rejected" ||
    rawStatus === "cancelled" ||
    rawStatus === "cancelled_by_user" ||
    rawStatus === "cancelled_by_restaurant" ||
    rawStatus === "cancelled_by_admin"
  const isCreated = rawStatus === "created" || rawStatus === "pending"
  const canAssign = !isCompletedOrCancelled && !isCreated && dispatchStatus !== "accepted"
  const canAdvanceStatus =
    dispatchStatus === "accepted" &&
    !isCompletedOrCancelled &&
    rawStatus !== "delivered" &&
    rawStatus !== "completed"
  const nextAdminStatus =
    rawStatus === "picked_up" ||
    rawStatus === "out_for_delivery" ||
    rawStatus === "reached_drop" ||
    rawStatus === "at_drop" ||
    rawStatus === "at_delivery"
      ? "delivered"
      : canAdvanceStatus
        ? "picked_up"
        : ""
  const nextAdminStatusLabel =
    nextAdminStatus === "picked_up" ? "Picked Up" : nextAdminStatus === "delivered" ? "Delivered" : ""
  const isAcceptLoading = actionLoadingKey === `accept:${order.orderMongoId}`
  const isRejectLoading = actionLoadingKey === `reject:${order.orderMongoId}`
  const isAssignLoading = actionLoadingKey === `assign:${order.orderMongoId}`
  const isAdvanceLoading = actionLoadingKey === `status:${order.orderMongoId}`
  const [deliveryPartners, setDeliveryPartners] = useState([])
  const [isLoadingPartners, setIsLoadingPartners] = useState(false)
  const [selectedPartnerId, setSelectedPartnerId] = useState("")
  const [isAssigningInline, setIsAssigningInline] = useState(false)
  const rejectionReason =
    String(
      sourceOrder?.cancellationReason ||
      sourceOrder?.rejectReason ||
      sourceOrder?.reason ||
      "",
    ).trim() || "No reason provided"
  const showAccept = isCreated && typeof onAcceptOrder === "function"
  const showReject = !isCompletedOrCancelled && typeof onRejectOrder === "function"
  const showAssign = canAssign
  const showAdvance = Boolean(nextAdminStatus) && typeof onAdminStatusChange === "function"
  const hasActionButtons = showAccept || showReject || showAssign || showAdvance

  const onlinePartners = useMemo(() => {
    return (deliveryPartners || []).filter((partner) => {
      const state = String(partner?.availabilityStatus || "").toLowerCase()
      if (state === "online") return true
      if (state === "offline") return false
      if (partner?.availability?.isOnline === true) return true
      if (partner?.availability?.isOnline === false) return false
      return Boolean(partner?.isOnline)
    })
  }, [deliveryPartners])

  useEffect(() => {
    if (!isOpen || !showAssign) return
    let ignore = false
    const loadPartners = async () => {
      try {
        setIsLoadingPartners(true)
        const response = await adminAPI.getDeliveryPartners({
          page: 1,
          limit: 1000,
          includeAvailability: true,
        })
        if (ignore) return
        const partners = response?.data?.data?.deliveryPartners || []
        setDeliveryPartners(partners)
      } catch (error) {
        if (!ignore) {
          toast.error(error?.response?.data?.message || "Failed to load delivery partners")
          setDeliveryPartners([])
        }
      } finally {
        if (!ignore) setIsLoadingPartners(false)
      }
    }
    loadPartners()
    return () => {
      ignore = true
    }
  }, [isOpen, showAssign])

  const handleInlineAssign = async () => {
    if (!order?.orderMongoId || !selectedPartnerId) return
    try {
      setIsAssigningInline(true)
      await adminAPI.assignDeliveryPartner(order.orderMongoId, selectedPartnerId)
      toast.success("Delivery request sent. Waiting for delivery boy acceptance")
      setSelectedPartnerId("")
      onRefresh?.()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to assign delivery partner")
    } finally {
      setIsAssigningInline(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      
      {/* Dialog */}
      <div className="relative bg-white rounded-xl shadow-2xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Order Details</h2>
            <p className="text-sm text-slate-500 mt-1">Order ID: #{order.orderId}</p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Order Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* User Information */}
            <div className="bg-slate-50 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <User className="w-4 h-4" />
                User Information
              </h3>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-slate-500">Name</p>
                  <p className="text-sm font-medium text-slate-900">{order.userName}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Phone Number</p>
                  <p className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5" />
                    {order.userNumber}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Address</p>
                  <p className="text-sm font-medium text-slate-900 whitespace-pre-line break-words">
                    {userAddress}
                  </p>
                </div>
              </div>
            </div>

            {/* Restaurant Information */}
            <div className="bg-slate-50 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Restaurant Information
              </h3>
              <div>
                <p className="text-xs text-slate-500">Restaurant Name</p>
                <p className="text-sm font-medium text-slate-900">{order.restaurantName}</p>
              </div>
            </div>

            {/* Delivery Boy Information */}
            {order.deliveryBoyName && (
              <div className="bg-slate-50 rounded-lg p-4 md:col-span-2">
                <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Delivery Boy Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500">Name</p>
                    <p className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      {order.deliveryBoyName}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Phone Number</p>
                    <p className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5" />
                      {order.deliveryBoyNumber}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Current Status */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Current Status</h3>
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 ${getStatusColor(order.status)}`}>
              <StatusIcon className="w-4 h-4" />
              <span className="font-semibold">{order.status}</span>
            </div>
            {isRejectedOrCancelled && (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
                <p className="text-xs font-semibold text-rose-700">Rejection Reason</p>
                <p className="text-sm text-rose-800">{rejectionReason}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          {hasActionButtons && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Actions</h3>
            <div className="flex flex-wrap gap-2">
              {showAccept && (
                <button
                  type="button"
                  onClick={() => onAcceptOrder(order)}
                  disabled={isAcceptLoading}
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isAcceptLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {isAcceptLoading ? "Accepting..." : "Accept Order"}
                </button>
              )}
              {showReject && (
                <button
                  type="button"
                  onClick={() => onRejectOrder(order)}
                  disabled={isRejectLoading}
                  className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isRejectLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {isRejectLoading ? "Cancelling..." : "Cancel Order"}
                </button>
              )}
              {showAdvance && (
                <button
                  type="button"
                  onClick={() => onAdminStatusChange(order, nextAdminStatus)}
                  disabled={isAdvanceLoading}
                  className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isAdvanceLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {isAdvanceLoading ? "Updating..." : `Mark ${nextAdminStatusLabel}`}
                </button>
              )}
            </div>
            {showAssign && (
              <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50/40 p-3">
                {isLoadingPartners ? (
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading online delivery partners...
                  </div>
                ) : onlinePartners.length === 0 ? (
                  <p className="text-sm text-slate-600">No online delivery partners found.</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={selectedPartnerId}
                      onChange={(e) => setSelectedPartnerId(e.target.value)}
                      className="min-w-[260px] rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                    >
                      <option value="">Select online delivery boy</option>
                      {onlinePartners.map((partner) => (
                        <option key={partner._id} value={String(partner._id)}>
                          {partner?.name || "Unnamed"} - {partner?.phone || "N/A"}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleInlineAssign}
                      disabled={!selectedPartnerId || isAssigningInline}
                      className="rounded-md bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isAssigningInline ? "Assigning..." : "Assign"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          )}

          {/* Status History Timeline */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Status History</h3>
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200" />
              
              {/* Status items */}
              <div className="space-y-4">
                {order.statusHistory && order.statusHistory.map((historyItem, index) => {
                  const isLast = index === order.statusHistory.length - 1
                  const HistoryIcon = getStatusIcon(historyItem.status)
                  
                  return (
                    <div key={index} className="relative flex items-start gap-4">
                      {/* Icon */}
                      <div className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full border-2 ${getStatusColor(historyItem.status)}`}>
                        <HistoryIcon className="w-4 h-4" />
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 pt-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-sm font-semibold ${getStatusColor(historyItem.status).split(' ')[1]}`}>
                            {historyItem.status}
                          </span>
                          <span className="text-xs text-slate-500">{historyItem.timestamp}</span>
                        </div>
                        {historyItem.deliveryBoy && (
                          <div className="mt-2 text-xs text-slate-600 bg-slate-50 rounded p-2">
                            <p><span className="font-medium">Delivery Boy:</span> {historyItem.deliveryBoy}</p>
                            {historyItem.deliveryBoyNumber && (
                              <p><span className="font-medium">Phone:</span> {historyItem.deliveryBoyNumber}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Order Date & Time */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <div className="flex items-center justify-between text-sm">
              <div>
                <p className="text-slate-500">Order Date</p>
                <p className="font-medium text-slate-900">{order.orderDate}</p>
              </div>
              <div>
                <p className="text-slate-500">Order Time</p>
                <p className="font-medium text-slate-900">{order.orderTime}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200 bg-slate-50">
          <button
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

