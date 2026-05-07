import { getRestaurantAvailabilityStatus } from "@food/utils/restaurantAvailability";

export const sortRestaurantsByAvailability = (restaurants = [], now = new Date()) => {
  if (!Array.isArray(restaurants)) return [];

  return [...restaurants].sort((left, right) => {
    const leftAvailability = getRestaurantAvailabilityStatus(left, now, {
      ignoreOperationalStatus: true,
    });
    const rightAvailability = getRestaurantAvailabilityStatus(right, now, {
      ignoreOperationalStatus: true,
    });

    const leftClosed = leftAvailability.isOpen ? 0 : 1;
    const rightClosed = rightAvailability.isOpen ? 0 : 1;
    if (leftClosed !== rightClosed) return leftClosed - rightClosed;

    return 0;
  });
};
