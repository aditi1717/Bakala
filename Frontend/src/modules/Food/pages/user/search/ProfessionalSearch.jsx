import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import { useSearchParams, Link, useNavigate } from "react-router-dom"
import { 
  ArrowLeft, Star, Clock, Search,
  X, Loader2
} from "lucide-react"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { useLocation as useGeoLocation } from "@food/hooks/useLocation"
import { useZone } from "@food/hooks/useZone"
import { searchAPI } from "@/services/api"
import { motion, AnimatePresence } from "framer-motion"

// Helper to resolve media URLs consistently
const getMediaUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('http')) return url;
  const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api/v1";
  const origin = apiBase.split('/api/v1')[0];
  return `${origin}${url.startsWith('/') ? url : '/' + url}`;
};

// Debounce hook for real-time search
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value)
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])
  return debouncedValue
}

export default function ProfessionalSearch() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialQuery = searchParams.get("q") || ""
  const navigate = useNavigate()
  const { location: userCoords } = useGeoLocation()
  const { zoneId } = useZone(userCoords)
  const cachedZoneId = useMemo(() => {
    try {
      return localStorage.getItem("userZoneId") || ""
    } catch {
      return ""
    }
  }, [])
  const effectiveZoneId = zoneId || cachedZoneId
  const inputRef = useRef(null)
  const skipUrlSyncRef = useRef(false)
  
  const [query, setQuery] = useState(initialQuery)
  const debouncedQuery = useDebounce(query, 500)
  
  const [results, setResults] = useState({ restaurants: [], dishes: [] })
  const [loading, setLoading] = useState(false)
  const [selectedCategoryId, setSelectedCategoryId] = useState(searchParams.get("cat") || null)

  useEffect(() => {
    if (skipUrlSyncRef.current) {
      if (!initialQuery) skipUrlSyncRef.current = false
      return
    }
    setQuery((prev) => (prev === initialQuery ? prev : initialQuery))
  }, [initialQuery])

  const performSearch = useCallback(async (searchTerm, catId) => {
    if (!searchTerm && !catId) {
      setResults({ restaurants: [], dishes: [] })
      return
    }

    if (!effectiveZoneId) {
      setResults({ restaurants: [], dishes: [] })
      return
    }
    
    setLoading(true)
    try {
      const res = await searchAPI.unifiedSearch({
        q: searchTerm,
        categoryId: catId,
        lat: userCoords?.latitude,
        lng: userCoords?.longitude,
        zoneId: effectiveZoneId
      })
      
      if (res.data?.success) {
        // Grouping results into Restaurants and potential Dishes
        const all = res.data.data.restaurants || []
        setResults({
          restaurants: all.filter(r => r.matchType === 'restaurant' || !r.matchType),
          dishes: all.filter(r => r.matchType === 'food')
        })
      }
    } catch (err) {
      console.error("Search failed", err)
    } finally {
      setLoading(false)
    }
  }, [userCoords, effectiveZoneId])

  useEffect(() => {
    performSearch(debouncedQuery, selectedCategoryId)
  }, [debouncedQuery, selectedCategoryId, performSearch])

  useEffect(() => {
    const trimmedQuery = String(query || "").trim()
    if (trimmedQuery || selectedCategoryId) {
      setSearchParams(
        { ...(trimmedQuery ? { q: trimmedQuery } : {}), ...(selectedCategoryId ? { cat: selectedCategoryId } : {}) },
        { replace: true }
      )
    } else {
      setSearchParams({}, { replace: true })
    }
  }, [query, selectedCategoryId, setSearchParams])

  const handleClear = () => {
    skipUrlSyncRef.current = true
    setQuery("")
    setSelectedCategoryId(null)
    setResults({ restaurants: [], dishes: [] })
    setSearchParams({}, { replace: true })
    inputRef.current?.focus()
  }

  const handleBack = () => {
    navigate("/food")
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button onClick={handleBack} className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              ref={inputRef}
              autoFocus
              placeholder="Search for restaurants or dishes..." 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10 pr-10 h-11 bg-slate-100 dark:bg-zinc-800 border-none focus:ring-2 focus:ring-rose-500 rounded-xl"
            />
            {query && (
              <button type="button" onClick={handleClear} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4">
        {/* Loading Spinner */}
        <AnimatePresence>
          {loading && (
            <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               className="flex flex-col items-center justify-center py-20"
            >
              <Loader2 className="w-8 h-8 text-rose-500 animate-spin mb-3" />
              <p className="text-slate-400 text-sm">Finding the best for you...</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search Results */}
        {!loading && (query || selectedCategoryId) && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            
            {/* Dish Results Section */}
            {results.dishes.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                   <div className="w-1 h-5 bg-orange-500 rounded-full" />
                   <h2 className="text-lg font-bold dark:text-white">Dishes from restaurants</h2>
                </div>
                <div className="grid gap-4">
                  {results.dishes.map((r) => (
                    <Link to={`/food/restaurants/${r.slug || r._id}${r.matchedDishId ? `?dish=${r.matchedDishId}` : ''}`} key={r._id} className="flex gap-4 p-3 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-slate-100 dark:border-zinc-800 hover:shadow-md transition-shadow group">
                       <div className="w-24 h-24 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0 relative">
                           <img 
                            src={getMediaUrl(r.matchedDishImage || r.profileImage || r.image || (Array.isArray(r.images) && r.images[0]))} 
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                            onError={(e) => (e.target.src = "/placeholder-dish.webp")}
                          />
                          {r.pureVegRestaurant && (
                            <div className="absolute top-1 left-1 w-4 h-4 border border-green-600 p-[1px] bg-white rounded-sm">
                               <div className="w-full h-full bg-green-600 rounded-full" />
                            </div>
                          )}
                       </div>
                       <div className="flex-1 min-w-0 flex flex-col justify-center">
                          <div className="text-rose-500 text-[10px] font-bold uppercase tracking-wider mb-1">
                             Matched: {r.matchedDish || query}
                          </div>
                          <h3 className="font-bold text-slate-900 dark:text-white line-clamp-1">{r.restaurantName}</h3>
                          <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-zinc-400 mt-1">
                             <div className="flex items-center gap-1">
                                <Star className="w-3 h-3 text-orange-500 fill-orange-500" />
                                <span className="font-semibold text-slate-700 dark:text-white">{r.rating || "New"}</span>
                             </div>
                             <span>•</span>
                             <span>{r.estimatedDeliveryTime || "30-40 mins"}</span>
                             <span>•</span>
                             <span className="line-clamp-1">{r.cuisines?.slice(0, 2).join(", ")}</span>
                          </div>
                       </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Restaurant Results Section */}
            {results.restaurants.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                   <div className="w-1 h-5 bg-rose-500 rounded-full" />
                   <h2 className="text-lg font-bold dark:text-white">Restaurants</h2>
                </div>
                <div className="grid gap-6">
                  {results.restaurants.map((r) => (
                    <Link to={`/food/restaurants/${r.slug || r._id}`} key={r._id} className="block group">
                      <div className="relative rounded-3xl overflow-hidden aspect-[16/9] mb-3 bg-slate-200">
                         <img 
                          src={getMediaUrl(r.profileImage || r.image || (Array.isArray(r.images) && r.images[0]))} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          onError={(e) => (e.target.src = "/placeholder-restaurant.webp")}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                        <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                           <div>
                              <h3 className="text-xl font-bold text-white mb-1">{r.restaurantName}</h3>
                              <p className="text-white/80 text-xs line-clamp-1">{r.cuisines?.join(", ")}</p>
                           </div>
                           <div className="bg-white/20 backdrop-blur-md border border-white/30 px-2 py-1 rounded-lg flex items-center gap-1">
                              <Star className="w-3 h-3 text-white fill-white" />
                              <span className="text-white text-xs font-bold">{r.rating || "4.0"}</span>
                           </div>
                        </div>
                        {r.offer && (
                           <div className="absolute top-4 left-0 bg-brand-600 text-white text-[10px] font-black px-3 py-1.5 rounded-r-lg shadow-lg flex items-center gap-1 tracking-tighter">
                              <BadgePercent className="w-3 h-3" />
                              {r.offer.toUpperCase()}
                           </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between px-1">
                         <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-zinc-400 font-medium">
                            <div className="flex items-center gap-1">
                               <Clock className="w-3 h-3" />
                               {r.estimatedDeliveryTime || "30 mins"}
                            </div>
                            <span>•</span>
                            <span>{r.location?.area || "Nearby"}</span>
                         </div>
                         <div className="text-[10px] font-bold text-rose-500 bg-rose-50 dark:bg-rose-500/10 px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Top Pick
                         </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Empty State */}
            {!loading && results.restaurants.length === 0 && results.dishes.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                 <div className="w-20 h-20 bg-slate-100 dark:bg-zinc-900 rounded-full flex items-center justify-center mb-4">
                    <Search className="w-8 h-8 text-slate-300" />
                 </div>
                 <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">We couldn't find any results</h2>
                 <p className="text-slate-500 text-sm max-w-xs">Maybe try searching for something else or check your spelling</p>
                 <Button variant="outline" onClick={handleClear} className="mt-6 rounded-xl border-rose-500 text-rose-500 hover:bg-rose-50">
                    Clear all filters
                 </Button>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  )
}
