import { ADMIN_ROLES, ROLES } from '../constants/roles.js';
import bcrypt from 'bcryptjs';
import { MANAGEMENT_ROLES } from '../constants/roles.js';
import { ProfileChangeRequest } from '../models/profileChangeRequest.model.js';
import { User } from '../models/user.model.js';
import { Attendance } from '../models/attendance.model.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/apiResponse.js';
import { buildSearchFilter, getPagination } from '../utils/pagination.js';
import { uploadToImageKit } from '../utils/uploadToImagekit.js';
import { notifyRoles, notifyUser } from '../services/notification.service.js';

const PROFILE_FIELDS = ['name', 'phone', 'branch', 'territory'];
const businessDate = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);

const compactProfileUpdates = (payload) =>
  Object.fromEntries(
    PROFILE_FIELDS
      .filter((field) => payload[field] !== undefined)
      .map((field) => [field, payload[field]])
  );

const approvalRolesFor = (role) => {
  if (role === ROLES.SALES_EXECUTIVE) return MANAGEMENT_ROLES;
  if ([ROLES.ADMIN, ROLES.MANAGER].includes(role)) return [ROLES.OWNER];
  return [];
};

const visibleUserRolesFor = (role) => {
  if (role === ROLES.OWNER) return null;
  if (role === ROLES.ADMIN) return [ROLES.MANAGER, ROLES.SALES_EXECUTIVE];
  if (role === ROLES.MANAGER) return [ROLES.SALES_EXECUTIVE];
  return [];
};

const canViewUserRole = (viewerRole, targetRole) => {
  const visibleRoles = visibleUserRolesFor(viewerRole);
  return visibleRoles === null || visibleRoles.includes(targetRole);
};

const notifyApproversAboutProfileRequest = async (request, requester, changeTypes) => {
  const roles = approvalRolesFor(requester.role);
  if (roles.length === 0) return;

  await notifyRoles(roles, {
    title: 'Profile change approval needed',
    message: `${requester.name} requested ${changeTypes.join(' and ')} change approval.`,
    type: 'system',
    excludeUser: requester._id,
    data: {
      action: 'profile_change_request',
      requestId: request._id.toString(),
      requestedBy: requester._id.toString(),
      requestedByName: requester.name,
      requestedByRole: requester.role,
      changeTypes
    }
  });
};

export const createSalesProfileChangeRequest = async ({ user, profileUpdates = {}, newPassword }) => {
  const changeTypes = [];
  const updatePayload = compactProfileUpdates(profileUpdates);
  const currentUser = await User.findById(user._id).select('-password -refreshToken');

  if (!currentUser) throw new ApiError(404, 'User not found');

  const hasProfileUpdates = Object.keys(updatePayload).some(
    (field) => String(updatePayload[field] || '') !== String(currentUser[field] || '')
  );

  if (hasProfileUpdates) changeTypes.push('profile');
  if (newPassword) changeTypes.push('password');
  if (changeTypes.length === 0) throw new ApiError(400, 'No profile or password changes requested');

  const request = await ProfileChangeRequest.create({
    requestedBy: user._id,
    profileUpdates: hasProfileUpdates ? updatePayload : {},
    passwordHash: newPassword ? await bcrypt.hash(newPassword, 10) : undefined,
    changeTypes
  });

  await notifyApproversAboutProfileRequest(request, currentUser, changeTypes);
  return ProfileChangeRequest.findById(request._id).populate('requestedBy', 'name email role phone branch territory');
};

/**
 * Lists users with search and role filters.
 */
