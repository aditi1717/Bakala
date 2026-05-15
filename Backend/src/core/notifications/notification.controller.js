import mongoose from 'mongoose';
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
        
        // Normalize owner type (e.g. DELIVERY -> DELIVERY_PARTNER)
        let effectiveOwnerType = ownerType;
        if (effectiveOwnerType === 'DELIVERY' || effectiveOwnerType === 'PARTNER') {
            effectiveOwnerType = 'DELIVERY_PARTNER';
        }
        
        console.log(`[Notification:Backfill] Checking support tickets for ${effectiveOwnerType}:${ownerIdString}`);

        if (effectiveOwnerType === 'USER') {
            const ownerObjectId = new mongoose.Types.ObjectId(String(ownerId));
            const { FoodSupportTicket } = await import('../../modules/food/user/models/supportTicket.model.js');
            // Backfill tickets that are resolved or have an admin response
            const tickets = await FoodSupportTicket.find({
                userId: ownerObjectId,
                $or: [
                    { adminResponse: { $exists: true, $ne: '' } },
                    { status: { $in: ['open', 'in-progress', 'resolved'] } }
                ]
            })
                .sort({ updatedAt: -1 })
                .limit(25)
                .lean();

            if (tickets.length > 0) {
                await createInboxNotifications({
                    notifications: tickets.map((ticket) =>
                        buildSupportNotificationPayload({
                            ownerType: 'USER',
                            ownerId: ownerIdString,
                            ticket,
                            link: '/food/notifications',
                        })
                    ),
                });
            }
        }

        if (effectiveOwnerType === 'RESTAURANT') {
            const ownerObjectId = new mongoose.Types.ObjectId(String(ownerId));
            const { FoodRestaurantSupportTicket } = await import('../../modules/food/restaurant/models/supportTicket.model.js');
            const tickets = await FoodRestaurantSupportTicket.find({
                restaurantId: ownerObjectId,
                $or: [
                    { adminResponse: { $exists: true, $ne: '' } },
                    { status: { $in: ['open', 'in-progress', 'resolved'] } }
                ]
            })
                .sort({ updatedAt: -1 })
                .limit(25)
                .lean();

            if (tickets.length > 0) {
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
            }
        }

        if (effectiveOwnerType === 'DELIVERY_PARTNER') {
            const { DeliverySupportTicket } = await import('../../modules/food/delivery/models/supportTicket.model.js');
            const { FoodDeliveryPartner } = await import('../../modules/food/delivery/models/deliveryPartner.model.js');
            
            const ownerObjectId = new mongoose.Types.ObjectId(String(ownerId));
            
            // Broad search: find partner phone to handles multiple accounts or ID mismatches
            const partnerDoc = await FoodDeliveryPartner.findById(ownerObjectId).select('phone').lean();
            const phone = partnerDoc?.phone;
            
            const query = {
                $or: [
                    { deliveryPartnerId: ownerObjectId },
                    { deliveryPartnerId: String(ownerId) }
                ]
            };
            
            if (phone) {
                const phoneDigits = String(phone).replace(/\D/g, '').slice(-10);
                if (phoneDigits.length === 10) {
                    // Match by phone suffix to find tickets created before/during onboarding
                    query.$or.push({ phone: { $regex: `${phoneDigits}$` } });
                }
            }

            const tickets = await DeliverySupportTicket.find(query)
                .sort({ updatedAt: -1 })
                .limit(50)
                .lean();
            
            console.log(`[Notification:Backfill] Found ${tickets.length} tickets for partner ${ownerId} (Phone: ${phone || 'N/A'})`);

            if (tickets.length > 0) {
                const notifications = tickets.map((ticket) => 
                    buildSupportNotificationPayload({
                        ownerType: 'DELIVERY_PARTNER',
                        ownerId: ownerIdString,
                        ticket,
                        link: '/food/delivery/notifications',
                    })
                );
                
                await createInboxNotifications({ notifications });
                console.log(`[Notification:Backfill] Successfully synced ${notifications.length} tickets to inbox for ${ownerId}`);
            }
        }
    } catch (error) {
        console.error('Failed to ensure support ticket inbox notifications:', error);
    }
};

export const getInboxController = async (req, res) => {
    try {
        const owner = resolveNotificationOwnerFromRequest(req.user);
        console.log(`[Notification:Inbox] GET /inbox for ${owner.ownerType}:${owner.ownerId}`);
        await ensureSupportTicketInboxNotifications(owner);
        const data = await getInboxNotifications({
            ...owner,
            page: req.query?.page,
            limit: req.query?.limit
        });
        console.log(`[Notification:Inbox] Returning ${data?.items?.length || 0} items`);
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
