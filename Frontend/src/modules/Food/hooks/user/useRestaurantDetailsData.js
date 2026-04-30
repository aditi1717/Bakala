import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { restaurantAPI, orderAPI } from "@food/api";
import { isModuleAuthenticated } from "@food/utils/auth";

/**
 * High-performance hook for Restaurant Details page.
 * Unifies restaurant info, menu, and offers fetching into a single reactive flow.
 */
export const useRestaurantDetailsData = ({ slug, zoneId, userLocation }) => {
  const [loading, setLoading] = useState(true);
  const [restaurant, setRestaurant] = useState(null);
  const [restaurantOffers, setRestaurantOffers] = useState([]);
  const [error, setError] = useState(null);
  
  const fetchedRef = useRef(false);
  const slugRef = useRef(slug);

  const fetchDetails = useCallback(async () => {
    if (!slug) return;
    
    // Prevent redundant fetches if slug hasn't changed and we have data
    if (fetchedRef.current && slugRef.current === slug && restaurant) return;

    try {
      setLoading(true);
      setError(null);

      // 1. Fetch Restaurant Basic Info
      const res = await restaurantAPI.getRestaurantById(slug);
      if (!res?.data?.success || !res?.data?.data) {
        throw new Error("Restaurant not found");
      }

      const rawRestaurant = res.data.data.restaurant || res.data.data;
      
      // 2. Parallel Fetch: Menu, Offers, and Outlet Timings
      const restaurantId = rawRestaurant._id || rawRestaurant.restaurantId;
      
      const [menuRes, offersRes, timingsRes] = await Promise.all([
        restaurantAPI.getMenuByRestaurantId(restaurantId, { noCache: true }).catch(() => null),
        restaurantAPI.getPublicOffers(restaurantId).catch(() => ({ data: { data: { offers: [] } } })),
        restaurantAPI.getOutletTimingsByRestaurantId(restaurantId).catch(() => null)
      ]);

      // 3. Process Data
      const menuData = menuRes?.data?.data?.menu || { sections: [] };
      const publicOffers = offersRes?.data?.data?.offers || offersRes?.data?.offers || [];
      const timings = timingsRes?.data?.data?.outletTimings || timingsRes?.data?.outletTimings || null;

      const transformed = {
        ...rawRestaurant,
        id: restaurantId,
        menuSections: menuData.sections || [],
        outletTimings: timings,
        // Add distance calculation if possible (using existing logic or utility)
        distance: rawRestaurant.distance || "1.2 km"
      };

      setRestaurant(transformed);
      setRestaurantOffers(publicOffers);
      fetchedRef.current = true;
      slugRef.current = slug;

    } catch (err) {
      console.error("Failed to fetch restaurant details:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [slug, zoneId]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  return {
    loading,
    restaurant,
    restaurantOffers,
    error,
    refresh: fetchDetails
  };
};
