import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Clock3, Star, Timer, ShoppingBasket } from "lucide-react";
import { useProfile } from "@food/context/ProfileContext";
import { useLocation } from "@food/hooks/useLocation";
import { useFoodHomeData } from "@food/hooks/user/useFoodHomeData";
import { useLocationSelector } from "@food/components/user/UserLayout";
import { getRestaurantAvailabilityStatus } from "@food/utils/restaurantAvailability";
import OptimizedImage from "@food/components/OptimizedImage";
import StickyCartCard from "@food/components/user/StickyCartCard";
import { RestaurantGridSkeleton } from "@food/components/ui/loading-skeletons";
import HomeHeader from "@food/components/user/home/HomeHeader";
import BRAND_THEME from "@/config/brandTheme";

const placeholders = [
  'Search "milk"',
  'Search "bread"',
  'Search "fruits"',
  'Search "mart"',
];

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

export default function Grocery() {
  const navigate = useNavigate();
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [availabilityTick] = useState(() => Date.now());
  const { location } = useLocation();
  const { openLocationSelector } = useLocationSelector();
  const { vegMode, isFavorite, addFavorite, removeFavorite } = useProfile();
  const { restaurants, loadingRestaurants } = useFoodHomeData({ location, vegMode, listingType: "grocery" });
  const { homepage } = BRAND_THEME.tokens;

  useEffect(() => {
    const interval = setInterval(() => setPlaceholderIndex((prev) => (prev + 1) % placeholders.length), 2000);
    return () => clearInterval(interval);
  }, []);

  const handleSearchClick = () => {
    navigate("/food/user/search");
  };

  const handleFavoriteToggle = (event, restaurant) => {
    event.preventDefault();
    event.stopPropagation();

    const restaurantId = getRestaurantRouteParam(restaurant);
    if (isFavorite(restaurantId)) {
      removeFavorite(restaurantId);
      return;
    }
    addFavorite({
      id: restaurantId,
      slug: restaurant.slug || restaurantId,
      name: restaurant.name || restaurant.restaurantName || "Restaurant",
      image: restaurant.image || restaurant.profileImage?.url || restaurant.profileImage || "",
      cuisines: restaurant.cuisines || [],
      rating: restaurant.rating || 0,
      deliveryTime: restaurant.deliveryTime || restaurant.estimatedDeliveryTime || "25-30 min",
    });
  };

  return (
    <div className={`min-h-screen pb-24 ${homepage.shared.pageBackground}`}>
      <section className="md:hidden">
        <HomeHeader
          activeTab="food"
          setActiveTab={() => {}}
          location={location}
          savedAddressText={location?.area || location?.city || "Mumbra"}
          handleLocationClick={openLocationSelector}
          handleSearchFocus={handleSearchClick}
          placeholderIndex={placeholderIndex}
          placeholders={placeholders}
          showVegMode={false}
        />
      </section>

      <section className="hidden md:block border-b border-slate-200 bg-white/90 px-4 py-5 backdrop-blur-sm sm:px-6">
        <div className="mx-auto max-w-6xl">
          <HomeHeader
            activeTab="food"
            setActiveTab={() => {}}
            location={location}
            savedAddressText={location?.area || location?.city || "Mumbra"}
            handleLocationClick={openLocationSelector}
            handleSearchFocus={handleSearchClick}
            placeholderIndex={placeholderIndex}
            placeholders={placeholders}
            showVegMode={false}
            compact
          />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className={`text-xs font-semibold uppercase tracking-[0.24em] ${homepage.shared.heading}`}>
              Grocery Stores
            </p>
            <h1 className={`mt-1 text-2xl font-black tracking-tight ${homepage.shared.title}`}>
              Grocery near you
            </h1>
          </div>
          <div className="rounded-full bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
            {restaurants.length} stores
          </div>
        </div>

        {loadingRestaurants ? (
          <RestaurantGridSkeleton count={6} />
        ) : restaurants.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-slate-300 bg-white/70 px-6 py-14 text-center">
            <ShoppingBasket className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <p className="text-lg font-semibold text-slate-800">No grocery stores found</p>
            <p className="mt-2 text-sm text-slate-500">No grocery stores are available in your area yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {restaurants.map((restaurant, index) => {
              const availability = getRestaurantAvailabilityStatus(restaurant, new Date(availabilityTick));
              const restaurantSlug = getRestaurantRouteParam(restaurant, index);
              const isMarkedFavorite = isFavorite(restaurantSlug);

              return (
                <Link key={restaurant._id || restaurant.id || restaurantSlug} to={`/food/user/restaurants/${restaurantSlug}`} className="group flex h-full">
                  <article className={`flex h-full w-full flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${availability.state !== "open" ? "opacity-85" : ""}`}>
                    <div className="relative h-48 w-full overflow-hidden">
                      <OptimizedImage
                        src={restaurant.image || restaurant.profileImage?.url || restaurant.profileImage || ""}
                        alt={restaurant.name || "Restaurant"}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <button
                        onClick={(event) => handleFavoriteToggle(event, restaurant)}
                        className={`absolute right-4 top-4 rounded-full px-3 py-1.5 text-xs font-semibold shadow-lg ${isMarkedFavorite ? "bg-[#005128] text-white" : "bg-white/90 text-slate-700"}`}
                      >
                        {isMarkedFavorite ? "Saved" : "Save"}
                      </button>
                      <div className={`absolute bottom-4 left-4 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${
                        availability.state === "open"
                          ? "bg-emerald-500 text-white"
                          : availability.state === "off"
                            ? "bg-rose-500 text-white"
                            : "bg-slate-500 text-white"
                      }`}>
                        {availability.badgeLabel || "Closed"}
                      </div>
                    </div>

                    <div className="flex flex-1 flex-col p-4">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="line-clamp-1 text-xl font-bold text-slate-900">{restaurant.name}</h2>
                          <p className="mt-1 line-clamp-1 text-sm text-slate-500">
                            {Array.isArray(restaurant.cuisines) && restaurant.cuisines.length > 0
                              ? restaurant.cuisines.join(", ")
                              : restaurant.area || "Everyday essentials"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 rounded-2xl bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">
                          <Star className="h-4 w-4 fill-emerald-500 text-emerald-500" />
                          <span>{Number(restaurant.rating || 0) > 0 ? Number(restaurant.rating).toFixed(1) : "NEW"}</span>
                        </div>
                      </div>

                      <div className="mb-3 flex items-center gap-2 text-sm text-slate-600">
                        <Clock3 className="h-4 w-4" />
                        <span>{restaurant.deliveryTime || restaurant.estimatedDeliveryTime || "25-30 min"}</span>
                      </div>

                      <div className={`mt-auto inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
                        availability.state === "open"
                          ? "bg-amber-50 text-amber-700"
                          : availability.state === "off"
                            ? "bg-rose-50 text-rose-700"
                            : "bg-slate-100 text-slate-600"
                      }`}>
                        <Timer className="h-4 w-4" />
                        <span>{availability.detailLabel || "Closed"}</span>
                      </div>
                    </div>
                  </article>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <StickyCartCard />
    </div>
  );
}
