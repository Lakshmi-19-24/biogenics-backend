cimport { Lead } from '../models/lead.model.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/apiResponse.js';
import { buildSearchFilter, getPagination } from '../utils/pagination.js';
import { notifyRoles, notifyUser } from '../services/notification.service.js';
import { MANAGEMENT_ROLES } from '../constants/roles.js';

export const listLeads = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const filter = buildSearchFilter(req.query.search, [
    'title',
    'customerName',
    'phone'
  ]);

  if (req.query.status) filter.status = req.query.status;
  if (req.query.assignedTo) filter.assignedTo = req.query.assignedTo;

  // Sales users can only see their own leads
  if (req.user.role === 'sales') {
    filter.$or = [
      { assignedTo: req.user._id },
      { createdBy: req.user._id }
    ];
  }

  const [items, total] = await Promise.all([
    Lead.find(filter)
      .populate('assignedTo', 'name email')
      .skip(skip)
      .limit(limit)
      .sort('-createdAt'),

    Lead.countDocuments(filter)
  ]);

  sendResponse(res, 200, 'Leads fetched', {
    items,
    page,
    limit,
    total
  });
});

export const createLead = asyncHandler(async (req, res) => {
  const lead = await Lead.create({
    ...req.body,
    convertedAt: req.body.status === 'converted' ? new Date() : req.body.convertedAt,
    createdBy: req.user._id
  });
  if (lead.assignedTo) {
    await notifyUser({
      recipient: lead.assignedTo.toString(),
      title: 'New lead assigned',
      message: `${lead.customerName} has been assigned to you.`,
      type: 'lead',
      data: { leadId: lead._id.toString() }
    });
  }
  await notifyRoles(MANAGEMENT_ROLES, {
    title: 'New lead created',
    message: `${lead.customerName} was added to the lead pipeline.`,
    type: 'lead',
    data: { action: 'lead_created', leadId: lead._id.toString() }
  });
  sendResponse(res, 201, 'Lead created', lead);
});

export const updateLead = asyncHandler(async (req, res) => {
  const oldLead = await Lead.findById(req.params.id);
  if (!oldLead) throw new ApiError(404, 'Lead not found');

  const wasConverted = oldLead.status === 'converted';
  const previousStatus = oldLead.status;
  Object.assign(oldLead, req.body);
  if (req.body.status === 'converted' && !wasConverted) {
    oldLead.convertedAt = new Date();
  }
  if (req.body.status && req.body.status !== 'converted') {
    oldLead.convertedAt = undefined;
  }
  await oldLead.save();

  if (req.body.assignedTo) {
    await notifyUser({
      recipient: req.body.assignedTo,
      title: 'Lead assigned',
      message: `${oldLead.customerName} is now assigned to you.`,
      type: 'lead',
      data: { leadId: oldLead._id.toString() }
    });
  }
  if (req.body.status && req.body.status !== previousStatus) {
    await notifyRoles(MANAGEMENT_ROLES, {
      title: 'Lead status updated',
      message: `${oldLead.customerName} is now ${oldLead.status.replace(/_/g, ' ')}.`,
      type: 'lead',
      data: { action: 'lead_status_updated', leadId: oldLead._id.toString(), status: oldLead.status }
    });
  }

  sendResponse(res, 200, 'Lead updated', oldLead);
});

export const getLead = asyncHandler(async (req, res) => {
  const lead = await Lead.findById(req.params.id).populate('assignedTo createdBy', 'name email role');
  if (!lead) throw new ApiError(404, 'Lead not found');
  sendResponse(res, 200, 'Lead fetched', lead);
});
