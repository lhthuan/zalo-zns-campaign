import * as XLSX from "xlsx";
import type { ImportedRecipientRow } from "@/types/domain";
import { isValidVietnamesePhone } from "@/lib/phone";

export interface ColumnMapping {
  customer_code?: string;
  name?: string;
  phone?: string;
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
 * into another object — always go through `mapRowsToRecipients` /
 * `mapAndValidateCustomerRows`, which read an explicit whitelist of keys
 * instead of forwarding "__proto__"/"constructor" keys that a crafted file
 * could smuggle in as header names.
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
      phone: readCell(row, mapping.phone) || undefined,
      zalo_uid: readCell(row, mapping.zalo_uid) || undefined,
      template_data: templateData,
    };
  });
}

export interface CustomerImportMapping {
  customer_code?: string;
  name?: string;
  phone?: string;
  zalo_uid?: string;
}

export interface MappedCustomerRow {
  customer_code: string | null;
  name: string;
  phone: string | null;
  zalo_uid: string | null;
  extra_fields: Record<string, string>;
}

export interface ValidatedCustomerRow {
  rowIndex: number;
  data: MappedCustomerRow;
  valid: boolean;
  reason: string | null;
}

/** Runs on both the customer-import preview (client) and as a defensive
 * server-side re-check before writing — never trust only one side. */
export function validateMappedCustomer(data: MappedCustomerRow): string | null {
  if (!data.phone && !data.zalo_uid) return "Thiếu cả SĐT và Zalo UID";
  if (data.phone && !isValidVietnamesePhone(data.phone)) return "SĐT không hợp lệ";
  return null;
}

export function mapAndValidateCustomerRows(
  rows: Record<string, unknown>[],
  mapping: CustomerImportMapping
): ValidatedCustomerRow[] {
  const mappedColumns = new Set(
    [mapping.customer_code, mapping.name, mapping.phone, mapping.zalo_uid].filter(
      (v): v is string => Boolean(v)
    )
  );

  return rows.map((row, rowIndex) => {
    const extra_fields: Record<string, string> = {};
    for (const key of Object.keys(row)) {
      if (mappedColumns.has(key) || FORBIDDEN_KEYS.has(key)) continue;
      extra_fields[key] = readCell(row, key);
    }

    const phone = readCell(row, mapping.phone) || null;
    const zalo_uid = readCell(row, mapping.zalo_uid) || null;
    const data: MappedCustomerRow = {
      customer_code: readCell(row, mapping.customer_code) || null,
      name: readCell(row, mapping.name) || phone || zalo_uid || `Dòng ${rowIndex + 2}`,
      phone,
      zalo_uid,
      extra_fields,
    };
    const reason = validateMappedCustomer(data);
    return { rowIndex, data, valid: reason === null, reason };
  });
}
