import { useState, useCallback, useEffect, useRef, startTransition, useMemo } from "react";
import { publicGetOnce, restaurantAPI, adminAPI } from "@food/api";
import { API_BASE_URL } from "@food/api/config";

const DEFAULT_UNDER_PRICE_LIMIT = 250;
const UNDER_PRICE_DEFAULT_STORAGE_KEY = "food-under-price-default";
const HOME_RESTAURANT_CACHE_TTL_MS = 5 * 60 * 1000;
const homeRestaurantsCache = new Map();
const homeRestaurantsInFlightCache = new Map();

const roundCacheCoordinate = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Number(parsed.toFixed(3));
};

const buildHomeRestaurantCacheKey = (params = {}) => {
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => [
      key,
      key === "lat" || key === "lng" ? roundCacheCoordinate(value) : value,
    ])
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
};

const resolveUnderPriceLimit = (value, fallback = DEFAULT_UNDER_PRICE_LIMIT) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
};

const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
};

/**
 * Super-fast unified hook for Food Homepage data.
 * Consolidates all layout, configuration, and restaurant fetching into a single parallel-execution flow.
 */
export const useFoodHomeData = ({ location, zoneId, vegMode }) => {
  const [loading, setLoading] = useState(true);
  const [loadingRestaurants, setLoadingRestaurants] = useState(true);
  
  // Layout & Config States
  const [heroBanners, setHeroBanners] = useState([]);
  const [exploreItems, setExploreItems] = useState([]);
  const [exploreHeading, setExploreHeading] = useState("Explore More");
  const [headerVideoUrl, setHeaderVideoUrl] = useState("");
  const [underPriceLimit, setUnderPriceLimit] = useState(DEFAULT_UNDER_PRICE_LIMIT);
  const [recommendedRestaurants, setRecommendedRestaurants] = useState([]);
  const [categories, setCategories] = useState([]);
  
  // Data States
  const [restaurants, setRestaurants] = useState([]);
  const restaurantsRequestSeqRef = useRef(0);

  // Normalize data for UI
  const normalizedCategories = useMemo(() => {
    return categories.map((cat, idx) => ({
      id: cat.id || cat._id || `cat-${idx}`,
      name: cat.name || cat.label || "Category",
      slug: cat.slug || String(cat.name || "").toLowerCase().replace(/\s+/g, "-"),
      image: cat.image || cat.imageUrl || "",
      foodTypeScope: cat.foodTypeScope || "Both",
    }));
  }, [categories]);

  const normalizedExploreItems = useMemo(() => {
    return exploreItems.map((it) => ({
      ...it,
      imageUrl: it.imageUrl || it.iconUrl,
      label: it.label || it.name,
    }));
  }, [exploreItems]);

  // 1. Initial Load - Fetch all static/layout data in parallel
  useEffect(() => {
    let cancelled = false;
    
    const fetchLayoutData = async () => {
      setLoading(true);
      
      try {
        const [bannersRes, exploreRes, settingsRes, categoriesRes] = await Promise.all([
          publicGetOnce("/food/hero-banners/public").catch(() => ({ data: { data: [] } })),
          publicGetOnce("/food/explore-icons/public").catch(() => ({ data: { data: [] } })),
          publicGetOnce("/food/landing/settings/public").catch(() => ({ data: { data: {} } })),
          adminAPI.getPublicCategories(zoneId ? { zoneId } : {}).catch(() => ({ data: { data: { categories: [] } } }))
        ]);

        if (cancelled) return;

        // Process Banners
        const bannerData = bannersRes?.data?.data?.banners || bannersRes?.data?.data || [];
        setHeroBanners(Array.isArray(bannerData) ? bannerData : []);

        // Process Explore Items
        const exploreData = exploreRes?.data?.data?.items || exploreRes?.data?.data || [];
        setExploreItems(Array.isArray(exploreData) ? exploreData : []);

        // Process Settings
        const settings = settingsRes?.data?.data || {};
        setExploreHeading(settings.exploreMoreHeading || "Explore More");
        setHeaderVideoUrl(settings.headerVideoUrl || "");
        const savedUnderPrice = resolveUnderPriceLimit(settings.defaultUnderPriceLimit);
        setUnderPriceLimit(savedUnderPrice);
        setRecommendedRestaurants(settings.recommendedRestaurants || []);

        // Process Categories
        const catList = categoriesRes?.data?.data?.categories || categoriesRes?.data?.categories || [];
        setCategories(catList);

      } catch (error) {
        console.error("Failed to fetch home layout data:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchLayoutData();
    return () => { cancelled = true; };
  }, [zoneId]);

  // 2. Restaurant Fetching - Zone & Location aware
  const fetchRestaurants = useCallback(async (filters = {}) => {
    const requestSeq = ++restaurantsRequestSeqRef.current;
    const params = { ...filters };

    if (Number.isFinite(location?.latitude) && Number.isFinite(location?.longitude)) {
      params.lat = location.latitude;
      params.lng = location.longitude;
    }
    if (zoneId) params.zoneId = zoneId;

    const cacheKey = buildHomeRestaurantCacheKey(params);
    const now = Date.now();

    // Check Cache
    const cachedEntry = homeRestaurantsCache.get(cacheKey);
    if (cachedEntry && now - cachedEntry.at < HOME_RESTAURANT_CACHE_TTL_MS) {
      startTransition(() => {
        setRestaurants(cachedEntry.data);
        setLoadingRestaurants(false);
      });
      return;
    }

    // Check In-Flight
    const pendingRequest = homeRestaurantsInFlightCache.get(cacheKey);
    if (pendingRequest) {
      const sharedResponse = await pendingRequest;
      if (requestSeq !== restaurantsRequestSeqRef.current) return;
      if (sharedResponse?.data?.success) {
        const sharedCached = homeRestaurantsCache.get(cacheKey);
        if (sharedCached?.data) {
          startTransition(() => {
            setRestaurants(sharedCached.data);
            setLoadingRestaurants(false);
          });
          return;
        }
      }
    }

    try {
      setLoadingRestaurants(true);
      const responsePromise = restaurantAPI.getRestaurants(params);
      homeRestaurantsInFlightCache.set(cacheKey, responsePromise);
      const response = await responsePromise;
      
      if (requestSeq !== restaurantsRequestSeqRef.current) return;

      if (response.data?.success && response.data?.data?.restaurants) {
        const raw = response.data.data.restaurants;
        
        // Transform and calculate distances
        const transformed = raw.map(r => {
          const rLoc = r.location;
          const rLat = rLoc?.latitude || rLoc?.coordinates?.[1];
          const rLng = rLoc?.longitude || rLoc?.coordinates?.[0];
          
          let distanceInKm = null;
          if (location?.latitude && location?.longitude && rLat && rLng) {
            distanceInKm = calculateDistance(location.latitude, location.longitude, rLat, rLng);
          }

          return {
            ...r,
            id: r.restaurantId || r._id,
            distanceInKm
          };
        });

        homeRestaurantsCache.set(cacheKey, { at: Date.now(), data: transformed });
        startTransition(() => {
          setRestaurants(transformed);
        });
      }
    } catch (error) {
      console.error("Failed to fetch restaurants:", error);
    } finally {
      if (requestSeq === restaurantsRequestSeqRef.current) {
        setLoadingRestaurants(false);
        homeRestaurantsInFlightCache.delete(cacheKey);
      }
    }
  }, [location?.latitude, location?.longitude, zoneId]);

  // Refetch restaurants when location or zone changes
  useEffect(() => {
    fetchRestaurants();
  }, [fetchRestaurants]);

  return {
    loading,
    loadingRestaurants,
    heroBanners,
    exploreItems,
    exploreHeading,
    headerVideoUrl,
    underPriceLimit,
    recommendedRestaurants,
    categories: normalizedCategories,
    exploreItems: normalizedExploreItems,
    restaurants,
    setRestaurants,
    refreshRestaurants: fetchRestaurants
  };
};
