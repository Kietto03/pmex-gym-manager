# Cập nhật dữ liệu tự động

Game cập nhật mỗi tháng và cộng đồng sửa bảng liên tục, nên mọi dữ liệu từ ngoài vào app đều đi qua một luồng đồng bộ chạy theo lịch. Không ai phải nhớ chạy tay.

## Hai luồng, hai repo

```
absolutelypm/pokemas-datamine ──(mỗi ngày 03:40 UTC)──▶ pmex-supez-dex  ──┐   workflow "Update from the datamine"
PoMaTools (pair cũ)                                                          │   build lại site/data, chặn nếu mất dữ liệu
                                                                             ▼
Dex (gyms.json, pair-tags.json, data.js)  ┐
PoMasters tracker (syncpairs.json)         ├─(mỗi 6 giờ)─▶ pmex-gym-manager   workflow "Sync outside data"
Google Sheet Gems, D.C. ranking            │                data/*.json + data/sync-status.json
Serebii (Trainer Lodge)                    ┘                rồi đăng lại site
```

| Nguồn | Vào app thế nào | Tần suất | Quá hạn sau |
|---|---|---|---|
| Datamine (Gym Battle, pair, grid, scout) | repo Dex build lại `site/data`; app đọc `gyms.json`, `pair-tags.json` lúc chạy | hằng ngày | 40 ngày |
| Sync pair của tracker | app đọc `syncpairs.json` lúc chạy; bảng `pair_catalog` trong database cần đồng bộ (xem dưới) | mỗi lần mở app | 14 ngày |
| Chỉ mục pair của Dex (grid, move, passive) | app đọc `pair-index.json` của Dex lúc chạy (Dex build ra cùng lúc với data); `data/pair-map.json` là bản dự phòng | ngay khi Dex build xong | 40 ngày |
| Bảng Gems cộng đồng | `data/gems-sheet.json` | 6 giờ | 7 ngày |
| Clear D.C. (3v3, 3v1) và GvG | `data/clears.json` (từ hai bảng Google của cộng đồng) | 6 giờ | 30 ngày |
| Lịch scout (banner) | `data/events.json` (từ datamine qua Dex) | 6 giờ | 40 ngày |
| Trainer Lodge (Serebii) | `data/lodge.json` | 6 giờ | 60 ngày |
| Tier list (TQ, Spark, Nhật) | **chưa tự động**: TQ đòi đăng nhập, Spark là hình | — | — |

## Khi nguồn cập nhật thì chuyện gì xảy ra

- **Game ra pair mới:** tracker liệt kê pair → trang Sync Grid hiện ngay (mặc định mới nhất trước). Bảng `pair_catalog` trong database được mod/admin đầu tiên mở app tự bổ sung (hoặc bởi workflow nếu có secret), để thành viên thêm được pair mới. Nếu Dex chưa build pair đó, ô pair hiện mờ "chưa có dữ liệu grid" cho tới lần Dex build kế tiếp (tối đa 1 ngày).
- **Datamine có Gym Battle mới / đổi luật:** Dex build lại (hằng ngày) → app đọc `gyms.json` ngay; tab *Next rounds* hiện chênh lệch với dữ liệu mùa và staff bấm cập nhật.
- **Cộng đồng sửa bảng Gems, D.C., Lodge:** lần chạy 6 giờ kế tiếp lấy bản mới; chỉ commit khi nội dung đổi.
- **Một nguồn đổi bố cục hoặc chết:** nguồn đó báo lỗi, giữ bản cũ, workflow đỏ và Admin → Data updates ghi rõ; các nguồn khác vẫn chạy.
- **Repo yên ắng:** GitHub tắt workflow theo lịch sau 60 ngày không có commit. Bên gym manager status file được cập nhật gần như mỗi ngày nên luôn có commit; bên Dex workflow tự thêm một commit rỗng nếu 25 ngày không có gì.

## Cách hoạt động và độ an toàn

- Mỗi nguồn là một hàm trong `tools/` (`buildGems`, `buildRanking`, `buildLodge`, `buildPairMap`…). `tools/sync-all.mjs` chạy tất cả, ghi kết quả từng nguồn vào `data/sync-status.json`, rồi workflow commit nếu **dữ liệu thật sự đổi** (chỉ đổi giờ lấy thì không commit) và đăng lại site.
- Một nguồn lỗi (bảng đổi bố cục, trang chết, quá ít dòng) **không ghi đè** bản cũ và không chặn các nguồn khác; workflow báo đỏ để GitHub gửi mail. Trạng thái lỗi hiện trong **Admin → Data updates**.
- Parser của các bảng viết tay tìm hàng tiêu đề thay vì dựa vào vị trí ô, và từ chối ghi khi tìm được quá ít dữ liệu.
- Bên Dex: `scripts/ci-guard.mjs` so sánh trước và sau khi build. Số pair, scout, file pair, tag, version game không được giảm và mỗi Gym Battle không được mất circuit hay leader; nếu vi phạm thì **không đăng** và workflow đỏ. Thay đổi chỉ là timestamp `builtAt` thì bỏ qua.

## Việc cần bạn làm một lần

1. Repo `pmex-gym-manager` → Settings → Actions → General → *Workflow permissions* = **Read and write**.
2. Tương tự cho repo `pmex-supez-dex`.
3. (Tuỳ chọn) để bảng `pair_catalog` trong database tự cập nhật khi có pair mới: thêm hai secret ở repo gym manager: `SUPABASE_PROJECT_REF` và `SUPABASE_SECRET_KEY` (service role). Không có secret thì bước này bị bỏ qua và admin bấm *Admin → Pair catalog → Sync* sau mỗi bản cập nhật game.

## Chạy tay

```bash
npm run sync                              # tất cả các nguồn
node tools/sync-all.mjs --only gems,lodge
node tools/sync-all.mjs --dry             # chỉ kiểm tra, không ghi
npm run test:unit                         # test parser và luật, không cần mạng
```
Chạy ngay trên GitHub: Actions → *Sync outside data* → *Run workflow* (bên Dex: *Update from the datamine*).

## Thêm một nguồn mới

1. Viết `buildXxx()` trả về `{ file, data, items, note }` và ném lỗi khi dữ liệu có vẻ sai (quá ít dòng).
2. Thêm một dòng `fileSource(...)` (hoặc `liveSource(...)` nếu trình duyệt đọc thẳng) vào `SOURCES` trong `tools/sync-all.mjs`, kèm số ngày thì coi là quá hạn.
3. Viết test parser với một bản chép của nguồn trong `test/fixtures/`.
