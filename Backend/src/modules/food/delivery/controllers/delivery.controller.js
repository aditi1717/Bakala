import mongoose from 'mongoose';
import { registerDeliveryPartner, updateDeliveryPartnerProfile, updateDeliveryPartnerBankDetails, listSupportTicketsByPartner, createSupportTicket, getSupportTicketByIdAndPartner, updateDeliveryPartnerDetails, updateDeliveryPartnerProfilePhotoBase64, updateDeliveryAvailability, getDeliveryPartnerWallet, getDeliveryPartnerEarnings, getDeliveryPartnerTripHistory, getDeliveryPocketDetails, getActiveEarningAddonsForPartner } from '../services/delivery.service.js';
import { createDeliveryCashDepositOrder, getDeliveryPartnerWalletEnhanced, requestDeliveryWithdrawal, verifyDeliveryCashDepositPayment } from '../services/deliveryFinance.service.js';
import { getDeliveryCashLimitSettings, getDeliveryEmergencyHelp } from '../../admin/services/admin.service.js';
import { DeliveryBonusTransaction } from '../../admin/models/deliveryBonusTransaction.model.js';
import { validateDeliveryRegisterDto, validateDeliveryProfileUpdateDto, validateDeliveryBankDetailsDto } from '../validators/delivery.validator.js';
import { sendResponse } from '../../../../utils/response.js';
import { getDeliveryReferralStats } from '../services/deliveryReferral.service.js';

export const registerDeliveryPartnerController = async (req, res, next) => {
    try {
        const validated = validateDeliveryRegisterDto(req.body);
        const partner = await registerDeliveryPartner(validated, req.files);
        return sendResponse(res, 201, 'Delivery partner registered successfully', partner);
    } catch (error) {
        next(error);
    }
};

export const updateDeliveryPartnerProfileController = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const validated = validateDeliveryProfileUpdateDto(req.body);
        const result = await updateDeliveryPartnerProfile(userId, validated, req.files);
        return sendResponse(res, 200, 'Profile updated successfully', result);
    } catch (error) {
        next(error);
    }
};

export const updateDeliveryPartnerDetailsController = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const partner = await updateDeliveryPartnerDetails(userId, req.body || {});
        return sendResponse(res, 200, 'Profile updated successfully', { partner });
    } catch (error) {
        next(error);
    }
};

export const updateDeliveryPartnerProfilePhotoBase64Controller = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const partner = await updateDeliveryPartnerProfilePhotoBase64(userId, req.body || {});
        return sendResponse(res, 200, 'Profile photo updated successfully', { partner });
    } catch (error) {
        next(error);
    }
};

export const updateDeliveryPartnerBankDetailsController = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const validated = validateDeliveryBankDetailsDto(req.body);
        const partner = await updateDeliveryPartnerBankDetails(userId, validated, req.files);
        const data = {
            bankDetails: {
                accountHolderName: partner.bankAccountHolderName,
                accountNumber: partner.bankAccountNumber,
                ifscCode: partner.bankIfscCode,
                bankName: partner.bankName,
                upiId: partner.upiId,
                upiQrCode: partner.upiQrCode
            },
            panNumber: partner.panNumber
        };
        return sendResponse(res, 200, 'Bank details updated successfully', data);
    } catch (error) {
        next(error);
    }
};

export const listSupportTicketsController = async (req, res, next) => {
    try {
        const deliveryPartnerId = req.user?.userId;
        const tickets = await listSupportTicketsByPartner(deliveryPartnerId);
        return sendResponse(res, 200, 'Tickets fetched successfully', { tickets });
    } catch (error) {
        next(error);
    }
};

export const createSupportTicketController = async (req, res, next) => {
    try {
        const deliveryPartnerId = req.user?.userId;
        const ticket = await createSupportTicket(deliveryPartnerId, req.body);
        return sendResponse(res, 201, 'Ticket created successfully', ticket);
    } catch (error) {
        next(error);
    }
};

