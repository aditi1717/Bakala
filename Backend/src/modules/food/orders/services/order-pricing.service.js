import mongoose from 'mongoose';
import { FoodOrder } from '../models/order.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodFeeSettings } from '../../admin/models/feeSettings.model.js';
import { FoodOffer } from '../../admin/models/offer.model.js';
import { FoodOfferUsage } from '../../admin/models/offerUsage.model.js';
import { ValidationError } from '../../../../core/auth/errors.js';

const resolveOfferEndBoundary = (endDateValue) => {
  if (!endDateValue) return null;
  const raw = String(endDateValue).trim();
  const end = new Date(endDateValue);
  if (Number.isNaN(end.getTime())) return null;
  // If date is provided without time, treat it as inclusive till end-of-day.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) end.setHours(23, 59, 59, 999);
  // Legacy/backfilled safety: stored midnight timestamps should also be full-day inclusive.
  if (
    end.getHours() === 0 &&
    end.getMinutes() === 0 &&
    end.getSeconds() === 0 &&
    end.getMilliseconds() === 0
  ) {
    end.setHours(23, 59, 59, 999);
  }
  return end;
};

export async function calculateOrderPricing(userId, dto) {
  const restaurant = await FoodRestaurant.findById(dto.restaurantId)
    .select("status")
    .lean();
  if (!restaurant) throw new ValidationError("Restaurant not found");
  if (restaurant.status !== "approved")
    throw new ValidationError("Restaurant not available");

  const items = Array.isArray(dto.items) ? dto.items : [];
  const subtotal = items.reduce(
    (sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1),
    0,
  );

  const feeDoc = await FoodFeeSettings.findOne({ isActive: true })
    .sort({ createdAt: -1 })
    .lean();
  const feeSettings = feeDoc || {
    deliveryFee: 25,
    deliveryFeeRanges: [],
    freeDeliveryThreshold: 149,
    platformFee: 5,
    gstRate: 5,
  };

  const packagingFee = 0;
  const platformFee = Number(feeSettings.platformFee || 0);

  const freeThreshold = Number(feeSettings.freeDeliveryThreshold || 0);
  let deliveryFee = 0;
  if (
    Number.isFinite(freeThreshold) &&
    freeThreshold > 0 &&
    subtotal >= freeThreshold
  ) {
    deliveryFee = 0;
  } else {
    const ranges = Array.isArray(feeSettings.deliveryFeeRanges)
      ? [...feeSettings.deliveryFeeRanges]
      : [];
    if (ranges.length > 0) {
      ranges.sort((a, b) => Number(a.min) - Number(b.min));
      let matched = null;
      for (let i = 0; i < ranges.length; i += 1) {
        const r = ranges[i] || {};
        const min = Number(r.min);
        const max = Number(r.max);
        const fee = Number(r.fee);
        if (
          !Number.isFinite(min) ||
          !Number.isFinite(max) ||
          !Number.isFinite(fee)
        ) {
          continue;
        }
        const isLast = i === ranges.length - 1;
        const inRange = isLast
          ? subtotal >= min && subtotal <= max
          : subtotal >= min && subtotal < max;
        if (inRange) {
          matched = fee;
          break;
        }
      }
      deliveryFee = Number.isFinite(matched)
        ? matched
        : Number(feeSettings.deliveryFee || 0);
    } else {
      deliveryFee = Number(feeSettings.deliveryFee || 0);
    }
  }

  const gstRate = Number(feeSettings.gstRate || 0);
  const tax =
    Number.isFinite(gstRate) && gstRate > 0
      ? Math.round(subtotal * (gstRate / 100))
      : 0;

  let discount = 0;
  let couponDiscount = 0;
  let appliedCoupon = null;
  const codeRaw = dto.couponCode
    ? String(dto.couponCode).trim().toUpperCase()
    : "";

    if (codeRaw) {
        const now = new Date();
        const offer = await FoodOffer.findOne({ couponCode: codeRaw }).lean();
        if (offer) {
            const approvalOk = (offer.approvalStatus || 'approved') === 'approved';
            const statusOk = offer.status === "active";
            const startOk = !offer.startDate || now >= new Date(offer.startDate);
            const couponEndBoundary = resolveOfferEndBoundary(offer.endDate);
            const endOk = !couponEndBoundary || now <= couponEndBoundary;
            const scopeOk =
                offer.restaurantScope !== "selected" ||
                String(offer.restaurantId || "") === String(dto.restaurantId || "");
            const minOk = subtotal >= (Number(offer.minOrderValue) || 0);
            let usageOk = true;
            if (
                Number(offer.usageLimit) > 0 &&
        Number(offer.usedCount || 0) >= Number(offer.usageLimit)
      ) {
        usageOk = false;
      }

      let perUserOk = true;
      if (userId && Number(offer.perUserLimit) > 0) {
        const usage = await FoodOfferUsage.findOne({
          offerId: offer._id,
          userId,
        }).lean();
        if (usage && Number(usage.count) >= Number(offer.perUserLimit)) {
          perUserOk = false;
        }
      }

      let firstOrderOk = true;
      if (userId && offer.customerScope === "first-time") {
        const c = await FoodOrder.countDocuments({
          userId: new mongoose.Types.ObjectId(userId),
        });
        firstOrderOk = c === 0;
      }
            if (userId && offer.isFirstOrderOnly === true) {
                const c2 = await FoodOrder.countDocuments({
                    userId: new mongoose.Types.ObjectId(userId),
                });
                if (c2 > 0) firstOrderOk = false;
            }

            const allowed =
                approvalOk &&
                statusOk &&
                startOk &&
                endOk &&
                scopeOk &&
                minOk &&
                usageOk &&
                perUserOk &&
        firstOrderOk;

      if (allowed) {
        if (offer.discountType === "percentage") {
          const raw = subtotal * (Number(offer.discountValue) / 100);
          const capped = Number(offer.maxDiscount)
            ? Math.min(raw, Number(offer.maxDiscount))
            : raw;
          couponDiscount = Math.max(0, Math.min(subtotal, Math.floor(capped)));
        } else {
          couponDiscount = Math.max(
            0,
            Math.min(subtotal, Math.floor(Number(offer.discountValue) || 0)),
          );
        }
        const isRestaurantFundedCoupon =
          offer.fundedBy === 'restaurant' || Boolean(offer.createdByRestaurantId);
        appliedCoupon = {
          code: codeRaw,
          discount: couponDiscount,
          fundedBy: isRestaurantFundedCoupon ? 'restaurant' : 'platform'
        };
      }
    }
  }

  discount = Math.max(0, Math.min(subtotal, couponDiscount));

  // Calculate discount breakdown for reporting
  let couponByAdmin = 0;
  let couponByRestaurant = 0;

  if (appliedCoupon) {
    if (appliedCoupon.fundedBy === 'restaurant') {
      couponByRestaurant = couponDiscount;
    } else {
      couponByAdmin = couponDiscount;
    }
  }

  const total = Math.max(
    0,
    subtotal + packagingFee + deliveryFee + platformFee + tax - discount,
  );

  return {
    pricing: {
      subtotal,
      tax,
      packagingFee,
      deliveryFee,
      platformFee,
      couponDiscount,
      discount,
      couponByAdmin,
      couponByRestaurant,
      total,
      currency: "INR",
      couponCode: appliedCoupon?.code || codeRaw || null,
      appliedCoupon,
    },
  };
}

