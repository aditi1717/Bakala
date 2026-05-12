/**
 * Location-based proximity has been removed from delivery flow.
 * Order actions stay manual, so pickup/drop progression is not blocked by GPS.
 * 
 * @returns {Object} { distanceToTarget, isWithinRange, actionLimit }
 */
export const useProximityCheck = () => {
  return {
    distanceToTarget: null,
    isWithinRange: true,
    actionLimit: null,
  };
};
