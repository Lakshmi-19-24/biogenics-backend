import { Document } from '../models/document.model.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/apiResponse.js';
import { getPagination } from '../utils/pagination.js';
import { uploadToImageKit } from '../utils/uploadToImagekit.js';
import { MANAGEMENT_ROLES } from '../constants/roles.js';

const documentAccessFilter = (user) => {
  if (MANAGEMENT_ROLES.includes(user.role)) return {};

  return {
    $or: [
      { visibility: 'team' },
      { visibility: 'admin', uploadedBy: user._id },
      { visibility: 'private', uploadedBy: user._id }
    ]
  };
};

const canManageDocument = (document, user) =>
  MANAGEMENT_ROLES.includes(user.role) || String(document.uploadedBy) === String(user._id);

export const uploadDocument = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Document file is required');

  const file = await uploadToImageKit(req.file, '/biogenics/documents');
  const document = await Document.create({
    ...req.body,
    visibility: ['admin', 'team'].includes(req.body.visibility) ? req.body.visibility : 'team',
    file,
    uploadedBy: req.user._id
  });

  sendResponse(res, 201, 'Document uploaded', document);
});

export const listDocuments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = documentAccessFilter(req.user);
  if (req.query.customer) filter.customer = req.query.customer;
  if (req.query.order) filter.order = req.query.order;
  if (req.query.category) filter.category = req.query.category;

  const [items, total] = await Promise.all([
    Document.find(filter).populate('uploadedBy', 'name email').skip(skip).limit(limit).sort('-createdAt'),
    Document.countDocuments(filter)
  ]);

  sendResponse(res, 200, 'Documents fetched', { items, page, limit, total });
});

export const updateDocument = asyncHandler(async (req, res) => {
  const allowed = ['title', 'category', 'customer', 'order', 'visibility'];
  const payload = {};

  for (const key of allowed) {
    if (req.body[key] !== undefined) payload[key] = req.body[key] || undefined;
  }
  if (payload.visibility && !['admin', 'team'].includes(payload.visibility)) payload.visibility = 'team';

  const existing = await Document.findOne({ _id: req.params.id, ...documentAccessFilter(req.user) });
  if (!existing) throw new ApiError(404, 'Document not found');
  if (!canManageDocument(existing, req.user)) throw new ApiError(403, 'You cannot update this document');

  const document = await Document.findByIdAndUpdate(req.params.id, payload, {
    new: true,
    runValidators: true
  });

  if (!document) throw new ApiError(404, 'Document not found');
  sendResponse(res, 200, 'Document updated', document);
});

export const deleteDocument = asyncHandler(async (req, res) => {
  const document = await Document.findOne({ _id: req.params.id, ...documentAccessFilter(req.user) });
  if (!document) throw new ApiError(404, 'Document not found');
  if (!canManageDocument(document, req.user)) throw new ApiError(403, 'You cannot delete this document');

  await Document.deleteOne({ _id: document._id });
  sendResponse(res, 200, 'Document deleted', { id: req.params.id });
});
