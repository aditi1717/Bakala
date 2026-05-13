import { sendResponse, sendError } from '../../utils/response.js';
import {
    createInboxNotifications,
    resolveNotificationOwnerFromRequest,
    getInboxNotifications,
    markNotificationAsRead,
    dismissNotification,
    dismissAllNotifications
} from './notification.service.js';

const buildSupportNotificationPayload = ({ ownerType, ownerId, ticket, link }) => {
    const ticketStatus = String(ticket?.status || '').toLowerCase();
    const issueType = String(
        ticket?.issueType ||
            ticket?.subject ||
            ticket?.category ||
            'support'
    ).trim();
    const responseText = String(ticket?.adminResponse || '').trim();
    const issueSuffix = issueType ? ` about ${issueType}` : '';
    const title =
        ticketStatus === 'resolved'
            ? 'Support Ticket Resolved'
            : responseText
                ? 'Support Ticket Reply'
                : 'Support Ticket Updated';
    const message =
        ticketStatus === 'resolved'
            ? `Your support ticket${issueSuffix} has been resolved.${responseText ? ` ${responseText}` : ''}`
            : responseText
                ? `We have responded to your support ticket${issueSuffix}. ${responseText}`
                : `Your support ticket${issueSuffix} has been updated.`;

    return {
        ownerType,
        ownerId,
        title,
        message,
        link,
        category: 'support_ticket',
        source: 'SUPPORT_TICKET',
        metadata: {
            source: 'support_ticket',
            ticketId: String(ticket?._id || ''),
            ticketShortId: String(ticket?._id || '').slice(-6).toUpperCase(),
            status: ticketStatus || null,
            issueType,
        },
    };
};

const ensureSupportTicketInboxNotifications = async ({ ownerType, ownerId } = {}) => {
    try {
        const ownerIdString = String(ownerId || '');
        if (!ownerIdString) return;

        if (ownerType === 'USER') {
            const { FoodSupportTicket } = await import('../../modules/food/user/models/supportTicket.model.js');
            const tickets = await FoodSupportTicket.find({
                userId: ownerId,
                adminResponse: { $exists: true, $ne: '' },
            })
                .sort({ updatedAt: -1 })
                .limit(25)
                .lean();

            if (!tickets.length) return;
            await createInboxNotifications({
                notifications: tickets.map((ticket) =>
                    buildSupportNotificationPayload({
                        ownerType: 'USER',
                        ownerId: ownerIdString,
                        ticket,
                        link: '/food/user/notifications',
                    })
                ),
            });
            return;
        }

        if (ownerType === 'RESTAURANT') {
            const { FoodRestaurantSupportTicket } = await import('../../modules/food/restaurant/models/supportTicket.model.js');
            const tickets = await FoodRestaurantSupportTicket.find({
                restaurantId: ownerId,
                adminResponse: { $exists: true, $ne: '' },
            })
                .sort({ updatedAt: -1 })
                .limit(25)
                .lean();

            if (!tickets.length) return;
            await createInboxNotifications({
                notifications: tickets.map((ticket) =>
                    buildSupportNotificationPayload({
                        ownerType: 'RESTAURANT',
                        ownerId: ownerIdString,
                        ticket,
                        link: '/food/restaurant/notifications',
                    })
                ),
            });
            return;
        }

        if (ownerType === 'DELIVERY_PARTNER') {
            const { DeliverySupportTicket } = await import('../../modules/food/delivery/models/supportTicket.model.js');
            const tickets = await DeliverySupportTicket.find({
                deliveryPartnerId: ownerId,
                adminResponse: { $exists: true, $ne: '' },
            })
                .sort({ updatedAt: -1 })
                .limit(25)
                .lean();

            if (!tickets.length) return;
            await createInboxNotifications({
                notifications: tickets.map((ticket) =>
                    buildSupportNotificationPayload({
                        ownerType: 'DELIVERY_PARTNER',
                        ownerId: ownerIdString,
                        ticket,
                        link: '/food/delivery/notifications',
                    })
                ),
            });
        }
    } catch (error) {
        console.error('Failed to ensure support ticket inbox notifications:', error);
    }
};

export const getInboxController = async (req, res) => {
    try {
        const owner = resolveNotificationOwnerFromRequest(req.user);
        await ensureSupportTicketInboxNotifications(owner);
        const data = await getInboxNotifications({
            ...owner,
            page: req.query?.page,
            limit: req.query?.limit
        });
        return sendResponse(res, 200, 'Notifications fetched successfully', data);
    } catch (error) {
        return sendError(res, error.statusCode || 500, error.message || 'Failed to fetch notifications');
    }
};

export const markNotificationReadController = async (req, res) => {
    try {
        const owner = resolveNotificationOwnerFromRequest(req.user);
        const data = await markNotificationAsRead({
            notificationId: req.params?.id,
            ...owner
        });
        return sendResponse(res, 200, 'Notification marked as read', data);
    } catch (error) {
        return sendError(res, error.statusCode || 500, error.message || 'Failed to update notification');
    }
};

export const dismissNotificationController = async (req, res) => {
    try {
        const owner = resolveNotificationOwnerFromRequest(req.user);
        const data = await dismissNotification({
            notificationId: req.params?.id,
            ...owner
        });
        return sendResponse(res, 200, 'Notification removed successfully', data);
    } catch (error) {
        return sendError(res, error.statusCode || 500, error.message || 'Failed to remove notification');
    }
};

export const dismissAllNotificationsController = async (req, res) => {
    try {
        const owner = resolveNotificationOwnerFromRequest(req.user);
        const data = await dismissAllNotifications(owner);
        return sendResponse(res, 200, 'All notifications removed successfully', data);
    } catch (error) {
        return sendError(res, error.statusCode || 500, error.message || 'Failed to clear notifications');
    }
};
