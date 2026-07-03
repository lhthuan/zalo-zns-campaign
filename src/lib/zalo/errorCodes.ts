// From official Zalo docs ("Bảng mã lỗi.pdf") — codes relevant to the send flow.
// Not exhaustive; unmapped codes fall back to the raw Zalo message.
export const ZALO_SEND_ERROR_MESSAGES: Record<string, string> = {
  "-108": "Số điện thoại không hợp lệ (định dạng phải 84xxxxxxxxx, không có số 0 đầu)",
  "-115": "Tài khoản ZBS hết số dư — cần nạp tiền",
  "-118": "Tài khoản Zalo của người nhận không tồn tại hoặc đã vô hiệu hoá",
  "-124": "Access token không hợp lệ",
  "-139": "Người dùng từ chối nhận loại template message này",
  "-140": "Người dùng không đủ điều kiện nhận theo chính sách gửi hiện tại",
  "-141": "Người dùng từ chối nhận tin qua số điện thoại",
  "-144": "OA đã vượt giới hạn gửi tin qua SĐT trong ngày",
  "-147": "Template đã vượt giới hạn gửi trong ngày",
  "-161": "Giá trị sending_mode không hợp lệ",
  "-162": "Không thể dùng sending_mode=3 (gửi vượt hạn mức) với template Tag 1/2",
  "-249": "Template không hỗ trợ gửi qua UID (template tạo trước 10/12/2025, OTP, Response hoặc Journey) — cần tạo mới/clone lại template",
};

export function describeZaloError(errorCode: number, fallbackMessage: string): string {
  return ZALO_SEND_ERROR_MESSAGES[String(errorCode)] ?? fallbackMessage;
}
