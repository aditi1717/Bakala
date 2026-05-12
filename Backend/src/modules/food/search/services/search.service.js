import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodItem } from '../../admin/models/food.model.js';
import { FoodCategory } from '../../admin/models/category.model.js';
import mongoose from 'mongoose';
import { isCategoryVisibleNow } from '../../shared/categoryWorkflow.js';

const parse12HourTimeToMinutes = (value) => {
    const text = String(value || '').trim();
    const match = text.match(/^(0?[1-9]|1[0-2]):([0-5]\d)\s?(AM|PM)$/i);
    if (!match) return null;
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    const meridiem = String(match[3] || '').toUpperCase();
    if (meridiem === 'AM') {
        if (hour === 12) hour = 0;
    } else if (hour !== 12) {
        hour += 12;
    }
    return hour * 60 + minute;
};

const getCurrentMinutesForTimezone = (timezone = 'Asia/Kolkata') => {
    const formatter = new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: timezone
    });
    const parts = formatter.formatToParts(new Date());
    const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
    return hour * 60 + minute;
};

const isFoodVisibleNow = (food = {}, options = {}) => {
    const start = String(food?.availabilityTimeStart || '').trim();
    const end = String(food?.availabilityTimeEnd || '').trim();
    if (!start && !end) return true;

    const nowMinutes = Number.isFinite(options.currentMinutes)
        ? Number(options.currentMinutes)
        : getCurrentMinutesForTimezone(options.timezone || 'Asia/Kolkata');
    const startMinutes = parse12HourTimeToMinutes(start);
    const endMinutes = parse12HourTimeToMinutes(end);

    if (start && !end && startMinutes !== null) return nowMinutes >= startMinutes;
    if (!start && end && endMinutes !== null) return nowMinutes <= endMinutes;
    if (startMinutes === null || endMinutes === null) return true;
    if (startMinutes <= endMinutes) {
        return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
    }
    return nowMinutes >= startMinutes || nowMinutes <= endMinutes;
};

const APPROVED_FOOD_FILTER = {
    $or: [
        { approvalStatus: 'approved' },
        { approvalStatus: { $exists: false }, isApproved: { $ne: false } }
    ]
};

const buildFoodSearchFilter = (regex, { isVeg } = {}) => {
    const filters = [APPROVED_FOOD_FILTER, { isAvailable: { $ne: false } }];
    if (isVeg === 'true') {
        filters.push({ foodType: 'Veg' });
    }
    if (regex) {
        filters.push({
            $or: [
                { name: { $regex: regex } },
                { description: { $regex: regex } },
                { categoryName: { $regex: regex } },
                { 'variants.name': { $regex: regex } },
                { 'variations.name': { $regex: regex } }
            ]
        });
    }
    return { $and: filters };
};

const getMatchedFoodLabel = (food, regex, fallbackTerm = '') => {
    if (!food) return fallbackTerm;
    const fields = [food.name, food.description, food.categoryName];
    const direct = fields.find((value) => value && regex?.test(String(value)));
    if (direct) return food.name || direct;

    const variantList = Array.isArray(food?.variants)
        ? food.variants
        : (Array.isArray(food?.variations) ? food.variations : []);

    const matchedVariant = Array.isArray(variantList)
        ? variantList.find((variant) => variant?.name && regex?.test(String(variant.name)))
        : null;
    if (matchedVariant?.name) {
        return food.name ? `${food.name} (${matchedVariant.name})` : matchedVariant.name;
    }

    return food.name || fallbackTerm;
};

/**
 * Unified Search Service
 * Searches for restaurants by name and also searches for food items, 
 * returning matched restaurants with potential dish highlights.
 */
