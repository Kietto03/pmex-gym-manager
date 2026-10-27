# Trạng thái triển khai v2.0 (đối chiếu với tài liệu BA 26/10/2026)

Cập nhật: 27/10/2026. Tất cả mục "Đã làm" đã chạy trên production (database và site), có test database (`npm run test:db`), test giao diện (`test/e2e.html`) và test luật (`node test/grid.test.mjs`, `node test/gems.test.mjs`).

| Mã | Nội dung | Trạng thái | Ghi chú |
|---|---|---|---|
| FR-01 | Sync Grid, Moves/Passives | Đã làm (một phần) | Danh sách mọi pair (mới nhất trước, có lọc theo hệ, role, sao, cách nhận, EX, của tôi, có grid). Trang Sync Grid: grid hex thật từ datamine, bật/tắt ô, kiểm tra ô kề, move level, giới hạn energy do người dùng nhập, lưu build riêng tư hoặc chia sẻ gym. Luật kiểm tra ở phía app (`src/grid.js`), chưa có ở database. Chưa có link công khai cho người chưa đăng nhập (BA chưa chốt). |
| FR-01B / 01C | Damage Calculator, Battle Simulator | Chưa làm | Phase sau theo BA: cần công thức được kiểm chứng với dữ liệu trận. |
| FR-02 | Vai trò theo mùa và lọc điểm | Đã làm | Plan → Roles: một role và một main type mỗi member mỗi mùa, lọc theo role/main type/hệ stage/leader, sao chép từ mùa khác. Hệ của stage là weakness của Gym Leader. |
| FR-02R | Review lượt hỗ trợ | Đã làm | Mỗi lượt lưu main type tại thời điểm log; phân loại Main/Support/Unclassified; staff Confirm hoặc Needs correction; review không đổi điểm, vé, round. Các lượt cũ trước 27/10/2026 là Unclassified. Chưa có lịch sử hiệu lực nhiều khoảng (dùng bản chụp trên từng lượt). |
| FR-03 | Thư viện chiến thuật và video | Đã làm | Draft → chờ duyệt → Published / Changes requested; sửa bản đã xuất bản mở revision mới; áp dụng vào plan chỉ với pair member sở hữu; video YouTube nhúng, nguồn khác chỉ có link. Chưa có import từ các Google Sheet (không đọc được). |
| FR-04 | Datamine round kế tiếp | Đã làm | Battle info → Next rounds: round đang mở và hai round sau, Gym Battle sắp tới (nhãn chưa xác nhận), so sánh với dữ liệu đã lưu, staff chủ động cập nhật. |
| FR-05 | Gợi ý theo Tier List và Type Move | Chưa làm | Các link tier đã thử đọc tự động: Tier TQ (docs.qq.com) đòi đăng nhập (HTTP 401), Tier Spark là hình ảnh trong Google Doc (không có chữ để đọc), bài GameWith là xếp hạng scout chứ không phải tier chiến đấu. Dữ liệu ranking đọc được là bảng D.C. (điểm 3v3 cao nhất theo hệ), đã hiển thị ở trang Strategies. Vẫn cần tiêu chí Type Move. |
| FR-06 | Thời điểm trận thực tế | Đã làm | `occurred_at` tách khỏi `created_at`; quyền sửa: member trong mùa, mod/admin trong mùa, sau mùa chỉ admin; có bảng audit; không đổi round hay vé. |
| FR-06L | Log muộn sau mùa | Chưa làm | Đề xuất BA chưa được khách hàng xác nhận. |
| FR-07 | Pasio Tower: ảnh và dashboard | Đã làm | Ảnh PNG cá nhân (lưu / sao chép), dashboard cho staff (bảng thành viên × hệ, tổng, trung bình, ngày cập nhật). Tower của mọi người vẫn đọc được (khách hàng chọn giữ). |
| FR-08 | Trainer Lodge | Đã làm (phase đầu) | Tra cứu tĩnh theo trainer và theo chủ đề, nguồn Serebii, có ngày chép (`tools/build-lodge.mjs` làm mới). Tư vấn theo lượt là phase sau. |
| FR-09 | Free Gems | Đã làm | Dự phóng đến cuối tháng từ bảng Gems của cộng đồng (tự cập nhật mỗi 6 giờ, kiểm tra tổng khớp với bảng) hoặc từ phần thưởng staff nhập; phần thưởng một lần tách riêng; số lượng chưa rõ không tính. |
| FR-10 | Resources | Đã làm | Kho link có nhóm, ngôn ngữ, nguồn, phiên bản, ngày hiệu lực, trạng thái link do staff đánh dấu. |
| FR-11 | Múi giờ | Đã làm | Múi giờ IANA trong hồ sơ, đồng hồ trên thẻ thành viên, mọi giờ hiển thị theo múi giờ người xem. |

## Còn cần khách hàng

1. Dữ liệu Tier List TQ và Spark ở dạng đọc được (bảng công khai hoặc xuất CSV; hiện TQ cần đăng nhập, Spark là hình) và định nghĩa "Type Move".
2. Xác nhận luồng log muộn sau mùa (FR-06L).
3. Quyết định có cho người chưa đăng nhập xem build Sync Grid qua link hay không.
4. Phase sau: công thức sát thương và cơ chế mô phỏng.

## Cập nhật dữ liệu tự động (27/10/2026)

Xem `docs/data-sync.md`: workflow `Sync outside data` (6 giờ một lần) cho bảng Gems, xếp hạng D.C., Trainer Lodge, bản đồ pair; kiểm tra sống cho tracker và Dex; trang Admin → Data updates. Repo Dex có workflow `Update from the datamine` (hằng ngày) với kiểm tra an toàn trước khi đăng.
