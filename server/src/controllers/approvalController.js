/**
 * Task 18 — Centralized Approvals and Overrides Controller
 * Architecture: Route -> Controller -> Service -> Repository -> Database Pool
 */
import approvalService from '../services/approvalService.js';
import { parseIdParam } from '../utils/parseId.js';

export async function listRequests(req, res, next) {
  try {
    const result = await approvalService.listRequests(req.query, req.user);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getRequestById(req, res, next) {
  try {
    const id = parseIdParam(req.params.id);
    const result = await approvalService.getRequestById(id, req.user);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function createRequest(req, res, next) {
  try {
    const result = await approvalService.createRequest(req.body, req.user);
    res.status(201).json({
      success: true,
      data: result,
      message: 'Approval request submitted successfully.',
    });
  } catch (err) {
    next(err);
  }
}

export async function approveRequest(req, res, next) {
  try {
    const id = parseIdParam(req.params.id);
    const result = await approvalService.approveRequest(id, req.body, req.user);
    res.json({
      success: true,
      data: result,
      message: 'Request successfully approved.',
    });
  } catch (err) {
    next(err);
  }
}

export async function rejectRequest(req, res, next) {
  try {
    const id = parseIdParam(req.params.id);
    const result = await approvalService.rejectRequest(id, req.body, req.user);
    res.json({
      success: true,
      data: result,
      message: 'Request rejected.',
    });
  } catch (err) {
    next(err);
  }
}

export async function cancelRequest(req, res, next) {
  try {
    const id = parseIdParam(req.params.id);
    const result = await approvalService.cancelRequest(id, req.body, req.user);
    res.json({
      success: true,
      data: result,
      message: 'Request cancelled.',
    });
  } catch (err) {
    next(err);
  }
}

export async function listPolicies(req, res, next) {
  try {
    const result = await approvalService.listPolicies(req.user);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function upsertPolicy(req, res, next) {
  try {
    const result = await approvalService.upsertPolicy(req.body, req.user);
    res.json({
      success: true,
      data: result,
      message: 'Approval policy saved.',
    });
  } catch (err) {
    next(err);
  }
}

export default {
  listRequests,
  getRequestById,
  createRequest,
  approveRequest,
  rejectRequest,
  cancelRequest,
  listPolicies,
  upsertPolicy,
};
