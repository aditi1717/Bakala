import { logger } from '../../utils/logger.js';

/**
 * BullMQ processor for order lifecycle jobs.
 *
 * Current implementation is intentionally logging-only to avoid changing API behavior.
 * @param {import('bullmq').Job} job
 */
export const processOrderJob = async (job) => {
    const data = job?.data || {};
    const action = data.action || 'unknown';
    const orderId = data.orderId || '';
    const orderMongoId = data.orderMongoId || '';

    logger.info(
        `[BullMQ:order] action=${action} jobId=${job.id} orderId=${orderId} orderMongoId=${orderMongoId}`
    );

    return { processed: true, action, jobId: job.id };
};
