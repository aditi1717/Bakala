import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { FoodRestaurant } from '../models/restaurant.model.js';
import { FoodItem } from '../../admin/models/food.model.js';
import { FoodCategory } from '../../admin/models/category.model.js';
import { getFoodDisplayPrice, serializeFoodVariants } from '../../admin/services/foodVariant.service.js';
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

const buildMenuFromFoods = async (foods = [], options = {}) => {
    const categoryIds = Array.from(
        new Set(
            (foods || [])
                .map((food) => {
                    const raw = food?.categoryId;
                    if (!raw) return '';
                    return String(raw);
                })
                .filter((value) => mongoose.Types.ObjectId.isValid(value))
        )
    );

    const categoryDocs = categoryIds.length
        ? await FoodCategory.find({ _id: { $in: categoryIds } })
            .select('name image sortOrder visibilityStartTime visibilityEndTime')
            .lean()
        : [];
    const categoryMap = new Map(categoryDocs.map((doc) => [String(doc._id), doc]));
    const visibleCategoryIdSet = new Set(
        categoryDocs
            .filter((doc) => isCategoryVisibleNow(doc, { timezone: 'Asia/Kolkata' }))
            .map((doc) => String(doc._id))
    );

    const byCategory = new Map();
    for (const food of foods) {
        if (options.onlyCurrentlyVisible === true && !isFoodVisibleNow(food, { timezone: options.timezone || 'Asia/Kolkata' })) {
            continue;
        }
        const categoryId = food?.categoryId ? String(food.categoryId) : '';
        if (categoryId && !visibleCategoryIdSet.has(categoryId)) {
            continue;
        }
        const categoryDoc = categoryMap.get(categoryId) || null;
        const sectionName = (categoryDoc?.name || food?.categoryName || food?.category || 'Menu').trim() || 'Menu';
        const groupKey = categoryId || `name:${sectionName.toLowerCase()}`;

        if (!byCategory.has(groupKey)) {
            byCategory.set(groupKey, {
                id: categoryId || null,
                name: sectionName,
                image: categoryDoc?.image || '',
                sortOrder: Number.isFinite(Number(categoryDoc?.sortOrder)) ? Number(categoryDoc.sortOrder) : Number.MAX_SAFE_INTEGER,
                items: []
            });
        }

        byCategory.get(groupKey).items.push({
            id: String(food._id),
            _id: food._id,
            categoryId: categoryId || null,
            categoryName: sectionName,
            category: sectionName,
            name: food.name,
            description: food.description || '',
            price: getFoodDisplayPrice(food),
            variants: serializeFoodVariants(food.variants),
            variations: serializeFoodVariants(food.variants),
            image: food.image || '',
            foodType: food.foodType || 'Non-Veg',
            isAvailable: food.isAvailable !== false,
            approvalStatus: food.approvalStatus || 'approved',
            rejectionReason: food.rejectionReason || '',
            requestedAt: food.requestedAt,
            approvedAt: food.approvedAt,
            rejectedAt: food.rejectedAt,
            preparationTime: food.preparationTime || '',
            availabilityTimeStart: food.availabilityTimeStart || '',
            availabilityTimeEnd: food.availabilityTimeEnd || '',
            createdAt: food.createdAt,
            updatedAt: food.updatedAt
        });
    }

    const orderedGroups = Array.from(byCategory.values()).sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return String(a.name || '').localeCompare(String(b.name || ''));
    });

    const sections = orderedGroups.map((group, idx) => ({
        id: group.id || `section-${idx}`,
        categoryId: group.id || null,
        name: group.name,
        image: group.image || '',
        sortOrder: Number.isFinite(Number(group.sortOrder)) ? Number(group.sortOrder) : 0,
        itemCount: group.items.length,
        items: group.items.sort((a, b) => {
            const at = new Date(a.createdAt || a.requestedAt || 0).getTime();
            const bt = new Date(b.createdAt || b.requestedAt || 0).getTime();
            return bt - at;
        }),
        subsections: []
    }));

    const categories = sections.map((section) => ({
        id: section.categoryId || section.id,
        categoryId: section.categoryId || null,
        name: section.name,
        image: section.image || '',
        sortOrder: section.sortOrder || 0,
        itemCount: section.itemCount || 0
    }));

    return { sections, categories };
};

export async function getRestaurantMenu(restaurantId) {
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(String(restaurantId))) {
        throw new ValidationError('Invalid restaurant id');
    }
    const foods = await FoodItem.find({ restaurantId })
        .sort({ createdAt: -1 })
        .limit(5000)
        .lean();
    return buildMenuFromFoods(foods);
}

export async function updateRestaurantMenu(restaurantId, body = {}) {
    // Option A: single source of truth (food_items). Menu layout snapshots are disabled.
    // Keep endpoint for backward compatibility, but make it explicit.
    throw new ValidationError('Menu editing is disabled. Menu is generated from food items.');
}

export async function getPublicApprovedRestaurantMenu(restaurantIdOrSlug) {
    const value = String(restaurantIdOrSlug || '').trim();
    if (!value) throw new ValidationError('Restaurant id is required');

    let restaurant = null;
    if (/^[0-9a-fA-F]{24}$/.test(value)) {
        restaurant = await FoodRestaurant.findOne({ _id: value, status: 'approved' })
            .select('_id status')
            .lean();
    } else {
        const normalized = value.trim().toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ');
        restaurant = await FoodRestaurant.findOne({ restaurantNameNormalized: normalized, status: 'approved' })
            .select('_id status')
            .lean();
    }

    if (!restaurant?._id) {
        return null;
    }
    const foods = await FoodItem.find({ restaurantId: restaurant._id, approvalStatus: 'approved' })
        .sort({ createdAt: -1 })
        .limit(2000)
        .lean();
    return buildMenuFromFoods(foods, { onlyCurrentlyVisible: true, timezone: 'Asia/Kolkata' });
}

export async function syncMenuItemApprovalStatus(restaurantId, itemId, status, rejectionReason = '') {
    // No-op in Option A (menu snapshots removed). Approval status lives only in food_items.
    // Kept to avoid breaking admin approval flows that call this helper.
    return;
}
