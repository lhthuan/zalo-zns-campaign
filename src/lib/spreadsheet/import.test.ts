import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import {
  parseSpreadsheet,
  mapRowsToRecipients,
  isImportableRecipient,
  dedupeByContactKey,
  type ColumnMapping,
} from "./import";

const MAPPING: ColumnMapping = {
  phone: "Số điện thoại",
  name: "Tên",
  templateParams: {},
};

/** Builds a real .xlsx file (via the same xlsx lib production code uses) from
 * a header row + data rows, then returns it as the ArrayBuffer parseSpreadsheet
 * expects — so these tests exercise the actual file round-trip, not a mocked
 * row array. */
function buildXlsxBuffer(header: string[], rows: (string | number)[][]): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  const buf = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return buf;
}

describe("2-row upload file -> how many recipients actually get created", () => {
  it("baseline: 2 distinct customers produce 2 recipients", () => {
    const buffer = buildXlsxBuffer(
      ["Số điện thoại", "Tên"],
      [
        ["0901234567", "Nguyễn Văn A"],
        ["0907654321", "Trần Thị B"],
      ]
    );
    const rows = parseSpreadsheet(buffer);
    expect(rows).toHaveLength(2);
    const mapped = mapRowsToRecipients(rows, MAPPING);
    const valid = mapped.filter(isImportableRecipient);
    const { rows: imported, duplicateCount } = dedupeByContactKey(valid);
    expect(imported).toHaveLength(2);
    expect(duplicateCount).toBe(0);
  });

  it("2 rows with the SAME phone (copy-paste duplicate) collapse to 1 recipient after the dedupe fix", () => {
    const buffer = buildXlsxBuffer(
      ["Số điện thoại", "Tên"],
      [
        ["0901234567", "Nguyễn Văn A"],
        ["0901234567", "Nguyễn Văn A"],
      ]
    );
    const rows = parseSpreadsheet(buffer);
    expect(rows).toHaveLength(2); // the file genuinely has 2 rows — parsing is not the bug
    const mapped = mapRowsToRecipients(rows, MAPPING);
    const valid = mapped.filter(isImportableRecipient);
    expect(valid).toHaveLength(2); // both pass the phone-format filter

    const { rows: imported, duplicateCount } = dedupeByContactKey(valid);
    // This is the "2 rows in, 1 created" outcome — but now it's an intentional,
    // reported dedupe (duplicateCount = 1) instead of an unexplained loss and,
    // before this fix, a real risk of the whole request crashing (see next test).
    expect(imported).toHaveLength(1);
    expect(duplicateCount).toBe(1);
  });

  it("a trailing blank row (common Excel used-range artifact) is silently rejected, not a parsing bug", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Số điện thoại", "Tên"],
      ["0901234567", "Nguyễn Văn A"],
      ["", ""], // e.g. leftover formatting on a row below the real data
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

    const rows = parseSpreadsheet(buffer);
    expect(rows).toHaveLength(2); // sheet_to_json faithfully returns both rows
    const mapped = mapRowsToRecipients(rows, MAPPING);
    const valid = mapped.filter(isImportableRecipient);
    expect(valid).toHaveLength(1); // the blank row has no phone/uid -> rejected, not imported
  });

  it("an unrecognizable phone format on one row is rejected, not silently kept", () => {
    const buffer = buildXlsxBuffer(
      ["Số điện thoại", "Tên"],
      [
        ["0901234567", "Nguyễn Văn A"],
        ["123", "Trần Thị B"], // too short to be a VN mobile number
      ]
    );
    const rows = parseSpreadsheet(buffer);
    const mapped = mapRowsToRecipients(rows, MAPPING);
    const valid = mapped.filter(isImportableRecipient);
    expect(valid).toHaveLength(1);
  });
});

describe("dedupeByContactKey", () => {
  it("keeps rows with no phone/uid untouched (never deduped against each other)", () => {
    const { rows, duplicateCount } = dedupeByContactKey([{ phone: null, zalo_uid: null }, { phone: null, zalo_uid: null }]);
    expect(rows).toHaveLength(2);
    expect(duplicateCount).toBe(0);
  });

  it("keeps the LAST occurrence's data when phones collide", () => {
    const { rows } = dedupeByContactKey([
      { phone: "84901234567", name: "old" },
      { phone: "84901234567", name: "new" },
    ]);
    expect(rows).toEqual([{ phone: "84901234567", name: "new" }]);
  });

  it("falls back to zalo_uid as the key when phone is absent", () => {
    const { rows, duplicateCount } = dedupeByContactKey([
      { phone: null, zalo_uid: "uid-1" },
      { phone: null, zalo_uid: "uid-1" },
      { phone: null, zalo_uid: "uid-2" },
    ]);
    expect(rows).toHaveLength(2);
    expect(duplicateCount).toBe(1);
  });
});
