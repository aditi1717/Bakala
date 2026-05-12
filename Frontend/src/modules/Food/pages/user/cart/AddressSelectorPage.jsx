import { useMemo, useState, useEffect, useRef, useCallback } from "react"
import { useNavigate, useLocation as useRouterLocation } from "react-router-dom"
import { ChevronLeft, ChevronRight, Plus, MapPin, Home, Building2, Briefcase, Trash2 } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { Label } from "@food/components/ui/label"
import { useProfile } from "@food/context/ProfileContext"
import { toast } from "sonner"
import { isModuleAuthenticated } from "@food/utils/auth"
import AnimatedPage from "@food/components/user/AnimatedPage"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import BRAND_THEME from "@/config/brandTheme"

const isCoordinateLikeText = (value) => {
  const text = String(value || "").trim()
  if (!text) return false
  return /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(text)
}

const composeAddressText = (address = {}) => {
  if (!address || typeof address !== "object") return ""

  const formattedAddress = String(address.formattedAddress || "").trim()
  if (formattedAddress && !isCoordinateLikeText(formattedAddress)) {
    return formattedAddress
  }

  const parts = [
    address.floor ? `Floor ${String(address.floor).trim()}` : "",
    address.buildingName,
    address.street,
    address.additionalDetails,
    address.landmark,
    address.city,
    address.state,
    address.zipCode || address.postalCode,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)

  // Prevent repeated values when area/additionalDetails and landmark are same text.
  const seen = new Set()
  const uniqueParts = parts.filter((part) => {
    const key = part.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return uniqueParts.join(", ")
}

// Get icon based on address type/label
const getAddressIcon = (address) => {
  const label = (address.label || address.additionalDetails || "").toLowerCase()
  if (label.includes("home")) return Home
  if (label.includes("work") || label.includes("office")) return Briefcase
  if (label.includes("building") || label.includes("apt")) return Building2
  return Home
}

const buildLocationPayloadFromAddress = (address) => {
  if (!address || typeof address !== "object") return null

  const coordinates = Array.isArray(address.location?.coordinates)
    ? address.location.coordinates
    : []
  const longitude = Number(
    coordinates[0] ?? address.longitude ?? address.lng ?? null,
  )
  const latitude = Number(
    coordinates[1] ?? address.latitude ?? address.lat ?? null,
  )

  const street = String(address.street || "").trim()
  const area = String(address.additionalDetails || address.area || "").trim()
  const buildingName = String(address.buildingName || "").trim()
  const floor = String(address.floor || "").trim()
  const landmark = String(address.landmark || "").trim()
  const city = String(address.city || "").trim()
  const state = String(address.state || "").trim()
  const zipCode = String(address.zipCode || address.postalCode || "").trim()
  const formattedAddress =
    composeAddressText(address) ||
    [area, street, city, state, zipCode].filter(Boolean).join(", ") ||
    [street, city, state].filter(Boolean).join(", ")

  return {
    label: address.label || "Home",
    latitude: Number.isFinite(latitude) ? latitude : undefined,
    longitude: Number.isFinite(longitude) ? longitude : undefined,
    street,
    area,
    buildingName,
    floor,
    landmark,
    city,
    state,
    zipCode,
    postalCode: zipCode,
    address: [street, city].filter(Boolean).join(", ") || formattedAddress,
    formattedAddress,
  }
}

const persistSelectedLocation = (locationData) => {
  if (!locationData) return
  try {
    localStorage.setItem("userLocation", JSON.stringify(locationData))
    window.dispatchEvent(
      new CustomEvent("userLocationUpdated", {
        detail: { location: locationData },
      }),
    )
  } catch {
    // Ignore storage/event sync errors so selection still works.
  }
}

export default function AddressSelectorPage({ formOnly = false }) {
  const navigate = useNavigate()
  const routerLocation = useRouterLocation()
  const goBack = useAppBackNavigation()
  const { addresses = [], addAddress, updateAddress, deleteAddress, setDefaultAddress } = useProfile()
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [editingAddressId, setEditingAddressId] = useState(null)
  const [addressFormData, setAddressFormData] = useState({
    street: "",
    buildingName: "",
    floor: "",
    landmark: "",
    city: "",
    state: "",
    zipCode: "",
    additionalDetails: "",
    label: "Home",
  })
  const [loadingAddress, setLoadingAddress] = useState(false)
  const [keyboardInset, setKeyboardInset] = useState(0)
  const formBodyRef = useRef(null)
  const manualFieldRefs = useRef({})
  const getAddressId = (address) => address?.id || address?._id || null
  const isFormRoute = formOnly || routerLocation.pathname.includes("/address-form")

  const normalizeFoodPath = useCallback((value) => {
    if (typeof value !== "string") return null
    const text = value.trim()
    if (!text) return null
    if (text.startsWith("/food/")) return text
    if (text === "/food") return "/food/user"
    if (text.startsWith("/user/")) return `/food${text}`
    if (text === "/user") return "/food/user"
    return null
  }, [])

  const cartReturnPath = useMemo(() => {
    const fromState =
      normalizeFoodPath(routerLocation.state?.backTo) ||
      normalizeFoodPath(routerLocation.state?.from)
    if (fromState && fromState.startsWith("/food/user/cart")) return fromState
    if (routerLocation.pathname.includes("/cart/address-selector")) return "/food/user/cart"
    if (routerLocation.pathname.includes("/cart/address-form")) return "/food/user/cart"
    return null
  }, [normalizeFoodPath, routerLocation.pathname, routerLocation.state])

  const formReturnPath = useMemo(() => {
    const fromState =
      normalizeFoodPath(routerLocation.state?.backTo) ||
      normalizeFoodPath(routerLocation.state?.from)
    if (!fromState) return null
    if (fromState.includes("/address-form")) return null
    return fromState
  }, [normalizeFoodPath, routerLocation.state])

  const handleBack = () => {
    goBack()
  }

  const handleSelectSavedAddress = async (address) => {
    const id = getAddressId(address)
    if (id) {
      await setDefaultAddress(id)
      persistSelectedLocation(buildLocationPayloadFromAddress(address))
      try { localStorage.setItem("deliveryAddressMode", "saved") } catch {}
      toast.success("Address selected")
      if (cartReturnPath) {
        navigate(cartReturnPath, { replace: true })
        return
      }
      handleBack()
    }
  }

  const openAddressFormPage = useCallback((extraState = {}) => {
    const currentPath = `${routerLocation.pathname || ""}${routerLocation.search || ""}${routerLocation.hash || ""}` || "/food/user/address-selector"
    navigate("/food/user/address-form", {
      state: {
        from: currentPath,
        backTo: currentPath,
        openAddressForm: true,
        ...extraState,
      },
    })
  }, [navigate, routerLocation.hash, routerLocation.pathname, routerLocation.search])

  const handleAddAddressClick = () => {
    const isLoggedInUser = isModuleAuthenticated("user")
    if (!isLoggedInUser) {
      toast.error("Please login first to add a new address")
      navigate("/user/auth/login", {
        replace: true,
        state: {
          from: `${routerLocation.pathname || "/food/user/address-selector"}${routerLocation.search || ""}`,
        },
      })
      return
    }

    if (!isFormRoute) {
      openAddressFormPage()
      return
    }
    setEditingAddressId(null)
    setAddressFormData({
      street: "",
      buildingName: "",
      floor: "",
      landmark: "",
      city: "",
      state: "",
      zipCode: "",
      additionalDetails: "",
      label: "Home",
    })
    setShowAddressForm(true)
  }

  const handleEditAddressClick = (address) => {
    if (!address || typeof address !== "object") return
    if (!isFormRoute) {
      openAddressFormPage({ editAddress: address })
      return
    }

    const id = getAddressId(address)
    setEditingAddressId(id || null)
    setAddressFormData({
      street: String(address.street || "").trim(),
      buildingName: String(address.buildingName || "").trim(),
      floor: String(address.floor || "").trim(),
      landmark: String(address.landmark || "").trim(),
      city: String(address.city || "").trim(),
      state: String(address.state || "").trim(),
      zipCode: String(address.zipCode || "").trim(),
      additionalDetails: String(address.additionalDetails || address.landmark || "").trim(),
      label: String(address.label || "Home").trim() === "Office" ? "Work" : String(address.label || "Home").trim(),
    })
    setShowAddressForm(true)
  }

  useEffect(() => {
    if (isFormRoute && !showAddressForm) {
      setShowAddressForm(true)
    }
  }, [isFormRoute, showAddressForm])

  useEffect(() => {
    if (!isFormRoute) return
    const stateEditAddress = routerLocation.state?.editAddress
    if (!stateEditAddress) return
    handleEditAddressClick(stateEditAddress)
  }, [isFormRoute, routerLocation.state])

  useEffect(() => {
    if (!routerLocation.state?.openCurrentLocationForm && !routerLocation.state?.openAddressForm) return
    if (showAddressForm) return
    handleAddAddressClick()
  }, [routerLocation.state, showAddressForm])

  const handleDeleteAddressClick = async (address) => {
    const id = getAddressId(address)
    if (!id) return
    const ok = window.confirm("Delete this saved address?")
    if (!ok) return
    try {
      await deleteAddress(id)
      toast.success("Address deleted")
    } catch {
      toast.error("Failed to delete address")
    } finally {
    }
  }

  const handleCancelAddressForm = () => {
    setEditingAddressId(null)
    if (isFormRoute) {
      handleBack()
      return
    }
    setShowAddressForm(false)
  }

  const scrollFieldIntoView = useCallback((fieldName) => {
    const el = manualFieldRefs.current?.[fieldName]
    if (!el) return
    setTimeout(() => {
      try {
        const scrollHost = formBodyRef.current
        if (!scrollHost) {
          el.scrollIntoView({ behavior: "smooth", block: "center" })
          return
        }
        const hostRect = scrollHost.getBoundingClientRect()
        const elRect = el.getBoundingClientRect()
        const viewportHeight =
          typeof window !== "undefined" && window.visualViewport
            ? window.visualViewport.height
            : window.innerHeight
        const safeBottom = viewportHeight - keyboardInset - 90
        const overBy = elRect.bottom - safeBottom
        if (overBy > 0) {
          scrollHost.scrollTo({
            top: scrollHost.scrollTop + overBy + 24,
            behavior: "smooth",
          })
          return
        }
        if (elRect.top < hostRect.top + 70) {
          const upBy = hostRect.top + 70 - elRect.top
          scrollHost.scrollTo({
            top: Math.max(0, scrollHost.scrollTop - upBy - 12),
            behavior: "smooth",
          })
          return
        }
        el.scrollIntoView({ behavior: "smooth", block: "center" })
      } catch {
        // Ignore scrolling errors.
      }
    }, 120)
  }, [keyboardInset])

  const handleAddressFormSubmit = async (e) => {
    e.preventDefault()
    if (!addressFormData.buildingName?.trim()) {
      toast.error("Building / apartment is required")
      return
    }
    if (!addressFormData.floor?.trim()) {
      toast.error("Floor / flat / unit is required")
      return
    }
    if (!addressFormData.landmark?.trim()) {
      toast.error("Landmark / area details are required")
      return
    }
    if (!addressFormData.city?.trim() || !addressFormData.state?.trim()) {
      toast.error("City and state are required")
      return
    }
    if (!addressFormData.zipCode?.trim()) {
      toast.error("Pincode / ZIP is required")
      return
    }
    setLoadingAddress(true)
    try {
      const payload = {
        ...addressFormData,
        label: addressFormData.label === "Work" ? "Office" : addressFormData.label,
        formattedAddress: composeAddressText(addressFormData),
        address: composeAddressText(addressFormData),
      }
      const savedAddress = editingAddressId
        ? await updateAddress(editingAddressId, payload)
        : await addAddress(payload)
      if (savedAddress) {
        const id = getAddressId(savedAddress)
        if (id) await setDefaultAddress(id)
        persistSelectedLocation(buildLocationPayloadFromAddress(savedAddress || payload))
        try { localStorage.setItem("deliveryAddressMode", "saved") } catch {}
        toast.success(editingAddressId ? "Address updated" : "Address saved")
        setEditingAddressId(null)
        if (formReturnPath) {
          navigate(formReturnPath, { replace: true })
          return
        }
        if (isFormRoute) {
          navigate("/food/user/address-selector", { replace: true })
          return
        }
        setShowAddressForm(false)
      }
    } catch (error) {
      toast.error(editingAddressId ? "Failed to update address" : "Failed to save address")
    } finally {
      setLoadingAddress(false)
    }
  }

  useEffect(() => {
    if (!showAddressForm || typeof window === "undefined" || !window.visualViewport) return
    const viewport = window.visualViewport
    const updateKeyboardInset = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      setKeyboardInset(inset > 0 ? inset : 0)
    }
    updateKeyboardInset()
    viewport.addEventListener("resize", updateKeyboardInset)
    viewport.addEventListener("scroll", updateKeyboardInset)
    return () => {
      viewport.removeEventListener("resize", updateKeyboardInset)
      viewport.removeEventListener("scroll", updateKeyboardInset)
    }
  }, [showAddressForm])

  if (showAddressForm || isFormRoute) {
    return (
      <AnimatedPage
        className="fixed inset-0 z-50 bg-white dark:bg-[#0a0a0a] flex flex-col h-screen overflow-hidden"
      >
        <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] border-b border-gray-100 dark:border-gray-800 px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleCancelAddressForm} className="rounded-full">
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <h1 className="text-lg font-bold">{editingAddressId ? "Edit delivery location" : "Add delivery location"}</h1>
        </div>

        <div
          ref={formBodyRef}
          className="flex-1 overflow-y-auto"
          style={{ paddingBottom: `${96 + keyboardInset}px` }}
        >
          <div className="relative bg-white dark:bg-[#0a0a0a] p-4 space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-1 block">Building / Apartment</Label>
                <Input
                  placeholder="Apartment, building, tower"
                  value={addressFormData.buildingName || ""}
                  onChange={e => setAddressFormData({...addressFormData, buildingName: e.target.value})}
                  onFocus={() => scrollFieldIntoView("buildingName")}
                  ref={(el) => { manualFieldRefs.current.buildingName = el }}
                  className="h-12 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#111111]"
                  required
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-1 block">Floor / Flat / Unit</Label>
                <Input
                  placeholder="Floor 3, Flat 302"
                  value={addressFormData.floor || ""}
                  onChange={e => setAddressFormData({...addressFormData, floor: e.target.value})}
                  onFocus={() => scrollFieldIntoView("floor")}
                  ref={(el) => { manualFieldRefs.current.floor = el }}
                  className="h-12 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#111111]"
                  required
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-1 block">Landmark / Area details</Label>
              <Input
                placeholder="Near metro, gate no 2, backside lane"
                value={addressFormData.landmark || addressFormData.additionalDetails || ""}
                onChange={e => setAddressFormData({
                  ...addressFormData,
                  landmark: e.target.value,
                  additionalDetails: e.target.value,
                })}
                onFocus={() => scrollFieldIntoView("landmark")}
                ref={(el) => { manualFieldRefs.current.landmark = el }}
                className="h-12 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#111111]"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-1 block">City</Label>
                <Input 
                  value={addressFormData.city} 
                  onChange={e => setAddressFormData({...addressFormData, city: e.target.value})}
                  onFocus={() => scrollFieldIntoView("city")}
                  ref={(el) => { manualFieldRefs.current.city = el }}
                  className="h-12 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#111111]"
                  required 
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-1 block">State</Label>
                <Input 
                  value={addressFormData.state} 
                  onChange={e => setAddressFormData({...addressFormData, state: e.target.value})}
                  onFocus={() => scrollFieldIntoView("state")}
                  ref={(el) => { manualFieldRefs.current.state = el }}
                  className="h-12 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#111111]"
                  required 
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-1 block">Pincode / ZIP</Label>
              <Input 
                placeholder="Pincode" 
                value={addressFormData.zipCode || ""} 
                onChange={e => setAddressFormData({...addressFormData, zipCode: e.target.value})}
                onFocus={() => scrollFieldIntoView("zipCode")}
                ref={(el) => { manualFieldRefs.current.zipCode = el }}
                className="h-12 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#111111]"
                required
              />
            </div>

            <div>
               <Label className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-2 block">Save address as</Label>
               <div className="flex gap-2">
                 {["Home", "Work", "Other"].map(l => (
                   <Button 
                     key={l}
                     variant={addressFormData.label === l ? "default" : "outline"}
                     onClick={() => setAddressFormData({...addressFormData, label: l})}
                     className="flex-1"
                     style={addressFormData.label === l ? {backgroundColor: BRAND_THEME.tokens.cart.primaryText, color: 'white'} : {}}
                   >
                     {l}
                   </Button>
                 ))}
               </div>
            </div>
          </div>
        </div>

        <div
          className="fixed left-0 right-0 p-4 bg-white dark:bg-[#1a1a1a] border-t dark:border-gray-800 transition-[bottom] duration-150"
          style={{ bottom: `${keyboardInset}px` }}
        >
          <Button 
            className="w-full h-12 text-white font-bold text-lg" 
            style={{backgroundColor: BRAND_THEME.tokens.cart.primaryText}}
            onClick={handleAddressFormSubmit}
            disabled={loadingAddress}
          >
            {loadingAddress ? (editingAddressId ? "Updating..." : "Saving...") : (editingAddressId ? "Update Address" : "Save Address \u0026 Proceed")}
          </Button>
        </div>
      </AnimatedPage>
    )
  }

  return (
    <AnimatedPage className={`min-h-screen ${BRAND_THEME.tokens.cart.pageBackground} flex flex-col`}>
      <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] border-b border-gray-100 dark:border-gray-800 px-4 py-4 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={handleBack} className="rounded-full">
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <h1 className="text-xl font-bold">Select Location</h1>
      </div>
      <div className="flex-1 overflow-y-auto pb-10">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">Saved Addresses</h2>
            <Button variant="ghost" className="p-0 h-auto font-bold" style={{ color: BRAND_THEME.tokens.cart.primaryText }} onClick={handleAddAddressClick}>
              <Plus className="h-4 w-4 mr-1" /> Add New
            </Button>
          </div>

          <div className="space-y-4">
            {addresses.length === 0 ? (
              <div className="text-center py-10 opacity-50">
                <MapPin className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                <p>No addresses saved yet</p>
              </div>
            ) : (
              addresses.map((addr, idx) => {
                const Icon = getAddressIcon(addr)
                const addressId = getAddressId(addr) || idx
                return (
                  <div
                    key={addressId}
                    className="w-full flex items-start gap-4 p-4 bg-slate-50 dark:bg-[#1a1a1a] rounded-xl hover:bg-brand-50 dark:hover:bg-brand-900/10 transition-colors text-left group"
                  >
                    <div className="h-10 w-10 rounded-full bg-white dark:bg-gray-800 flex items-center justify-center shadow-sm">
                      <Icon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectSavedAddress(addr)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className="font-bold text-gray-900 dark:text-white capitalize">{addr.label || "Address"}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">
                        {composeAddressText(addr)}
                      </p>
                    </button>
                    <div className="relative flex items-center gap-2 mt-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteAddressClick(addr)}
                        className="h-9 w-9 rounded-full border border-red-200 bg-white text-red-600 hover:bg-red-50 dark:bg-gray-800 dark:border-red-900/40 dark:hover:bg-red-950/30"
                        aria-label={`Delete ${addr.label || "address"}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <button
                        type="button"
                        onClick={() => handleSelectSavedAddress(addr)}
                        className="h-6 w-6 rounded-full border border-gray-200 dark:border-gray-700 mt-2 flex items-center justify-center"
                        style={{ borderColor: BRAND_THEME.colors.brand.primary }}
                        aria-label={`Select ${addr.label || "address"}`}
                      >
                        <ChevronRight className="h-3 w-3 text-gray-400" style={{ color: BRAND_THEME.colors.brand.primary }} />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </AnimatedPage>
  )
}
