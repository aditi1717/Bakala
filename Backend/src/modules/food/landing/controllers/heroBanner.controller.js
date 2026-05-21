import {
    listHeroBanners,
    createHeroBannersFromFiles,
    deleteHeroBanner,
    updateHeroBannerOrder,
    toggleHeroBannerStatus,
    updateHeroBannerCtaLink,
    updateHeroBannerLinkedRestaurants
} from '../services/heroBanner.service.js';
import { sendResponse } from '../../../../utils/response.js';
import { ValidationError } from '../../../../core/auth/errors.js';

export const listHeroBannersController = async (req, res, next) => {
    try {
        const data = await listHeroBanners();
        // Wrap in { banners } to match LandingPageManagement.jsx expectations
        const mappedData = (data || []).map(b => {
            const { linkedRestaurantIds, ...rest } = b;
            return {
                ...rest,
                linkedRestaurantIds: Array.isArray(linkedRestaurantIds) ? linkedRestaurantIds.map(r => r._id || r) : [],
                linkedRestaurants: Array.isArray(linkedRestaurantIds) ? linkedRestaurantIds.map(r => ({
                    ...r,
                    id: r._id,
                    name: r.restaurantName || r.name || ''
                })) : []
            };
        });
        return sendResponse(res, 200, 'Hero banners fetched successfully', { banners: mappedData });
    } catch (error) {
        next(error);
    }
};

export const uploadHeroBannersController = async (req, res, next) => {
    try {
        if (!req.files || !req.files.length) {
            throw new ValidationError('No files uploaded');
        }

        const meta = {
            title: req.body.title,
            ctaText: req.body.ctaText,
            ctaLink: req.body.ctaLink
        };

        const results = await createHeroBannersFromFiles(req.files, meta);
        return sendResponse(res, 201, 'Hero banners uploaded', { results });
    } catch (error) {
        next(error);
    }
};

export const deleteHeroBannerController = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!id) {
            throw new ValidationError('Banner id is required');
        }
        const result = await deleteHeroBanner(id);
        return sendResponse(res, 200, result.deleted ? 'Hero banner deleted' : 'Hero banner not found', result);
    } catch (error) {
        next(error);
    }
};

export const updateHeroBannerOrderController = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { sortOrder } = req.body;
        if (!id || typeof sortOrder !== 'number') {
            throw new ValidationError('id and numeric sortOrder are required');
        }
        const updated = await updateHeroBannerOrder(id, sortOrder);
        return sendResponse(res, 200, 'Hero banner order updated', updated);
    } catch (error) {
        next(error);
    }
};

export const toggleHeroBannerStatusController = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;
        if (!id || typeof isActive !== 'boolean') {
            throw new ValidationError('id and boolean isActive are required');
        }
        const updated = await toggleHeroBannerStatus(id, isActive);
        return sendResponse(res, 200, 'Hero banner status updated', updated);
    } catch (error) {
        next(error);
    }
};

export const updateHeroBannerCtaLinkController = async (req, res, next) => {
    try {
        const { id } = req.params;
        const ctaLink = typeof req.body?.ctaLink === 'string' ? req.body.ctaLink.trim() : '';
        if (!id) {
            throw new ValidationError('Banner id is required');
        }
        const updated = await updateHeroBannerCtaLink(id, ctaLink || null);
        return sendResponse(res, 200, 'Hero banner URL updated', updated);
    } catch (error) {
        next(error);
    }
};

export const updateHeroBannerLinkedRestaurantsController = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { restaurantIds } = req.body;
        if (!id) {
            throw new ValidationError('Banner id is required');
        }
        const updated = await updateHeroBannerLinkedRestaurants(id, restaurantIds || []);
        
        // Map response same as list for frontend
        const mapped = updated ? {
            ...updated,
            linkedRestaurantIds: Array.isArray(updated.linkedRestaurantIds) ? updated.linkedRestaurantIds.map(r => r._id || r) : [],
            linkedRestaurants: Array.isArray(updated.linkedRestaurantIds) ? updated.linkedRestaurantIds.map(r => ({
                ...r,
                id: r._id,
                name: r.restaurantName || r.name || ''
            })) : []
        } : null;
        
        return sendResponse(res, 200, 'Hero banner linked restaurants updated', mapped);
    } catch (error) {
        next(error);
    }
};


