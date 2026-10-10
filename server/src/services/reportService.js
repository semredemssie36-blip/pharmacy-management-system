/**
 * Task 21 — Reports and Dashboards Service
 * Architecture: Route -> Controller -> Service -> Repository -> Database Pool
 *
 * Responsibilities:
 * - Data scope enforcement (Organization, Branch, Warehouse).
 * - Date boundary parsing and validation (preventing inverted dates or off-by-one errors).
 * - Read-only reporting access.
 */
import reportRepository from '../repositories/reportRepository.js';
import authorizationService from './authorizationService.js';
import AppError from '../errors/AppError.js';
import ValidationError from '../errors/ValidationError.js';

class ReportService {
  /**
   * Resolve user accessible scopes (Organizations, Branches, Warehouses)
   */
  async getUserAccessibleScopes(userId) {
    const scope = await authorizationService.getUserScope(userId);
    const orgIds = new Set(scope.organizationIds);

    if (scope.branchIds.size > 0) {
      const runner = reportRepository.getPool();
      const branchArr = [...scope.branchIds];
      const [bRows] = await runner.query(
        `SELECT DISTINCT organization_id FROM branches WHERE id IN (${branchArr.map(() => '?').join(',')})`,
        branchArr,
      );
      bRows.forEach((r) => orgIds.add(Number(r.organization_id)));
    }

    if (scope.warehouseIds.size > 0) {
      const runner = reportRepository.getPool();
      const whArr = [...scope.warehouseIds];
      const [wRows] = await runner.query(
        `SELECT DISTINCT organization_id FROM warehouses WHERE id IN (${whArr.map(() => '?').join(',')})`,
        whArr,
      );
      wRows.forEach((r) => orgIds.add(Number(r.organization_id)));
    }

    return {
      organizationIds: orgIds,
      explicitOrgIds: scope.organizationIds,
      branchIds: scope.branchIds,
      warehouseIds: scope.warehouseIds,
    };
  }

  /**
   * Validate scope filters against user permissions
   */
  async resolveScopedFilters(query, user) {
    const userScope = await this.getUserAccessibleScopes(user.id);

    // Organization resolution
    let orgId = query.organizationId
      ? Number(query.organizationId)
      : [...userScope.organizationIds][0] || user.organization_id;

    if (!orgId) {
      throw new AppError('Organization context required', { statusCode: 400 });
    }

    if (!userScope.organizationIds.has(Number(orgId))) {
      throw new AppError('Forbidden: Organization is out of user scope', {
        statusCode: 403,
        code: 'SCOPE_FORBIDDEN',
      });
    }

    // Branch resolution
    let branchIds = null;
    const isBranchScopedOnly =
      userScope.branchIds.size > 0 && !userScope.explicitOrgIds.has(Number(orgId));

    if (isBranchScopedOnly) {
      if (query.branchId) {
        const reqBranchId = Number(query.branchId);
        if (!userScope.branchIds.has(reqBranchId)) {
          throw new AppError('Forbidden: Branch is out of user scope', {
            statusCode: 403,
            code: 'SCOPE_FORBIDDEN',
          });
        }
        branchIds = [reqBranchId];
      } else {
        branchIds = [...userScope.branchIds];
      }
    } else if (query.branchId) {
      branchIds = [Number(query.branchId)];
    }

    // Warehouse resolution
    let warehouseId = query.warehouseId ? Number(query.warehouseId) : undefined;
    const isWhScopedOnly =
      userScope.warehouseIds.size > 0 &&
      !userScope.explicitOrgIds.has(Number(orgId)) &&
      userScope.branchIds.size === 0;

    if (isWhScopedOnly) {
      if (warehouseId && !userScope.warehouseIds.has(warehouseId)) {
        throw new AppError('Forbidden: Warehouse is out of user scope', {
          statusCode: 403,
          code: 'SCOPE_FORBIDDEN',
        });
      }
      if (!warehouseId) {
        warehouseId = [...userScope.warehouseIds][0];
      }
    }

    return {
      organizationId: orgId,
      branchIds,
      warehouseId,
    };
  }

  /**
   * Validate and normalize date parameters
   * Formats into 'YYYY-MM-DD 00:00:00' and 'YYYY-MM-DD 23:59:59' for consistent datetime queries
   */
  normalizeDateRange(startDateStr, endDateStr, defaultDays = 30) {
    let start = startDateStr;
    let end = endDateStr;

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

    if (start && !dateRegex.test(start)) {
      throw new ValidationError('Invalid startDate format. Expected YYYY-MM-DD');
    }
    if (end && !dateRegex.test(end)) {
      throw new ValidationError('Invalid endDate format. Expected YYYY-MM-DD');
    }

    if (!start && !end) {
      const now = new Date();
      const past = new Date();
      past.setDate(now.getDate() - defaultDays);
      start = past.toISOString().slice(0, 10);
      end = now.toISOString().slice(0, 10);
    } else if (start && !end) {
      end = new Date().toISOString().slice(0, 10);
    } else if (!start && end) {
      const eDate = new Date(end);
      const past = new Date(eDate);
      past.setDate(past.getDate() - defaultDays);
      start = past.toISOString().slice(0, 10);
    }

    if (start > end) {
      throw new ValidationError('startDate cannot be after endDate');
    }

    return {
      startDate: `${start} 00:00:00`,
      endDate: `${end} 23:59:59`,
      rawStart: start,
      rawEnd: end,
    };
  }