export const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {
    ...buildSearchFilter(req.query.search, ['name', 'email', 'phone', 'branch', 'territory'])
  };
  const visibleRoles = visibleUserRolesFor(req.user.role);
  if (visibleRoles === null) {
    if (req.query.role) filter.role = req.query.role;
  } else if (req.query.role) {
    filter.role = visibleRoles.includes(req.query.role) ? req.query.role : { $in: [] };
  } else {
    filter.role = { $in: visibleRoles };
  }
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';

  const [items, total] = await Promise.all([
    User.find(filter).select('-password -refreshToken').skip(skip).limit(limit).sort('-createdAt'),
    User.countDocuments(filter)
  ]);

  const attendanceRows = await Attendance.find({
    date: businessDate(),
    employee: { $in: items.map((item) => item._id) }
  }).select('employee status checkInAt checkOutAt');
  const attendanceByUser = new Map(attendanceRows.map((row) => [String(row.employee), row]));
  const users = items.map((user) => {
    const plain = user.toObject();
    const attendance = attendanceByUser.get(String(user._id));
    return {
      ...plain,
      attendanceStatus: attendance?.status || 'absent',
      isAttendanceActive: Boolean(attendance?.checkInAt && attendance.status !== 'absent')
    };
  });

  sendResponse(res, 200, 'Users fetched', { items: users, page, limit, total });
});

/**
 * Creates an employee account.
 */
export const createUser = asyncHandler(async (req, res) => {
  const user = await User.create(req.body);
  const safeUser = await User.findById(user._id).select('-password -refreshToken');
  sendResponse(res, 201, 'User created', safeUser);
});

export const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('-password -refreshToken');
  if (!user) throw new ApiError(404, 'User not found');
  if (!canViewUserRole(req.user.role, user.role)) throw new ApiError(404, 'User not found');
  sendResponse(res, 200, 'User fetched', user);
});

export const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('-password -refreshToken');
  if (!user) throw new ApiError(404, 'User not found');
  sendResponse(res, 200, 'Current user fetched', user);
});

export const updateMe = asyncHandler(async (req, res) => {
  const allowed = ['name', 'email', 'phone', 'branch', 'territory', 'avatar'];
  const updates = Object.fromEntries(
    Object.entries(req.body).filter(([key]) => allowed.includes(key))
  );

  const user = await User.findByIdAndUpdate(req.user._id, updates, {
    new: true,
    runValidators: true
  }).select('-password -refreshToken');

  if (!user) throw new ApiError(404, 'User not found');
  sendResponse(res, 200, 'Profile updated', user);
});

export const updateUser = asyncHandler(async (req, res) => {
  const targetUser = await User.findById(req.params.id).select('+password');

  if (!targetUser) throw new ApiError(404, 'User not found');

  // Authorization checks
  if (req.user.role !== ROLES.OWNER) {
    if (!ADMIN_ROLES.includes(req.user.role)) {
      throw new ApiError(403, 'Only owner or admin can update users');
    }

    // Admin can only update managers and sales executives
    if (![ROLES.MANAGER, ROLES.SALES_EXECUTIVE].includes(targetUser.role)) {
      throw new ApiError(403, 'Admins can only update managers and sales executives');
    }

    // Prevent admin from changing role
    if (req.body.role) {
      throw new ApiError(403, 'Admins cannot change user roles');
    }
  }

  // Prevent changing role to/from owner if it would leave no active owner
  if (req.body.role && targetUser.role === ROLES.OWNER && req.body.role !== ROLES.OWNER) {
    const ownerCount = await User.countDocuments({ role: ROLES.OWNER, isActive: true });
    if (ownerCount <= 1) throw new ApiError(400, 'At least one active owner is required');
  }

  Object.assign(targetUser, req.body);
  await targetUser.save();

  const safeUser = await User.findById(targetUser._id).select('-password -refreshToken');
  sendResponse(res, 200, 'User updated', safeUser);
});

export const uploadAvatar = asyncHandler(async (req, res) => {
  const targetUser = await User.findById(req.params.id).select('role');
  if (!targetUser) throw new ApiError(404, 'User not found');
  if (!canViewUserRole(req.user.role, targetUser.role)) throw new ApiError(404, 'User not found');

  const file = await uploadToImageKit(req.file, '/biogenics/users');
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { avatar: { url: file.url, fileId: file.fileId } },
    { new: true }
  ).select('-password -refreshToken');

  if (!user) throw new ApiError(404, 'User not found');
  sendResponse(res, 200, 'Avatar uploaded', user);
});

/**
 * Allows a user to update their own profile
 */
