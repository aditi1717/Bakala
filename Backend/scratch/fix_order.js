
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { FoodOrder } from '../src/modules/food/orders/models/order.model.js';

dotenv.config();

async function fixOrder() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const orderId = '69f85c5de757fea8f93f9944';
        const result = await FoodOrder.updateOne(
            { _id: orderId },
            { $set: { riderEarning: 45 } }
        );

        console.log('Update Result:', result);

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

fixOrder();
