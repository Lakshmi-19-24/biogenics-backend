import mongoose from 'mongoose';
import { env } from './env.js';

/**
 * Opens a MongoDB connection for the API.
 *
 * @returns {Promise<typeof mongoose>}
 */
export const connectDB = async () => {
  mongoose.set('strictQuery', true);
  const connection = await mongoose.connect(env.MONGO_URI);
  console.log(`MongoDB connected: ${connection.connection.host}`);
  return connection;
};