export const updateProfile = asyncHandler(async (req, res) => {
  const allowedFields = compactProfileUpdates(req.body);

  if (req.user.role === ROLES.SALES_EXECUTIVE) {
    const request = await createSalesProfileChangeRequest({
      user: req.user,
      profileUpdates: allowedFields
    });

    return sendResponse(res, 202, 'Profile change request sent for approval', request);
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    allowedFields,
    { new: true, runValidators: true }
  ).select('-password -refreshToken');

  if (!user) throw new ApiError(404, 'User not found');
  sendResponse(res, 200, 'Profile updated successfully', user);
});

/**
 * Allows a user to change their password
 */
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  
  if (!currentPassword || !newPassword) {
    throw new ApiError(400, 'Current password and new password are required');
  }
  if (newPassword.length < 8) {
    throw new ApiError(400, 'New password must be at least 8 characters');
  }

  const user = await User.findById(req.user._id).select('+password');
  if (!user) throw new ApiError(404, 'User not found');

  const isPasswordCorrect = await user.comparePassword(currentPassword);
  if (!isPasswordCorrect) {
    throw new ApiError(401, 'Current password is incorrect');
  }

  if (req.user.role !== ROLES.OWNER) {
    const request = await createSalesProfileChangeRequest({
      user: req.user,
      newPassword
    });

    return sendResponse(res, 202, 'Password change request sent for approval', request);
  }

  user.password = newPassword;
  await user.save();

  sendResponse(res, 200, 'Password changed successfully');
});

export const listProfileChangeRequests = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;

  const [items, total] = await Promise.all([
    ProfileChangeRequest.find(filter)
      .populate('requestedBy', 'name email role phone branch territory')
      .populate('decidedBy', 'name role')
      .skip(skip)
      .limit(limit)
      .sort('-createdAt'),
    ProfileChangeRequest.countDocuments(filter)
  ]);

  sendResponse(res, 200, 'Profile change requests fetched', { items, page, limit, total });
});

export const decideProfileChangeRequest = asyncHandler(async (req, res) => {
  const { decision } = req.params;
  if (!['approve', 'decline'].includes(decision)) {
    throw new ApiError(400, 'Decision must be approve or decline');
  }

  const request = await ProfileChangeRequest.findById(req.params.id).select('+passwordHash');
  if (!request) throw new ApiError(404, 'Profile change request not found');
  if (request.status !== 'pending') throw new ApiError(400, 'This request has already been decided');

  const requester = await User.findById(request.requestedBy).select('+password');
  if (!requester) throw new ApiError(404, 'Requesting user not found');
  const allowedApproverRoles = approvalRolesFor(requester.role);
  if (!allowedApproverRoles.includes(req.user.role)) {
    throw new ApiError(403, 'You are not allowed to approve this request');
  }

  request.status = decision === 'approve' ? 'approved' : 'declined';
  request.decidedBy = req.user._id;
  request.decidedAt = new Date();
  request.decisionNote = req.body?.note || '';

  if (decision === 'approve') {
    Object.entries(request.profileUpdates?.toObject?.() || request.profileUpdates || {}).forEach(
      ([field, value]) => {
        if (PROFILE_FIELDS.includes(field) && value !== undefined) requester[field] = value;
      }
    );
    if (request.passwordHash) requester.password = request.passwordHash;
    await requester.save();
  }

  await request.save();

  await notifyUser({
    recipient: requester._id,
    title: `Profile change ${request.status}`,
    message:
      decision === 'approve'
        ? `${req.user.name} approved your requested profile change.`
        : `${req.user.name} declined your requested profile change. Your current profile and password remain unchanged.`,
    type: 'system',
    data: {
      action: 'profile_change_decision',
      requestId: request._id.toString(),
      status: request.status
    }
  });

  const safeRequest = await ProfileChangeRequest.findById(request._id)
    .populate('requestedBy', 'name email role phone branch territory')
    .populate('decidedBy', 'name role');

  sendResponse(res, 200, `Profile change request ${request.status}`, safeRequest);
});

/**
 * Get current user profile
 */
export const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('-password -refreshToken');
  if (!user) throw new ApiError(404, 'User not found');
  sendResponse(res, 200, 'Profile fetched', user);
});
