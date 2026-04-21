import { useEffect, useState } from "react"
import { Loader2, MapPin, Phone, Truck } from "lucide-react"
import { adminAPI } from "@food/api"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const normalizeId = (value) => {
  if (!value) return ""
  if (typeof value === "string") return value.trim()
  if (typeof value === "number") return String(value)
  if (typeof value === "object") {
    if (value?._id) return normalizeId(value._id)
    if (value?.$oid) return String(value.$oid).trim()
    if (typeof value.toString === "function") {
      const raw = String(value.toString()).trim()
      if (raw && raw !== "[object Object]") return raw
    }
  }
  return ""
}

const isPartnerOnline = (partner) => {
  const state = String(partner?.availabilityStatus || "").toLowerCase()
  if (state === "online") return true
  if (state === "offline") return false
  if (partner?.availability?.isOnline === true) return true
  if (partner?.availability?.isOnline === false) return false
  return Boolean(partner?.isOnline)
}

const normalizeLabel = (value) => String(value || "").trim().toLowerCase()

const getPartnerZoneId = (partner) =>
  normalizeId(partner?.zoneId?._id) ||
  normalizeId(partner?.zoneId) ||
  normalizeId(partner?.zone?._id) ||
  normalizeId(partner?.zone)

const getPartnerZoneLabel = (partner) =>
  normalizeLabel(
    partner?.zoneId?.name ||
      partner?.zoneId?.zoneName ||
      partner?.zoneId?.serviceLocation ||
      partner?.zone?.name ||
      partner?.zone?.zoneName ||
      partner?.zone?.serviceLocation ||
      partner?.zone ||
      "",
  )

