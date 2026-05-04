import { useSearchParams, Link, useNavigate, useLocation as useRouterLocation } from "react-router-dom";
import React, { useRef, useEffect, useState, useMemo, useCallback, startTransition } from "react";
import { Star, Clock, MapPin, Heart, Search, Tag, Flame, ShoppingBag, ShoppingCart, Mic, SlidersHorizontal, CheckCircle2, Bookmark, BadgePercent, X, ArrowDownUp, Timer, CalendarClock, ShieldCheck, IndianRupee, UtensilsCrossed, Leaf, AlertCircle, Loader2, Plus, Check, Share2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Footer from "@food/components/user/Footer";
import AddToCartButton from "@food/components/user/AddToCartButton";
import StickyCartCard from "@food/components/user/StickyCartCard";
import OrderTrackingCard from "@food/components/user/OrderTrackingCard";
import { CategoryChipRowSkeleton, ExploreGridSkeleton, HeroBannerSkeleton, LoadingSkeletonRegion, RestaurantGridSkeleton } from "@food/components/ui/loading-skeletons";
import { useProfile } from "@food/context/ProfileContext";
import { useCart } from "@food/context/CartContext";
import { DotPattern } from "@food/components/ui/dot-pattern";
import { Card, CardHeader, CardTitle, CardContent } from "@food/components/ui/card";
import { Button } from "@food/components/ui/button";
import { Badge } from "@food/components/ui/badge";
import { Input } from "@food/components/ui/input";
import { Switch } from "@food/components/ui/switch";
import { Checkbox } from "@food/components/ui/checkbox";
import { useSearchOverlay, useLocationSelector } from "@food/components/user/UserLayout";
import PageNavbar from "@food/components/user/PageNavbar";
import { useLocation } from "@food/hooks/useLocation";
import { useZone } from "@food/hooks/useZone";
import OptimizedImage from "@food/components/OptimizedImage";
import { getRestaurantAvailabilityStatus } from "@food/utils/restaurantAvailability";
import FoodHeroHeaderShell from "@food/components/user/home/FoodHeroHeaderShell";
import PromoRow from "@food/components/user/home/PromoRow";
import BRAND_THEME from "@/config/brandTheme";
import { useFoodHomeData } from "@food/hooks/user/useFoodHomeData";
import exploreOffers from "@food/assets/explore more icons/offers.webp";
import exploreGourmet from "@food/assets/explore more icons/gourmet.webp";
import exploreCollection from "@food/assets/explore more icons/collection.webp";

const placeholders = [
  'Search "burger"', 'Search "biryani"', 'Search "pizza"', 'Search "desserts"',
  'Search "chinese"', 'Search "thali"', 'Search "momos"', 'Search "dosa"',
];

const RESTAURANTS_BATCH_SIZE = 9;
const HOME_VEG_MODE_OPTION_KEY = "food-home-veg-mode-option";
const getRestaurantRouteParam = (restaurant, fallbackIndex = 0) => {
  const slug = typeof restaurant?.slug === "string" ? restaurant.slug.trim() : "";
  if (slug && slug.toLowerCase() !== "undefined" && slug.toLowerCase() !== "null") return slug;

  const idCandidates = [restaurant?._id, restaurant?.restaurantId, restaurant?.id, restaurant?.mongoId];
  const id = idCandidates.find((value) => typeof value === "string" && value.trim());
  if (id) return id.trim();

  const name = typeof restaurant?.name === "string" ? restaurant.name.trim() : "";
  if (name) return name.toLowerCase().replace(/\s+/g, "-");

  return `restaurant-${fallbackIndex}`;
};

export default function Home() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [heroSearch, setHeroSearch] = useState("");
  const { openSearch, searchValue, setSearchValue } = useSearchOverlay();
  const { openLocationSelector } = useLocationSelector();
  const { vegMode, setVegMode: setVegModeContext, getDefaultAddress } = useProfile();
  const { addToCart, cart } = useCart();
  const { location } = useLocation();
  const { zoneId } = useZone(location);
  const routerLocation = useRouterLocation();
  
  const [showVegModePopup, setShowVegModePopup] = useState(false);
  const [showSwitchOffPopup, setShowSwitchOffPopup] = useState(false);
  const [vegModeOption, setVegModeOption] = useState(() => {
    if (typeof window === "undefined") return "all";
    const saved = window.localStorage.getItem(HOME_VEG_MODE_OPTION_KEY);
    return saved === "pure-veg" ? "pure-veg" : "all";
  });
  const [hasScrolledPastBanner, setHasScrolledPastBanner] = useState(false);
  const [visibleRestaurantCount, setVisibleRestaurantCount] = useState(RESTAURANTS_BATCH_SIZE);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [currentHeroBanner, setCurrentHeroBanner] = useState(0);
  const [activeTab, setActiveTab] = useState(routerLocation.pathname.endsWith("/quick") ? "quick" : "food");

  const heroShellRef = useRef(null);
  const stickyHeaderRef = useRef(null);
  const categoryScrollRef = useRef(null);
  const restaurantLoadMoreRef = useRef(null);
  const isHandlingSwitchOff = useRef(false);
  const heroTouchStartX = useRef(0);

  // High-performance data fetching hook
  const {
    loading: loadingConfig,
    loadingRestaurants,
    heroBanners,
    exploreItems: landingExploreMore,
    exploreHeading,
    underPriceLimit,
    recommendedRestaurants,
    categories: landingCategories,
    restaurants: restaurantsData,
    refreshRestaurants: fetchRestaurants
  } = useFoodHomeData({ location, zoneId, vegMode });

  // Sync activeTab with URL
  useEffect(() => {
    const isQuick = routerLocation.pathname.endsWith("/quick");
    setActiveTab(isQuick ? "quick" : "food");
  }, [routerLocation.pathname]);

  // Derive UI data
  const displayCategories = useMemo(() => {
    if (vegMode) return landingCategories.filter(cat => cat.foodTypeScope === "Veg");
    return landingCategories;
  }, [landingCategories, vegMode]);

  const finalExploreItems = useMemo(() => {
    const fallback = [
      { id: "offers", label: "Offers", image: exploreOffers, href: "/food/user/offers" },
      { id: "gourmet", label: "Gourmet", image: exploreGourmet, href: "/food/user/gourmet" },
      { id: "collection", label: "Collections", image: exploreCollection, href: "/food/user/profile/favorites" },
    ];
    if (!landingExploreMore?.length) return fallback;
    return fallback.map(item => {
      const apiItem = landingExploreMore.find(ai => ai.label?.toLowerCase() === item.label?.toLowerCase());
      return apiItem ? { ...item, image: apiItem.imageUrl || item.image, href: apiItem.link || item.href } : item;
    });
  }, [landingExploreMore]);

  const filteredRestaurants = useMemo(() => {
    if (!vegMode) return restaurantsData;
    if (vegModeOption === "pure-veg") {
      return restaurantsData.filter((r) => r.pureVegRestaurant);
    }
    return restaurantsData;
  }, [restaurantsData, vegMode, vegModeOption]);

  const visibleRestaurants = useMemo(() => filteredRestaurants.slice(0, visibleRestaurantCount), [filteredRestaurants, visibleRestaurantCount]);

  // Loading Skeletons State
  const showBannerSkeleton = loadingConfig;
  const showCategorySkeleton = loadingConfig;
  const showExploreSkeleton = loadingConfig;
  const showRestaurantSkeleton = loadingRestaurants;

  // Handlers
  const handleLocationClick = useCallback(() => openLocationSelector(), [openLocationSelector]);
  const handleSearchFocus = useCallback(() => {
    if (heroSearch) setSearchValue(heroSearch);
    openSearch();
  }, [heroSearch, openSearch, setSearchValue]);

  const handleVegModeChange = useCallback((newValue) => {
    if (newValue) {
      isHandlingSwitchOff.current = false;
      setShowSwitchOffPopup(false);
      setShowVegModePopup(true);
      return;
    }

    if (!vegMode || isHandlingSwitchOff.current) return;
    isHandlingSwitchOff.current = true;
    setShowVegModePopup(false);
    setShowSwitchOffPopup(true);
  }, [vegMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(HOME_VEG_MODE_OPTION_KEY, vegModeOption);
  }, [vegModeOption]);

  // Scroll Tracking
  useEffect(() => {
    const onScroll = () => {
      if (!heroShellRef.current) return;
      const stickyH = stickyHeaderRef.current?.offsetHeight || 0;
      setHasScrolledPastBanner(window.scrollY + stickyH >= heroShellRef.current.offsetTop + heroShellRef.current.offsetHeight);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Infinite Scroll
  useEffect(() => {
    if (visibleRestaurantCount >= filteredRestaurants.length) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisibleRestaurantCount(prev => prev + RESTAURANTS_BATCH_SIZE);
    }, { rootMargin: "300px" });
    if (restaurantLoadMoreRef.current) observer.observe(restaurantLoadMoreRef.current);
    return () => observer.disconnect();
  }, [filteredRestaurants.length, visibleRestaurantCount]);

  // Placeholder Animation
  useEffect(() => {
    const interval = setInterval(() => setPlaceholderIndex(p => (p + 1) % placeholders.length), 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (heroBanners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentHeroBanner((prev) => (prev + 1) % heroBanners.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [heroBanners.length]);

  useEffect(() => {
    setCurrentHeroBanner((prev) => {
      if (!heroBanners.length) return 0;
      return Math.min(prev, heroBanners.length - 1);
    });
  }, [heroBanners.length]);

  useEffect(() => {
    const shouldLockScroll = showVegModePopup || showSwitchOffPopup;
    if (shouldLockScroll) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [showVegModePopup, showSwitchOffPopup]);

  // UI Sections
  const CategoryRailSection = useMemo(() => (
    <section className="space-y-2 px-4 pt-4 content-auto">
      <p className="text-xl font-bold text-neutral-900">What's on your mind?</p>
      <div ref={categoryScrollRef} className="flex gap-4 overflow-x-auto scrollbar-hide py-2">
        <div className="flex-shrink-0 flex flex-col items-center gap-2 cursor-pointer" onClick={() => navigate("/user/under-price")}>
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-b-full rounded-t-sm shadow-md border-t-4 border-brand-200 flex flex-col items-center justify-center p-1" style={{ backgroundColor: BRAND_THEME.tokens.homepage.home.promoBadgeBackground }}>
            <span className="text-[10px] font-bold text-white">UNDER</span>
            <span className="text-sm font-extrabold text-white">{"\u20B9"}{underPriceLimit}</span>
          </div>
          <span className="text-xs font-medium text-gray-700">Offers</span>
        </div>
        {showCategorySkeleton ? <CategoryChipRowSkeleton /> : displayCategories.slice(0, 12).map((cat, i) => (
          <Link key={cat.id || i} to={`/user/category/${cat.slug}`} className="flex-shrink-0 flex flex-col items-center gap-2 group transition-transform hover:-translate-y-1">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden shadow-sm border border-gray-100">
              <OptimizedImage 
                src={cat.image} 
                alt={cat.name} 
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                priority={i < 6}
              />
            </div>
            <span className="text-xs font-medium text-center truncate max-w-[72px]">{cat.name}</span>
          </Link>
        ))}
      </div>
    </section>
  ), [displayCategories, showCategorySkeleton, navigate, underPriceLimit]);

  const InlineHeroBannerSection = useMemo(() => {
    if (showBannerSkeleton) return <section className="px-4"><HeroBannerSkeleton className="h-40 w-full" /></section>;
    if (!heroBanners.length) return null;

    const onBannerClick = (banner) => {
      const targetUrl = typeof banner?.ctaLink === "string" ? banner.ctaLink.trim() : "";
      if (targetUrl) {
        if (targetUrl.startsWith("/")) {
          navigate(targetUrl);
          return;
        }
        if (/^https?:\/\//i.test(targetUrl)) {
          window.location.assign(targetUrl);
          return;
        }
      }
      if (banner.linkedRestaurants?.[0]) {
        navigate(`/food/restaurants/${banner.linkedRestaurants[0].slug || banner.linkedRestaurants[0].id || banner.linkedRestaurants[0]._id}`);
      }
    };

    const goNext = () => setCurrentHeroBanner((prev) => (prev + 1) % heroBanners.length);
    const goPrev = () => setCurrentHeroBanner((prev) => (prev - 1 + heroBanners.length) % heroBanners.length);

    return (
      <section className="pt-4 px-4 content-auto">
        <div
          className="relative overflow-hidden rounded-[28px]"
          onTouchStart={(e) => {
            heroTouchStartX.current = e.touches[0]?.clientX || 0;
          }}
          onTouchEnd={(e) => {
            if (heroBanners.length <= 1) return;
            const touchEndX = e.changedTouches[0]?.clientX || 0;
            const diffX = heroTouchStartX.current - touchEndX;
            if (Math.abs(diffX) < 40) return;
            if (diffX > 0) goNext();
            else goPrev();
          }}
        >
          <motion.div
            className="flex"
            animate={{ x: `-${currentHeroBanner * 100}%` }}
            transition={{ type: "tween", ease: "easeInOut", duration: 0.45 }}
          >
            {heroBanners.map((banner, i) => (
              <button
                key={banner.id || i}
                onClick={() => onBannerClick(banner)}
                className="relative block h-40 w-full shrink-0 overflow-hidden rounded-[28px] shadow-sm sm:h-44 lg:h-52"
              >
                <OptimizedImage src={banner.imageUrl} alt={banner.title} className="h-full w-full object-cover" />
              </button>
            ))}
          </motion.div>
          {heroBanners.length > 1 && (
            <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5 rounded-full bg-black/30 px-2 py-1 backdrop-blur-sm">
              {heroBanners.map((_, i) => (
                <button
                  key={`hero-dot-${i}`}
                  onClick={() => setCurrentHeroBanner(i)}
                  className={`h-1.5 rounded-full transition-all ${currentHeroBanner === i ? "w-4 bg-white" : "w-1.5 bg-white/60"}`}
                  aria-label={`Go to banner ${i + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }, [heroBanners, showBannerSkeleton, navigate, currentHeroBanner]);

  return (
    <div className={`relative min-h-screen ${BRAND_THEME.tokens.homepage.shared.pageBackground} pb-24 overflow-x-clip`}>
      <FoodHeroHeaderShell
        stickyHeaderRef={stickyHeaderRef}
        bannerShellRef={heroShellRef}
        hasScrolledPastBanner={hasScrolledPastBanner}
        location={location}
        savedAddressText={getDefaultAddress()?.formattedAddress || "Select Location"}
        handleLocationClick={handleLocationClick}
        handleSearchFocus={handleSearchFocus}
        placeholderIndex={placeholderIndex}
        placeholders={placeholders}
        vegMode={vegMode}
        onVegModeChange={handleVegModeChange}
      />

      <div className="bg-white dark:bg-[#0a0a0a] relative z-10">
        {InlineHeroBannerSection}

        {CategoryRailSection}
        
        {recommendedRestaurants.length > 0 && (
          <section className="pt-6 px-4 content-auto">
            <h2 className="text-sm font-semibold text-gray-500 tracking-widest uppercase mb-4">Recommended For You</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {recommendedRestaurants
                .filter((r) => !vegMode || vegModeOption !== "pure-veg" || r.pureVegRestaurant)
                .slice(0, 4)
                .map((r, i) => (
                <Link key={i} to={`/food/restaurants/${r.slug || r.id || r._id}`} className="block rounded-[20px] overflow-hidden border border-gray-100 bg-white shadow-sm hover:shadow-md transition-shadow">
                  <div className="relative h-28 bg-gray-50">
                    <OptimizedImage 
                      src={r.image} 
                      alt={r.name} 
                      className="w-full h-full object-cover" 
                      priority={i < 2}
                    />
                    <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-lg bg-black/80 text-white text-[10px] font-medium">{r.rating || "NEW"}</div>
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-semibold truncate">{r.name}</p>
                    <p className="text-[10px] font-bold mt-1 flex items-center gap-1 uppercase tracking-wider text-orange-500"><Flame className="w-3.5 h-3.5" />Near & Fast</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
        <section className="pt-8 px-4 content-auto">
          <h2 className="text-sm font-semibold text-gray-500 tracking-widest uppercase mb-4">{exploreHeading}</h2>
          <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-4">
            {showExploreSkeleton ? <ExploreGridSkeleton /> : finalExploreItems.map((item, i) => (
              <Link key={item.id} to={item.href} className="flex-shrink-0 group">
                <div className="flex flex-col items-center gap-3 w-24">
                  <div className="w-20 h-20 rounded-3xl bg-white flex items-center justify-center shadow-sm border border-gray-100 group-hover:scale-105 transition-transform overflow-hidden p-3">
                    <OptimizedImage src={item.image} alt={item.label} className="w-full h-full object-contain" />
                  </div>
                  <span className="text-[11px] font-medium text-gray-600 text-center">{item.label}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="pt-8 pb-12 px-4 content-auto">
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-500 tracking-widest uppercase">{filteredRestaurants.length} Restaurants Delivering to You</h2>
            <p className="text-2xl font-bold text-neutral-900 mt-1">Featured</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative">
            {showRestaurantSkeleton && <div className="absolute inset-0 z-20 bg-white/80 backdrop-blur-sm flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-brand-500" /></div>}
            
            {visibleRestaurants.map((r, i) => (
              <Link key={r.id || i} to={`/food/restaurants/${r.slug || r.id || r._id}`} className="group block bg-white rounded-3xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-300">
                <div className="relative h-48 sm:h-56 overflow-hidden">
                  <OptimizedImage 
                    src={r.image} 
                    alt={r.name} 
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                    priority={i < 1}
                  />
                  <div className="absolute top-4 left-4 px-3 py-1 bg-white/90 backdrop-blur-md rounded-full text-xs font-bold shadow-sm">{r.offer || "Best Price"}</div>
                  <div className="absolute bottom-4 right-4 px-3 py-1 bg-black/70 backdrop-blur-md rounded-full text-white text-xs font-bold">{r.rating} <Star className="w-3 h-3 inline-block fill-yellow-400 text-yellow-400" /></div>
                </div>
                <div className="p-5">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-lg truncate flex-1">{r.name}</h3>
                    <div className="flex items-center gap-1 text-gray-500 text-xs ml-2"><Clock className="w-3.5 h-3.5" />{r.deliveryTime || "25-30 min"}</div>
                  </div>
                  <p className="text-sm text-gray-500 mb-3 truncate">{r.cuisines?.join(", ") || "Multi-cuisine"}</p>
                  <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600"><MapPin className="w-3.5 h-3.5 text-brand-500" />{r.distance || "1.2 km"}</div>
                    <div className="text-sm font-bold text-brand-600">{"\u20B9"}{r.featuredPrice || 249} for one</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          
          <div ref={restaurantLoadMoreRef} className="h-20 flex items-center justify-center mt-8">
            {visibleRestaurantCount < filteredRestaurants.length && <Loader2 className="w-6 h-6 animate-spin text-gray-400" />}
          </div>
        </section>
      </div>

      <StickyCartCard />
      <Footer />
      
      <AnimatePresence>
        {showVegModePopup && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => {
                setShowVegModePopup(false);
                setVegModeContext(false);
              }}
              className="fixed inset-0 bg-black/30 z-[9998] backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: -12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: -12 }}
              transition={{ type: "spring", damping: 25, stiffness: 300, mass: 0.8 }}
              className="fixed z-[9999] left-4 right-4 top-24 mx-auto bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl p-4 w-[calc(100%-2rem)] max-w-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-bold text-gray-900 dark:text-white mb-3">
                See veg dishes from
              </h3>
              <div className="space-y-2 mb-4">
                <label
                  className="flex items-center gap-2.5 cursor-pointer p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  onClick={() => setVegModeOption("all")}
                >
                  <input type="radio" name="homeVegModeOption" checked={vegModeOption === "all"} onChange={() => setVegModeOption("all")} className="sr-only" />
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${vegModeOption === "all" ? "border-green-600 bg-green-600" : "border-gray-300 bg-white"}`}>
                    {vegModeOption === "all" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">Veg from all restaurants</span>
                </label>
                <label
                  className="flex items-center gap-2.5 cursor-pointer p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  onClick={() => setVegModeOption("pure-veg")}
                >
                  <input type="radio" name="homeVegModeOption" checked={vegModeOption === "pure-veg"} onChange={() => setVegModeOption("pure-veg")} className="sr-only" />
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${vegModeOption === "pure-veg" ? "border-green-600 bg-green-600" : "border-gray-300 bg-white"}`}>
                    {vegModeOption === "pure-veg" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">Veg from pure veg restaurants only</span>
                </label>
              </div>
              <button
                onClick={() => {
                  setShowVegModePopup(false);
                  setVegModeContext(true);
                }}
                className={`w-full font-semibold py-2.5 rounded-xl transition-colors mb-2 text-sm ${BRAND_THEME.tokens.homepage.filters.primaryButton}`}
              >
                Apply
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSwitchOffPopup && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => {
                setShowSwitchOffPopup(false);
                isHandlingSwitchOff.current = false;
                setVegModeContext(true);
              }}
              className="fixed inset-0 bg-black/40 z-[9998] backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ type: "spring", damping: 25, stiffness: 300, mass: 0.8 }}
              className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl w-[86%] max-w-sm p-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white text-center mb-2">
                  Switch off Veg Mode?
                </h2>
                <p className="text-gray-600 dark:text-gray-300 text-center mb-5 text-sm">
                  You will see all dishes including non-veg.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowSwitchOffPopup(false);
                      isHandlingSwitchOff.current = false;
                      setVegModeContext(true);
                    }}
                    className="flex-1 rounded-lg py-2.5 text-sm font-semibold border border-gray-200 text-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      setShowSwitchOffPopup(false);
                      isHandlingSwitchOff.current = false;
                      setVegModeContext(false);
                    }}
                    className="flex-1 rounded-lg py-2.5 text-sm font-semibold text-white"
                    style={{ backgroundColor: BRAND_THEME.colors.brand.primary }}
                  >
                    Switch Off
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
