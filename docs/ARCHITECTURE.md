# Kiến trúc & đặc tả dự án — Zalo ZNS Campaign Manager

> Tài liệu này ghi lại kiến trúc, luồng nghiệp vụ, mô hình dữ liệu và lịch sử các
> vấn đề đã phát hiện/sửa, để các lần làm việc sau (người hoặc Claude) đọc lại
> nhanh chóng nắm bối cảnh trước khi sửa bug — không cần dò lại từ đầu.
>
> Cập nhật lần cuối: 2026-07-16.

## 1. Tổng quan

Ứng dụng nội bộ để tạo và gửi chiến dịch **Zalo ZNS** (Zalo Notification
Service) tới khách hàng, quản lý danh bạ khách hàng, template, API key cho hệ
thống ngoài gọi vào, và dashboard theo dõi chi phí/kết quả gửi.

- **Next.js 16** (App Router, Turbopack) + React 19 + TypeScript, UI bằng
  Base UI + Tailwind v4.
- **Supabase** (Postgres) làm backend duy nhất — mọi route API dùng
  `createAdminClient()` (service_role, bỏ qua RLS) vì toàn bộ logic phân quyền
  nằm ở tầng API (`requireUser()`), không dựa vào RLS phía client.
- **Upstash QStash** để enqueue việc gửi ZNS theo từng batch 100 người nhận,
  chạy bất đồng bộ qua webhook có ký (`verifySignatureAppRouter`).
- Nguồn dữ liệu DB: `supabase/schema.sql` là schema đầy đủ cho project mới;
  `supabase/migrations/*.sql` là các thay đổi tăng dần chạy tay qua SQL Editor
  cho project đã tồn tại (không có migration runner tự động — xem comment đầu
  mỗi file migration).

## 2. Mô hình dữ liệu chính (`supabase/schema.sql`)

| Bảng | Vai trò | Điểm cần nhớ |
|---|---|---|
| `customers` | Danh bạ khách hàng | `phone` unique (nullable), `zalo_uid` unique **partial** index (`where zalo_uid is not null`) vì khách có thể chỉ có UID. `import_batch` là **1 cột text duy nhất, bị ghi đè** mỗi lần khách được import/touch lại — xem mục 5. |
| `customer_groups` / `customer_group_members` | Nhóm khách hàng, quan hệ nhiều-nhiều | Khác `import_batch`: đây là **cộng dồn**, không ghi đè — gán nhóm cũ không mất khi thêm nhóm mới. |
| `customer_import_history` | **(mới, migration 013)** Log append-only mọi lần 1 khách hàng bị chạm vào bởi import/campaign | Xem mục 5 — đây là cách đáng tin cậy để biết lịch sử nguồn dữ liệu của 1 khách hàng. |
| `campaigns` | 1 chiến dịch gửi ZNS | `creation_mode`: `'broadcast'` (gửi theo danh bạ có sẵn: tất cả/lô/nhóm) hoặc `'custom'` (upload file riêng cho chiến dịch này). |
| `campaign_recipients` | Snapshot người nhận của 1 campaign tại thời điểm tạo | `import_batch` **(mới, migration 012)**: snapshot nguồn dữ liệu tại thời điểm gửi — xem mục 5. `batch_number` = lô gửi 100 người/lần (khác hẳn khái niệm "lô import"). `tracking_id` sinh ngẫu nhiên cho mọi recipient (kể cả nhánh UID) để đối soát nội bộ. |
| `zalo_templates` | Cache template ZNS từ Zalo (đồng bộ qua `/api/templates/sync`) | `status` thật từ Zalo chỉ có `ENABLE/PENDING_REVIEW/REJECT/DISABLE` (không có `APPROVED`). |
| `api_keys` / `api_send_log` | Cho hệ thống ngoài (POS/CRM) gọi thẳng `POST /api/sendzns` | Chỉ lưu hash của key. |
| `test_send_log` | Lịch sử "Gửi thử" | Trước đây không được lưu gì cả — nay lưu để gộp vào lịch sử tin nhắn của khách hàng. |

