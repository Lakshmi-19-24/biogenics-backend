import { Visit } from '../models/visit.model.js';
import { LocationPing } from '../models/locationPing.model.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/apiResponse.js';
import { getPagination } from '../utils/pagination.js';
import { uploadToImageKit } from '../utils/uploadToImagekit.js';
import { emitToAdmins } from '../services/notification.service.js';

export const listVisits = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.employee) filter.employee = req.query.employee;
  if (req.query.customer) filter.customer = req.query.customer;
  if (req.query.status) filter.status = req.query.status;

  const [items, total] = await Promise.all([
    Visit.find(filter).populate('customer', 'name phone').populate('employee', 'name role').skip(skip).limit(limit).sort('-createdAt'),
    Visit.countDocuments(filter)
  ]);

  sendResponse(res, 200, 'Visits fetched', { items, page, limit, total });
});

export const createVisit = asyncHandler(async (req, res) => {
  const visit = await Visit.create({ ...req.body, employee: req.body.employee || req.user._id });
  sendResponse(res, 201, 'Visit created', visit);
});

export const checkInVisit = asyncHandler(async (req, res) => {
  const visit = await Visit.findByIdAndUpdate(
    req.params.id,
    {
      status: 'checked_in',
      checkInAt: new Date(),
      location: { type: 'Point', coordinates: [req.body.longitude, req.body.latitude] },
      geoFenceVerified: Boolean(req.body.geoFenceVerified)
    },
    { new: true }
  );
  if (!visit) throw new ApiError(404, 'Visit not found');
  emitToAdmins('visit:checked-in', visit);
  await LocationPing.create({
    employee: visit.employee,
    source: 'visit',
    location: { type: 'Point', coordinates: [req.body.longitude, req.body.latitude] },
    trackedAt: visit.checkInAt,
    metadata: { action: 'visit-check-in', visitId: visit._id.toString() }
  });
  sendResponse(res, 200, 'Visit checked in', visit);
});

export const completeVisit = asyncHandler(async (req, res) => {
  const visit = await Visit.findByIdAndUpdate(
    req.params.id,
    { ...req.body, status: 'completed', checkOutAt: new Date() },
    { new: true, runValidators: true }
  );
  if (!visit) throw new ApiError(404, 'Visit not found');
  emitToAdmins('visit:completed', visit);
  sendResponse(res, 200, 'Visit completed', visit);
});

export const uploadVisitAttachment = asyncHandler(async (req, res) => {
  const file = await uploadToImageKit(req.file, '/biogenics/visits');
  const visit = await Visit.findByIdAndUpdate(
    req.params.id,
    { $push: { attachments: file } },
    { new: true }
  );
  if (!visit) throw new ApiError(404, 'Visit not found');
  sendResponse(res, 200, 'Visit attachment uploaded', visit);
});
