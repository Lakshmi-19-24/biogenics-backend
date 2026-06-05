import http from 'node:http';
import { app } from './src/app.js';
import { connectDB } from './src/config/db.js';
import { env } from './src/config/env.js';
import { initSocket } from './src/config/socket.js';
import { initializeProductCatalog } from './src/services/productCatalog.service.js';
import { startProductExpiryScheduler, stopProductExpiryScheduler } from './src/services/productExpiryScheduler.service.js';
import { startReminderScheduler, stopReminderScheduler } from './src/services/reminderScheduler.service.js';

const server = http.createServer(app);

initSocket(server);

/**
 * Starts the HTTP server after MongoDB is connected.
 *
 * @returns {Promise<void>}
 */
const bootstrap = async () => {
  await connectDB();
  await initializeProductCatalog();
  startReminderScheduler();
  startProductExpiryScheduler();

  server.listen(env.PORT, () => {
    console.log(`API running in ${env.NODE_ENV} mode on port ${env.PORT}`);
  });
};

bootstrap().catch((error) => {
  console.error('Server bootstrap failed:', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  server.close(() => process.exit(1));
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Closing server.');
  stopReminderScheduler();
  stopProductExpiryScheduler();
  server.close(() => process.exit(0));
});
