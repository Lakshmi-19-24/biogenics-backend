import { Router } from 'express';
import { createUser, getUser, listUsers, updateUser, uploadAvatar, getProfile, updateProfile, changePassword, listProfileChangeRequests, decideProfileChangeRequest } from '../controllers/user.controller.js';
import { ADMIN_ROLES, MANAGEMENT_ROLES } from '../constants/roles.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { upload } from '../middlewares/upload.js';

export const userRouter = Router();

userRouter.use(authenticate);

// Profile endpoints MUST come before :id routes to avoid conflicts
userRouter.get('/profile/me', getProfile);
userRouter.patch('/profile/me', updateProfile);
userRouter.post('/profile/change-password', changePassword);
userRouter.post('/profile/avatar', upload.single('file'), uploadAvatar);
userRouter.get('/profile-change-requests', authorize(...MANAGEMENT_ROLES), listProfileChangeRequests);
userRouter.post('/profile-change-requests/:id/:decision', authorize(...MANAGEMENT_ROLES), decideProfileChangeRequest);

// Admin endpoints (for managing users)
userRouter.get('/', authorize(...MANAGEMENT_ROLES), listUsers);
userRouter.post('/', authorize(...ADMIN_ROLES), createUser);
userRouter.get('/:id', authorize(...ADMIN_ROLES), getUser);
userRouter.patch('/:id', authorize(...ADMIN_ROLES), updateUser);
userRouter.post('/:id/avatar', authorize(...ADMIN_ROLES), upload.single('file'), uploadAvatar);