export const getSupportTicketByIdController = async (req, res, next) => {
    try {
        const deliveryPartnerId = req.user?.userId;
        const ticket = await getSupportTicketByIdAndPartner(req.params.id, deliveryPartnerId);
        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }
        return sendResponse(res, 200, 'Ticket fetched successfully', ticket);
    } catch (error) {
        next(error);
    }
};

export const updateAvailabilityController = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const data = await updateDeliveryAvailability(userId, req.body || {});
        return sendResponse(res, 200, 'Availability updated successfully', data);
    } catch (error) {
        next(error);
    }
};

export const getWalletController = async (req, res, next) => {
    try {
        const deliveryPartnerId = req.user?.userId;
        const requestedTypeRaw = String(req.query?.type || '').trim().toLowerCase();
        const rawLimit = Number.parseInt(String(req.query?.limit || ''), 10);
        const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50;

        const normalizeWalletTransaction = (tx) => ({
            ...tx,
            id: tx?.id || tx?._id,
            _id: tx?._id || tx?.id,
            amount: Number(tx?.amount) || 0,
            date: tx?.date || tx?.createdAt,
            createdAt: tx?.createdAt || tx?.date
        });

        if (requestedTypeRaw === 'bonus' || requestedTypeRaw === 'deposit' || requestedTypeRaw === 'deduction') {
            if (!deliveryPartnerId || !mongoose.Types.ObjectId.isValid(deliveryPartnerId)) {
                return sendResponse(res, 200, 'Wallet fetched successfully', { wallet: { transactions: [] } });
            }

            const wallet = await getDeliveryPartnerWalletEnhanced(deliveryPartnerId);
            if (requestedTypeRaw === 'bonus') {
                const bonusList = await DeliveryBonusTransaction.find({ deliveryPartnerId })
                    .sort({ createdAt: -1 })
                    .limit(limit)
                    .lean();

                wallet.transactions = (bonusList || []).map((b) => ({
                    id: b._id,
                    _id: b._id,
                    type: 'bonus',
                    amount: b.amount || 0,
                    status: 'Completed',
                    date: b.createdAt,
                    createdAt: b.createdAt,
                    description: b.reference || 'Bonus',
                    transactionId: b.transactionId
                }));
            } else {
                const allowedTypes = requestedTypeRaw === 'deposit'
                    ? new Set(['deposit'])
                    : new Set(['withdrawal', 'deposit']);

                wallet.transactions = (wallet.transactions || [])
                    .filter((tx) => allowedTypes.has(String(tx?.type || '').trim().toLowerCase()))
                    .map(normalizeWalletTransaction)
                    .slice(0, limit);
            }

            return sendResponse(res, 200, 'Wallet fetched successfully', { wallet });
        }

        const wallet = await getDeliveryPartnerWalletEnhanced(deliveryPartnerId);
        return sendResponse(res, 200, 'Wallet fetched successfully', { wallet });
    } catch (error) {
        next(error);
    }
};

export const createWithdrawalRequestController = async (req, res, next) => {
    try {
        const deliveryPartnerId = req.user?.userId;
        const result = await requestDeliveryWithdrawal(deliveryPartnerId, req.body || {});
        return sendResponse(res, 201, 'Withdrawal request submitted successfully', { withdrawal: result });
    } catch (error) {
        next(error);
    }
};

export const getEarningsController = async (req, res, next) => {
    try {
        const deliveryPartnerId = req.user?.userId;
        const data = await getDeliveryPartnerEarnings(deliveryPartnerId, req.query || {});
        return sendResponse(res, 200, 'Earnings fetched successfully', data);
    } catch (error) {
        next(error);
    }
};

export const getActiveEarningAddonsController = async (req, res, next) => {
    try {
        const deliveryPartnerId = req.user?.userId;
        const data = await getActiveEarningAddonsForPartner(deliveryPartnerId);
        return sendResponse(res, 200, 'Active earning addons fetched successfully', data);
    } catch (error) {
        next(error);
    }
};

export const createCashDepositOrderController = async (req, res, next) => {
    try {
        const deliveryPartnerId = req.user?.userId;
        const amount = req.body?.amount;
        const data = await createDeliveryCashDepositOrder(deliveryPartnerId, amount);
        return sendResponse(res, 201, 'Cash deposit order created successfully', data);
    } catch (error) {
        next(error);
    }
};

