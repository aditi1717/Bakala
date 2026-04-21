import { useState, useMemo, useEffect, useCallback } from "react"
import { Search, Trash2, Loader2, Pencil, Plus, X, PackageOpen, Store, ToggleLeft, ToggleRight, ChevronLeft, ChevronRight } from "lucide-react"
import { adminAPI, uploadAPI } from "@food/api"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@food/components/ui/dialog"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const createEmptyVariant = () => ({
  _tempId: `v-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  name: "Standard",
  price: "",
  stock: "",
})

const createEmptyForm = () => ({
  name: "",
  description: "",
  image: "",
  category: "",
  isPublished: false,
  variants: [createEmptyVariant()],
})

// ─── Component ────────────────────────────────────────────────────────────────

export default function StoreProducts() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterPublished, setFilterPublished] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(20)

  // Modal state
  const [showFormModal, setShowFormModal] = useState(false)
  const [formMode, setFormMode] = useState("add") // "add" | "edit"
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(createEmptyForm())
  const [submitting, setSubmitting] = useState(false)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState("")

  // Stock modal state
  const [showStockModal, setShowStockModal] = useState(false)
  const [stockProduct, setStockProduct] = useState(null)
  const [stockDeltas, setStockDeltas] = useState({}) // variantId → delta string
  const [updatingStock, setUpdatingStock] = useState(false)

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true)
      const res = await adminAPI.getStoreProducts({ limit: 200 })
      const list = res?.data?.data?.products || res?.data?.products || []
      setProducts(list)
    } catch {
      toast.error("Failed to load store products")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchProducts() }, [fetchProducts])

  // ── Filters ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = [...products]
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(p =>
        p.name?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
      )
    }
    if (filterPublished === "published") result = result.filter(p => p.isPublished)
    if (filterPublished === "draft") result = result.filter(p => !p.isPublished)
    return result
  }, [products, searchQuery, filterPublished])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  useEffect(() => { setCurrentPage(1) }, [searchQuery, filterPublished])

  // ── Add / Edit form ────────────────────────────────────────────────────────
  const openAdd = () => {
    setFormMode("add")
    setEditingId(null)
    setForm(createEmptyForm())
    setImageFile(null)
    setImagePreview("")
    setShowFormModal(true)
  }

  const openEdit = (product) => {
    setFormMode("edit")
    setEditingId(product._id || product.id)
    setForm({
      name: product.name || "",
      description: product.description || "",
      image: product.image || "",
      category: product.category || "",
      isPublished: Boolean(product.isPublished),
      variants: (product.variants || []).map(v => ({
        _id: v._id,
        _tempId: v._id || `v-${Math.random().toString(36).slice(2, 8)}`,
        name: v.name || "",
        price: String(v.price ?? ""),
        stock: String(v.stock ?? ""),
      }))
    })
    setImageFile(null)
    setImagePreview(product.image || "")
    setShowFormModal(true)
  }

  const handleImageChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const addVariant = () => {
    setForm(prev => ({ ...prev, variants: [...prev.variants, createEmptyVariant()] }))
  }

  const removeVariant = (tempId) => {
    setForm(prev => {
      const remainingVariants = prev.variants.filter(v => v._tempId !== tempId)
      return {
        ...prev,
        variants: remainingVariants.length ? remainingVariants : [createEmptyVariant()],
      }
    })
  }

  const changeVariant = (tempId, field, value) => {
    setForm(prev => ({
      ...prev,
      variants: prev.variants.map(v => v._tempId === tempId ? { ...v, [field]: value } : v)
    }))
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error("Product name is required"); return }
    if (form.variants.length === 0) { toast.error("At least one variant is required"); return }
    for (const v of form.variants) {
      if (!v.name.trim()) { toast.error("Each variant must have a name"); return }
      if (!v.price || Number(v.price) < 0) { toast.error("Each variant must have a valid price"); return }
      if (v.stock === "" || Number(v.stock) < 0) { toast.error("Each variant must have a valid stock"); return }
    }

    try {
      setSubmitting(true)
      let imageUrl = form.image

      if (imageFile) {
        const uploadRes = await uploadAPI.uploadMedia(imageFile, { folder: "store-products" })
        imageUrl = uploadRes?.data?.data?.url || uploadRes?.data?.url || imageUrl
      }

      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        image: imageUrl,
        category: form.category.trim(),
        isPublished: form.isPublished,
        variants: form.variants.map(v => ({
          ...(v._id ? { _id: v._id } : {}),
          name: v.name.trim(),
          price: Number(v.price),
          stock: Number(v.stock),
        }))
      }

      if (formMode === "edit") {
        await adminAPI.updateStoreProduct(editingId, payload)
        toast.success("Product updated successfully")
      } else {
        await adminAPI.createStoreProduct(payload)
        toast.success("Product created successfully")
      }

      setShowFormModal(false)
      fetchProducts()
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to save product")
    } finally {
      setSubmitting(false)
    }
  }

  // ── Toggle publish ─────────────────────────────────────────────────────────
  const togglePublish = async (product) => {
    try {
      await adminAPI.updateStoreProduct(product._id || product.id, {
        isPublished: !product.isPublished
      })
      setProducts(prev => prev.map(p =>
        (p._id || p.id) === (product._id || product.id)
          ? { ...p, isPublished: !p.isPublished }
          : p
      ))
      toast.success(`Product ${!product.isPublished ? "published" : "unpublished"} successfully`)
    } catch {
      toast.error("Failed to update product")
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (product) => {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return
    try {
      await adminAPI.deleteStoreProduct(product._id || product.id)
      setProducts(prev => prev.filter(p => (p._id || p.id) !== (product._id || product.id)))
      toast.success("Product deleted successfully")
    } catch {
      toast.error("Failed to delete product")
    }
  }

  // ── Stock modal ────────────────────────────────────────────────────────────
  const openStockModal = (product) => {
    setStockProduct(product)
    const deltas = {}
    ;(product.variants || []).forEach(v => { deltas[v._id] = "" })
    setStockDeltas(deltas)
    setShowStockModal(true)
  }

  const handleStockUpdate = async () => {
    if (!stockProduct) return
    const entries = Object.entries(stockDeltas).filter(([, v]) => v !== "" && !isNaN(Number(v)))
    if (entries.length === 0) { toast.error("Enter a stock change value for at least one variant"); return }

    try {
      setUpdatingStock(true)
      for (const [variantId, delta] of entries) {
        if (Number(delta) === 0) continue
        await adminAPI.updateStoreProductStock(stockProduct._id || stockProduct.id, variantId, Number(delta))
      }
      toast.success("Stock updated successfully")
      setShowStockModal(false)
      fetchProducts()
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to update stock")
    } finally {
      setUpdatingStock(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">

      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <Store className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Store Products</h1>
            <p className="text-xs text-slate-500">Products that delivery boys can purchase</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-700">Total:</span>
            <span className="px-2.5 py-0.5 rounded-full text-sm font-semibold bg-indigo-100 text-indigo-700">{filtered.length}</span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={openAdd}
              className="px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Product
            </button>

            {/* Search */}
            <div className="relative min-w-[200px]">
              <input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>

            {/* Filter */}
            <select
              value={filterPublished}
              onChange={e => setFilterPublished(e.target.value)}
              className="px-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="all">All Status</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {["#", "Image", "Product", "Category", "Variants", "Status", "Actions"].map(h => (
                  <th key={h} className="px-5 py-3.5 text-left text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="w-7 h-7 animate-spin text-indigo-500" />
                      <p className="text-sm text-slate-500">Loading products...</p>
                    </div>
                  </td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <PackageOpen className="w-10 h-10 text-slate-300" />
                      <p className="text-sm font-medium text-slate-600">No products found</p>
                      <p className="text-xs text-slate-400">Create your first product using the button above</p>
                    </div>
                  </td>
                </tr>
              ) : paginated.map((p, idx) => (
                <tr key={p._id || p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4 text-sm text-slate-600">{(currentPage - 1) * pageSize + idx + 1}</td>

                  <td className="px-5 py-4">
                    <div className="w-11 h-11 rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center border border-slate-200">
                      {p.image ? (
                        <img src={p.image} alt={p.name} className="w-full h-full object-cover" onError={e => { e.target.src = "" }} />
                      ) : (
                        <PackageOpen className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                  </td>

                  <td className="px-5 py-4">
                    <p className="text-sm font-semibold text-slate-900">{p.name}</p>
                    {p.description && <p className="text-xs text-slate-500 truncate max-w-[200px]">{p.description}</p>}
                  </td>

                  <td className="px-5 py-4 text-sm text-slate-700">{p.category || <span className="text-slate-400">—</span>}</td>

                  <td className="px-5 py-4">
                    <div className="flex flex-col gap-0.5">
                      {(p.variants || []).map(v => (
                        <div key={v._id} className="flex items-center gap-2 text-xs text-slate-700">
                          <span className="font-medium">{v.name}</span>
                          <span className="text-slate-400">₹{v.price}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${v.stock > 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                            Stock: {v.stock}
                          </span>
                        </div>
                      ))}
                    </div>
                  </td>

                  <td className="px-5 py-4">
                    <button
                      onClick={() => togglePublish(p)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                        p.isPublished ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {p.isPublished ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                      {p.isPublished ? "Published" : "Draft"}
                    </button>
                  </td>

                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => openStockModal(p)}
                        title="Update Stock"
                        className="px-2.5 py-1.5 text-xs rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 font-medium border border-amber-200 transition-colors"
                      >
                        Stock
                      </button>
                      <button
                        onClick={() => openEdit(p)}
                        title="Edit"
                        className="p-1.5 rounded-md text-indigo-600 hover:bg-indigo-50 transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(p)}
                        title="Delete"
                        className="p-1.5 rounded-md text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && filtered.length > pageSize && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-200 bg-slate-50">
            <span className="text-sm text-slate-600">
              Showing <b>{(currentPage - 1) * pageSize + 1}</b>–<b>{Math.min(currentPage * pageSize, filtered.length)}</b> of <b>{filtered.length}</b>
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                className="p-1.5 rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium text-slate-700">{currentPage} / {totalPages}</span>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}
                className="p-1.5 rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Create / Edit Modal ───────────────────────────────────────────── */}
      <Dialog open={showFormModal} onOpenChange={open => { if (!open) { setShowFormModal(false); setImageFile(null); setImagePreview("") } }}>
        <DialogContent className="w-[95vw] max-w-4xl p-0 overflow-hidden max-h-[90vh] flex flex-col">
          <DialogHeader className="px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
            <DialogTitle className="text-base font-semibold text-slate-900">
              {formMode === "edit" ? "Edit Product" : "Add New Product"}
            </DialogTitle>
          </DialogHeader>

          <div className="overflow-y-auto p-6 space-y-5">
            {/* Image upload */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Product Image</label>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden">
                  {imagePreview ? (
                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover rounded-xl" />
                  ) : (
                    <PackageOpen className="w-8 h-8 text-slate-300" />
                  )}
                </div>
                <label className="cursor-pointer px-4 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                  Choose Image
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                </label>
              </div>
            </div>

            {/* Basic fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Product Name *</label>
                <input
                  type="text" value={form.name}
                  onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Delivery Jacket"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                <input
                  type="text" value={form.category}
                  onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
                  placeholder="e.g. Uniform, Equipment"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Short description of this product..."
                rows={2}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
              />
            </div>

            {/* Publish toggle */}
            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={form.isPublished}
                  onChange={e => setForm(prev => ({ ...prev, isPublished: e.target.checked }))}
                />
                <div className="w-10 h-5 bg-slate-200 rounded-full peer peer-checked:bg-indigo-600 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5" />
              </label>
              <span className="text-sm font-medium text-slate-700">
                {form.isPublished ? "Published (visible to delivery boys)" : "Draft (hidden from delivery boys)"}
              </span>
            </div>

            {/* Variants */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-semibold text-slate-800">Variants *</label>
                <button
                  type="button"
                  onClick={addVariant}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Variant
                </button>
              </div>

              <div className="space-y-2.5">
                <div className="hidden md:grid md:grid-cols-[1.2fr_1fr_1fr_auto] gap-2 mb-1">
                  <span className="text-[11px] text-slate-500 font-medium">Name</span>
                  <span className="text-[11px] text-slate-500 font-medium">Price (₹)</span>
                  <span className="text-[11px] text-slate-500 font-medium">Stock</span>
                  <span className="text-[11px] text-slate-500 font-medium">Action</span>
                </div>

                {form.variants.map(v => (
                  <div key={v._tempId} className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr_1fr_auto] gap-2 items-center">
                    <input
                      type="text" value={v.name} placeholder="e.g. Large"
                      onChange={e => changeVariant(v._tempId, "name", e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <input
                      type="number" value={v.price} placeholder="0" min={0}
                      onChange={e => changeVariant(v._tempId, "price", e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <input
                      type="number" value={v.stock} placeholder="0" min={0}
                      onChange={e => changeVariant(v._tempId, "stock", e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <button
                      type="button"
                      onClick={() => removeVariant(v._tempId)}
                      className="justify-self-start md:justify-self-center p-1.5 rounded-md text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      aria-label="Delete variant"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer buttons */}
          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setShowFormModal(false)}
              className="px-4 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-5 py-2 text-sm rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2 transition-colors"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {formMode === "edit" ? "Update Product" : "Create Product"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Stock Update Modal ─────────────────────────────────────────────── */}
      <Dialog open={showStockModal} onOpenChange={open => { if (!open) setShowStockModal(false) }}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <DialogTitle className="text-base font-semibold text-slate-900">
              Update Stock — {stockProduct?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="p-6 space-y-4">
            <p className="text-xs text-slate-500">Enter positive number to add stock, negative to reduce. Leave blank to skip.</p>
            {(stockProduct?.variants || []).map(v => (
              <div key={v._id} className="flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">{v.name}</p>
                  <p className="text-xs text-slate-500">Current stock: <b>{v.stock}</b></p>
                </div>
                <input
                  type="number"
                  value={stockDeltas[v._id] ?? ""}
                  onChange={e => setStockDeltas(prev => ({ ...prev, [v._id]: e.target.value }))}
                  placeholder="±delta"
                  className="w-28 px-3 py-2 border border-slate-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
            ))}
          </div>

          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
            <button onClick={() => setShowStockModal(false)}
              className="px-4 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 transition-colors">
              Cancel
            </button>
            <button onClick={handleStockUpdate} disabled={updatingStock}
              className="px-5 py-2 text-sm rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2 transition-colors">
              {updatingStock && <Loader2 className="w-4 h-4 animate-spin" />}
              Update Stock
            </button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}

