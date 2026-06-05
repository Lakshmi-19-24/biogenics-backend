import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { ROLES } from '../constants/roles.js';
import { User } from '../models/user.model.js';

/**
 * Seeds the first owner/admin account from environment variables.
 */
const seedAdmin = async () => {
  await connectDB();

  const email = (process.env.SEED_ADMIN_EMAIL || 'admin@biogenics.com').toLowerCase().trim();
  const password = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';

  const existing = await User.findOne({ email }).select('+password');

  if (existing) {
    const currentPassword = existing.password || '';
    if (currentPassword && !currentPassword.startsWith('$2')) {
      existing.password = await bcrypt.hash(password, 10);
      await existing.save();
      console.log(`Updated plain-text admin password to hashed password for: ${email}`);
    } else {
      console.log(`Admin already exists: ${email}`);
    }
    return;
  }

  await User.create({
    name: process.env.SEED_ADMIN_NAME || 'System Admin',
    email,
    password,
    role: ROLES.OWNER,
    isActive: true
  });

  console.log(`Seeded owner account: ${email}`);
};

seedAdmin()
  .catch((error) => {
    console.error('Admin seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