export const verifyCashDepositPaymentController = async (req, res, next) => {
    try {
        const deliveryPartnerId = req.user?.userId;
        const data = await verifyDeliveryCashDepositPayment(deliveryPartnerId, {
            razorpayOrderId: req.body?.razorpay_order_id,
            razorpayPaymentId: req.body?.razorpay_payment_id,
            razorpaySignature: req.body?.razorpay_signature,
            amount: req.body?.amount
        });
        return sendResponse(res, 200, 'Cash deposit verified successfully', data);
    } catch (error) {
        next(error);
    }
};

export const getTripHistoryController = async (req, res, next) => {
    try {
        const deliveryPartnerId = req.user?.userId;
        const data = await getDeliveryPartnerTripHistory(deliveryPartnerId, req.query || {});
        return sendResponse(res, 200, 'Trip history fetched successfully', data);
    } catch (error) {
        next(error);
    }
};

export const getPocketDetailsController = async (req, res, next) => {
    try {
        const deliveryPartnerId = req.user?.userId;
        const data = await getDeliveryPocketDetails(deliveryPartnerId, req.query || {});
        return sendResponse(res, 200, 'Pocket details fetched successfully', data);
    } catch (error) {
        next(error);
    }
};

export const getEmergencyHelpController = async (req, res, next) => {
    try {
        const data = await getDeliveryEmergencyHelp();
        return sendResponse(res, 200, 'Emergency help fetched successfully', data);
    } catch (error) {
        next(error);
    }
};

export const getCashLimitController = async (req, res, next) => {
    try {
        const data = await getDeliveryCashLimitSettings();
        return sendResponse(res, 200, 'Cash limit fetched successfully', data);
    } catch (error) {
        next(error);
    }
};

export const getDeliveryReferralStatsController = async (req, res, next) => {
    try {
        const deliveryPartnerId = req.user?.userId;
        const stats = await getDeliveryReferralStats(deliveryPartnerId);
        return sendResponse(res, 200, 'Referral stats fetched successfully', { stats });
    } catch (error) {
        next(error);
    }
};



// ===== STORE SHOP (Delivery Boy purchases from Admin store) =====

export async function getStoreProductsDelivery(req, res, next) {
    try {
        const { StoreProduct } = await import('../../admin/models/storeProduct.model.js');
        const { category, search, limit = 20, page = 1 } = req.query;
        const filter = { isPublished: true };
        if (category) filter.category = { $regex: category, $options: 'i' };
        if (search) filter.name = { $regex: search, $options: 'i' };
        const skip = (Number(page) - 1) * Number(limit);
        const [products, total] = await Promise.all([
            StoreProduct.find(filter).skip(skip).limit(Number(limit)).lean(),
            StoreProduct.countDocuments(filter)
        ]);
        res.status(200).json({ success: true, message: 'Store products fetched', data: { products, total, page: Number(page), limit: Number(limit) } });
    } catch (error) { next(error); }
}

export async function getStoreProductByIdDelivery(req, res, next) {
    try {
        const { StoreProduct } = await import('../../admin/models/storeProduct.model.js');
        const product = await StoreProduct.findOne({ _id: req.params.id, isPublished: true }).lean();
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        res.status(200).json({ success: true, message: 'Product fetched', data: { product } });
    } catch (error) { next(error); }
}

