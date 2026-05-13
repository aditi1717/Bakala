import { getRestaurantAvailabilityStatus } from "@food/utils/restaurantAvailability";

const getListingOrder = (restaurant) => {
  const value = Number(restaurant?.listingOrder);
  return Number.isFinite(value) && value > 0 ? value : null;
};

export const sortRestaurantsByAvailability = (restaurants = [], now = new Date()) => {
  if (!Array.isArray(restaurants)) return [];

  return [...restaurants].sort((left, right) => {
    const leftAvailability = getRestaurantAvailabilityStatus(left, now);
    const rightAvailability = getRestaurantAvailabilityStatus(right, now);

    const leftClosed = leftAvailability.isOpen ? 0 : 1;
    const rightClosed = rightAvailability.isOpen ? 0 : 1;
    if (leftClosed !== rightClosed) return leftClosed - rightClosed;

    const leftOrder = getListingOrder(left);
    const rightOrder = getListingOrder(right);
    const leftUnnumbered = leftOrder === null ? 1 : 0;
    const rightUnnumbered = rightOrder === null ? 1 : 0;
    if (leftUnnumbered !== rightUnnumbered) return leftUnnumbered - rightUnnumbered;
    if (leftOrder !== null && rightOrder !== null && leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return 0;
  });
};
