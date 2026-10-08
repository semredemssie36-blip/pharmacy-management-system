import inventoryService from '../services/inventoryService.js';
import { parseIdParam } from '../utils/parseId.js';

async function listInventory(req, res, next) {
  try {
    res.json({
      success: true,
      data: await inventoryService.listInventoryForUser(req.user.id, {
        organizationId: req.query.organizationId,
        branchId: req.query.branchId,
        warehouseId: req.query.warehouseId,
        storageLocationId: req.query.storageLocationId,
        productId: req.query.productId,
        batchId: req.query.batchId,
        status: req.query.status,
        search: req.query.search,
        sort: req.query.sort,
        page: req.query.page,
        limit: req.query.limit,
      }),
    });
  } catch (err) { next(err); }
}

async function getInventory(req, res, next) {
  try {
    res.json({ success: true, data: { inventory: await inventoryService.getInventoryForUser(parseIdParam(req.params.id), req.user.id) } });
  } catch (err) { next(err); }
}

async function listBatches(req, res, next) {
  try {
    res.json({
      success: true,
      data: await inventoryService.listBatchesForUser(req.user.id, {
        organizationId: req.query.organizationId,
        productId: req.query.productId,
        status: req.query.status,
        search: req.query.search,
        page: req.query.page,
        limit: req.query.limit,
      }),
    });
  } catch (err) { next(err); }
}

async function getBatch(req, res, next) {
  try {
    res.json({ success: true, data: { batch: await inventoryService.getBatchForUser(parseIdParam(req.params.id), req.user.id) } });
  } catch (err) { next(err); }
}

async function listStockMovements(req, res, next) {
  try {
    res.json({
      success: true,
      data: await inventoryService.listStockMovementsForUser(req.user.id, {
        organizationId: req.query.organizationId,
        branchId: req.query.branchId,
        warehouseId: req.query.warehouseId,
        productId: req.query.productId,
        batchId: req.query.batchId,
        movementType: req.query.movementType,
        page: req.query.page,
        limit: req.query.limit,
      }),
    });
  } catch (err) { next(err); }
}

async function getStockMovement(req, res, next) {
  try {
    res.json({ success: true, data: { stockMovement: await inventoryService.getStockMovementForUser(parseIdParam(req.params.id), req.user.id) } });
  } catch (err) { next(err); }
}

async function createOpeningBalance(req, res, next) {
  try {
    const result = await inventoryService.createOpeningBalance(req.body ?? {}, req.user.id);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
}

export default {
  listInventory, getInventory, listBatches, getBatch, listStockMovements, getStockMovement, createOpeningBalance,
};
