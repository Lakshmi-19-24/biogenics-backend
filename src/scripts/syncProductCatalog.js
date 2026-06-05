import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { initializeProductCatalog } from '../services/productCatalog.service.js';
import { Product } from '../models/product.model.js';

const syncProductCatalog = async () => {
  await connectDB();
  await initializeProductCatalog();

  const [activeCount, inactiveCount] = await Promise.all([
    Product.countDocuments({ isActive: true, sku: { $ne: 'CUSTOM-ORDER-LINE' } }),
    Product.countDocuments({ isActive: false })
  ]);

  console.log(`BGL product catalog synced. Active catalog products: ${activeCount}. Retired products: ${inactiveCount}.`);
};

syncProductCatalog()
  .catch((error) => {
    console.error('Product catalog sync failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
