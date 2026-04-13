export interface CsvRow {
  [key: string]: string;
}

/**
 * Parse CSV text into headers + rows, correctly handling:
 * - Quoted fields containing commas
 * - Quoted fields containing newlines (multi-line values)
 * - Escaped quotes (doubled "")
 */
export function parseCsv(text: string): { headers: string[]; rows: CsvRow[] } {
  const records = parseRecords(text);
  if (records.length === 0) return { headers: [], rows: [] };

  const headers = records[0].map(normalizeHeader);
  const rows: CsvRow[] = [];

  for (let i = 1; i < records.length; i++) {
    const values = records[i];
    const row: CsvRow = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (values[j] ?? "").trim();
    }
    rows.push(row);
  }

  return { headers, rows };
}

/**
 * Single-pass tokenizer that splits CSV text into an array of records,
 * where each record is an array of field strings. Handles multi-line
 * quoted fields correctly by tracking quote state across newlines.
 */
function parseRecords(text: string): string[][] {
  const records: string[][] = [];
  let fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i++;
        } else {
          // End of quoted field
          inQuotes = false;
        }
      } else {
        // Inside quotes: accept everything, including newlines
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        fields.push(current);
        current = "";
      } else if (char === "\r") {
        // Handle \r\n or standalone \r as record separator
        if (i + 1 < text.length && text[i + 1] === "\n") {
          i++; // skip the \n
        }
        fields.push(current);
        current = "";
        if (fields.some((f) => f !== "")) {
          records.push(fields);
        }
        fields = [];
      } else if (char === "\n") {
        fields.push(current);
        current = "";
        if (fields.some((f) => f !== "")) {
          records.push(fields);
        }
        fields = [];
      } else {
        current += char;
      }
    }
  }

  // Handle final field/record (no trailing newline)
  fields.push(current);
  if (fields.some((f) => f !== "")) {
    records.push(fields);
  }

  return records;
}

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}
