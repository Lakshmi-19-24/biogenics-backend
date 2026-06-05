import { Router } from 'express';
import { checkIn, checkOut, listAttendance } from '../controllers/attendance.controller.js';
import { authenticate } from '../middlewares/auth.js';

export const attendanceRouter = Router();

attendanceRouter.use(authenticate);
attendanceRouter.post('/check-in', checkIn);
attendanceRouter.post('/check-out', checkOut);
attendanceRouter.get('/', listAttendance);