export async function createStoreOrderDelivery(req, res, next) {
    try {
        const { StoreProduct } = await import('../../admin/models/storeProduct.model.js');
        const { StoreOrder } = await import('../../admin/models/storeOrder.model.js');
        const { createRazorpayOrder, getRazorpayKeyId } = await import('../../orders/helpers/razorpay.helper.js');
        
        const deliveryPartnerId = req.user?.userId || req.user?._id;
        const { productId, variantId, quantity = 1 } = req.body || {};
        if (!deliveryPartnerId) {
            return res.status(401).json({ success: false, message: 'Delivery partner not authenticated' });
        }
        if (!productId || !variantId) {
            return res.status(400).json({ success: false, message: 'productId and variantId are required' });
        }
        const product = await StoreProduct.findOne({ _id: productId, isPublished: true });
        if (!product) return res.status(404).json({ success: false, message: 'Product not found or not available' });

        const variant = product.variants.id(variantId);
        if (!variant) return res.status(404).json({ success: false, message: 'Variant not found' });
        if (variant.stock < quantity) return res.status(400).json({ success: false, message: `Insufficient stock. Available: ${variant.stock}` });

        const totalAmount = variant.price * Number(quantity);

        const order = await StoreOrder.create({
            deliveryPartnerId,
            productId: productId,
            productName: product.name,
            productImage: product.image,
            variantId: variantId,
            variantName: variant.name,
            unitPrice: variant.price,
            quantity: Number(quantity),
            totalAmount,
            paymentMethod: 'razorpay',
            paymentStatus: 'pending',
            orderStatus: 'pending',
        });

        // Deduct stock atomically to reserve it
        await StoreProduct.updateOne(
            { _id: productId, 'variants._id': variantId },
            { $inc: { 'variants.$.stock': -Number(quantity) } }
        );

        // Generate Razorpay Order
        const razorpayOrder = await createRazorpayOrder(totalAmount * 100, 'INR', order._id.toString());
        order.razorpayOrderId = razorpayOrder.id;
        await order.save();

        res.status(201).json({ 
            success: true, 
            message: 'Order created', 
            data: { 
                order, 
                razorpayOrderId: razorpayOrder.id,
                razorpayKeyId: getRazorpayKeyId(),
                amount: totalAmount * 100
            } 
        });
    } catch (error) { next(error); }
}

export async function verifyStoreOrderDelivery(req, res, next) {
    try {
        const { StoreOrder } = await import('../../admin/models/storeOrder.model.js');
        const { verifyPaymentSignature } = await import('../../orders/helpers/razorpay.helper.js');
        const deliveryPartnerId = req.user?.userId || req.user?._id;
        
        const { orderId, razorpayPaymentId, razorpaySignature } = req.body;
        if (!orderId || !razorpayPaymentId || !razorpaySignature) {
            return res.status(400).json({ success: false, message: 'Missing parameters' });
        }

        const order = await StoreOrder.findOne({ _id: orderId, deliveryPartnerId });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        const isValid = verifyPaymentSignature(order.razorpayOrderId, razorpayPaymentId, razorpaySignature);
        if (!isValid) return res.status(400).json({ success: false, message: 'Invalid payment signature' });

        order.paymentStatus = 'paid';
        order.orderStatus = 'confirmed';
        order.razorpayPaymentId = razorpayPaymentId;
        order.razorpaySignature = razorpaySignature;
        await order.save();

        res.status(200).json({ success: true, message: 'Payment verified and order confirmed', data: { order } });
    } catch (error) { next(error); }
}

export async function getMyStoreOrders(req, res, next) {
    try {
        const { StoreOrder } = await import('../../admin/models/storeOrder.model.js');
        const { status, limit = 20, page = 1 } = req.query;
        const deliveryPartnerId = req.user?.userId || req.user?._id;
        const filter = { deliveryPartnerId };
        if (status) filter.orderStatus = status;
        const skip = (Number(page) - 1) * Number(limit);
        const [orders, total] = await Promise.all([
            StoreOrder.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
            StoreOrder.countDocuments(filter)
        ]);
        res.status(200).json({ success: true, message: 'Orders fetched', data: { orders, total } });
    } catch (error) { next(error); }
}

export async function getStoreOrderByIdDelivery(req, res, next) {
    try {
        const { StoreOrder } = await import('../../admin/models/storeOrder.model.js');
        const deliveryPartnerId = req.user?.userId || req.user?._id;
        const order = await StoreOrder.findOne({ _id: req.params.id, deliveryPartnerId }).lean();
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        res.status(200).json({ success: true, message: 'Order fetched', data: { order } });
    } catch (error) { next(error); }
}