export const searchUnified = async (query = {}, options = {}) => {
    const { 
        q, 
        lat, 
        lng, 
        radiusKm = 20, 
        categoryId, 
        minRating, 
        maxDeliveryTime, 
        isVeg,
        page = 1,
        limit = 20
    } = query;

    const skip = (page - 1) * limit;
    const term = String(q || '').trim();
    const regex = term ? new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;

    // 1. Initial Filter (approved status and basic conditions)
    const restaurantFilter = { status: 'approved' };
    
    console.log(`[Search-Service] Querying with term: "${term}", categoryId: "${categoryId}"`);

    if (isVeg === 'true') {
        restaurantFilter.pureVegRestaurant = true;
    }

    if (minRating) {
        restaurantFilter.rating = { $gte: parseFloat(minRating) };
    }

    if (maxDeliveryTime) {
        restaurantFilter.estimatedDeliveryTimeMinutes = { $lte: parseInt(maxDeliveryTime) };
    }
    
    console.log(`[Search-Service] Final Restaurant Filter:`, JSON.stringify(restaurantFilter));

    let restaurantIds = new Set();
    let restaurantDetailsMap = new Map();

    // 2. Handle Category Filtering (Restaurants don't have categoryId, FoodItems do)
    if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) {
        const selectedCategory = await FoodCategory.findById(categoryId)
            .select('isActive visibilityStartTime visibilityEndTime')
            .lean();
        if (
            !selectedCategory ||
            selectedCategory.isActive === false ||
            !isCategoryVisibleNow(selectedCategory, { timezone: 'Asia/Kolkata' })
        ) {
            return {
                success: true,
                data: { restaurants: [], total: 0, page: parseInt(page), limit: parseInt(limit) }
            };
        }

        const catFoodItems = await FoodItem.find({
            $and: [
                APPROVED_FOOD_FILTER,
                { isAvailable: { $ne: false } },
                { categoryId: new mongoose.Types.ObjectId(categoryId) }
            ]
        }).select('restaurantId').lean();
        
        const catRestaurantIds = [...new Set(catFoodItems.map(f => f.restaurantId.toString()))];
        if (catRestaurantIds.length > 0) {
            restaurantFilter._id = { $in: catRestaurantIds.map(id => new mongoose.Types.ObjectId(id)) };
        } else {
            // No food items in this category -> No restaurants
            return {
                success: true,
                data: { restaurants: [], total: 0, page: parseInt(page), limit: parseInt(limit) }
            };
        }
    }

    // 3. Search Matching
    if (regex) {
        // A. Search by Restaurant Name / Cuisine
        const matchedRestaurants = await FoodRestaurant.find({
            ...restaurantFilter,
            $or: [
                { restaurantName: { $regex: regex } },
                { cuisines: { $regex: regex } }
            ]
        }).limit(limit * 2).lean();

        matchedRestaurants.forEach(r => {
            restaurantIds.add(r._id.toString());
            restaurantDetailsMap.set(r._id.toString(), { ...r, matchType: 'restaurant' });
        });

        // B. Search by Food Item Name
        const matchedFoodsRaw = await FoodItem.find(buildFoodSearchFilter(regex, { isVeg }))
            .limit(limit * 2)
            .lean();

        const matchedFoodCategoryIds = Array.from(
            new Set(
                matchedFoodsRaw
                    .map((food) => (food?.categoryId ? String(food.categoryId) : ''))
                    .filter((value) => mongoose.Types.ObjectId.isValid(value))
            )
        );

        const categoryVisibilityMap = new Map();
        if (matchedFoodCategoryIds.length > 0) {
            const categoryDocs = await FoodCategory.find({ _id: { $in: matchedFoodCategoryIds } })
                .select('isActive visibilityStartTime visibilityEndTime')
                .lean();
            categoryDocs.forEach((doc) => {
                categoryVisibilityMap.set(
                    String(doc._id),
                    doc?.isActive !== false &&
                    isCategoryVisibleNow(doc, { timezone: 'Asia/Kolkata' })
                );
            });
        }

        const matchedFoods = matchedFoodsRaw.filter((food) => {
            if (food?.isAvailable === false) return false;
            if (!isFoodVisibleNow(food, { timezone: 'Asia/Kolkata' })) return false;
            if (!food?.categoryId) return true;
            const key = String(food.categoryId);
            if (!categoryVisibilityMap.has(key)) return true;
            return categoryVisibilityMap.get(key) === true;
        });

        const foodRestaurantIds = matchedFoods.map(f => f.restaurantId.toString());
        
        if (foodRestaurantIds.length > 0) {
            const unmatchedIds = foodRestaurantIds.filter(id => !restaurantIds.has(id));
            if (unmatchedIds.length > 0) {
                const rsForFoods = await FoodRestaurant.find({
                    ...restaurantFilter,
                    _id: { $in: unmatchedIds.map(id => new mongoose.Types.ObjectId(id)) }
                }).lean();

                rsForFoods.forEach(r => {
                    const matchedFood = matchedFoods.find(f => f.restaurantId.toString() === r._id.toString());
                    restaurantIds.add(r._id.toString());
                    restaurantDetailsMap.set(r._id.toString(), { 
                        ...r, 
                        matchType: 'food',
                        matchedDish: getMatchedFoodLabel(matchedFood, regex, term),
                        matchedDishImage: matchedFood?.image,
                        matchedDishId: matchedFood?._id
                    });
                });
            }
        }
    } else {
        // No search text -> List all restaurants matching filters/category.
        const allMatching = await FoodRestaurant.find(restaurantFilter)
            .sort({ rating: -1, createdAt: -1 })
            .limit(limit * 2)
            .lean();
            
        allMatching.forEach(r => {
            restaurantIds.add(r._id.toString());
            restaurantDetailsMap.set(r._id.toString(), r);
        });
    }

    // 4. Final Result Formatting
    let results = Array.from(restaurantDetailsMap.values());

    // Simple distance sorting if lat/lng are provided
    if (lat && lng && results.length > 0) {
        results.forEach(res => {
            if (res.location && res.location.latitude && res.location.longitude) {
                const dLat = (res.location.latitude - lat) * Math.PI / 180;
                const dLon = (res.location.longitude - lng) * Math.PI / 180;
                const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                          Math.cos(lat * Math.PI / 180) * Math.cos(res.location.latitude * Math.PI / 180) *
                          Math.sin(dLon/2) * Math.sin(dLon/2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                res.distanceScore = 6371 * c; // Km
            } else {
                res.distanceScore = 999;
            }
        });
        results.sort((a, b) => (a.distanceScore || 999) - (b.distanceScore || 999));
    }

    // ... (rest of logic up to result formation)
    const finalResult = {
        success: true,
        data: {
            restaurants: results.slice(skip, skip + limit),
            total: results.length,
            page: parseInt(page),
            limit: parseInt(limit)
        }
    };

    return finalResult;
};

/**
 * Fetch Admin-only categories
 */
export const getAdminCategories = async (query = {}) => {
    const filter = { 
        isActive: true, 
        isApproved: true,
        $or: [
            { restaurantId: { $exists: false } },
            { restaurantId: null },
            { restaurantId: { $eq: undefined } }
        ]
    };

    const categories = await FoodCategory.find(filter)
        .sort({ sortOrder: 1, name: 1 })
        .lean();
    return categories.filter((category) => isCategoryVisibleNow(category, { timezone: 'Asia/Kolkata' }));
};
