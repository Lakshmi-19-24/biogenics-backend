import { Attendance } from '../models/attendance.model.js';
import { LocationPing } from '../models/locationPing.model.js';
import { User } from '../models/user.model.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/apiResponse.js';
import { getPagination } from '../utils/pagination.js';
import { emitToAdmins, notifyRoles, notifyUser } from '../services/notification.service.js';
import { MANAGEMENT_ROLES, ROLES } from '../constants/roles.js';

const isoDate = (date = new Date()) => date.toISOString().slice(0, 10);
const businessDate = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);

const LATE_AFTER_HOUR = 10;
const HALF_DAY_MINUTES = 4 * 60;

const visibleEmployeeRolesFor = (role) => {
  if (role === ROLES.OWNER) return null;
  if (role === ROLES.ADMIN) return [ROLES.MANAGER, ROLES.SALES_EXECUTIVE];
  if (role === ROLES.MANAGER) return [ROLES.SALES_EXECUTIVE];
  return [];
};

const attendanceViewerRolesFor = (employeeRole) => {
  if (employeeRole === ROLES.ADMIN) return [ROLES.OWNER];
  if (employeeRole === ROLES.MANAGER) return [ROLES.OWNER, ROLES.ADMIN];
  if (employeeRole === ROLES.SALES_EXECUTIVE) return MANAGEMENT_ROLES;
  return [];
};

const monthDaysUntilToday = (monthValue) => {
  const [year, month] = String(monthValue || businessDate().slice(0, 7)).split('-').map(Number);
  if (!year || !month) return [];
  const today = businessDate();
  const lastDay = new Date(year, month, 0).getDate();
  const days = [];
  for (let day = 1; day <= lastDay; day += 1) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (date > today) break;
    days.push(date);
  }
  return days;
};

const buildVisibleEmployeeFilter = async (user, requestedEmployee) => {
  if (user.role === ROLES.OWNER) return requestedEmployee ? { _id: requestedEmployee } : {};

  const visibleRoles = visibleEmployeeRolesFor(user.role);
  const filter = { role: { $in: visibleRoles } };
  if (requestedEmployee) filter._id = requestedEmployee;
  return filter;
};

const isLateCheckIn = (date) => {
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
  return hour > LATE_AFTER_HOUR || (hour === LATE_AFTER_HOUR && minute > 0);
};

const calculateStatus = (attendance) => {
  if (!attendance.checkInAt) return 'absent';
  if (attendance.checkOutAt && Number(attendance.totalMinutes || 0) < HALF_DAY_MINUTES) return 'half_day';
  if (isLateCheckIn(attendance.sessions?.[0]?.checkInAt || attendance.checkInAt)) return 'late';
  return 'present';
};

const locationFromBody = (body) => ({
  type: 'Point',
  coordinates: [Number(body.longitude) || 0, Number(body.latitude) || 0]
});

const seedLegacySession = (attendance) => {
  if (attendance.sessions?.length || !attendance.checkInAt) return;
  attendance.sessions = [
    {
      checkInAt: attendance.checkInAt,
      checkOutAt: attendance.checkOutAt,
      checkInLocation: attendance.checkInLocation,
      checkOutLocation: attendance.checkOutLocation,
      totalMinutes: attendance.totalMinutes || 0,
      breakMinutes: attendance.breakMinutes || 0
    }
  ];
};

export const checkIn = asyncHandler(async (req, res) => {
  const now = new Date();
  const checkInLocation = locationFromBody(req.body);
  let attendance = await Attendance.findOne({ employee: req.user._id, date: businessDate() });
  if (attendance?.checkInAt && !attendance.checkOutAt) {
    return sendResponse(res, 200, 'Already checked in', attendance);
  }

  if (!attendance) {
    attendance = await Attendance.create({
      employee: req.user._id,
      date: businessDate(),
      checkInAt: now,
      checkInLocation,
      totalMinutes: 0,
      status: req.body.status || (isLateCheckIn(now) ? 'late' : 'present'),
      sessions: [{ checkInAt: now, checkInLocation }]
    });
  } else {
    seedLegacySession(attendance);
    attendance.checkInAt = now;
    attendance.checkOutAt = undefined;
    attendance.checkInLocation = checkInLocation;
    attendance.checkOutLocation = undefined;
    attendance.status = req.body.status || (isLateCheckIn(attendance.sessions?.[0]?.checkInAt || now) ? 'late' : attendance.status || 'present');
    attendance.sessions.push({ checkInAt: now, checkInLocation });
    await attendance.save();
  }

  const checkInViewerRoles = attendanceViewerRolesFor(req.user.role);
  if (checkInViewerRoles.length) {
    if (checkInViewerRoles.includes(ROLES.ADMIN)) emitToAdmins('attendance:checked-in', attendance);
    await notifyRoles(checkInViewerRoles, {
      title: 'Attendance check-in',
      message: `${req.user.name} checked in for ${attendance.date}.`,
      type: 'attendance',
      excludeUser: req.user._id,
      data: { action: 'attendance_check_in', attendanceId: attendance._id.toString(), date: attendance.date }
    });
  }
  if (req.user.role === ROLES.SALES_EXECUTIVE) {
    await notifyUser({
      recipient: req.user._id,
      title: 'Attendance check-in',
      message: `You checked in for ${attendance.date}.`,
      type: 'attendance',
      data: { action: 'own_attendance_check_in', attendanceId: attendance._id.toString(), date: attendance.date }
    });
  }
  await LocationPing.create({
    employee: req.user._id,
    source: 'attendance',
    location: checkInLocation,
    trackedAt: attendance.checkInAt,
    metadata: { action: 'check-in', attendanceId: attendance._id.toString() }
  });
  sendResponse(res, 200, 'Attendance checked in', attendance);
});