## 3. Luồng tạo campaign (`POST /api/campaigns`, [route.ts](../src/app/api/campaigns/route.ts))

Hai chế độ loại trừ lẫn nhau, chọn ở [campaigns/new/page.tsx](../src/app/(dashboard)/campaigns/new/page.tsx):

### 3.1 `broadcast` — gửi theo danh bạ có sẵn
Chọn "Tất cả" / 1 lô (`customer_batch`, lọc theo `customers.import_batch`) / 1
nhóm (`customer_group_id`). Không có file upload — chỉ đọc `customers` hiện có
và điền `fixed_template_data` (tham số cố định, giống nhau cho mọi người
nhận). Mỗi recipient snapshot cả `import_batch` hiện tại của khách hàng đó
(để biết sau này khách này lúc gửi đang thuộc lô nào).

### 3.2 `custom` — upload file người nhận riêng cho chiến dịch này
Pipeline đầy đủ (mọi hàm nằm ở [`src/lib/spreadsheet/import.ts`](../src/lib/spreadsheet/import.ts)):

```
file (.xlsx/.xls/.csv)
  → parseSpreadsheet()          # XLSX.utils.sheet_to_json — đọc TOÀN BỘ rows
  → mapRowsToRecipients()       # áp column mapping do user chọn (phone/name/uid/template params)
  → filter isImportableRecipient # loại dòng thiếu phone+uid, hoặc phone sai định dạng VN
  → dedupeByContactKey()        # MỚI — gộp các dòng trùng phone/uid trong CÙNG file, giữ dòng cuối
  → groupRowsBySignature()      # nhóm theo "tập cột optional đang có giá trị" (bắt buộc cho upsert)
  → upsert vào `customers`      # tạo mới hoặc cập nhật, chỉ ghi đè field có giá trị
  → insert vào `customer_import_history`  # MỚI — log nguồn cho mỗi khách hàng bị chạm
  → insert `campaigns` (1 dòng)
  → insert `campaign_recipients` (N dòng, kèm import_batch = tên campaign)
```

Response trả về `{ id, totalRecipients, byMode, rejectedRows, duplicateRows }`
— `rejectedRows` = dòng thiếu/sai định dạng, `duplicateRows` = dòng bị gộp do
trùng phone/uid trong file (cả hai đều hiện toast cảnh báo ở frontend).

### 3.3 Gửi thực tế
`POST /api/campaigns/[id]/send` → set `status='sending'`, enqueue 1 job QStash
cho mỗi `batch_number` (100 recipient/batch) → `POST /api/campaigns/[id]/process-batch`
(webhook có ký QStash) gửi tối đa 8 request song song
(`mapWithConcurrency`, `SEND_CONCURRENCY=8`) qua Zalo API, ghi kết quả vào
từng `campaign_recipients` row, và cập nhật `campaigns.status` khi hết pending.

## 4. Luồng import khách hàng riêng (không qua campaign)

`customers/import/page.tsx` → preview (`mapAndValidateCustomerRows`, chạy
client-side để hiện bảng dòng hợp lệ/lỗi) → `POST /api/customers/import`
([route.ts](../src/app/api/customers/import/route.ts)) với cùng pipeline dedupe +
upsert + log lịch sử như mục 3.2, cộng thêm gán vào `customer_groups` (cột
"Nhóm" trong file, tự tạo nhóm nếu tên chưa tồn tại, không bao giờ xoá nhóm
cũ khi thêm nhóm mới).

## 5. Ba tầng "nguồn dữ liệu" — dễ nhầm, cần phân biệt rõ

