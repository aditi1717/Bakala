
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { FoodOrder } from '../src/modules/food/orders/models/order.model.js';

dotenv.config();

async function checkOrder() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const orderId = '69f85c5de757fea8f93f9944';
        const order = await FoodOrder.findById(orderId).lean();

        if (!order) {
            console.log('Order not found');
        } else {
            console.log('Order Details:');
            console.log('ID:', order._id);
            console.log('OrderID:', order.orderId);
            console.log('riderEarning:', order.riderEarning);
            console.log('restaurantId:', order.restaurantId);
            console.log('restaurantId:', order.restaurantId);
            const { FoodRestaurant } = await import('../src/modules/food/restaurant/models/restaurant.model.js');
            const restaurant = await FoodRestaurant.findById(order.restaurantId).lean();
            if (restaurant) {
                console.log('restaurant found:', restaurant.restaurantName);
                console.log('restaurant location field:', JSON.stringify(restaurant.location, null, 2));
            } else {
                console.log('restaurant NOT found in DB');
            }
            console.log('pricing:', JSON.stringify(order.pricing, null, 2));
            console.log('dispatch:', JSON.stringify(order.dispatch, null, 2));
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

checkOrder();
