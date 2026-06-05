import { io } from 'socket.io-client';

const socketUrl = process.env.SOCKET_URL || 'http://localhost:5000';
const token = process.env.ACCESS_TOKEN;

if (!token) {
  console.error('ACCESS_TOKEN is required. Login in Postman and copy the accessToken, then run this script.');
  process.exit(1);
}

/**
 * Opens a Socket.IO connection and validates the location event path.
 */
const run = async () => {
  const socket = io(socketUrl, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
    timeout: 5000
  });

  const timeout = setTimeout(() => {
    console.error('Socket smoke test timed out');
    socket.close();
    process.exit(1);
  }, 8000);

  socket.on('connect', () => {
    console.log(`Socket connected: ${socket.id}`);
    socket.emit('sales:location:update', {
      latitude: 19.076,
      longitude: 72.8777,
      speed: 0,
      battery: 92
    });
    console.log('Emitted sales:location:update');
    clearTimeout(timeout);
    socket.close();
    process.exit(0);
  });

  socket.on('connect_error', (error) => {
    clearTimeout(timeout);
    console.error(`Socket connection failed: ${error.message}`);
    process.exit(1);
  });
};

run();
