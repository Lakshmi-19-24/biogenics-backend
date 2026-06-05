import { MANAGEMENT_ROLES } from '../constants/roles.js';
import { Product } from '../models/product.model.js';
import { notifyRoles } from './notification.service.js';

let productExpiryTimer;

export const processProductExpiryAlerts = async () => {
  const now = new Date();
  const warningDate = new Date(now);
  warningDate.setDate(warningDate.getDate() + 30);

  const products = await Product.find({
    isActive: true,
    expiryDate: { $lte: warningDate },
    expiryNotifiedAt: { $exists: false }
  });

  await Promise.all(
    products.map(async (product) => {
      const expiryDate = new Date(product.expiryDate);
      await notifyRoles(MANAGEMENT_ROLES, {
        title: expiryDate < now ? 'Product expired' : 'Product expiry approaching',
        message: `${product.name} expires on ${expiryDate.toLocaleDateString('en-IN')}.`,
        type: 'stock',
        data: {
          action: expiryDate < now ? 'product_expired' : 'product_expiry_near',
          productId: product._id.toString(),
          expiryDate
        }
      });

      product.expiryNotifiedAt = new Date();
      await product.save();
    })
  );
};

export const startProductExpiryScheduler = () => {
  if (productExpiryTimer) return;

  processProductExpiryAlerts().catch((error) => {
    console.error('Product expiry scheduler failed:', error);
  });

  productExpiryTimer = setInterval(() => {
    processProductExpiryAlerts().catch((error) => {
      console.error('Product expiry scheduler failed:', error);
    });
  }, 60 * 60 * 1000);
};

export const stopProductExpiryScheduler = () => {
  if (productExpiryTimer) clearInterval(productExpiryTimer);
  productExpiryTimer = undefined;
};
