import * as XLSX from "xlsx";

export interface ReportRow {
  phone: string;
  customer_name: string | null;
  send_mode: string;
  status: string;
  zalo_msg_id: string | null;
  error_code: string | null;
  error_message: string | null;
  sent_at: string | null;
}

const HEADERS: { key: keyof ReportRow; label: string }[] = [
  { key: "phone", label: "Số điện thoại" },
  { key: "customer_name", label: "Tên khách hàng" },
  { key: "send_mode", label: "Chế độ gửi" },
  { key: "status", label: "Trạng thái" },
  { key: "zalo_msg_id", label: "Zalo Message ID" },
  { key: "error_code", label: "Mã lỗi" },
  { key: "error_message", label: "Lỗi" },
  { key: "sent_at", label: "Thời gian gửi" },
];

function toAoa(rows: ReportRow[]): unknown[][] {
  return [HEADERS.map((h) => h.label), ...rows.map((row) => HEADERS.map((h) => row[h.key] ?? ""))];
}

export function exportReportToXlsx(rows: ReportRow[]): Buffer {
  const worksheet = XLSX.utils.aoa_to_sheet(toAoa(rows));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Báo cáo");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

export function exportReportToCsv(rows: ReportRow[]): string {
  const worksheet = XLSX.utils.aoa_to_sheet(toAoa(rows));
  return XLSX.utils.sheet_to_csv(worksheet);
}
