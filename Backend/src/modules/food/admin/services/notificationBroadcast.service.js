import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { FoodUser } from '../../../../core/users/user.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodDeliveryPartner } from '../../delivery/models/deliveryPartner.model.js';
import { notifyOwnersSafely } from '../../../../core/notifications/firebase.service.js';
import { getIO, rooms } from '../../../../config/socket.js';

const TARGET_TYPE_MAP = {
    ALL: 'ALL',
    USER: 'USER',
    RESTAURANT: 'RESTAURANT',
    DELIVERY: 'DELIVERY',
    CUSTOM: 'CUSTOM'
};

const toObjectId = (value, fieldName) => {
    if (!value || !mongoose.Types.ObjectId.isValid(String(value))) {
        throw new ValidationError(`${fieldName} is invalid`);
    }
    return new mongoose.Types.ObjectId(String(value));
};

const normalizeText = (value, fieldName, required = true) => {
    const text = String(value || '').trim();
    if (required && !text) {
        throw new ValidationError(`${fieldName} is required`);
    }
    return text;
};

const normalizeTargetType = (value) => {
    const nextValue = String(value || '').trim().toUpperCase();
    const normalized = TARGET_TYPE_MAP[nextValue];
    if (!normalized) {
        throw new ValidationError('targetType is invalid');
    }
    return normalized;
};

const buildUserLabel = (doc) => ({
    label: String(doc?.name || doc?.phone || 'User').trim(),
    subLabel: [doc?.phone, doc?.email].filter(Boolean).join(' â€¢ ')
});

const buildRestaurantLabel = (doc) => ({
    label: String(doc?.restaurantName || doc?.ownerName || 'Restaurant').trim(),
    subLabel: [doc?.ownerPhone, doc?.ownerEmail].filter(Boolean).join(' â€¢ ')
});

const buildDeliveryLabel = (doc) => ({
    label: String(doc?.name || doc?.phone || 'Delivery Partner').trim(),
    subLabel: [doc?.phone, doc?.email].filter(Boolean).join(' â€¢ ')
});

const modelConfigMap = {
    USER: {
        model: FoodUser,
        query: { isActive: true },
        select: '_id name phone email',
        buildLabel: buildUserLabel
    },
    RESTAURANT: {
        model: FoodRestaurant,
        query: { status: 'approved' },
        select: '_id restaurantName ownerName ownerPhone ownerEmail',
        buildLabel: buildRestaurantLabel
    },
    DELIVERY_PARTNER: {
        model: FoodDeliveryPartner,
        query: { status: 'approved' },
        select: '_id name phone email',
        buildLabel: buildDeliveryLabel
    }
};

const dedupeTargets = (targets = []) => {
    const map = new Map();
    for (const target of Array.isArray(targets) ? targets : []) {
        const ownerType = String(target?.ownerType || '').trim().toUpperCase();
        const ownerId = String(target?.ownerId || '').trim();
        if (!ownerType || !ownerId || !mongoose.Types.ObjectId.isValid(ownerId)) continue;
        map.set(`${ownerType}:${ownerId}`, {
            ownerType,
            ownerId,
            label: String(target?.label || '').trim(),
            subLabel: String(target?.subLabel || '').trim()
        });
    }
    return [...map.values()];
};

const loadTargetsByOwnerType = async (ownerType) => {
    const config = modelConfigMap[ownerType];
    if (!config) return [];

    const rows = await config.model.find(config.query).select(config.select).lean();
    return rows.map((row) => ({
        ownerType,
        ownerId: String(row._id),
        ...config.buildLabel(row)
    }));
};

const resolveCustomTargets = async ({ targets = [], targetIds = [] } = {}) => {
    const explicitTargets = dedupeTargets(targets);
    if (explicitTargets.length > 0) return explicitTargets;

    const ids = [...new Set((Array.isArray(targetIds) ? targetIds : []).map((value) => String(value || '').trim()).filter(Boolean))];
    if (!ids.length) {
        throw new ValidationError('Please select at least one recipient for custom broadcast');
    }

    const users = await FoodUser.find({ _id: { $in: ids }, isActive: true }).select('_id name phone email').lean();
    return users.map((row) => ({
        ownerType: 'USER',
        ownerId: String(row._id),
        ...buildUserLabel(row)
    }));
};

const resolveTargets = async ({ targetType, targetIds = [], targets = [] } = {}) => {
    if (targetType === 'ALL') {
        const [users, restaurants, deliveryPartners] = await Promise.all([
            loadTargetsByOwnerType('USER'),
            loadTargetsByOwnerType('RESTAURANT'),
            loadTargetsByOwnerType('DELIVERY_PARTNER')
        ]);
        return [...users, ...restaurants, ...deliveryPartners];
    }

    if (targetType === 'USER') return loadTargetsByOwnerType('USER');
    if (targetType === 'RESTAURANT') return loadTargetsByOwnerType('RESTAURANT');
    if (targetType === 'DELIVERY') return loadTargetsByOwnerType('DELIVERY_PARTNER');
    if (targetType === 'CUSTOM') return resolveCustomTargets({ targets, targetIds });

    throw new ValidationError('Unsupported targetType');
};

