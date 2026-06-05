import { Router } from 'express';
import { changePassword, login, logout, me, refresh, refreshStatus, register } from '../controllers/auth.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { loginSchema, registerSchema } from '../validators/auth.validator.js';
import { ADMIN_ROLES } from '../constants/roles.js';

export const authRouter = Router();

// User creation is restricted to owner/admin accounts.
authRouter.post('/register', authenticate, authorize(...ADMIN_ROLES), validate({ body: registerSchema }), register);
authRouter.post('/login', validate({ body: loginSchema }), login);
authRouter.post('/refresh', refresh);
authRouter.post('/refresh-token', refresh);
authRouter.get('/refresh-status', refreshStatus);
authRouter.post('/logout', logout);
authRouter.put('/change-password', authenticate, changePassword);
authRouter.get('/me', authenticate, me);
