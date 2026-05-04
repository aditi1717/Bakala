import { useState, useMemo, useEffect, useCallback } from "react"
import { useSearchParams } from "react-router-dom"
import { Search, Trash2, Loader2, Eye, Pencil, Plus, ChevronLeft, ChevronRight } from "lucide-react"
import { adminAPI } from "@food/api"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@food/components/ui/dialog"
import { getFoodDisplayPrice, getFoodVariants } from "@food/utils/foodVariants"
import FoodFormDialog from "./FoodFormDialog"

const debugError = (...args) => {}

const normalizeEntityId = (value) => {
  if (!value) return ""
  if (typeof value === "string") return value.trim()
  if (typeof value === "object") {
    return String(value?._id || value?.id || value?.restaurantId || "").trim()
  }
  return String(value).trim()
}

export default function FoodsList() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedRestaurant, setSelectedRestaurant] = useState("all")
  const [foods, setFoods] = useState([])
  const [restaurantsForFilter, setRestaurantsForFilter] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [selectedFood, setSelectedFood] = useState(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  
  // Modal state for the standalone FoodFormDialog
  const [showFoodFormModal, setShowFoodFormModal] = useState(false)
  const [foodFormMode, setFoodFormMode] = useState("add")
  const [editingFood, setEditingFood] = useState(null)
  
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [imageVersion, setImageVersion] = useState(Date.now())

  const getItemCreatedMs = (item = {}) => {
    const direct = [item.createdAt, item.addedAt, item.requestedAt, item.updatedAt]
      .map((v) => new Date(v).getTime())
      .find((ms) => Number.isFinite(ms) && ms > 0)
    if (direct) return direct

    const rawId = String(item.id || "")
    const match = rawId.match(/\d{10,}/)
    if (match) {
      const fromId = Number(match[0])
      if (Number.isFinite(fromId) && fromId > 0) return fromId
    }
    return 0
  }

  const withImageVersion = (url) => {
    if (!url || typeof url !== "string") return "https://via.placeholder.com/40"
    return `${url}${url.includes("?") ? "&" : "?"}v=${imageVersion}`
  }

  const fetchAllFoods = useCallback(async () => {
    try {
      setLoading(true)

      const [activeRestaurantsResponse, inactiveRestaurantsResponse] = await Promise.all([
        adminAPI.getRestaurants({ limit: 1000 }),
        adminAPI.getRestaurants({ limit: 1000, status: "inactive" }),
      ])

      const activeRestaurants = activeRestaurantsResponse?.data?.data?.restaurants ||
        activeRestaurantsResponse?.data?.restaurants ||
        []
      const inactiveRestaurants = inactiveRestaurantsResponse?.data?.data?.restaurants ||
        inactiveRestaurantsResponse?.data?.restaurants ||
        []

      const restaurantsMap = new Map()
      ;[...activeRestaurants, ...inactiveRestaurants].forEach((restaurant) => {
        const restaurantId = String(restaurant?._id || restaurant?.id || "")
        if (!restaurantId) return
        if (!restaurantsMap.has(restaurantId)) {
          restaurantsMap.set(restaurantId, restaurant)
        }
      })
      const restaurants = Array.from(restaurantsMap.values())
      setRestaurantsForFilter(
        restaurants
          .map((restaurant) => ({
            id: String(restaurant?._id || restaurant?.id || ""),
            name: restaurant?.name || restaurant?.restaurantName || "Unknown Restaurant",
          }))
          .filter((restaurant) => restaurant.id)
          .sort((a, b) => a.name.localeCompare(b.name))
      )

      if (restaurants.length === 0) {
        setFoods([])
        return
      }

      const foodsRes = await adminAPI.getFoods({ limit: 1000 })
      const list = foodsRes?.data?.data?.foods || []
      const approvedOnly = Array.isArray(list)
        ? list.filter((f) => String(f?.approvalStatus || "").toLowerCase() === "approved")
        : []
      setFoods(
        Array.isArray(approvedOnly)
          ? approvedOnly.map((f) => ({
              id: String(f.id || f._id || ""),
              _id: f._id || f.id,
              name: f.name || "Unnamed Item",
              image: f.image || "https://via.placeholder.com/40",
              status: f.isAvailable !== false && String(f.approvalStatus || "").toLowerCase() !== "rejected",
              restaurantId: normalizeEntityId(f.restaurantId),
              restaurantName: f.restaurantName || "Unknown Restaurant",
              categoryId: String(f.categoryId || ""),
              categoryName: f.categoryName || "",
              price: getFoodDisplayPrice(f),
              variants: getFoodVariants(f),
              foodType: f.foodType || "Non-Veg",
              approvalStatus: f.approvalStatus || "approved",
              description: f.description || "",
              preparationTime: f.preparationTime || "",
              isAvailable: f.isAvailable !== false,
              createdAt: f.createdAt,
              updatedAt: f.updatedAt,
            }))
          : []
      )
      setImageVersion(Date.now())
    } catch (error) {
      debugError("Error fetching foods:", error)
      toast.error("Failed to load foods")
      setFoods([])
      setRestaurantsForFilter([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAllFoods()
  }, [fetchAllFoods])

  const [searchParams] = useSearchParams()
  const productIdFromUrl = searchParams.get("productId")

  useEffect(() => {
    if (productIdFromUrl && foods.length > 0) {
      const food = foods.find(f => f.id === productIdFromUrl || f._id === productIdFromUrl)
      if (food) {
        handleViewDetails(food)
      }
    }
  }, [productIdFromUrl, foods])

  const formatFoodId = (id) => {
    if (!id) return "FOOD000000"
    const idString = String(id)
    const parts = idString.split(/[-.]/)
    let lastDigits = ""
    if (parts.length > 0) {
      const lastPart = parts[parts.length - 1]
      const digits = lastPart.match(/\d+/g)
      if (digits && digits.length > 0) {
        const allDigits = digits.join("")
        lastDigits = allDigits.slice(-6).padStart(6, "0")
      }
    }
    if (!lastDigits) {
      const hash = idString.split("").reduce((acc, char) => {
        return ((acc << 5) - acc) + char.charCodeAt(0) | 0
      }, 0)
      lastDigits = Math.abs(hash).toString().slice(-6).padStart(6, "0")
    }
    return `FOOD${lastDigits}`
  }

  const filteredFoods = useMemo(() => {
    let result = [...foods]
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter(food =>
        food.name.toLowerCase().includes(query) ||
        food.id.toString().includes(query) ||
        food.restaurantName?.toLowerCase().includes(query) ||
        food.categoryName?.toLowerCase().includes(query)
      )
    }
    if (selectedRestaurant !== "all") {
      result = result.filter((food) => String(food.restaurantId) === selectedRestaurant)
    }
    result.sort((a, b) => getItemCreatedMs(b) - getItemCreatedMs(a))
    return result
  }, [foods, searchQuery, selectedRestaurant])

  const totalPages = useMemo(() => {
    if (filteredFoods.length === 0) return 1
    return Math.ceil(filteredFoods.length / pageSize)
  }, [filteredFoods.length, pageSize])

  const paginatedFoods = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredFoods.slice(start, start + pageSize)
  }, [filteredFoods, currentPage, pageSize])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, selectedRestaurant, pageSize])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const openAddFoodModal = () => {
    setFoodFormMode("add")
    setEditingFood(null)
    setShowFoodFormModal(true)
  }

  const openEditFoodModal = (food) => {
    setFoodFormMode("edit")
    setEditingFood(food)
    setShowFoodFormModal(true)
  }

  const handleDelete = async (id) => {
    const food = foods.find(f => f.id === id)
    if (!food) return
    if (!window.confirm(`Are you sure you want to delete "${food.name}"? This action cannot be undone.`)) {
      return
    }
    try {
      setDeleting(true)
      await adminAPI.deleteFood(food?._id || food?.id)
      setFoods((prev) => prev.filter((f) => String(f.id) !== String(id)))
      toast.success("Food item deleted successfully")
    } catch (error) {
      debugError("Error deleting food:", error)
      toast.error(error?.response?.data?.message || "Failed to delete food item")
    } finally {
      setDeleting(false)
    }
  }

  const handleViewDetails = (food) => {
    setSelectedFood(food)
    setShowDetailModal(true)
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      {/* List Header */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
            <div className="grid grid-cols-2 gap-0.5">
              <div className="w-2 h-2 bg-white rounded-sm"></div>
              <div className="w-2 h-2 bg-white rounded-sm"></div>
              <div className="w-2 h-2 bg-white rounded-sm"></div>
              <div className="w-2 h-2 bg-white rounded-sm"></div>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Food</h1>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Food List</h2>
            <span className="px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">
              {filteredFoods.length}
            </span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={openAddFoodModal}
              className="px-4 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add Food</span>
            </button>
            <div className="relative flex-1 sm:flex-initial min-w-[200px]">
              <input
                type="text"
                placeholder="Ex : Foods"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>
            <select
              value={selectedRestaurant}
              onChange={(e) => setSelectedRestaurant(e.target.value)}
              className="px-4 py-2.5 min-w-[220px] text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
            >
              <option value="all">All Restaurants</option>
              {restaurantsForFilter.map((restaurant) => (
                <option key={restaurant.id} value={restaurant.id}>
                  {restaurant.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">SL</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Image</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Title</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Restaurant</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Category</th>
                <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-brand-600 mb-2" />
                      <p className="text-sm text-slate-500">Loading foods...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredFoods.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <p className="text-sm text-slate-500">No food items found</p>
                  </td>
                </tr>
              ) : (
                paginatedFoods.map((food, index) => (
                  <tr key={food.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-slate-700">{(currentPage - 1) * pageSize + index + 1}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center border border-slate-200">
                        <img
                          src={withImageVersion(food.image)}
                          alt={food.name}
                          className="w-full h-full object-cover"
                          onError={(e) => { e.target.src = "https://via.placeholder.com/40" }}
                        />
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap"><span className="text-sm font-medium text-slate-900">{food.name}</span></td>
                    <td className="px-6 py-4 whitespace-nowrap"><span className="text-sm font-medium text-slate-800">{food.restaurantName || "-"}</span></td>
                    <td className="px-6 py-4 whitespace-nowrap"><span className="text-sm font-medium text-slate-800">{food.categoryName || "-"}</span></td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => handleViewDetails(food)} className="p-1.5 rounded text-brand-600 hover:bg-brand-50" title="View Details"><Eye className="w-4 h-4" /></button>
                        <button onClick={() => openEditFoodModal(food)} className="p-1.5 rounded text-amber-600 hover:bg-amber-50" title="Edit Food"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(food.id)} disabled={deleting} className="p-1.5 rounded text-red-600 hover:bg-red-50" title="Delete Food"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && filteredFoods.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
            <div className="text-sm text-slate-600">
              Showing <span className="font-semibold text-slate-800">{(currentPage - 1) * pageSize + 1}</span> to <span className="font-semibold text-slate-800">{Math.min(currentPage * pageSize, filteredFoods.length)}</span> of <span className="font-semibold text-slate-800">{filteredFoods.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="px-2 py-1 text-sm rounded border border-slate-300 bg-white">
                <option value={10}>10 / page</option>
                <option value={20}>20 / page</option>
                <option value={50}>50 / page</option>
              </select>
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 rounded border border-slate-300 bg-white disabled:opacity-50"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-sm font-medium">{currentPage} / {totalPages}</span>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="p-1.5 rounded border border-slate-300 bg-white disabled:opacity-50"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>

      {/* Food Details Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-xl p-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <DialogTitle className="text-lg font-semibold text-slate-900">Food Details</DialogTitle>
          </DialogHeader>
          {selectedFood && (
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-4">
                <img src={withImageVersion(selectedFood.image)} alt={selectedFood.name} className="w-20 h-20 rounded-xl object-cover border border-slate-200" onError={(e) => { e.target.src = "https://via.placeholder.com/64" }} />
                <div>
                  <p className="text-lg font-semibold text-slate-900">{selectedFood.name}</p>
                  <p className="text-sm text-slate-500 mt-0.5">ID #{formatFoodId(selectedFood.id)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm bg-slate-50 border border-slate-200 rounded-lg p-4">
                <p><span className="font-semibold text-slate-700">Restaurant:</span> <span className="text-slate-900">{selectedFood.restaurantName || "-"}</span></p>
                <p><span className="font-semibold text-slate-700">Price:</span> <span className="text-slate-900">{selectedFood.price}</span></p>
                <p><span className="font-semibold text-slate-700">Category:</span> <span className="text-slate-900">{selectedFood.categoryName || "-"}</span></p>
                <p><span className="font-semibold text-slate-700">Food Type:</span> <span className="text-slate-900">{selectedFood.foodType || "-"}</span></p>
              </div>
              {selectedFood.description && <p className="text-sm text-slate-700 leading-relaxed"><span className="font-semibold text-slate-800">Description:</span> {selectedFood.description}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Standalone Food Form Component */}
      <FoodFormDialog
        open={showFoodFormModal}
        onOpenChange={setShowFoodFormModal}
        mode={foodFormMode}
        editingFood={editingFood}
        restaurantOptions={restaurantsForFilter}
        initialRestaurantId={selectedRestaurant !== "all" ? selectedRestaurant : ""}
        onSuccess={fetchAllFoods}
      />
    </div>
  )
}
