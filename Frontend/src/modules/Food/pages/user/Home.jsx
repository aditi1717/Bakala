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
import { HorizontalCarousel } from "@food/components/ui/horizontal-carousel";
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

const HERO_BANNER_AUTO_SLIDE_MS = 3500;
const RESTAURANTS_BATCH_SIZE = 9;
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
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [hasScrolledPastBanner, setHasScrolledPastBanner] = useState(false);
  const [visibleRestaurantCount, setVisibleRestaurantCount] = useState(RESTAURANTS_BATCH_SIZE);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [activeTab, setActiveTab] = useState(routerLocation.pathname.endsWith("/quick") ? "quick" : "food");

  const heroShellRef = useRef(null);
  const stickyHeaderRef = useRef(null);
  const categoryScrollRef = useRef(null);
  const restaurantLoadMoreRef = useRef(null);
  const autoSlideIntervalRef = useRef(null);
  const isHandlingSwitchOff = useRef(false);
  const isSwiping = useRef(false);
  const touchStartX = useRef(0);

  // High-performance data fetching hook
  const {
    loading: loadingConfig,
    loadingRestaurants,
    heroBanners,
    exploreItems: landingExploreMore,
    exploreHeading,
    headerVideoUrl,
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
  const heroBannerImages = useMemo(() => heroBanners.map(b => b.imageUrl).filter(Boolean), [heroBanners]);
  
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
    return restaurantsData.filter(r => !vegMode || r.pureVegRestaurant);
  }, [restaurantsData, vegMode]);

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

  const handleVegModeChange = (newValue) => {
    if (isHandlingSwitchOff.current) return;
    if (newValue && !vegMode) setShowVegModePopup(true);
    else if (!newValue && vegMode) { isHandlingSwitchOff.current = true; setShowSwitchOffPopup(true); }
    else setVegModeContext(newValue);
  };

  // Hero Carousel Logic
  useEffect(() => {
    if (heroBannerImages.length <= 1) return;
    autoSlideIntervalRef.current = setInterval(() => {
      if (!isSwiping.current) setCurrentBannerIndex(p => (p + 1) % heroBannerImages.length);
    }, HERO_BANNER_AUTO_SLIDE_MS);
    return () => clearInterval(autoSlideIntervalRef.current);
  }, [heroBannerImages.length]);

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

  // UI Sections
  const HeroBannerSection = useMemo(() => {
    if (showBannerSkeleton) return <div className="h-full w-full"><HeroBannerSkeleton className="h-full w-full" /></div>;
    if (!heroBannerImages.length) return null;
    return (
      <div ref={heroShellRef} className="relative w-full h-full overflow-hidden bg-white">
        {heroBannerImages.map((img, idx) => (
          <motion.div key={idx} initial={false} animate={{ opacity: currentBannerIndex === idx ? 1 : 0 }} transition={{ duration: 0.7 }} className="absolute inset-0">
            <img 
              src={img} 
              alt="" 
              className="w-full h-full object-cover" 
              fetchpriority={idx === 0 ? "high" : "low"}
              loading={idx === 0 ? "eager" : "lazy"}
            />
          </motion.div>
        ))}
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex gap-1.5 z-30">
          {heroBannerImages.map((_, idx) => (
            <div key={idx} className={`h-1.5 rounded-full transition-all duration-300 ${currentBannerIndex === idx ? "bg-white w-5" : "bg-white/40 w-1.5"}`} />
          ))}
        </div>
      </div>
    );
  }, [heroBannerImages, currentBannerIndex, showBannerSkeleton]);

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
    return (
      <section className="pt-4 px-4 space-y-3 content-auto">
        {heroBanners.map((banner, i) => (
          <motion.button key={banner.id || i} whileHover={{ scale: 0.98 }} onClick={() => banner.linkedRestaurants?.[0] && navigate(`/food/restaurants/${banner.linkedRestaurants[0].slug || banner.linkedRestaurants[0].id || banner.linkedRestaurants[0]._id}`)} className="relative block w-full h-40 sm:h-44 lg:h-52 overflow-hidden rounded-[28px] shadow-sm">
            <OptimizedImage src={banner.imageUrl} alt={banner.title} className="w-full h-full object-cover" />
          </motion.button>
        ))}
      </section>
    );
  }, [heroBanners, showBannerSkeleton, navigate]);

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
        bannerContent={headerVideoUrl ? (
          <video 
            src={headerVideoUrl.replace('/upload/', '/upload/q_auto,vc_auto/')} 
            poster={headerVideoUrl.replace(/\.[^/.]+$/, ".jpg").replace('/upload/', '/upload/q_auto,f_auto,so_0/')}
            autoPlay 
            loop 
            muted 
            playsInline 
            className="h-full w-full object-cover" 
          />
        ) : HeroBannerSection}
      />

      <div className="bg-white dark:bg-[#0a0a0a] relative z-10">
        {CategoryRailSection}
        
        {recommendedRestaurants.length > 0 && (
          <section className="pt-6 px-4 content-auto">
            <h2 className="text-sm font-semibold text-gray-500 tracking-widest uppercase mb-4">Recommended For You</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {recommendedRestaurants.filter(r => !vegMode || r.pureVegRestaurant).slice(0, 4).map((r, i) => (
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

        {InlineHeroBannerSection}

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
      
      {/* Veg Mode Popups would go here */}
    </div>
  );
}
