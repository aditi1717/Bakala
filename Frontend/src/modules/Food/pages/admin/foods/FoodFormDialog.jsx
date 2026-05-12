import React, { useState, useEffect, useMemo } from "react"
import { Plus, Save, ChevronDown, Trash2, Loader2 } from "lucide-react"
import { adminAPI, uploadAPI } from "@food/api"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@food/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@food/components/ui/popover"

const normalizeEntityId = (value) => {
  if (!value) return ""
  if (typeof value === "string") return value.trim()
  if (typeof value === "object") {
    return String(value?._id || value?.id || value?.restaurantId || "").trim()
  }
  return String(value).trim()
}

const createFoodForm = () => ({
  restaurantId: "",
  categoryId: "",
  categoryName: "",
  name: "",
  price: "",
  variants: [],
  description: "",
  image: "",
  foodType: "Non-Veg",
  isAvailable: true,
  preparationTime: "",
})

const createVariantDraft = (variant = {}) => ({
  id: String(variant?.id || variant?._id || `variant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
  name: String(variant?.name || ""),
  price: variant?.price != null ? String(variant.price) : "",
})

const FoodFormDialog = ({
  open,
  onOpenChange,
  mode = "add",
  editingFood = null,
  restaurantOptions = [],
  initialRestaurantId = "",
  onSuccess,
}) => {
  const [foodForm, setFoodForm] = useState(createFoodForm())
  const [submittingFood, setSubmittingFood] = useState(false)
  const [categorySearch, setCategorySearch] = useState("")
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false)
  const [selectedImageFile, setSelectedImageFile] = useState(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState("")

  // Initialize form when editing or opening
  useEffect(() => {
    if (open) {
      if (mode === "edit" && editingFood) {
        setFoodForm({
          restaurantId: normalizeEntityId(editingFood.restaurantId),
          categoryId: String(editingFood.categoryId || ""),
          categoryName: String(editingFood.categoryName || ""),
          name: String(editingFood.name || ""),
          price: String(editingFood.price || ""),
          variants: (editingFood.variants || []).map(createVariantDraft),
          description: String(editingFood.description || ""),
          image: String(editingFood.image || ""),
          foodType: String(editingFood.foodType || "Non-Veg"),
          isAvailable: editingFood.isAvailable !== false,
          preparationTime: String(editingFood.preparationTime || ""),
        })
        setImagePreviewUrl(String(editingFood.image || ""))
      } else {
        setFoodForm({
          ...createFoodForm(),
          restaurantId: initialRestaurantId || "",
        })
        setImagePreviewUrl("")
      }
      setSelectedImageFile(null)
      setCategorySearch("")
      setCategoryPopoverOpen(false)
    }
  }, [open, mode, editingFood, initialRestaurantId])

  const [allCategories, setAllCategories] = useState([])

  // Fetch categories whenever restaurant changes (Fixed backend makes this reliable)
  useEffect(() => {
    if (!open) {
      setAllCategories([])
      return
    }

    const selectedResId = normalizeEntityId(foodForm.restaurantId)
    let cancelled = false

    const loadCategories = async () => {
      try {
        const params = { limit: 1000 }
        if (selectedResId) {
          params.restaurantId = selectedResId
        }

        const res = await adminAPI.getCategories(params)
        const list =
          res?.data?.data?.categories ||
          res?.data?.categories ||
          (Array.isArray(res?.data?.data) ? res?.data?.data : []) ||
          res?.data?.data?.data?.categories ||
          []
        
        if (!cancelled) setAllCategories(list)
      } catch (error) {
        console.error("Error loading categories:", error)
        if (!cancelled) setAllCategories([])
      }
    }

    loadCategories()
    return () => { cancelled = true }
  }, [open, foodForm.restaurantId])

  // Filter and sort categories client-side (Matches legacy behavior exactly)
  const categoryOptions = useMemo(() => {
    const selectedResId = normalizeEntityId(foodForm.restaurantId)
    
    return allCategories
      .map((c) => {
        // Global/private is determined by current owner (restaurantId), not creator.
        // createdByRestaurantId can remain set even after category is globalized.
        const ownerRestaurantId = String(
          c?.restaurantId?._id ||
          c?.restaurantId?.id ||
          c?.restaurantId ||
          c?.restaurant?._id ||
          c?.restaurant?.id ||
          ""
        ).trim()

        const isGlobal =
          c?.isGlobal === true ||
          c?.isGlobal === "true" ||
          c?.isGlobal === 1 ||
          !ownerRestaurantId ||
          ownerRestaurantId === "undefined" ||
          ownerRestaurantId === "null"

        return {
          id: String(c.id || c._id || c.name),
          name: String(c.name || "").trim(),
          isGlobal: isGlobal,
          normalizedRestaurantId: ownerRestaurantId,
        }
      })
      .filter((c) => {
        if (!selectedResId) return c.isGlobal
        return c.isGlobal || c.normalizedRestaurantId === selectedResId
      })
      .sort((a, b) => {
        const aIsOwn = a.normalizedRestaurantId === selectedResId
        const bIsOwn = b.normalizedRestaurantId === selectedResId
        if (aIsOwn && !bIsOwn) return -1
        if (!aIsOwn && bIsOwn) return 1
        if (a.isGlobal && !b.isGlobal) return -1
        if (!a.isGlobal && b.isGlobal) return 1
        return a.name.localeCompare(b.name)
      })
  }, [allCategories, foodForm.restaurantId])

  const handleVariantChange = (variantId, field, value) => {
    setFoodForm((prev) => ({
      ...prev,
      variants: prev.variants.map((variant) =>
        variant.id === variantId ? { ...variant, [field]: value } : variant
      ),
    }))
  }

  const handleAddVariant = () => {
    setFoodForm((prev) => ({
      ...prev,
      variants: [...prev.variants, createVariantDraft()],
    }))
  }

  const handleRemoveVariant = (variantId) => {
    setFoodForm((prev) => ({
      ...prev,
      variants: prev.variants.filter((variant) => variant.id !== variantId),
    }))
  }

  const handleSubmit = async () => {
    if (!foodForm.restaurantId) {
      toast.error("Please select a restaurant")
      return
    }
    if (!String(foodForm.categoryName || "").trim()) {
      toast.error("Please select or enter a category")
      return
    }
    if (!foodForm.name.trim()) {
      toast.error("Food name is required")
      return
    }

    const normalizedVariants = foodForm.variants
      .map((variant) => ({
        id: String(variant?.id || variant?._id || "").trim(),
        name: String(variant?.name || "").trim(),
        price: Number(variant?.price),
      }))
      .filter((variant) => variant.id || variant.name || variant.price)

    const hasVariants = normalizedVariants.length > 0
    const parsedPrice = Number(foodForm.price)

    if (normalizedVariants.some((variant) => !variant.name)) {
      toast.error("Each variant must have a name")
      return
    }

    if (normalizedVariants.some((variant) => !Number.isFinite(variant.price) || variant.price <= 0)) {
      toast.error("Each variant price must be greater than 0")
      return
    }

    if (!hasVariants && (!Number.isFinite(parsedPrice) || parsedPrice <= 0)) {
      toast.error("Base price must be greater than 0")
      return
    }

    try {
      setSubmittingFood(true)
      let imageUrl = foodForm.image.trim()

      if (selectedImageFile) {
        const uploadResponse = await uploadAPI.uploadMedia(selectedImageFile, {
          folder: "foods",
        })
        imageUrl = uploadResponse?.data?.data?.url || uploadResponse?.data?.url || imageUrl
      }

      const payload = {
        restaurantId: foodForm.restaurantId,
        categoryId: foodForm.categoryId || undefined,
        categoryName: String(foodForm.categoryName || "").trim(),
        name: foodForm.name.trim(),
        price: hasVariants ? undefined : parsedPrice,
        variants: normalizedVariants.map((variant) => ({
          ...(variant.id && !variant.id.startsWith("variant-") ? { _id: variant.id } : {}),
          name: variant.name,
          price: variant.price,
        })),
        description: foodForm.description.trim(),
        image: imageUrl,
        foodType: foodForm.foodType === "Veg" ? "Veg" : "Non-Veg",
        isAvailable: foodForm.isAvailable !== false,
        preparationTime: String(foodForm.preparationTime || "").trim(),
      }

      if (mode === "edit") {
        await adminAPI.updateFood(editingFood?._id || editingFood?.id, payload)
      } else {
        await adminAPI.createFood(payload)
      }
      
      toast.success(mode === "edit" ? "Food updated successfully" : "Food added successfully")
      onOpenChange(false)
      if (onSuccess) onSuccess()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to save food")
    } finally {
      setSubmittingFood(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-slate-200 bg-slate-50">
          <DialogTitle className="text-lg font-semibold text-slate-900">
            {mode === "edit" ? "Edit Food" : "Add Food"}
          </DialogTitle>
        </DialogHeader>
        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Restaurant</label>
              <select
                value={foodForm.restaurantId}
                onChange={(e) => setFoodForm((prev) => ({ ...prev, restaurantId: e.target.value, categoryId: "", categoryName: "" }))}
                disabled={mode === "edit"}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white disabled:bg-slate-100"
              >
                <option value="">Select restaurant</option>
                {restaurantOptions.map((restaurant) => (
                  <option key={restaurant.id} value={restaurant.id}>
                    {restaurant.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
              <Popover open={categoryPopoverOpen} onOpenChange={setCategoryPopoverOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-left flex items-center justify-between"
                  >
                    <span className={foodForm.categoryName ? "text-slate-900" : "text-slate-400"}>
                      {foodForm.categoryName || "Select category"}
                    </span>
                    <ChevronDown className="w-4 h-4 text-slate-500" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
                  <input
                    type="text"
                    value={categorySearch}
                    onChange={(e) => setCategorySearch(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white mb-2"
                    placeholder="Search category..."
                    autoFocus
                  />
                  <div className="max-h-56 overflow-y-auto">
                    {categoryOptions
                      .filter((c) => {
                        const q = categorySearch.trim().toLowerCase()
                        return !q || c.name.toLowerCase().includes(q)
                      })
                      .map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setFoodForm((prev) => ({ ...prev, categoryId: c.id, categoryName: c.name }))
                            setCategoryPopoverOpen(false)
                          }}
                          className={`w-full text-left px-3 py-2 rounded-md text-sm hover:bg-slate-100 ${
                            foodForm.categoryName === c.name ? "bg-slate-100 font-medium" : ""
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span>{c.name}</span>
                            {c.normalizedRestaurantId === normalizeEntityId(foodForm.restaurantId) && (
                                <span className="text-[10px] bg-brand-50 text-brand-600 px-1.5 py-0.5 rounded border border-brand-100 font-bold">OWN</span>
                            )}
                          </div>
                        </button>
                      ))}
                    {categoryOptions.length === 0 && (
                      <div className="px-3 py-2 text-sm text-slate-500">No categories found</div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Food Name</label>
              <input
                type="text"
                value={foodForm.name}
                onChange={(e) => setFoodForm((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Base Price</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={foodForm.price}
                onChange={(e) => setFoodForm((prev) => ({ ...prev, price: e.target.value }))}
                disabled={foodForm.variants.length > 0}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white disabled:bg-slate-100 disabled:text-slate-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Food Type</label>
              <select
                value={foodForm.foodType}
                onChange={(e) => setFoodForm((prev) => ({ ...prev, foodType: e.target.value }))}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white"
              >
                <option value="Veg">Veg</option>
                <option value="Non-Veg">Non-Veg</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Preparation Time</label>
              <select
                value={foodForm.preparationTime}
                onChange={(e) => setFoodForm((prev) => ({ ...prev, preparationTime: e.target.value }))}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white"
              >
                <option value="">Select timing</option>
                <option value="10-20 mins">10-20 mins</option>
                <option value="20-25 mins">20-25 mins</option>
                <option value="25-35 mins">25-35 mins</option>
                <option value="35-45 mins">35-45 mins</option>
                <option value="45+ mins">45+ mins</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Upload Image</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null
                  setSelectedImageFile(file)
                  if (file) setImagePreviewUrl(URL.createObjectURL(file))
                }}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm"
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="isAvailable"
                checked={foodForm.isAvailable}
                onChange={(e) => setFoodForm((prev) => ({ ...prev, isAvailable: e.target.checked }))}
                className="w-4 h-4 text-brand-600 border-slate-300 rounded focus:ring-brand-500"
              />
              <label htmlFor="isAvailable" className="text-sm font-medium text-slate-700">
                Available for ordering
              </label>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">Variants</label>
              <button
                type="button"
                onClick={handleAddVariant}
                className="text-xs font-semibold text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Add Variant
              </button>
            </div>
            <div className="space-y-2">
              {foodForm.variants.map((variant) => (
                <div key={variant.id} className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <input
                    placeholder="Variant Name"
                    value={variant.name}
                    onChange={(e) => handleVariantChange(variant.id, "name", e.target.value)}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
                  />
                  <input
                    type="number"
                    placeholder="Price"
                    value={variant.price}
                    onChange={(e) => handleVariantChange(variant.id, "price", e.target.value)}
                    className="w-24 px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveVariant(variant.id)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-md transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {foodForm.variants.length === 0 && (
                <div className="text-center py-4 border border-dashed border-slate-300 rounded-lg text-sm text-slate-400">
                  No variants added
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea
              rows={3}
              value={foodForm.description}
              onChange={(e) => setFoodForm((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white"
              placeholder="Tell customers more about this dish..."
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submittingFood}
              className="px-6 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {submittingFood ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {mode === "edit" ? "Update Food" : "Add Food"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default FoodFormDialog
