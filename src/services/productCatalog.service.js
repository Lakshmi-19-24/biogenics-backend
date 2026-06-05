import { productCatalogItems } from '../data/productCatalog.js';
import { Product } from '../models/product.model.js';

let catalogSeedPromise;

const toSkuPart = (value = '') =>
  String(value)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'PRODUCT';

const uniqueSku = (base, usedSkus) => {
  let candidate = base;
  let suffix = 2;
  while (usedSkus.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  usedSkus.add(candidate);
  return candidate;
};

const logDuplicateKey = (error, context) => {
  if (error?.code !== 11000) return;
  console.error(`[product-catalog] Duplicate key during ${context}`, {
    code: error.code,
    keyPattern: error.keyPattern,
    keyValue: error.keyValue,
    writeErrors: error.writeErrors?.map((writeError) => ({
      code: writeError.code,
      keyPattern: writeError.err?.keyPattern,
      keyValue: writeError.err?.keyValue,
      message: writeError.errmsg
    }))
  });
};

export const repairProductIndexesAndData = async () => {
  let indexes = [];

  try {
    indexes = await Product.collection.indexes();
  } catch (error) {
    if (error.codeName === 'NamespaceNotFound') {
      await Product.createCollection();
      indexes = [];
    } else {
      throw error;
    }
  }
  const allowedUniqueIndexes = new Set(['_id_', 'sku_1']);

  await Promise.all(
    indexes
      .filter((index) => index.unique && !allowedUniqueIndexes.has(index.name))
      .map(async (index) => {
        console.warn(`[product-catalog] Dropping obsolete unique index ${index.name}`, {
          key: index.key
        });
        await Product.collection.dropIndex(index.name);
      })
  );

  const usedSkus = new Set(
    (await Product.find({ sku: { $type: 'string', $ne: '' } }).distinct('sku')).map((sku) => sku.trim())
  );

  const missingSkuProducts = await Product.find({
    $or: [{ sku: { $exists: false } }, { sku: null }, { sku: '' }]
  }).select('_id name supplier category');

  for (const product of missingSkuProducts) {
    const base = `${toSkuPart(product.supplier || product.category || 'LOCAL')}-${toSkuPart(product.name || product._id)}`;
    const sku = uniqueSku(base, usedSkus);
    await Product.updateOne({ _id: product._id }, { $set: { sku } });
    console.warn(`[product-catalog] Repaired missing SKU for product ${product._id}: ${sku}`);
  }

  const duplicateSkuGroups = await Product.aggregate([
    { $match: { sku: { $type: 'string', $ne: '' } } },
    { $group: { _id: '$sku', ids: { $push: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }
  ]);

  for (const group of duplicateSkuGroups) {
    for (const productId of group.ids.slice(1)) {
      const sku = uniqueSku(`${group._id}-DUP`, usedSkus);
      await Product.updateOne({ _id: productId }, { $set: { sku } });
      console.warn(`[product-catalog] Repaired duplicate SKU for product ${productId}: ${sku}`);
    }
  }

  await Product.syncIndexes();
};

export const ensureCatalogProducts = async () => {
  if (!catalogSeedPromise) {
    const catalogSkus = productCatalogItems.map((product) => product.sku);
    catalogSeedPromise = (async () => {
      await Product.updateMany(
        {
          sku: { $nin: [...catalogSkus, 'CUSTOM-ORDER-LINE'] },
          isActive: true
        },
        {
          $set: {
            isActive: false,
            deletedAt: new Date(),
            deleteReason: 'Replaced by BGL stock catalog 2026-27'
          }
        }
      );

      return Product.bulkWrite(
        productCatalogItems.map((product) => ({
          updateOne: {
            filter: { sku: product.sku },
            update: {
              $set: { ...product, deleteReason: '' },
              $unset: { deletedAt: '', deletedBy: '', features: '', expiryRaw: '' }
            },
            upsert: true
          }
        })),
        { ordered: false }
      );
    })().catch((error) => {
      logDuplicateKey(error, 'catalog seed');
      catalogSeedPromise = undefined;
      throw error;
    });
  }

  return catalogSeedPromise;
};

export const initializeProductCatalog = async () => {
  try {
    await repairProductIndexesAndData();
    await ensureCatalogProducts();
  } catch (error) {
    logDuplicateKey(error, 'catalog initialization');
    throw error;
  }
};
