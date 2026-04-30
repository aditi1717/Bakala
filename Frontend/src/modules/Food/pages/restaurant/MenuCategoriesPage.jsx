import { useEffect, useRef, useState } from "react"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { AnimatePresence, motion } from "framer-motion"
import {
  ArrowLeft,
  BadgeCheck,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { restaurantAPI, uploadAPI } from "@food/api"
import { toast } from "sonner"
import BRAND_THEME from "@/config/brandTheme"

const defaultFormData = {
  name: "",
  type: "",
  image: "",
  isActive: true,
  foodTypeScope: "Veg",
}

const approvalBadgeClass = (status) => {
  const value = String(status || "pending").toLowerCase()
  if (value === "approved") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (value === "rejected") return "bg-rose-50 text-rose-700 border-rose-200"
  return "bg-amber-50 text-amber-700 border-amber-200"
}

const scopePillClass = (scope) => {
  if (scope === "Veg") return "bg-green-50 text-green-700 border-green-200"
  if (scope === "Non-Veg") return "bg-red-50 text-red-700 border-red-200"
  return "bg-slate-100 text-slate-700 border-slate-200"
}

const isRestaurantOwnedCategory = (category) => {
  if (!category || typeof category !== "object") return false
  if (category?.ownedByRestaurant === true || category?.canEdit === true) return true

  const restaurantId = category?.restaurantId
  const createdByRestaurantId = category?.createdByRestaurantId
  const restaurantObjectId = typeof restaurantId === "object" ? restaurantId?._id || restaurantId?.id : restaurantId
  const creatorObjectId =
    typeof createdByRestaurantId === "object"
      ? createdByRestaurantId?._id || createdByRestaurantId?.id
      : createdByRestaurantId

  return Boolean(restaurantObjectId || creatorObjectId)
}

export default function MenuCategoriesPage() {
  const goBack = useRestaurantBackNavigation()
  const fileInputRef = useRef(null)

  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)
  const [formData, setFormData] = useState(defaultFormData)
  const [selectedImageFile, setSelectedImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [saving, setSaving] = useState(false)

  const loadCategories = async () => {
    try {
      setLoading(true)
      const response = await restaurantAPI.getAllCategories()
      const list = response?.data?.data?.categories || response?.data?.categories || []
      const restaurantOwnedCategories = Array.isArray(list)
        ? list.filter((category) => isRestaurantOwnedCategory(category) && category?.isGlobal !== true)
        : []
      setCategories(restaurantOwnedCategories)
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load categories")
      setCategories([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCategories()
  }, [])

  const resetModal = () => {
    setIsModalOpen(false)
    setEditingCategory(null)
    setFormData(defaultFormData)
    setSelectedImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleAddNew = () => {
    setEditingCategory(null)
    setFormData(defaultFormData)
    setSelectedImageFile(null)
    setImagePreview(null)
    setIsModalOpen(true)
  }

  const handleEdit = (category) => {
    setEditingCategory(category)
    setFormData({
      name: category?.name || "",
      type: category?.type || "",
      image: category?.image || "",
      isActive: category?.isActive !== false,
      foodTypeScope: category?.foodTypeScope || "Veg",
    })
    setSelectedImageFile(null)
    setImagePreview(category?.image || null)
    setIsModalOpen(true)
  }

  const handleImageSelect = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid file type. Please upload PNG, JPG, JPEG, or WEBP.")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size exceeds 5MB limit.")
      return
    }

    setSelectedImageFile(file)
    const reader = new FileReader()
    reader.onloadend = () => setImagePreview(reader.result)
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!String(formData.name || "").trim()) {
      toast.error("Category name is required")
      return
    }

    try {
      setSaving(true)
      let imageUrl = String(formData.image || "").trim()

      if (selectedImageFile) {
        const uploadRes = await uploadAPI.uploadMedia(selectedImageFile, { folder: "appzeto/categories" })
        const payload = uploadRes?.data?.data || uploadRes?.data
        imageUrl = payload?.url || imageUrl
      }

      const payload = {
        name: String(formData.name || "").trim(),
        type: String(formData.type || "").trim(),
        image: imageUrl || undefined,
        isActive: formData.isActive !== false,
        foodTypeScope: formData.foodTypeScope || "Veg",
      }

      if (editingCategory?.id || editingCategory?._id) {
        await restaurantAPI.updateCategory(editingCategory.id || editingCategory._id, payload)
        toast.success("Category updated successfully")
      } else {
        await restaurantAPI.createCategory(payload)
        toast.success("Category created successfully")
      }

      resetModal()
      await loadCategories()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to save category")
    } finally {
      setSaving(false)
    }
  }

  const handleToggleStatus = async (category) => {
    try {
      await restaurantAPI.updateCategory(category.id || category._id, {
        isActive: category?.isActive === false,
      })
      toast.success("Category status updated")
      await loadCategories()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to update category status")
    }
  }

  const handleDelete = async (category) => {
    const categoryId = category?.id || category?._id
    if (!categoryId) return
    if (!window.confirm(`Delete "${category?.name || "this category"}"?`)) return

    try {
      await restaurantAPI.deleteCategory(categoryId)
      toast.success("Category deleted successfully")
      await loadCategories()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to delete category")
    }
  }

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: BRAND_THEME.colors.brand.primarySoft }}>
      <div className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={goBack} className="rounded-full p-1 hover:bg-slate-100">
              <ArrowLeft className="h-5 w-5 text-slate-700" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Menu Categories</h1>
              <p className="text-xs text-slate-500">Create and manage restaurant categories.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAddNew}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
            style={{ background: BRAND_THEME.gradients.primary }}
          >
            <Plus className="h-4 w-4" />
            Add Category
          </button>
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
          </div>
        ) : categories.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
            <p className="text-lg font-semibold text-slate-900">No restaurant categories yet</p>
            <p className="mt-2 text-sm text-slate-500">Only categories created by this restaurant are shown here.</p>
            <button
              type="button"
              onClick={handleAddNew}
              className="mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
              style={{ background: BRAND_THEME.gradients.primary }}
            >
              <Plus className="h-4 w-4" />
              Add Category
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {categories.map((category) => {
              const categoryId = category?.id || category?._id
              const approvalStatus = category?.approvalStatus || "pending"
              const canDelete = category?.canDelete !== false

              return (
                <div key={categoryId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                      {category?.image ? (
                        <img src={category.image} alt={category?.name || "Category"} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-500">
                          No Image
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-base font-semibold text-slate-900">{category?.name || "Untitled Category"}</h2>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${approvalBadgeClass(approvalStatus)}`}>
                          {approvalStatus === "approved" && <BadgeCheck className="mr-1 h-3.5 w-3.5" />}
                          {approvalStatus.charAt(0).toUpperCase() + approvalStatus.slice(1)}
                        </span>
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${scopePillClass(category?.foodTypeScope || "Both")}`}>
                          {category?.foodTypeScope || "Both"}
                        </span>
                      </div>

                      {category?.type ? <p className="mt-1 text-sm text-slate-500">{category.type}</p> : null}

                      {approvalStatus === "rejected" && category?.rejectionReason ? (
                        <p className="mt-2 text-xs text-rose-600">{category.rejectionReason}</p>
                      ) : null}

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(category)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(category)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          {category?.isActive === false ? "Enable" : "Disable"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(category)}
                          disabled={!canDelete}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/40" onClick={resetModal} />
            <div className="absolute inset-0 flex items-end justify-center p-4 sm:items-center">
              <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.98 }}
                className="w-full max-w-lg rounded-3xl bg-white shadow-2xl"
              >
                <div className="flex items-center justify-between border-b px-5 py-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">{editingCategory ? "Edit Category" : "Add Category"}</h2>
                    <p className="text-xs text-slate-500">Restaurant categories are sent for admin approval.</p>
                  </div>
                  <button onClick={resetModal} className="rounded-full p-1 hover:bg-slate-100">
                    <X className="h-5 w-5 text-slate-500" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 p-5">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Category Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
                      placeholder="Enter category name"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Category Type</label>
                    <input
                      type="text"
                      value={formData.type}
                      onChange={(event) => setFormData((prev) => ({ ...prev, type: event.target.value }))}
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
                      placeholder="Examples: Starters, Desserts"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Diet Scope</label>
                    <select
                      value={formData.foodTypeScope}
                      onChange={(event) => setFormData((prev) => ({ ...prev, foodTypeScope: event.target.value }))}
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-slate-900"
                    >
                      <option value="Veg">Veg</option>
                      <option value="Non-Veg">Non-Veg</option>
                      <option value="Both">Both</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Category Image</label>
                    <div className="space-y-3">
                      {(imagePreview || formData.image) && (
                        <div className="relative h-28 w-28 overflow-hidden rounded-2xl border border-slate-300">
                          <img src={imagePreview || formData.image} alt="Category preview" className="h-full w-full object-cover" />
                        </div>
                      )}
                      <div className="flex items-center gap-3">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,image/webp"
                          onChange={handleImageSelect}
                          className="hidden"
                          id="restaurant-category-image-upload"
                        />
                        <label
                          htmlFor="restaurant-category-image-upload"
                          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700"
                        >
                          <Upload className="h-4 w-4" />
                          {imagePreview ? "Change Image" : "Upload Image"}
                        </label>
                      </div>
                    </div>
                  </div>

                  <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(event) => setFormData((prev) => ({ ...prev, isActive: event.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Active Status
                  </label>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={resetModal}
                      className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-slate-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold text-white disabled:opacity-60"
                      style={{ background: BRAND_THEME.gradients.primary }}
                    >
                      {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                      {editingCategory ? "Update" : "Create"}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