const parseCoords = (coords = []) => {
  if (!Array.isArray(coords) || coords.length < 2) return null
  let lat = null
  let lng = null
  if (coords[0] > -180 && coords[0] < 180 && coords[1] > -90 && coords[1] < 90) {
    lng = Number(coords[0])
    lat = Number(coords[1])
  } else {
    lat = Number(coords[0])
    lng = Number(coords[1])
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

const getZonePoint = (coord = {}) => {
  if (Array.isArray(coord) && coord.length >= 2) return parseCoords(coord)
  const lat = Number(coord?.latitude ?? coord?.lat)
  const lng = Number(coord?.longitude ?? coord?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

const isPointInsidePolygon = (point, polygon = []) => {
  if (!point || !Array.isArray(polygon) || polygon.length < 3) return false
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = Number(polygon[i]?.lng)
    const yi = Number(polygon[i]?.lat)
    const xj = Number(polygon[j]?.lng)
    const yj = Number(polygon[j]?.lat)
    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / ((yj - yi) || Number.EPSILON) + xi
    if (intersect) inside = !inside
  }
  return inside
}

const getPartnerPoint = (partner = {}) => {
  const availabilityCoords = partner?.availability?.currentLocation?.coordinates
  const locationCoords = partner?.location?.coordinates
  const currentCoords = partner?.currentLocation?.coordinates
  return parseCoords(availabilityCoords) || parseCoords(locationCoords) || parseCoords(currentCoords) || null
}

const partnerMatchesZone = (partner, zoneId, zoneLabel) => {
  const partnerZoneId = getPartnerZoneId(partner)
  if (partnerZoneId && zoneId && partnerZoneId === zoneId) return true

  const partnerZoneLabel = getPartnerZoneLabel(partner)
  if (partnerZoneLabel && zoneLabel && partnerZoneLabel === zoneLabel) return true

  return false
}

export default function AssignDeliveryPartnerDialog({
  isOpen,
  onOpenChange,
  order,
  onAssigned,
}) {
  const [deliveryPartners, setDeliveryPartners] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedPartnerId, setSelectedPartnerId] = useState("")
  const [isAssigning, setIsAssigning] = useState(false)

  const orderZoneId =
    normalizeId(order?.zoneId) ||
    normalizeId(order?.originalOrder?.zoneId?._id) ||
    normalizeId(order?.originalOrder?.zoneId) ||
    normalizeId(order?.originalOrder?.restaurantId?.zoneId?._id) ||
    normalizeId(order?.originalOrder?.restaurantId?.zoneId)
  const orderZoneLabel = normalizeLabel(
    order?.zoneName ||
      order?.originalOrder?.zoneId?.name ||
      order?.originalOrder?.zoneId?.zoneName ||
      order?.originalOrder?.zoneId?.serviceLocation ||
      order?.originalOrder?.restaurantId?.zoneId?.name ||
      order?.originalOrder?.restaurantId?.zoneId?.zoneName ||
      order?.originalOrder?.restaurantId?.zoneId?.serviceLocation ||
      "",
  )

  useEffect(() => {
    if (!isOpen) {
      setDeliveryPartners([])
      setSelectedPartnerId("")
      setIsLoading(false)
      setIsAssigning(false)
      return
    }

    if (!orderZoneId) {
      setDeliveryPartners([])
      return
    }

    const loadPartners = async () => {
      try {
        setIsLoading(true)
        const [zoneScopedResponse, allPartnersResponse, zonesResponse] = await Promise.all([
          adminAPI.getDeliveryPartners({
            page: 1,
            limit: 1000,
            zoneId: orderZoneId,
            includeAvailability: true,
          }),
          adminAPI.getDeliveryPartners({
            page: 1,
            limit: 1000,
            includeAvailability: true,
          }),
          adminAPI.getZones({ page: 1, limit: 1000, isActive: true }),
        ])

        const zoneScopedList = zoneScopedResponse?.data?.data?.deliveryPartners || []
        const allPartners = allPartnersResponse?.data?.data?.deliveryPartners || []
        const zones = zonesResponse?.data?.data?.zones || []

        const matchedZone =
          zones.find((zone) => normalizeId(zone?._id || zone?.id) === orderZoneId) ||
          zones.find((zone) => normalizeLabel(zone?.name || zone?.zoneName || zone?.serviceLocation) === orderZoneLabel) ||
          null

        const zonePolygon = Array.isArray(matchedZone?.coordinates)
          ? matchedZone.coordinates.map(getZonePoint).filter(Boolean)
          : []

        const fallbackSameZone = allPartners.filter((partner) =>
          partnerMatchesZone(partner, orderZoneId, orderZoneLabel),
        )
        const fallbackInsideZone = allPartners.filter((partner) => {
          if (zonePolygon.length < 3) return false
          const point = getPartnerPoint(partner)
          return isPointInsidePolygon(point, zonePolygon)
        })

        const mergedById = new Map()
        for (const partner of [...zoneScopedList, ...fallbackSameZone, ...fallbackInsideZone]) {
          const id = String(partner?._id || "")
          if (!id) continue
          mergedById.set(id, partner)
        }

        setDeliveryPartners(Array.from(mergedById.values()))
      } catch (error) {
        toast.error(error?.response?.data?.message || "Failed to load delivery partners")
        setDeliveryPartners([])
      } finally {
        setIsLoading(false)
      }
    }

    loadPartners()
  }, [isOpen, orderZoneId, orderZoneLabel])

  const handleAssign = async () => {
    if (!order?.orderMongoId || !selectedPartnerId) return

    try {
      setIsAssigning(true)
      await adminAPI.assignDeliveryPartner(order.orderMongoId, selectedPartnerId)
      toast.success("Delivery request sent. Waiting for delivery boy acceptance")
      onAssigned?.()
      onOpenChange(false)
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to assign delivery partner")
    } finally {
      setIsAssigning(false)
    }
  }

  const sortedPartners = [...deliveryPartners].sort((a, b) => {
    const aOnline = isPartnerOnline(a)
    const bOnline = isPartnerOnline(b)
    if (aOnline === bOnline) return 0
    return aOnline ? -1 : 1
  })

  const onlineCount = sortedPartners.filter(
    (partner) => isPartnerOnline(partner),
  ).length

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl !p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Assign Delivery Partner</DialogTitle>
          <DialogDescription>
            {order?.orderId
              ? `Choose a delivery partner for order #${order.orderId}.`
              : "Choose a delivery partner."}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4">
          {!orderZoneId ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-800">
              This order does not have a zone assigned yet, so same-zone delivery partners cannot be listed.
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
            </div>
          ) : sortedPartners.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
              No delivery partners were found in this zone.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Showing <span className="font-semibold text-slate-800">{sortedPartners.length}</span> partners in this zone
                {" | "}
                <span className="font-semibold text-emerald-700">{onlineCount} online</span>
                {" | "}
                <span className="font-semibold text-slate-700">{sortedPartners.length - onlineCount} offline</span>
              </div>
              <div className="max-h-[380px] space-y-3 overflow-y-auto pr-1">
                {sortedPartners.map((partner) => {
                  const isSelected = selectedPartnerId === String(partner._id)
                  const isOnline = isPartnerOnline(partner)
                  return (
                    <button
                      key={partner._id}
                      type="button"
                      onClick={() => setSelectedPartnerId(String(partner._id))}
                      className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                        isSelected
                          ? "border-orange-400 bg-orange-50 shadow-sm"
                          : "border-slate-200 bg-white hover:border-orange-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{partner.name || "Unnamed Partner"}</p>
                          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
                            <span className="inline-flex items-center gap-1">
                              <Phone className="h-3.5 w-3.5" />
                              {partner.phone || "N/A"}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              {partner.zone || "Zone not set"}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Truck className="h-3.5 w-3.5" />
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                  isOnline
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {isOnline ? "Online" : "Offline"}
                              </span>
                            </span>
                          </div>
                        </div>
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                            isSelected
                              ? "bg-orange-500 text-white"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {isSelected ? "Selected" : "Select"}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 pb-6 pt-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAssign}
            disabled={!selectedPartnerId || isAssigning || !orderZoneId}
            className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isAssigning ? "Assigning..." : "Assign Partner"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
