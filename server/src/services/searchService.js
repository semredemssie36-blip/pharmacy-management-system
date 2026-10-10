import AppError from '../errors/AppError.js';
import authorizationService from './authorizationService.js';
import searchRepository from '../repositories/searchRepository.js';

class SearchService {
  /**
   * Performs permission- and scope-aware global search.
   * 
   * @param {object} params
   * @param {object} params.user Authenticated user
   * @param {string} params.query Search term
   * @param {string} [params.type] Optional specific category filter
   * @param {number} [params.limit] Max items per category
   * @returns {Promise<{ query: string, totalMatches: number, results: Record<string, Array> }>}
   */
  async search({ user, query, type, limit = 5 }) {
    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      throw new AppError('Search query must be at least 2 characters long.', {
        statusCode: 400,
        code: 'INVALID_SEARCH_QUERY',
      });
    }

    const trimmedQuery = query.trim().slice(0, 100);
    const scope = await authorizationService.getUserScope(user.id);
    const permissions = await authorizationService.getUserPermissions(user.id);
    const userPermSet = new Set(permissions);
    const roles = await authorizationService.getUserRoles(user.id);
    const isSystemAdmin = roles.some((r) => r.code === 'SYSTEM_ADMINISTRATOR');

    const orgIds = new Set(scope.organizationIds);
    if (scope.branchIds && scope.branchIds.size > 0) {
      const { getPool } = await import('../database/pool.js');
      const branchArr = [...scope.branchIds];
      const [bRows] = await getPool().query(
        `SELECT DISTINCT organization_id FROM branches WHERE id IN (${branchArr.map(() => '?').join(',')})`,
        branchArr,
      );
      bRows.forEach((r) => orgIds.add(Number(r.organization_id)));
    }
    const organizationId = [...orgIds][0] || null;
    if (!organizationId) {
      return { query: trimmedQuery, totalMatches: 0, results: {} };
    }

    const branchIds = isSystemAdmin
      ? []
      : Array.from(scope.branchIds || []);

    const maxPerCategory = Math.min(20, Math.max(1, Number(limit) || 5));
    const results = {};
    let totalMatches = 0;

    const requestedType = type ? type.toLowerCase().trim() : null;

    // Helper to conditionally search
    const maybeSearch = async (catKey, permCode, searchFn) => {
      if (requestedType && requestedType !== catKey) return;
      if (!userPermSet.has(permCode) && !isSystemAdmin) return;

      try {
        const items = await searchFn();
        if (items && items.length > 0) {
          results[catKey] = items;
          totalMatches += items.length;
        }
      } catch (err) {
        // Silently capture category failure so other categories still return
      }
    };

    await Promise.all([
      maybeSearch('products', 'product.view', () =>
        searchRepository.searchProducts({ organizationId, query: trimmedQuery, limit: maxPerCategory })
      ),
      maybeSearch('batches', 'inventory.view', () =>
        searchRepository.searchBatches({ organizationId, query: trimmedQuery, limit: maxPerCategory })
      ),
      maybeSearch('suppliers', 'supplier.view', () =>
        searchRepository.searchSuppliers({ organizationId, query: trimmedQuery, limit: maxPerCategory })
      ),
      maybeSearch('customers', 'customer.view', () =>
        searchRepository.searchCustomers({ organizationId, query: trimmedQuery, limit: maxPerCategory })
      ),
      maybeSearch('purchase_orders', 'purchase_order.view', () =>
        searchRepository.searchPurchaseOrders({ organizationId, branchIds, query: trimmedQuery, limit: maxPerCategory })
      ),
      maybeSearch('goods_receipts', 'goods_receipt.view', () =>
        searchRepository.searchGoodsReceipts({ organizationId, branchIds, query: trimmedQuery, limit: maxPerCategory })
      ),
      maybeSearch('sales', 'sale.view', () =>
        searchRepository.searchSales({ organizationId, branchIds, query: trimmedQuery, limit: maxPerCategory })
      ),
      maybeSearch('transfers', 'stock_transfer.view', () =>
        searchRepository.searchStockTransfers({ organizationId, branchIds, query: trimmedQuery, limit: maxPerCategory })
      ),
      maybeSearch('quarantines', 'quarantine.view', () =>
        searchRepository.searchQuarantines({ organizationId, branchIds, query: trimmedQuery, limit: maxPerCategory })
      ),
      maybeSearch('recalls', 'recall.view', () =>
        searchRepository.searchRecalls({ organizationId, query: trimmedQuery, limit: maxPerCategory })
      ),
      maybeSearch('prescriptions', 'prescription.view', () =>
        searchRepository.searchPrescriptions({ organizationId, branchIds, query: trimmedQuery, limit: maxPerCategory })
      ),
      maybeSearch('patients', 'patient.view', () =>
        searchRepository.searchPatients({ organizationId, query: trimmedQuery, limit: maxPerCategory })
      ),
    ]);

    return {
      query: trimmedQuery,
      totalMatches,
      results,
    };
  }
}

export default new SearchService();
