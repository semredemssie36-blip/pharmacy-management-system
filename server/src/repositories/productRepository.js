import { getPool } from '../database/pool.js';

const PRODUCT_FIELDS = `
  p.id, p.organization_id, p.code, p.barcode, p.name, p.description,
  p.brand_id, p.generic_id, p.dosage_form_id, p.route_id, p.category_id,
  p.therapeutic_category_id, p.manufacturer_id, p.registration_number,
  p.prescription_classification, p.controlled_classification, p.antibiotic_classification,
  p.storage_requirement, p.min_stock_level, p.max_stock_level, p.reorder_level,
  p.selling_price, p.status, p.created_at, p.updated_at`;

const PRODUCT_JOINS = `
  LEFT JOIN brands b ON b.id = p.brand_id
  LEFT JOIN generics g ON g.id = p.generic_id
  LEFT JOIN dosage_forms df ON df.id = p.dosage_form_id
  LEFT JOIN routes rt ON rt.id = p.route_id
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN therapeutic_categories tc ON tc.id = p.therapeutic_category_id
  LEFT JOIN manufacturers m ON m.id = p.manufacturer_id`;

const sortableColumns = {
  name: 'p.name',
  code: 'p.code',
  created_at: 'p.created_at',
};

async function list({ search, status, brandId, genericId, categoryId, dosageFormId, routeId, prescriptionClassification, controlledClassification, antibioticClassification, page = 1, limit = 20, sort = 'name', organizationScopeIds }) {
  const where = [];
  const params = [];

  if (!organizationScopeIds || organizationScopeIds.length === 0) return { items: [], total: 0, page: Number(page) || 1, limit: Number(limit) || 20 };
  where.push(`p.organization_id IN (${organizationScopeIds.map(() => '?').join(',')})`);
  params.push(...organizationScopeIds);

  if (status) { where.push('p.status = ?'); params.push(status); }
  if (brandId) { where.push('p.brand_id = ?'); params.push(Number(brandId)); }
  if (genericId) { where.push('p.generic_id = ?'); params.push(Number(genericId)); }
  if (categoryId) { where.push('p.category_id = ?'); params.push(Number(categoryId)); }
  if (dosageFormId) { where.push('p.dosage_form_id = ?'); params.push(Number(dosageFormId)); }
  if (routeId) { where.push('p.route_id = ?'); params.push(Number(routeId)); }
  if (prescriptionClassification) { where.push('p.prescription_classification = ?'); params.push(prescriptionClassification); }
  if (controlledClassification) { where.push('p.controlled_classification = ?'); params.push(controlledClassification); }
  if (antibioticClassification) { where.push('p.antibiotic_classification = ?'); params.push(antibioticClassification); }

  if (search) {
    where.push(`(
      p.name LIKE ? OR p.code LIKE ? OR p.barcode LIKE ? OR
      g.name LIKE ? OR b.name LIKE ? OR
      EXISTS (
        SELECT 1 FROM product_active_ingredients pai
        JOIN active_ingredients ai ON ai.id = pai.active_ingredient_id
        WHERE pai.product_id = p.id AND ai.name LIKE ?
      )
    )`);
    const s = `%${search}%`;
    params.push(s, s, s, s, s, s);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderColumn = sortableColumns[sort] || 'p.name';
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (pageNum - 1) * limitNum;

  const [countRows] = await getPool().query(
    `SELECT COUNT(*) AS total FROM products p ${PRODUCT_JOINS} ${whereSql}`,
    params,
  );
  const [items] = await getPool().query(
    `SELECT p.id, p.organization_id, p.code, p.barcode, p.name, p.status,
            p.selling_price,
            b.name AS brand_name, g.name AS generic_name, df.name AS dosage_form_name,
            c.name AS category_name, p.prescription_classification, p.controlled_classification,
            p.antibiotic_classification, p.storage_requirement, p.min_stock_level, p.max_stock_level,
            p.reorder_level, p.created_at, p.updated_at
     FROM products p ${PRODUCT_JOINS} ${whereSql}
     ORDER BY ${orderColumn} LIMIT ? OFFSET ?`,
    [...params, limitNum, offset],
  );
  return { items, total: countRows[0].total, page: pageNum, limit: limitNum };
}

async function findById(id) {
  const [rows] = await getPool().query(`SELECT ${PRODUCT_FIELDS} FROM products p WHERE p.id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

async function findByCode(organizationId, code) {
  const [rows] = await getPool().query(`SELECT ${PRODUCT_FIELDS} FROM products p WHERE p.organization_id = ? AND p.code = ? LIMIT 1`, [organizationId, code]);
  return rows[0] || null;
}

async function findByBarcode(organizationId, barcode) {
  const [rows] = await getPool().query(`SELECT ${PRODUCT_FIELDS} FROM products p WHERE p.organization_id = ? AND p.barcode = ? LIMIT 1`, [organizationId, barcode]);
  return rows[0] || null;
}

async function create(input) {
  const columns = [
    'organization_id', 'code', 'barcode', 'name', 'description', 'brand_id', 'generic_id',
    'dosage_form_id', 'route_id', 'category_id', 'therapeutic_category_id', 'manufacturer_id',
    'registration_number', 'prescription_classification', 'controlled_classification',
    'antibiotic_classification', 'storage_requirement', 'min_stock_level', 'max_stock_level',
    'reorder_level', 'selling_price', 'status',
  ];
  const values = columns.map((c) => input[c] ?? (c === 'selling_price' ? 0.00 : null));
  const [result] = await getPool().query(
    `INSERT INTO products (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    values,
  );
  return findById(result.insertId);
}

async function update(id, input) {
  const mapping = {
    code: 'code', barcode: 'barcode', name: 'name', description: 'description',
    brandId: 'brand_id', genericId: 'generic_id', dosageFormId: 'dosage_form_id',
    routeId: 'route_id', categoryId: 'category_id', therapeuticCategoryId: 'therapeutic_category_id',
    manufacturerId: 'manufacturer_id', registrationNumber: 'registration_number',
    prescriptionClassification: 'prescription_classification',
    controlledClassification: 'controlled_classification',
    antibioticClassification: 'antibiotic_classification',
    storageRequirement: 'storage_requirement',
    minStockLevel: 'min_stock_level', maxStockLevel: 'max_stock_level', reorderLevel: 'reorder_level',
    sellingPrice: 'selling_price',
    status: 'status',
  };
  const sets = [];
  const params = [];
  for (const [inputKey, column] of Object.entries(mapping)) {
    if (input[inputKey] !== undefined) {
      sets.push(`${column} = ?`);
      params.push(input[inputKey] === '' ? null : input[inputKey]);
    }
  }
  if (sets.length === 0) return findById(id);
  params.push(id);
  await getPool().query(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`, params);
  return findById(id);
}

async function getActiveIngredients(productId) {
  const [rows] = await getPool().query(
    `SELECT pai.active_ingredient_id, ai.name, ai.code, pai.strength
     FROM product_active_ingredients pai
     JOIN active_ingredients ai ON ai.id = pai.active_ingredient_id
     WHERE pai.product_id = ? ORDER BY ai.name`,
    [productId],
  );
  return rows;
}

async function setActiveIngredients(productId, items) {
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM product_active_ingredients WHERE product_id = ?', [productId]);
    for (const item of items) {
      await connection.query(
        'INSERT INTO product_active_ingredients (product_id, active_ingredient_id, strength) VALUES (?, ?, ?)',
        [productId, item.activeIngredientId, item.strength || null],
      );
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
  return getActiveIngredients(productId);
}

async function getUnits(productId) {
  const [rows] = await getPool().query(
    `SELECT pu.unit_id, u.name, u.code, pu.is_base_unit, pu.is_purchase_unit, pu.is_inventory_unit, pu.is_selling_unit
     FROM product_units pu JOIN units u ON u.id = pu.unit_id
     WHERE pu.product_id = ? ORDER BY u.name`,
    [productId],
  );
  return rows;
}

async function setUnits(productId, items) {
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM product_units WHERE product_id = ?', [productId]);
    for (const item of items) {
      await connection.query(
        'INSERT INTO product_units (product_id, unit_id, is_base_unit, is_purchase_unit, is_inventory_unit, is_selling_unit) VALUES (?, ?, ?, ?, ?, ?)',
        [productId, item.unitId, item.isBaseUnit ? 1 : 0, item.isPurchaseUnit ? 1 : 0, item.isInventoryUnit ? 1 : 0, item.isSellingUnit ? 1 : 0],
      );
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
  return getUnits(productId);
}

async function getConversions(productId) {
  const [rows] = await getPool().query(
    `SELECT puc.id, puc.from_unit_id, fu.name AS from_unit_name, puc.to_unit_id, tu.name AS to_unit_name, puc.factor
     FROM product_unit_conversions puc
     JOIN units fu ON fu.id = puc.from_unit_id
     JOIN units tu ON tu.id = puc.to_unit_id
     WHERE puc.product_id = ? ORDER BY fu.name`,
    [productId],
  );
  return rows;
}

async function setConversions(productId, items) {
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM product_unit_conversions WHERE product_id = ?', [productId]);
    for (const item of items) {
      await connection.query(
        'INSERT INTO product_unit_conversions (product_id, from_unit_id, to_unit_id, factor) VALUES (?, ?, ?, ?)',
        [productId, item.fromUnitId, item.toUnitId, item.factor],
      );
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
  return getConversions(productId);
}

async function getRelationships(productId) {
  const [rows] = await getPool().query(
    `SELECT pr.id, pr.related_product_id, p2.name AS related_product_name, p2.code AS related_product_code, pr.relationship_type
     FROM product_relationships pr
     JOIN products p2 ON p2.id = pr.related_product_id
     WHERE pr.product_id = ? ORDER BY pr.relationship_type`,
    [productId],
  );
  return rows;
}

async function setRelationships(productId, items) {
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM product_relationships WHERE product_id = ?', [productId]);
    for (const item of items) {
      await connection.query(
        'INSERT INTO product_relationships (product_id, related_product_id, relationship_type) VALUES (?, ?, ?)',
        [productId, item.relatedProductId, item.relationshipType],
      );
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
  return getRelationships(productId);
}

export default {
  list, findById, findByCode, findByBarcode, create, update,
  getActiveIngredients, setActiveIngredients, getUnits, setUnits, getConversions, setConversions, getRelationships, setRelationships,
};
