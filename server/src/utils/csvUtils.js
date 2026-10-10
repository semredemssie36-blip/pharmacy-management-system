/**
 * High-performance, RFC 4180 compliant CSV parser and serializer
 * with built-in protection against CSV/Formula Injection attacks.
 */

/**
 * Parses an RFC 4180 compliant CSV string into headers and row objects.
 * Handles CRLF and LF line endings, quoted fields containing commas,
 * escaped quotes (""), and embedded newlines.
 * 
 * @param {string} csvText
 * @returns {{ headers: string[], rows: Record<string, string>[] }}
 */
export function parseCsv(csvText) {
  if (!csvText || typeof csvText !== 'string') {
    return { headers: [], rows: [] };
  }

  // Strip UTF-8 Byte Order Mark (BOM) if present
  let cleanText = csvText.charCodeAt(0) === 0xFEFF ? csvText.slice(1) : csvText;

  const lines = [];
  let currentRow = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (insideQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote: "" -> "
          currentField += '"';
          i++;
        } else {
          // Closing quote
          insideQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (char === '\r') {
        if (nextChar === '\n') {
          i++;
        }
        currentRow.push(currentField);
        lines.push(currentRow);
        currentRow = [];
        currentField = '';
      } else if (char === '\n') {
        currentRow.push(currentField);
        lines.push(currentRow);
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  // Push last field and line if text didn't end with newline
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    lines.push(currentRow);
  }

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  // Normalize and trim headers
  const headers = lines[0].map((h) => (h ? h.trim() : ''));
  const rows = [];

  for (let r = 1; r < lines.length; r++) {
    const line = lines[r];
    // Skip empty lines (e.g. trailing newline)
    if (line.length === 1 && line[0].trim() === '') continue;

    const rowObj = {};
    for (let c = 0; c < headers.length; c++) {
      const headerKey = headers[c];
      if (headerKey) {
        rowObj[headerKey] = line[c] !== undefined ? line[c].trim() : '';
      }
    }
    rows.push(rowObj);
  }

  return { headers, rows };
}

/**
 * Formula Injection dangerous prefixes (Excel, LibreOffice, Google Sheets).
 */
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Sanitizes a single cell value for CSV output, neutralizing formula injection.
 * 
 * @param {any} value
 * @returns {string}
 */
export function sanitizeCell(value) {
  if (value === null || value === undefined) {
    return '';
  }

  // Handle numbers and booleans directly
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  // Dates
  if (value instanceof Date) {
    return value.toISOString();
  }

  let str = String(value);

  // Check for formula injection if string starts with formula trigger
  const trimmed = str.trimStart();
  if (trimmed.length > 0) {
    const firstChar = trimmed[0];
    if (FORMULA_TRIGGERS.includes(firstChar)) {
      // Don't sanitize pure numbers that happen to be negative (e.g. "-12.50")
      const isPureNumber = !Number.isNaN(Number(trimmed)) && !Number.isNaN(parseFloat(trimmed));
      if (!isPureNumber) {
        // Prepend single quote (') to force spreadsheet apps to treat as literal text
        str = "'" + str;
      }
    }
  }

  // Escape quotes and wrap in quotes if containing special characters
  const needsQuotes = str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r') || str.startsWith("'");
  if (needsQuotes) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Serializes headers and record objects into an RFC 4180 CSV string with formula safety.
 * 
 * @param {Array<{ key: string, label: string } | string>} columns Column definitions or keys
 * @param {Array<Record<string, any>>} records Data rows
 * @returns {string} Safe CSV string
 */
export function serializeCsv(columns, records) {
  const colKeys = columns.map((col) => (typeof col === 'string' ? col : col.key));
  const colLabels = columns.map((col) => (typeof col === 'string' ? col : col.label || col.key));

  const headerLine = colLabels.map(sanitizeCell).join(',');
  const rowLines = records.map((record) => {
    return colKeys.map((key) => sanitizeCell(record[key])).join(',');
  });

  return [headerLine, ...rowLines].join('\r\n') + '\r\n';
}