| Tầng | Ở đâu | Đặc tính | Dùng để làm gì |
|---|---|---|---|
| `customers.import_batch` | 1 cột text trên danh bạ | **Bị ghi đè** mỗi lần khách hàng đó xuất hiện lại ở 1 import/campaign custom khác — chỉ phản ánh lô **gần nhất** | Lọc nhanh "gửi theo lô X" ở broadcast mode (`customer_import_batches()` SQL function) |
| `campaign_recipients.import_batch` | 1 cột trên snapshot recipient của từng campaign | **Không đổi sau khi tạo** — chụp đúng giá trị `import_batch` tại thời điểm campaign đó được tạo | Trả lời "lúc gửi campaign này, khách hàng X đang thuộc lô nào" — hiện trong recipients grid (nút "Xem nội dung" → "Lô nguồn") |
| `customer_import_history` | Bảng log riêng, append-only | Mỗi lần khách hàng bị insert/update qua import (2 route ở mục 3.2/4) đều thêm 1 dòng — **không bao giờ mất lịch sử** | Trả lời "khách hàng X từng đến từ những lô nào, theo thời gian" — hiện trong dialog "Lịch sử tin nhắn" của trang Khách hàng (badge "Lịch sử nguồn nhập") |

Trước đây (trước 2026-07-16) chỉ có tầng 1 tồn tại → không thể trả lời đáng
tin cậy câu hỏi "campaign sau dùng lại khách này thì hệ thống có nhớ nó từng ở
lô nào không" vì giá trị bị ghi đè liên tục. Đã bổ sung tầng 2 và 3 để giải
quyết dứt điểm.

## 6. Validate & dedupe số điện thoại

- Chuẩn hoá về dạng `84xxxxxxxxx` (không số 0 đầu) — [`src/lib/phone.ts`](../src/lib/phone.ts).
  Nhận diện: `0xxxxxxxxx` (10 số), `xxxxxxxxx` (9 số, Excel hay làm rớt số 0
  đầu khi cột được định dạng Number), hoặc đã là `84xxxxxxxxx`. Đầu số hợp lệ:
  `3,5,7,8,9`.
- **Dedupe trong 1 lần import** (`dedupeByContactKey`,
  [`src/lib/spreadsheet/import.ts`](../src/lib/spreadsheet/import.ts)): gộp các dòng
  cùng phone (hoặc cùng zalo_uid khi không có phone) trong CÙNG file, giữ dòng
  **cuối cùng**. Bắt buộc phải chạy trước khi `upsert` — nếu không, 2 dòng
  trùng phone rơi vào cùng 1 lệnh `upsert(..., {onConflict:"phone"})` sẽ khiến
  Postgres báo lỗi `ON CONFLICT DO UPDATE command cannot affect row a second
  time` và toàn bộ request 500 (không tạo được gì).
- **Không có khái niệm "mã voucher"** ở đâu trong hệ thống — nếu 1 template
  ZNS có tham số kiểu voucher code, nó chỉ là 1 key tự do trong
  `template_data` (JSON), **không được validate/dedupe**. Muốn dedupe theo
  voucher cần biết tên tham số cụ thể (khác nhau theo từng template) — chưa
  làm vì không có đặc tả rõ field nào là voucher.

## 7. Bảo mật khi parse file upload

`xlsx@0.18.5` (bản mới nhất trên npm) có CVE prototype-pollution đã biết, bản
vá chỉ có trên CDN riêng của SheetJS (bị chặn bởi guardrail cài đặt gói). Vì
đây là input do người dùng upload (untrusted), `parseSpreadsheet()` giảm thiểu
rủi ro bằng cách: chỉ đọc raw cell value (không xử lý style/formula/VBA), và
**không bao giờ spread trực tiếp** object đã parse — mọi nơi đọc cell đều qua
`readCell()` với whitelist tường minh, chặn `__proto__`/`constructor`/`prototype`
làm tên cột. Xem comment đầu file `import.ts`.

## 8. Testing