export const checkOut = asyncHandler(async (req, res) => {
  const attendance = await Attendance.findOne({ employee: req.user._id, date: businessDate() });
  if (!attendance) throw new ApiError(404, 'Check-in record not found');
  if (!attendance.checkInAt) throw new ApiError(400, 'Cannot check out without check-in time');
  if (attendance.checkOutAt) throw new ApiError(400, 'Already checked out for today');

  const checkOutLocation = locationFromBody(req.body);
  attendance.checkOutAt = new Date();
  attendance.checkOutLocation = checkOutLocation;
  attendance.breakMinutes = req.body.breakMinutes || attendance.breakMinutes;
  const sessionMinutes = Math.max(
    Math.round((attendance.checkOutAt - attendance.checkInAt) / 60000) - attendance.breakMinutes,
    0
  );
  seedLegacySession(attendance);
  const openSession = [...attendance.sessions].reverse().find((session) => session.checkInAt && !session.checkOutAt);
  if (openSession) {
    openSession.checkOutAt = attendance.checkOutAt;
    openSession.checkOutLocation = checkOutLocation;
    openSession.breakMinutes = attendance.breakMinutes;
    openSession.totalMinutes = sessionMinutes;
  }
  attendance.totalMinutes = attendance.sessions.reduce((sum, session) => sum + (session.totalMinutes || 0), 0);
  attendance.status = calculateStatus(attendance);
  await attendance.save();

  const checkOutViewerRoles = attendanceViewerRolesFor(req.user.role);
  if (checkOutViewerRoles.length) {
    if (checkOutViewerRoles.includes(ROLES.ADMIN)) emitToAdmins('attendance:checked-out', attendance);
    await notifyRoles(checkOutViewerRoles, {
      title: 'Attendance check-out',
      message: `${req.user.name} checked out for ${attendance.date}.`,
      type: 'attendance',
      excludeUser: req.user._id,
      data: { action: 'attendance_check_out', attendanceId: attendance._id.toString(), date: attendance.date }
    });
  }
  if (req.user.role === ROLES.SALES_EXECUTIVE) {
    await notifyUser({
      recipient: req.user._id,
      title: 'Attendance check-out',
      message: `You checked out for ${attendance.date}.`,
      type: 'attendance',
      data: { action: 'own_attendance_check_out', attendanceId: attendance._id.toString(), date: attendance.date }
    });
  }
  await LocationPing.create({
    employee: req.user._id,
    source: 'attendance',
    location: checkOutLocation,
    trackedAt: attendance.checkOutAt,
    metadata: { action: 'check-out', attendanceId: attendance._id.toString() }
  });
  sendResponse(res, 200, 'Attendance checked out', attendance);
});

export const listAttendance = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  const isOwnAttendance = req.query.mine === 'true' || !MANAGEMENT_ROLES.includes(req.user.role);
  if (isOwnAttendance) filter.employee = req.user._id;
  else if (req.query.employee) filter.employee = req.query.employee;
  if (req.query.date) filter.date = req.query.date;
  if (req.query.month) filter.date = { $regex: `^${String(req.query.month).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` };
  if (!isOwnAttendance) {
    const visibleRoles = visibleEmployeeRolesFor(req.user.role);
    if (visibleRoles) {
      const visibleEmployeeIds = await User.find({ role: { $in: visibleRoles } }).distinct('_id');
      const canViewRequestedEmployee = visibleEmployeeIds.some((id) => String(id) === String(req.query.employee));
      filter.employee = req.query.employee
        ? canViewRequestedEmployee ? req.query.employee : { $in: [] }
        : { $in: visibleEmployeeIds };
    }
  }

  if (req.query.includeAbsences === 'true') {
    const dates = monthDaysUntilToday(req.query.month);
    const employees = isOwnAttendance
      ? await User.find({ _id: req.user._id }).select('name email role')
      : await User.find(await buildVisibleEmployeeFilter(req.user, req.query.employee)).select('name email role').sort('name');
    const employeeIds = employees.map((employee) => employee._id);
    const attendanceRows = await Attendance.find({
      employee: { $in: employeeIds },
      date: { $in: dates }
    }).populate('employee', 'name email role');
    const attendanceByEmployeeDate = new Map(
      attendanceRows.map((row) => [`${String(row.employee?._id || row.employee)}:${row.date}`, row])
    );
    const rows = employees.flatMap((employee) =>
      dates.map((date) => {
        const existing = attendanceByEmployeeDate.get(`${String(employee._id)}:${date}`);
        if (existing) return existing;
        return {
          _id: `absent-${employee._id}-${date}`,
          employee,
          date,
          status: 'absent',
          totalMinutes: 0,
          sessions: [],
          isGeneratedAbsent: true
        };
      })
    ).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.employee?.name || '').localeCompare(String(b.employee?.name || '')));
    return sendResponse(res, 200, 'Attendance fetched', { items: rows, page: 1, limit: rows.length, total: rows.length });
  }

  const [items, total] = await Promise.all([
    Attendance.find(filter).populate('employee', 'name email role').skip(skip).limit(limit).sort('-date'),
    Attendance.countDocuments(filter)
  ]);

  sendResponse(res, 200, 'Attendance fetched', { items, page, limit, total });
});
