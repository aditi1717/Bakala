import crypto from 'crypto';
import ms from 'ms';
import { FoodOtp } from './otp.model.js';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { ValidationError } from '../auth/errors.js';

const generateOtpCode = () => {
    const code = crypto.randomInt(1000, 10000);
    return String(code);
};

const normalizePhoneForOtp = (phone) => String(phone || '').replace(/\D/g, '');
const DEFAULT_OTP_TEST_PHONE_NUMBERS = new Set(['9326552667']);

const getPhoneCandidates = (phone) => {
    const raw = String(phone || '').trim();
    const digits = normalizePhoneForOtp(phone);
    const last10 = digits.slice(-10);

    return Array.from(new Set([
        raw,
        digits,
        last10,
        digits ? `+${digits}` : '',
        last10 ? `+91 ${last10}` : '',
        last10 ? `+91${last10}` : '',
        last10 ? `91${last10}` : '',
    ].filter(Boolean)));
};

/**
 * Sends SMS via MSG91 API
 * @param {string} phone - 10-digit mobile number (will be prefixed with 91)
 * @param {string} otp
 */
const sendSmsViaMsg91 = async (phone, otp) => {
    try {
        // Normalize phone: strip non-digits, ensure 91 country code prefix
        const digits = String(phone || '').replace(/\D/g, '');
        const mobile = digits.slice(-10);

        const messageTemplate = String(
            config.smsOtpMessageTemplate ||
            'Bakalaa: {{OTP}} is your login OTP. Use this OTP to login to your Bakalaa account. Thank you.'
        );
        const message = messageTemplate.replace(/\{\{OTP\}\}/g, String(otp));

        const url = 'https://api.msg91.com/api/v2/sendsms?response=json';
        const payload = {
            sender: config.smsSenderId,
            route: '4',
            country: '91',
            sms: [
                {
                    message,
                    to: [mobile],
                },
            ],
        };
        if (config.smsDltTemplateId) {
            payload.DLT_TE_ID = config.smsDltTemplateId;
        }
        if (config.smsDltPeId) {
            payload.PE_ID = config.smsDltPeId;
        }

        logger.info(`[SMS] Sending OTP to ${mobile} via MSG91...`);
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                authkey: config.smsApiKey,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify(payload),
        });
        const resultText = await response.text();
        logger.info(`[SMS] MSG91 raw response for ${mobile}: ${resultText}`);

        let parsed = null;
        try {
            parsed = JSON.parse(resultText);
        } catch {
            parsed = null;
        }

        if (!response.ok) {
            logger.error(`MSG91 API HTTP error for ${phone}: ${response.status} - ${resultText}`);
        } else if (parsed && String(parsed.type || '').toUpperCase() === 'ERROR') {
            logger.error(`MSG91 API rejected SMS for ${phone}: ${resultText}`);
        } else {
            logger.info(`SMS sent successfully to ${mobile} via MSG91`);
        }
    } catch (error) {
        logger.error(`Error sending MSG91 SMS to ${phone}: ${error.message}`);
        // Do NOT throw — OTP is already stored in DB; SMS failure should not block the flow
    }
};

export const createOrUpdateOtp = async (phone, options = {}) => {
    const forceRandom = options?.forceRandom === true;
    const phoneCandidates = getPhoneCandidates(phone);
    const normalizedPhone = normalizePhoneForOtp(phone) || String(phone || '').trim();
    const normalizedLast10 = normalizedPhone.slice(-10);
    const existing = await FoodOtp.findOne({ phone: { $in: phoneCandidates } });
    const now = new Date();

    // Rate Limiting Logic
    if (existing) {
        const windowMs = (config.otpRateWindow || 600) * 1000;
        const isInWindow = now - existing.lastRequestAt < windowMs;

        if (isInWindow) {
            if (existing.requestCount >= (config.otpRateLimit || 3)) {
                logger.warn(`Rate limit exceeded for phone ${phone}`);
                throw new ValidationError(`Too many OTP requests. Please try again after ${Math.ceil(windowMs / 60000)} minutes.`);
            }
            existing.requestCount += 1;
        } else {
            // Reset count if window has passed
            existing.requestCount = 1;
        }
    }

    const shouldUseDefaultOtpForTestPhone =
        !forceRandom && DEFAULT_OTP_TEST_PHONE_NUMBERS.has(normalizedLast10);
    const shouldUseDefaultOtp = (config.useDefaultOtp || shouldUseDefaultOtpForTestPhone) && !forceRandom;

    let otp;
    if (shouldUseDefaultOtp) {
        otp = '1234';
        logger.info(`Default OTP mode enabled – OTP is ${otp} for phone ${phone}`);
    } else {
        otp = generateOtpCode();
    }

    // Expiry calculation: prioritize seconds, then minutes, then fallback to MS string
    let ttlMs;
    if (config.otpExpirySeconds) {
        ttlMs = config.otpExpirySeconds * 1000;
    } else if (config.otpExpiryMinutes) {
        ttlMs = config.otpExpiryMinutes * 60 * 1000;
    } else {
        ttlMs = ms(config.otpExpiry || '5m');
    }
    const expiresAt = new Date(now.getTime() + ttlMs);

    if (existing) {
        existing.phone = normalizedPhone;
        existing.otp = otp;
        existing.expiresAt = expiresAt;
        existing.attempts = 0;
        existing.lastRequestAt = now;
        await existing.save();
    } else {
        await FoodOtp.create({ 
            phone: normalizedPhone,
            otp, 
            expiresAt,
            requestCount: 1,
            lastRequestAt: now
        });
    }

    // Only send SMS if not in default OTP mode and credentials exist.
    if (!shouldUseDefaultOtp && config.smsApiKey && config.smsSenderId) {
        await sendSmsViaMsg91(phone, otp);
    } else if (!shouldUseDefaultOtp) {
        logger.warn(`OTP generated for ${phone}, but SMS delivery is skipped because MSG91 credentials are missing.`);
    }

    return otp;
};

export const verifyOtp = async (phone, otp) => {
    const phoneCandidates = getPhoneCandidates(phone);
    const record = await FoodOtp.findOne({ phone: { $in: phoneCandidates } });
    if (!record) {
        return { valid: false, reason: 'OTP not found' };
    }

    if (record.expiresAt < new Date()) {
        return { valid: false, reason: 'OTP expired' };
    }

    if (record.attempts >= config.otpMaxAttempts) {
        return { valid: false, reason: 'Max attempts exceeded' };
    }

    record.attempts += 1;

    if (record.otp !== otp) {
        await record.save();
        return { valid: false, reason: 'Invalid OTP' };
    }

    await record.deleteOne();
    return { valid: true };
};