  /**
   * 1. Dashboard Overview
   */
  async getDashboardSummary(query, user) {
    const scopeFilters = await this.resolveScopedFilters(query, user);
    const dateRange = this.normalizeDateRange(query.startDate, query.endDate, 30);

    const summary = await reportRepository.getDashboardSummary({
      ...scopeFilters,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    });

    return {
      period: {
        startDate: dateRange.rawStart,
        endDate: dateRange.rawEnd,
      },
      scope: {
        organizationId: scopeFilters.organizationId,
        branchIds: scopeFilters.branchIds,
        warehouseId: scopeFilters.warehouseId,
      },
      ...summary,
    };
  }

  /**
   * 2. Sales Report
   */
  async getSalesReport(query, user) {
    const scopeFilters = await this.resolveScopedFilters(query, user);
    const dateRange = this.normalizeDateRange(query.startDate, query.endDate, 30);

    const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10) || 20));

    const result = await reportRepository.getSalesReport({
      ...scopeFilters,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      productId: query.productId ? Number(query.productId) : undefined,
      categoryId: query.categoryId ? Number(query.categoryId) : undefined,
      paymentStatus: query.paymentStatus ? String(query.paymentStatus).trim() : undefined,
      page,
      limit,
    });

    return {
      period: {
        startDate: dateRange.rawStart,
        endDate: dateRange.rawEnd,
      },
      scope: {
        organizationId: scopeFilters.organizationId,
        branchIds: scopeFilters.branchIds,
      },
      ...result,
    };
  }

  /**
   * 3. Inventory Report
   */
  async getInventoryReport(query, user) {
    const scopeFilters = await this.resolveScopedFilters(query, user);
    const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10) || 20));

    const result = await reportRepository.getInventoryReport({
      ...scopeFilters,
      categoryId: query.categoryId ? Number(query.categoryId) : undefined,
      status: query.status ? String(query.status).trim() : undefined,
      isLowStock: query.isLowStock,
      page,
      limit,
    });

    return {
      scope: {
        organizationId: scopeFilters.organizationId,
        branchIds: scopeFilters.branchIds,
        warehouseId: scopeFilters.warehouseId,
      },
      ...result,
    };
  }

  /**
   * 4. Financial & Receivables Report
   */
  async getFinancialReport(query, user) {
    const scopeFilters = await this.resolveScopedFilters(query, user);
    const dateRange = this.normalizeDateRange(query.startDate, query.endDate, 30);
    const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10) || 20));

    const result = await reportRepository.getFinancialReport({
      ...scopeFilters,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      paymentMethod: query.paymentMethod ? String(query.paymentMethod).trim() : undefined,
      page,
      limit,
    });

    return {
      period: {
        startDate: dateRange.rawStart,
        endDate: dateRange.rawEnd,
      },
      scope: {
        organizationId: scopeFilters.organizationId,
        branchIds: scopeFilters.branchIds,
      },
      ...result,
    };
  }

  /**
   * 5. Procurement & Receiving Report
   */
  async getProcurementReport(query, user) {
    const scopeFilters = await this.resolveScopedFilters(query, user);
    const dateRange = this.normalizeDateRange(query.startDate, query.endDate, 60);
    const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10) || 20));

    const result = await reportRepository.getProcurementReport({
      ...scopeFilters,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      supplierId: query.supplierId ? Number(query.supplierId) : undefined,
      status: query.status ? String(query.status).trim() : undefined,
      page,
      limit,
    });

    return {
      period: {
        startDate: dateRange.rawStart,
        endDate: dateRange.rawEnd,
      },
      scope: {
        organizationId: scopeFilters.organizationId,
        branchIds: scopeFilters.branchIds,
      },
      ...result,
    };
  }

  /**
   * 6. Clinical & Dispensing Report
   */
  async getDispensingReport(query, user) {
    const scopeFilters = await this.resolveScopedFilters(query, user);
    const dateRange = this.normalizeDateRange(query.startDate, query.endDate, 30);
    const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10) || 20));

    const result = await reportRepository.getDispensingReport({
      ...scopeFilters,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      page,
      limit,
    });

    return {
      period: {
        startDate: dateRange.rawStart,
        endDate: dateRange.rawEnd,
      },
      scope: {
        organizationId: scopeFilters.organizationId,
        branchIds: scopeFilters.branchIds,
      },
      ...result,
    };
  }

  /**
   * 7. Expiry, Quarantine & Recall Exceptions Report
   */
  async getExpiryQuarantineReport(query, user) {
    const scopeFilters = await this.resolveScopedFilters(query, user);
    const daysThreshold = Math.min(365, Math.max(1, parseInt(query.daysThreshold || '90', 10) || 90));
    const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10) || 20));

    const result = await reportRepository.getExpiryQuarantineReport({
      ...scopeFilters,
      daysThreshold,
      page,
      limit,
    });

    return {
      thresholdDays: daysThreshold,
      scope: {
        organizationId: scopeFilters.organizationId,
        branchIds: scopeFilters.branchIds,
        warehouseId: scopeFilters.warehouseId,
      },
      ...result,
    };
  }
}

export default new ReportService();
