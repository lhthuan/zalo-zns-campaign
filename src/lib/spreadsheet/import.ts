import * as XLSX from "xlsx";
import type { ImportedRecipientRow } from "@/types/domain";
import { isValidVietnamesePhone, toCanonicalZnsPhone } from "@/lib/phone";

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

/** Reads a phone cell and converts it to Zalo's canonical 84xxxxxxxxx form.
 * If the cell has content but can't be converted, the raw text is kept so
 * the caller can surface exactly what was wrong instead of a blank field. */
function readPhoneCell(row: Record<string, unknown>, column: string | undefined): string | null {
  const raw = readCell(row, column);
  if (!raw) return null;
  return toCanonicalZnsPhone(raw) ?? raw;
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
      phone: readPhoneCell(row, mapping.phone) ?? undefined,
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
  group?: string; // cell may contain multiple group names separated by "," or ";"
}

export interface MappedCustomerRow {
  customer_code: string | null;
  name: string | null;
  phone: string | null; // canonical 84xxxxxxxxx when valid; raw text when invalid (for error display)
  zalo_uid: string | null;
  extra_fields: Record<string, string>;
  groups: string[];
}

function readGroupNames(row: Record<string, unknown>, column: string | undefined): string[] {
  const raw = readCell(row, column);
  if (!raw) return [];
  return [...new Set(raw.split(/[,;]/).map((g) => g.trim()).filter(Boolean))];
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
    [mapping.customer_code, mapping.name, mapping.phone, mapping.zalo_uid, mapping.group].filter(
      (v): v is string => Boolean(v)
    )
  );

  return rows.map((row, rowIndex) => {
    const extra_fields: Record<string, string> = {};
    for (const key of Object.keys(row)) {
      if (mappedColumns.has(key) || FORBIDDEN_KEYS.has(key)) continue;
      extra_fields[key] = readCell(row, key);
    }

    const data: MappedCustomerRow = {
      customer_code: readCell(row, mapping.customer_code) || null,
      name: readCell(row, mapping.name) || null,
      phone: readPhoneCell(row, mapping.phone),
      zalo_uid: readCell(row, mapping.zalo_uid) || null,
      extra_fields,
      groups: readGroupNames(row, mapping.group),
    };
    const reason = validateMappedCustomer(data);
    return { rowIndex, data, valid: reason === null, reason };
  });
}

/** Any row we key a customer/recipient upsert by phone or Zalo UID. */
export interface ContactKeyed {
  phone?: string | null;
  zalo_uid?: string | null;
}

export interface DedupeResult<T> {
  rows: T[];
  duplicateCount: number;
}

/**
 * Collapses rows that share the same phone (or, when phone is absent, the same
 * Zalo UID) down to their last occurrence in the file.
 *
 * Two reasons this must run before anything touches the DB:
 * 1. Postgres's `INSERT ... ON CONFLICT (phone) DO UPDATE` throws "ON CONFLICT
 *    DO UPDATE command cannot affect row a second time" the moment the same
 *    conflict key appears twice in one statement — an unhandled duplicate
 *    phone in the uploaded file would 500 the entire campaign/import request.
 * 2. Even when two duplicate rows land in different upsert calls (no crash),
 *    without this step both still turn into separate campaign_recipients rows
 *    later — the same person gets the ZNS message sent to them twice.
 * Last-occurrence-wins matches spreadsheet intuition: a later row for the same
 * contact is treated as the corrected/more recent value.
 */
export function dedupeByContactKey<T extends ContactKeyed>(rows: T[]): DedupeResult<T> {
  const indexByKey = new Map<string, number>();
  const result: T[] = [];
  for (const row of rows) {
    const key = row.phone ? `p:${row.phone}` : row.zalo_uid ? `u:${row.zalo_uid}` : null;
    if (key == null) {
      result.push(row);
      continue;
    }
    const existingIndex = indexByKey.get(key);
    if (existingIndex != null) {
      result[existingIndex] = row;
    } else {
      indexByKey.set(key, result.length);
      result.push(row);
    }
  }
  return { rows: result, duplicateCount: rows.length - result.length };
}

/** A recipient row needs a phone or a Zalo UID to be sendable, and a phone
 * (when present) must be a real VN mobile number — same rule enforced both
 * for campaign recipients and for customer-import rows. */
export function isImportableRecipient(r: { phone?: string; zalo_uid?: string }): boolean {
  if (!r.phone && !r.zalo_uid) return false;
  if (r.phone && !isValidVietnamesePhone(r.phone)) return false;
  return true;
}

export interface CustomerUpsertFields {
  customer_code?: string;
  name?: string;
  phone?: string;
  zalo_uid?: string;
  extra_fields?: Record<string, string>;
}

/** Only includes a key when this row actually has a value for it — an absent
 * key means "don't touch this column" on conflict (see groupRowsBySignature). */
export function presentCustomerFields(data: MappedCustomerRow): CustomerUpsertFields {
  const row: CustomerUpsertFields = {};
  if (data.customer_code) row.customer_code = data.customer_code;
  if (data.name) row.name = data.name;
  if (data.phone) row.phone = data.phone;
  if (data.zalo_uid) row.zalo_uid = data.zalo_uid;
  if (Object.keys(data.extra_fields).length > 0) row.extra_fields = data.extra_fields;
  return row;
}

/**
 * PostgREST's upsert derives its ON CONFLICT DO UPDATE SET columns from the
 * union of keys present across the WHOLE batch passed to a single
 * .upsert() call — so rows that carry a different set of optional fields
 * must never share one upsert call, or a row missing e.g. zalo_uid would get
 * it overwritten with NULL just because another row in the same batch had it.
 * This groups rows by their exact "which optional fields are present"
 * signature so each group can be upserted safely on its own.
 */
export function groupRowsBySignature<T extends object>(rows: T[], keys: readonly (keyof T)[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const signature = keys.filter((k) => row[k] !== undefined).join(",");
    const list = groups.get(signature) ?? [];
    list.push(row);
    groups.set(signature, list);
  }
  return [...groups.values()];
}
