import { Router } from 'express';
import { createLocationPing, latestLocations, listLocationPings } from '../controllers/location.controller.js';
import { ADMIN_ROLES, ROLES } from '../constants/roles.js';
import { authenticate, authorize } from '../middlewares/auth.js';

export const locationRouter = Router();

locationRouter.use(authenticate);
// Create a location ping (for authenticated users)
locationRouter.post('/', createLocationPing);
// List location pings (admins/managers only)
locationRouter.get('/', authorize(...ADMIN_ROLES, ROLES.MANAGER), listLocationPings);
// Get latest locations (admins/managers only)
locationRouter.get('/latest', authorize(...ADMIN_ROLES, ROLES.MANAGER), latestLocations);
