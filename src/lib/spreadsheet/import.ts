import * as XLSX from "xlsx";
import type { ImportedRecipientRow } from "@/types/domain";

export interface ColumnMapping {
  customer_code?: string;
  name?: string;
  phone: string;
  zalo_uid?: string;
  // maps template param name -> source column header
  templateParams: Record<string, string>;
}

/**
 * Parses an uploaded xlsx/csv buffer into raw row objects (header -> cell value).
 *
 * xlsx@0.18.5 (the newest version published to the npm registry) carries a
 * known prototype-pollution CVE; the patched build only ships via SheetJS's
 * own CDN, which Claude Code's install guardrail blocks as an untrusted
 * source. Since this parses files uploaded by staff (an untrusted-input path),
 * mitigate here rather than trust the library alone: read raw cell values only
 * (no style/formula/VBA processing), and never spread a parsed row directly
 * into another object — always go through `mapRowsToRecipients`, which reads
 * an explicit whitelist of keys instead of forwarding "__proto__"/"constructor"
 * keys that a crafted file could smuggle in as header names.
 */
export function parseSpreadsheet(buffer: ArrayBuffer): Record<string, unknown>[] {
  const workbook = XLSX.read(buffer, { type: "array", raw: true, cellHTML: false, cellFormula: false });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json(sheet, { raw: true, defval: "" });
}

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function readCell(row: Record<string, unknown>, column: string | undefined): string {
  if (!column || FORBIDDEN_KEYS.has(column)) return "";
  const value = Object.prototype.hasOwnProperty.call(row, column) ? row[column] : undefined;
  return value == null ? "" : String(value).trim();
}

export function mapRowsToRecipients(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping
): ImportedRecipientRow[] {
  return rows.map((row, index) => {
    const templateData: Record<string, string> = {};
    for (const [paramName, column] of Object.entries(mapping.templateParams)) {
      if (FORBIDDEN_KEYS.has(paramName)) continue;
      templateData[paramName] = readCell(row, column);
    }

    return {
      rowIndex: index,
      customer_code: readCell(row, mapping.customer_code) || undefined,
      name: readCell(row, mapping.name) || undefined,
      phone: readCell(row, mapping.phone),
      zalo_uid: readCell(row, mapping.zalo_uid) || undefined,
      template_data: templateData,
    };
  });
}