const emitRealtimeNotifications = (targets = [], broadcast) => {
    const io = getIO();
    if (!io) return;

    for (const target of targets) {
        const ownerId = String(target.ownerId || '');
        if (!ownerId) continue;

        const payload = {
            id: String(broadcast._id),
            type: 'admin_broadcast',
            broadcastId: String(broadcast._id),
            title: broadcast.title,
            message: broadcast.message,
            link: broadcast.link || '',
            targetType: broadcast.targetType,
            createdAt: broadcast.createdAt
        };

        if (target.ownerType === 'USER') {
            io.to(rooms.user(ownerId)).emit('admin_notification', payload);
        }
        if (target.ownerType === 'RESTAURANT') {
            io.to(rooms.restaurant(ownerId)).emit('admin_notification', payload);
        }
        if (target.ownerType === 'DELIVERY_PARTNER') {
            io.to(rooms.delivery(ownerId)).emit('admin_notification', payload);
        }
    }
};

const runBroadcastSideEffectsInBackground = ({ resolvedTargets = [], title, message, link, broadcastId } = {}) => {
    if (!broadcastId || !resolvedTargets.length) return;

    Promise.resolve()
        .then(async () => {
            console.log(`[FCM Broadcast Push] Dispatching live broadcast to ${resolvedTargets.length} targets.`);
            const pushResult = await notifyOwnersSafely(
                resolvedTargets.map((target) => ({
                    ownerType: target.ownerType,
                    ownerId: target.ownerId
                })),
                {
                    title,
                    body: message,
                    data: {
                        type: 'admin_broadcast',
                        broadcastId: String(broadcastId),
                        link
                    }
                }
            );
            console.log(`[FCM Broadcast Push] Push dispatch completed. Result:`, JSON.stringify(pushResult, null, 2));
        })
        .catch((error) => {
            console.error('Broadcast notification side effects failed:', error?.message || error);
        });
};

const paginationMeta = ({ page = 1, limit = 10 } = {}) => {
    const nextPage = Math.max(1, Number(page) || 1);
    const nextLimit = Math.max(1, Math.min(100, Number(limit) || 10));
    return {
        page: nextPage,
        limit: nextLimit,
        skip: (nextPage - 1) * nextLimit
    };
};

export const createBroadcastNotification = async ({ body = {}, adminId } = {}) => {
    console.log('[FCM Broadcast Create] Request received', { body, adminId });
    const title = normalizeText(body?.title, 'title');
    const message = normalizeText(body?.message, 'message');
    const link = normalizeText(body?.link, 'link', false);
    const targetType = normalizeTargetType(body?.targetType);
    const resolvedTargets = await resolveTargets({
        targetType,
        targetIds: body?.targetIds,
        targets: body?.targets
    });

    console.log('[FCM Broadcast Create] Resolved targets:', resolvedTargets.map((target) => `${target.ownerType}:${target.ownerId}`));
    if (!resolvedTargets.length) {
        throw new ValidationError(`No recipients found for ${targetType.toLowerCase()} broadcast`);
    }

    const broadcast = {
        _id: new mongoose.Types.ObjectId(),
        title,
        message,
        targetType,
        targets: resolvedTargets.map((target) => ({
            ownerType: target.ownerType,
            ownerId: toObjectId(target.ownerId, 'ownerId'),
            label: target.label || '',
            subLabel: target.subLabel || ''
        })),
        link,
        createdBy: toObjectId(adminId, 'createdBy'),
        targetCount: resolvedTargets.length,
        createdAt: new Date()
    };

    console.log(`[FCM Broadcast Create] Live-only broadcast prepared: ${broadcast._id}. Emitting real-time updates and running side effects.`);
    emitRealtimeNotifications(resolvedTargets, broadcast);
    runBroadcastSideEffectsInBackground({
        resolvedTargets,
        title,
        message,
        link,
        broadcastId: broadcast._id
    });

    return {
        broadcast,
        targetPreview: resolvedTargets.slice(0, 10)
    };
};

export const getBroadcastNotifications = async ({ page = 1, limit = 10 } = {}) => {
    const { ...meta } = paginationMeta({ page, limit });

    return {
        items: [],
        pagination: {
            page: meta.page,
            limit: meta.limit,
            total: 0,
            totalPages: 1
        },
        liveOnly: true
    };
};

export const deleteBroadcastNotification = async (broadcastId) => {
    return {
        broadcastId: broadcastId ? String(broadcastId) : '',
        deletedInboxCount: 0,
        liveOnly: true
    };
};