`npx vitest run` — test ở [`src/lib/spreadsheet/import.test.ts`](../src/lib/spreadsheet/import.test.ts),
dựng file `.xlsx` thật bằng chính thư viện `xlsx` (không mock) rồi chạy qua
đúng pipeline production (`parseSpreadsheet` → `mapRowsToRecipients` →
`isImportableRecipient` → `dedupeByContactKey`) để kiểm chứng các tình huống
thực tế: file 2 dòng hợp lệ, 2 dòng trùng phone, dòng trắng thừa cuối file,
SĐT sai định dạng. `vitest.config.ts` map alias `@/*` → `./src` (giống
`tsconfig.json`) vì trước đây project chưa có config vitest dù đã có sẵn
devDependency.

## 9. Lịch sử vấn đề đã phát hiện & sửa

### 2026-07-16 — Rà soát luồng import/tạo campaign

Người dùng báo cáo: "upload file người nhận thì chỉ tạo được 1 dòng đầu
tiên", và hỏi về dedup phone/voucher + đồng bộ danh bạ + tracking nguồn dữ
liệu. Kết luận sau khi đọc code + viết test tái hiện bằng chính pipeline thật:

- **Không có bug "chỉ đọc dòng đầu tiên"** ở tầng parse — `sheet_to_json` và
  mọi `.map()` xử lý toàn bộ rows. `rows[0]` chỉ dùng để suy ra tên cột
  (header) cho UI mapping, dữ liệu vẫn giữ đầy đủ.
- **Đã xác nhận + sửa** lỗ hổng dedup: file có 2 dòng cùng SĐT/UID trước đây
  có thể (a) khiến cả request tạo campaign/import fail 500 (Postgres ON
  CONFLICT), hoặc (b) tạo 2 recipient trùng → gửi ZNS 2 lần cho cùng 1 khách.
  → Thêm `dedupeByContactKey()`, áp dụng ở cả `api/campaigns/route.ts` và
  `api/customers/import/route.ts`, có test tái hiện ở mục 8. Đây rất có thể
  chính là nguyên nhân thực tế của "2 dòng file → 1 dòng campaign": nếu 2 dòng
  trùng SĐT, kết quả giờ là 1 recipient được tạo **có chủ đích** kèm toast
  "Đã gộp N dòng trùng SĐT/Zalo UID" — thay vì im lặng hoặc lỗi 500 như trước.
- **Đã xác nhận**: không có khái niệm dedupe theo "mã voucher" (không tồn
  tại field này trong hệ thống) — xem mục 6.
- **Đã xác nhận**: đồng bộ vào danh bạ khi import hoạt động đúng (chế độ
  custom + trang import riêng), chỉ ghi đè field có giá trị.
- **Đã sửa** lỗ hổng tracking nguồn dữ liệu: thêm `campaign_recipients.import_batch`
  (migration 012) và bảng `customer_import_history` (migration 013) — xem
  mục 5 để biết vì sao chỉ có `customers.import_batch` là không đủ.

Các file đổi trong lần sửa này: `src/lib/spreadsheet/import.ts` (2 hàm mới),
`src/app/api/campaigns/route.ts`, `src/app/api/customers/import/route.ts`,
`src/app/api/customers/[id]/import-history/route.ts` (mới),
`src/app/api/campaigns/[id]/recipients/route.ts`, `src/types/supabase.ts`,
`src/components/campaign-recipients-grid.tsx`,
`src/app/(dashboard)/campaigns/new/page.tsx`,
`src/app/(dashboard)/customers/import/page.tsx`,
`src/app/(dashboard)/customers/page.tsx`, `src/lib/i18n/translations.ts`,
`supabase/schema.sql`, `supabase/migrations/012_*.sql`,
`supabase/migrations/013_*.sql`, `src/lib/spreadsheet/import.test.ts` (mới),
`vitest.config.ts` (mới).

**Chưa làm (cần thêm input trước khi làm)**: dedupe theo "mã voucher" —
không rõ tên tham số cụ thể trong `template_data` đại diện cho voucher
(khác nhau theo từng template ZNS).
