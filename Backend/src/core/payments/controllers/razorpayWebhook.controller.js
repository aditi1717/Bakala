import crypto from 'crypto';
import mongoose from 'mongoose';
import { FoodOrder } from '../../../modules/food/orders/models/order.model.js';
import * as foodTransactionService from '../../../modules/food/orders/services/foodTransaction.service.js';
import { config } from '../../../config/env.js';
import { logger } from '../../../utils/logger.js';

/**
 * ✅ NEW: Centralized Razorpay Webhook Handler (Core Layer)
 * Manages atomic updates for order payments and refunds across all modules.
 */
export const handleRazorpayWebhook = async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];
    const secret = config.razorpayWebhookSecret;

    // 1. Verify Signature using raw body buffer
    if (!signature || !secret || !req.rawBody) {
        logger.warn('Razorpay Webhook: Missing signature or rawBody buffer.');
        return res.status(400).send('Invalid signature');
    }

    const expected = crypto
        .createHmac('sha256', secret)
        .update(req.rawBody)
        .digest('hex');

    if (expected !== signature) {
        logger.warn('Razorpay Webhook: Signature verification failed.');
        return res.status(400).send('Invalid signature');
    }

    const { event, payload } = req.body;
    logger.info(`Razorpay Webhook Received: ${event}`);

    try {
        // --- 🟢 Handle Payment Captured (Success) ---
        if (event === 'payment.captured') {
            const paymentObj = payload.payment.entity;
            const rzOrderId = paymentObj.order_id;
            const rzPaymentId = paymentObj.id;
            const paymentCapturedStatus = String(paymentObj.status || 'captured').toLowerCase();

            const order = await FoodOrder.findOne({ "payment.razorpay.orderId": rzOrderId });

            if (order) {
                let needsSave = false;
                if (order.payment?.status !== 'paid') {
                    order.payment.status = 'paid';
                    needsSave = true;
                }
                if (order.payment?.razorpay?.paymentId !== rzPaymentId) {
                    order.payment.razorpay.paymentId = rzPaymentId;
                    needsSave = true;
                }
                if (needsSave) {
                    await order.save();
                }

                try {
                    await foodTransactionService.updateTransactionStatus(order._id, 'captured', {
                        status: 'captured',
                        paymentStatus: 'paid',
                        razorpayOrderId: rzOrderId,
                        razorpayPaymentId: rzPaymentId,
                        note: `Payment status synced via Webhook (payment.captured:${paymentCapturedStatus})`
                    });
                } catch (ledgerErr) {
                    logger.error(`Webhook Ledger Error (Order ${order.orderId}): ${ledgerErr.message}`);
                }
                logger.info(`Webhook [payment.captured]: Synced Order ${order.orderId} (Status=paid)`);
            } else {
                // ✅ ADDED: Log warn if order not found but payment was captured
                logger.warn(`Webhook [payment.captured]: Order not found or already paid for RZ-Order: ${rzOrderId}`);
            }
        }

        // --- 🔴 Handle Refund Processed ---
        if (event === 'refund.processed') {
            const refundObj = payload.refund.entity;
            const rzPaymentId = refundObj.payment_id;
            const rzRefundId = refundObj.id;
            const refundAmount = refundObj.amount / 100; // to major unit

            // Sync refund fields in the order
            const order = await FoodOrder.findOneAndUpdate(
                { 
                    "payment.razorpay.paymentId": rzPaymentId,
                    "payment.refund.status": { $ne: 'processed' }
                },
                { 
                    $set: { 
                        "payment.status": 'refunded',
                        "payment.refund": {
                            status: 'processed',
                            amount: refundAmount,
                            refundId: rzRefundId,
                            processedAt: new Date()
                        }
                    } 
                },
                { new: true }
            );

            if (order) {
                try {
                    await foodTransactionService.updateTransactionStatus(order._id, 'refunded', {
                        status: 'refunded',
                        paymentStatus: 'refunded',
                        razorpayPaymentId: rzPaymentId,
                        note: `Refund synced via Webhook (refund.processed:${rzRefundId})`
                    });
                } catch (ledgerErr) {
                    logger.error(`Webhook Refund Ledger Error (Order ${order.orderId}): ${ledgerErr.message}`);
                }
                logger.info(`Webhook [refund.processed]: Synced Order ${order.orderId} (Refunded)`);
                try {
                    const title = 'Refund Processed Successful';
                    const message = `Your refund of ₹${refundAmount} for Order #${order.orderId} has been processed successfully.`;
                    const link = `/food/orders/${order._id}`;

                    const { createInboxNotifications } = await import('../../notifications/notification.service.js');
                    await createInboxNotifications({
                        notifications: [{
                            ownerType: 'USER',
                            ownerId: order.userId,
                            title,
                            message,
                            link,
                            category: 'payment',
                            source: 'WEBHOOK_REFUND'
                        }]
                    });

                    const { notifyOwnerSafely } = await import('../../notifications/firebase.service.js');
                    await notifyOwnerSafely(
                        { ownerType: 'USER', ownerId: order.userId },
                        { title, body: message, data: { link, type: 'refund_processed' } }
                    );
                } catch (notifErr) {
                    logger.error(`Webhook Refund Notification Error (Order ${order.orderId}): ${notifErr.message}`);
                }
            } else {
                // ✅ ADDED: Log warn if order not found for refund
                logger.warn(`Webhook [refund.processed]: Order not found or already refunded for RZ-Payment: ${rzPaymentId}`);
            }
        }

        res.status(200).json({ status: 'ok' });
    } catch (err) {
        logger.error(`Razorpay Webhook Logic Error: ${err.message}`);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
