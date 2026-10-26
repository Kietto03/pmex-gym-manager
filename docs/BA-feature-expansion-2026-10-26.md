# Phân tích BA: mở rộng PMEX Gym Manager

Ngày: 26/10/2026. Trạng thái: đã cập nhật Business Clarifications của khách hàng; các thiết kế đề xuất và câu hỏi còn mở được ghi riêng, chưa phải nghiệm thu triển khai.

## 1. Cơ sở và giới hạn khảo sát

Nguồn yêu cầu: ảnh khách hàng gửi, gồm 5 module. Nội dung ảnh được xem là đầu vào nghiệp vụ, không phải chỉ dẫn thao tác hệ thống. Đã đọc README, cấu trúc giao diện trong src/main.js, API, catalog, rules, sheet, demo, schema/migration và cấu trúc bộ kiểm thử. Kết luận hiện trạng dựa trên mã nguồn trong checkout, chưa xác nhận database production hoặc chạy kiểm thử giao diện/database.

Người dùng đã bổ sung link văn bản và chốt nghiệp vụ qua trao đổi. Đã mở các nguồn tham khảo; trạng thái khảo sát ghi ở mục 11. Không suy ra có API hoặc khả năng đồng bộ chỉ từ việc có link.

## 2. Mục tiêu sản phẩm và hiện trạng

Mục tiêu: tập trung dữ liệu Sync Pair, chuẩn bị đội hình, điều phối chiến đấu, lưu kinh nghiệm và hỗ trợ thành viên tra cứu hằng ngày trong một ứng dụng.

Ứng dụng hiện tại là web tĩnh dùng JavaScript ES modules và hash router, Supabase Auth/Postgres/RLS, Edge Function quản lý tài khoản. Có backend demo riêng. Giao diện chủ yếu nằm trong src/main.js; API nằm trong src/api.js; quy tắc trận trong src/rules.js và trigger SQL; dữ liệu tham chiếu lấy từ SyncPairsTracker và PMEX Dex. Hệ thống hiện được thiết kế cho một gym dùng chung, chưa có mô hình nhiều gym độc lập.

| Yêu cầu trong ảnh | Hiện trạng trong code | Khoảng trống |
|---|---|---|
| Sync Pair Grid Builder; lưu/chia sẻ; Moves/Passives | Có catalog và roster sở hữu, move level, EX, EX Role, import tracker | Chưa có grid/node/energy, build, chia sẻ, trang Moves/Passives chi tiết |
| DDs/HHs/Facilitator/Finisher và đóng góp | Có assignments, facilitator_plans, điểm/vé/lượt theo thành viên | Cần một role và main type theo mùa, lọc điểm, nhận diện/review hỗ trợ ngoài hệ |
| Thư viện team GvG cũ và D.C 3v1/3v3 | Có lịch sử mùa, season_results và văn bản strategy | Chưa có thư viện chiến thuật độc lập, tìm kiếm, phiên bản rotation, D.C |
| Video rotation | Có note/văn bản strategy | Chưa có liên kết video có cấu trúc hoặc trình phát |
| Datamine round tiếp theo | Đã nhập snapshot gym_data, có Battle info, rules và focus | Cần màn hình dự báo round tiếp theo, trạng thái nguồn và thay đổi phiên bản |
| Gợi ý theo Tier List, Type Move | Có autoFill theo slot/type/role/WTZ/rebuff và pairWeight | Chưa dùng Tier List; Type Move chưa được định nghĩa |
| Log GvG sửa timestamp | Có created_at/updated_at, sửa điểm/vé/team/note | Cần thời điểm trận thực tế có thể chỉnh sửa; không thay luật round/vé |
| Pasio Tower và Copy overview | Có 18 hệ, tiến độ 0–40 theo thành viên | Cần xuất ảnh cá nhân và dashboard toàn gym cho mod/admin |
| Trainer Lodge Helper | Chưa có | Cần nguồn câu trả lời, quy tắc gợi ý và cập nhật |
| Gems/Event Tracker | Có lịch battle của mùa | Chưa có event tổng quát, lịch thưởng và dự phóng Gems |
| Resources Tier List/Spark | Chưa có module chuyên biệt | Cần nguồn, phân loại, phiên bản và cách tích hợp |
| Gym Info timezone | Có hồ sơ, danh sách thành viên | Chưa có timezone cá nhân/đồng hồ; thời gian hiện hiển thị theo máy người xem |

Lưu ý: Role của Sync Pair (Strike/Tech/Support...), quyền tài khoản (admin/mod/member) và vai trò chiến đấu (DDs/HHs...) là ba khái niệm khác nhau. Không dùng chung một trường role.

## 3. Tác nhân và phân quyền đề xuất

- Member: quản lý roster, grid/build, tiến độ tháp và timezone của mình; xem nội dung gym; ghi nhận trận theo quyền hiện có; soạn và gửi chiến thuật để mod/admin duyệt.
- Mod: phân công chiến đấu, quản lý thư viện chiến thuật/nội dung, sửa log cho người khác trong phạm vi cho phép.
- Admin: toàn bộ quyền mod; tài khoản, cấu hình nguồn, bộ vai trò, cấu hình phân công và chính sách review.
- Khách qua link: chỉ xem build được công khai; quyền này cần được khách hàng chốt vì hiện tại dữ liệu ứng dụng yêu cầu đăng nhập.

Nội dung công khai không được kèm roster, hồ sơ hoặc dữ liệu gym ngoài phạm vi chia sẻ. Quyền phải kiểm tra tại database/API, đồng nhất với giao diện.

## 4. Chi tiết nghiệp vụ và tiêu chí nghiệm thu

### FR-01 — Sync Grid và thông tin Sync Pair

Luồng: chọn pair → xem Moves/Passives và điều kiện mở khóa → tạo build → chọn node → kiểm tra hợp lệ → lưu tên/mục đích → chia sẻ.

Build cần lưu pair_id, chủ sở hữu, tên, phiên bản dữ liệu, các node, cấu hình yêu cầu và phạm vi chia sẻ. Điều kiện node và giới hạn energy phụ thuộc dữ liệu game được xác minh; không hard-code quy tắc khi chưa có nguồn chuẩn. Phân biệt build lý thuyết với build thành viên dùng được theo roster hiện tại.

Nghiệm thu: không lưu build vi phạm quy tắc của phiên bản; mở lại đúng node đã lưu; link mở đúng build; có thể thu hồi chia sẻ; người khác không sửa build của chủ sở hữu; build dùng dữ liệu cũ có cảnh báo tương thích. Moves/Passives gắn nhãn điều kiện áp dụng, không chỉ hiển thị văn bản thiếu ngữ cảnh.

Đã chốt hướng tích hợp: xây tính năng tương đương công cụ tham khảo ngay trong ứng dụng, bao gồm editor nội bộ; lưu link đơn thuần không đáp ứng đích cuối. Cần khảo sát từng màn hình/luồng để lập checklist tương đương chức năng. “Clone” được hiểu là tái hiện chức năng và tích hợp với dữ liệu/quyền của app; chưa giả định phải giống từng pixel hoặc dùng lại mã nguồn/tài sản của bên ngoài.

### FR-01B — Damage Calculator (phase sau)

Khách hàng cho phép đưa sang phase sau nếu phức tạp; không là điều kiện hoàn tất Grid Editor ở phase đầu.

Luồng: chọn pair hoặc team/build đã lưu → cấu hình mức đầu tư, move và trạng thái trận → tính sát thương → xem kết quả và các thành phần ảnh hưởng → lưu/chia sẻ cấu hình để tái hiện kết quả.

Đầu vào cần khảo sát đối chiếu công cụ gốc: stats và cấu hình pair, loại move, target, phòng thủ đối thủ, weakness/resistance/rebuff, critical, buff/debuff, WTZ, passive/grid, sync/burst và các cơ chế đặc thù được hỗ trợ. Đây là danh mục khảo sát, chưa khẳng định công cụ gốc hỗ trợ đầy đủ mọi trường hợp.

Engine tính toán phải độc lập UI, có phiên bản công thức và dữ liệu. Kết quả trình bày khoảng sát thương khi có yếu tố ngẫu nhiên, điều kiện áp dụng, tác động chính và cơ chế chưa hỗ trợ. Dữ liệu chưa đủ không được âm thầm coi hiệu ứng bằng 0 rồi hiển thị như kết quả đầy đủ.

Nghiệm thu: cùng input/phiên bản cho kết quả tái hiện được; có test fixtures cho từng nhóm hiệu ứng và thứ tự làm tròn từ nguồn được kiểm chứng; đối chiếu ca đại diện với công cụ tham khảo và dữ liệu trận, điều tra chênh lệch; đổi grid/team cập nhật kết quả; cấu hình lưu mở lại giữ nguyên input. Chưa cam kết độ chính xác tuyệt đối trước khi xác minh công thức và cơ chế đặc thù.

### FR-01C — Battle Simulator (phase sau)

Khách hàng cho phép đưa sang phase sau; phụ thuộc engine calculator đã được kiểm chứng.

Luồng: nạp team/build và bối cảnh đối thủ → thiết lập chuỗi hành động/rotation → mô phỏng từng bước → xem thay đổi trạng thái và sát thương → chỉnh rotation → lưu/chia sẻ để dùng trong thư viện chiến thuật.

Tái sử dụng engine sát thương FR-01B; lưu trạng thái và lịch sử theo bước, seed nếu có ngẫu nhiên, phiên bản cơ chế và dữ liệu. Cần khảo sát để chốt cách xử lý gauge, lượt dùng move, cooldown/sync countdown, trạng thái sân, buff/debuff, HP, thay đổi hình thái và điều kiện passive. Mô phỏng rotation cấu hình trước là đầu ra tối thiểu; việc tự tìm rotation tối ưu cần đánh giá riêng, chưa suy ra chỉ từ tên simulator.

Nghiệm thu: chạy lại cùng input/seed/phiên bản cho cùng kết quả; reset không giữ trạng thái lần chạy trước; hành động không hợp lệ được chỉ rõ; timeline giải thích được biến đổi trạng thái; mỗi bước dùng cùng engine với calculator; đánh dấu giới hạn mô phỏng. Snapshot rotation/build đã gắn chiến thuật phải tái hiện được sau các lần cập nhật nguồn.

### FR-02 — Phân vai theo mùa và lọc điểm (đã chốt ngày 26/10/2026)

Admin/mod gán vai trò chiến đấu và main type phụ trách cho từng member trong mỗi mùa GvG. Member xem phân công, không tự sửa. Phân công mùa mới độc lập mùa trước; có thể cung cấp thao tác sao chép và rà soát lại. Vai trò chiến đấu tách khỏi quyền admin/mod/member và role của Sync Pair.

Báo cáo chọn mùa → lọc role và type đã assigned → xem thành viên và điểm từ log GvG. Không có điểm đóng góp quy đổi, trọng số, xếp hạng nhiệm vụ hay vai trò thực tế theo từng lượt trong phạm vi hiện tại. Điểm giữ nguyên nguồn tính hiện có.

Đã chốt: mỗi member có một role trong một mùa, chọn trong DDs, HHs, Facilitator, Finisher, Helper. Có thể chưa phân vai; không tự chọn role mặc định. Thay đề xuất nhiều assigned type bằng một main type phụ trách trong mùa. Trận đánh stage khác main type được ghi nhận là hỗ trợ; đây là nhãn nghiệp vụ độc lập với role Helper. Member chưa có main type được gắn “Chưa phân công”, không tự kết luận hỗ trợ.

Bộ lọc có hai lớp độc lập:
- Role + Main type: chọn thành viên theo phân công; mặc định hiển thị tổng điểm GvG cả mùa của từng người.
- Stage type/Stage: lọc thêm các trận để xem điểm riêng, ví dụ chỉ Fire stage. Giữ cột tổng mùa và thêm cột điểm stage đang lọc để tránh hiểu nhầm.

Ví dụ nghiệm thu giả lập: A là DDs, assigned Fire, có tổng 1.000.000 điểm gồm Fire stage 600.000 và Water stage 400.000. Lọc DDs + Assigned Fire trả A với tổng 1.000.000. Lọc thêm Fire stage hiển thị điểm stage 600.000, tổng mùa vẫn 1.000.000. Không suy ra stage type từ hệ pair trong team. Đã chốt stage type theo weakness của boss trong cấu hình mùa. Theo khách hàng, phạm vi các mùa GvG hiện tại: mỗi stage có một weakness chung cho team boss. Chỉ dùng một stage weakness để phân loại; xử lý boss đa weakness nằm ngoài phạm vi hiện tại, không tự tách thành nhiều kết quả.

Nghiệm thu: chỉ admin/mod thay đổi role/type; mỗi season/member tối đa một role; mùa A không ảnh hưởng mùa B; member chưa phân vai vẫn xuất hiện ở bộ lọc tất cả/chưa phân vai; điểm chỉ tổng hợp từ log hiện có, giữ chính sách excluded/banned; mỗi log chỉ tính một lần. Bộ lọc phân công dùng phân công hiện tại của mùa; lịch sử main type dùng phân loại hỗ trợ theo đề xuất bên dưới, cần được xác nhận.

#### FR-02R — Review hỗ trợ ngoài main type (thiết kế đề xuất)

Mục tiêu: nhận diện ai hỗ trợ stage khác hệ phụ trách, giữ đầy đủ điểm thực tế và cho staff rà soát. Không quy đổi trọng số đóng góp.

1. Khi log trận, đối chiếu stage weakness với main type hiệu lực tại thời điểm kết thúc trận. Cùng hệ → Main; khác hệ → Support; thiếu phân công/weakness → Unclassified.
2. Support tự xuất hiện trong hàng đợi review của mod/admin. Member có thể thêm lý do hoặc liên kết yêu cầu hỗ trợ; không bắt buộc xin duyệt trước khi log.
3. Trạng thái đề xuất: Pending → Confirmed hoặc Needs correction. Staff lưu người review, thời gian, ghi chú. Không dùng “Rejected” để loại bỏ một trận đã diễn ra.
4. Review chỉ xác nhận nhãn/bối cảnh hỗ trợ. Pending hoặc Needs correction vẫn giữ điểm/vé và tiến độ clear theo log; không làm tắc round. Nếu log sai, sửa qua luồng sửa log và phân quyền riêng.
5. Khi đổi member/stage/timestamp hoặc sửa lịch sử main type khiến bối cảnh thay đổi, tính lại nhãn và đưa về Pending nếu cần review lại. Giữ audit trước–sau.

Dashboard theo member: role, main type hiện tại, tổng điểm mùa, điểm main, điểm hỗ trợ, điểm chưa phân loại, số lượt hỗ trợ và số lượt chờ review. Tổng điểm main + hỗ trợ + chưa phân loại bằng tổng điểm mùa trên cùng chính sách excluded/banned. Bộ lọc stage chỉ thu hẹp tập run, không đổi main type của người đó.

Đề xuất lưu lịch sử hiệu lực main type (valid_from/valid_to) và snapshot phân loại trên run; không cần snapshot role cho mỗi lượt. Nếu thay main type giữa mùa, phải phân biệt đổi từ thời điểm mới với sửa phân công lịch sử. Đây là đề xuất để hỗ trợ review chính xác, chưa phải quy tắc khách hàng đã xác nhận.

Nghiệm thu: member không tự confirm review; role Helper đánh đúng main type vẫn là Main; Support Pending vẫn cộng điểm; chỉnh timestamp qua mốc đổi main type kích hoạt phân loại/review lại; thiếu phân công không bị tự gán Support; thay nhãn không tạo log hoặc điểm trùng.

### FR-03 — Thư viện chiến thuật và video

Phân loại GvG, D.C 3v1, D.C 3v3. Mỗi chiến thuật gồm tiêu đề, mode, boss/weakness, mùa hoặc phiên bản nội dung, điều kiện trận, team, cấu hình tối thiểu, grid tham khảo, rotation, video, tác giả, trạng thái Draft/Pending review/Published/Changes requested/Archived.

Đã chốt bắt buộc mod/admin duyệt trước khi xuất bản. Luồng: tác giả soạn Draft → gửi Pending review → mod/admin duyệt Published hoặc trả Changes requested kèm nhận xét → lọc theo mode/type/boss → so sánh với roster → áp dụng bản sao vào kế hoạch hiện tại. Bản tham khảo có thể chứa pair người dùng chưa sở hữu; bản kế hoạch áp dụng phải kiểm tra roster. Bản sửa nội dung đã xuất bản tạo revision chờ duyệt, giữ bản published hiện tại cho tới khi revision mới được duyệt. Plan cũ tham chiếu đúng phiên bản đã áp dụng. Tác giả không tự vượt luồng duyệt; đề xuất staff có thể duyệt nội dung do staff tạo, chưa yêu cầu hai người độc lập.

Video giai đoạn đầu dùng URL được kiểm tra giao thức và nhà cung cấp; nhúng khi nhà cung cấp cho phép; luôn có link mở ngoài. Không mặc định cần upload/lưu video.

Nghiệm thu: tìm được team theo mode và boss; hiển thị thiếu pair/điều kiện; video lỗi không làm mất rotation dạng chữ; sửa nguồn không âm thầm thay đổi plan đã áp dụng.

### FR-04 — Datamine có sẵn cho round/mùa

Tận dụng gym_data snapshot hiện có. Tính round kế tiếp theo circuitAt và cơ chế lặp hiện tại; hiển thị leader, weakness, rule, focus/gimmick, nguồn và thời điểm cập nhật. Nếu mùa kết thúc hữu hạn thì báo không còn round.

Đã chốt “có gì show nấy”: hiển thị cả dữ liệu round trong mùa hiện tại và mùa sắp tới nếu nguồn có, không bắt buộc chờ đủ bộ dữ liệu. Phân nhóm rõ mùa/round/phiên bản để tránh trộn thông tin. Datamine chưa xác nhận phải được gắn nhãn. Không tự ghi đè snapshot mùa đang vận hành khi nguồn cập nhật; staff xem chênh lệch và chủ động áp dụng.

Nghiệm thu: round hiện tại chưa clear vẫn xem được phần chuẩn bị round sau; thiếu dữ liệu thì báo thiếu; nguồn lỗi vẫn xem được snapshot đã lưu; circuit lặp dùng đúng rule tương ứng.

### FR-05 — Gợi ý pair theo Tier List và Type Move

Hiện tại pairWeight chỉ dựa trên mức đầu tư; readiness còn cộng tiến độ tháp. Đây là heuristic của app, chưa phải tier hay mô phỏng sát thương/rotation.

Đề xuất pipeline: lọc roster sở hữu → đối chiếu type được yêu cầu → kiểm tra điều kiện trận → đối chiếu vai trò/slot → xếp hạng tier theo mode và phiên bản → dùng mức đầu tư để phân xử. Hiển thị lý do gợi ý, nguồn tier và điều kiện còn thiếu. Không coi tier là cam kết thắng.

Đã chốt ưu tiên Tier List TQ khi dữ liệu xếp hạng mâu thuẫn trong cùng mode/role/điều kiện; Spark/Nhật là nguồn tham khảo, không tự trộn thang điểm. Nếu nguồn TQ thiếu/không tương thích, hiển thị chưa có tier và fallback có nhãn, không giả vờ dùng tier TQ.

Type Move vẫn cần chốt là hệ move thường, sync move, B-move hay hệ hiệu dụng sau chuyển đổi. Trường p.type hiện có chưa đủ để khẳng định đáp ứng yêu cầu này. Bản đầu nên hỗ trợ một tiêu chí được thống nhất thay vì suy đoán mọi cơ chế.

Nghiệm thu: không đề xuất pair không sở hữu vào plan; không ghi đè ô đã chọn/đánh dấu không có nếu chưa chủ động yêu cầu; nguồn tier thiếu thì fallback có nhãn; đề xuất là lựa chọn để staff/member duyệt.

### FR-06 — Thời điểm thực tế của log GvG

Tách occurred_at (thời điểm kết thúc trận) khỏi created_at (thời điểm nhập) và updated_at (lần sửa). Lưu UTC, nhập có timezone/offset rõ ràng, hiển thị theo timezone đã chọn. Dữ liệu cũ backfill từ created_at và đánh dấu thời gian suy ra.

Đã chốt: timestamp phục vụ ghi nhận và điều chỉnh lịch sử để phản ánh đúng thời điểm trận của mỗi thành viên. Không dùng thay đổi timestamp để đổi round, cấp vé hoặc tính lại luật điểm/vé. Lịch sử trận hiển thị và sắp xếp theo occurred_at, có id làm khóa phụ khi trùng thời gian; nhật ký thao tác vẫn theo thời gian nhập/sửa thực tế. Quyền sửa theo trạng thái mùa được chốt bên dưới.

Đã chốt quyền timestamp: khi mùa chưa kết thúc, member sửa thời điểm của log mình, mod/admin sửa của mọi thành viên. Sau khi mùa kết thúc, chỉ admin được sửa timestamp của mọi log; member/mod không được sửa. Cần tách cập nhật timestamp khỏi chỉnh score/team/round để không vô tình cấp thêm quyền sửa các trường khác. Ghi lịch sử trước–sau và người sửa. Làm rõ mới nhất: phải hỗ trợ cập nhật lịch sử sau mùa vì các round cuối có thể ghi log không kịp. Quyền sửa timestamp sau mùa của admin đã chốt trước đó vẫn giữ; câu trả lời mới chưa nêu rõ có mở thêm quyền cho member/mod hoặc cho tạo log mới sau mùa hay không. Không mặc định mở các quyền này. Đề xuất một cửa sổ đối soát sau mùa cho gửi log muộn và staff duyệt; chi tiết bên dưới. Timestamp dùng sắp xếp lượt clear trong round đã ghi nhận, không tự suy ra lại round từ thời gian.

Nghiệm thu: nhập trễ không làm mất thời điểm trận; giờ hiển thị đúng khi đổi timezone; chặn thời gian ngoài phạm vi được phép; sửa đồng thời hoặc gửi lặp không tạo điểm/vé trùng; sửa log không tự chuyển round khác.

#### FR-06L — Đối soát log muộn sau mùa (đề xuất cần chốt)

Sửa timestamp của log đã tồn tại không giải quyết trận chưa được nhập. Đề xuất: mùa kết thúc chuyển sang trạng thái đối soát; member gửi yêu cầu bổ sung trận của mình (round, stage, điểm, vé, team, occurred_at và ghi chú), mod/admin kiểm tra và duyệt tạo run. Run chỉ vào điểm/tiến độ khi được duyệt; yêu cầu không phải run tạm nên không tiêu vé trước. Thời hạn đối soát để admin cấu hình, chưa tự đặt số ngày.

Trận được bổ sung phải kết thúc trong thời gian thi đấu của mùa, dù thời điểm nhập/duyệt sau mùa. Luồng duyệt phải kiểm tra lại cap, vé, round và trùng log trong cùng transaction; không mở toàn bộ quyền ghi trực tiếp mùa đã khóa. Nếu timestamp sai thì admin sửa qua quyền đã chốt. Đề xuất audit lý do, người yêu cầu, người duyệt và liên kết run được tạo. Chính sách này cần khách hàng xác nhận trước khi triển khai.

### FR-07 — Pasio Tower Copy

Đã chốt xuất ảnh overview cá nhân để chia sẻ. Ảnh gồm tên/avatar trong app, tiến độ từng hệ, tổng tầng và thời điểm xuất; đề xuất PNG, có tải xuống và Copy Image nếu trình duyệt hỗ trợ. Không đưa thông tin tài khoản riêng tư vào ảnh.

Bổ sung dashboard toàn gym cho mod/admin: bảng thành viên × hệ, tổng tiến độ, bộ lọc thành viên/hệ và thời gian cập nhật. Đây là dashboard theo dõi, chưa có yêu cầu xuất ảnh cả gym hoặc mở dashboard cho member.

Nghiệm thu: ảnh phản ánh dữ liệu đã lưu, chữ rõ và không bị cắt trên mobile; tải ảnh vẫn hoạt động khi Copy Image không hỗ trợ; không xuất nhầm thành viên; member không truy cập dashboard staff qua API; dữ liệu thiếu hiển thị “chưa cập nhật”, không tự coi là 0 nếu không có bản ghi. Trần 40 tầng là hiện trạng code, cần xác minh nguồn khi triển khai.

### FR-08 — Trainer Lodge Helper

Luồng: chọn trainer → tìm/lọc topic/câu trả lời → xem lựa chọn và mức ưu tiên. Nguồn tham khảo đã có Serebii. Ngôn ngữ và phiên bản dữ liệu cần xác định khi khảo sát.

Đã chốt phase đầu ít nhất có tra cứu đáp án tĩnh theo trainer/topic, có nguồn và ngày cập nhật. Phase sau phát triển tư vấn theo lượt; cần định nghĩa mục tiêu tối ưu và trạng thái đầu vào trước khi thiết kế thuật toán. Chỉ phát triển thuật toán khi đủ trạng thái đầu vào và luật được xác minh. Không suy ra có thể gợi ý tối ưu từ danh sách đáp án đơn thuần.

Nghiệm thu: trainer có bộ câu trả lời riêng; dữ liệu chưa có/đã cũ được thể hiện; gợi ý có lý do theo quy tắc được duyệt; tra cứu được trên điện thoại.

### FR-09 — Event và Gems Tracker

Đã chốt dự phóng tổng Free Gems có thể kiếm được, breakdown theo ngày đến cuối tháng. Không tính Paid Gems hoặc số dư/tình trạng thực nhận cá nhân trong phạm vi này.

Tách event (lịch nội dung) khỏi reward entry (ngày phát/khả dụng, số Free Gems, điều kiện nhận, nguồn và mức chắc chắn). Mỗi ngày hiển thị từng nguồn thưởng, tổng ngày, lũy kế và tổng dự phóng phần còn lại của tháng. Phân biệt reward theo ngày với reward một lần trong một khoảng thời gian, tránh gán ngày nhận giả định như lịch phát cố định.

Còn xác định ngày reset server và cách xử lý thưởng một lần đã khả dụng trước hôm nay nhưng còn hạn nhận: đề xuất hiển thị thành nhóm riêng “còn khả dụng”, không tự coi đã nhận hoặc tự cộng vào ngày tương lai. Event qua tháng phân bổ theo lịch thưởng; không dồn toàn bộ vào tháng bắt đầu. Nguồn thiếu ngày/số lượng phải có nhãn chưa đủ dữ liệu.

Nghiệm thu: loại Paid Gems; tổng từng ngày cộng khớp tổng tháng trên cùng bộ dữ liệu; một reward không bị cộng lặp giữa các nguồn/event; đổi timezone hiển thị không làm đổi ngày nghiệp vụ server; lịch sửa tính lại dự phóng và có ngày cập nhật. Không trình bày tổng dự phóng như số Gems chắc chắn tài khoản sẽ nhận.

### FR-10 — Resources

Kho link có phân loại: Tier List Trung Quốc theo role, Spark Tier List, Tier List Nhật (GameWith), tài liệu khác. Metadata: tiêu đề, ngôn ngữ, role/mode, nguồn, tác giả nếu có, ngày hiệu lực, ngày kiểm tra, phiên bản.

Bản đầu quản lý link và bộ lọc. Import dữ liệu có cấu trúc chỉ sau khi xác minh khả năng truy cập, quyền sử dụng và cách ánh xạ pair_id. Không dùng trực tiếp tài liệu văn bản thay đổi tự do làm nguồn xếp hạng runtime.

Nghiệm thu: lọc được theo nhóm/role; phân biệt role nguồn với role chuẩn của app; link hỏng có trạng thái; nếu tier được dùng trong gợi ý phải truy vết được phiên bản.

### FR-11 — Gym Info và timezone

Thêm timezone theo chuẩn IANA vào profile, ví dụ Asia/Ho_Chi_Minh. Member tự chọn, staff cập nhật theo quyền. Danh sách hiển thị giờ địa phương, ngày khi khác ngày người xem, và timezone. Không lưu giờ hiện tại vào database, không dùng offset cố định thay cho timezone.

Nghiệm thu: đổi timezone cập nhật đồng hồ; vùng có DST hiển thị đúng; giá trị sai bị từ chối; chưa khai báo có nhãn rõ ràng; đồng hồ dùng chung timer và cập nhật lại khi trở về tab.

## 5. Mô hình dữ liệu đề xuất

Đây là mô hình logic để trao đổi, chưa phải migration cuối cùng.

| Nhóm | Dữ liệu chính |
|---|---|
| Hồ sơ | profiles.timezone |
| Log | runs.occurred_at, nguồn thời gian; giữ created_at/updated_at phục vụ audit |
| Vai trò | season_members.battle_role (nullable, một trong 5 nhãn); season_members.main_type; main_type_assignment_history theo khoảng hiệu lực (đề xuất), không còn danh sách nhiều assigned type |
| Review hỗ trợ (đề xuất) | run classification Main/Support/Unclassified, phân công tham chiếu, trạng thái review, reviewer/note/audit |
| Log muộn (đề xuất) | late_run_requests, trạng thái duyệt, người duyệt, run_id; cấu hình cửa sổ đối soát mùa |
| Báo cáo điểm | Tổng hợp log hiện có, lọc theo phân công role/type của mùa; không thêm công thức đóng góp |
| Grid | pair_data_versions, grid_builds, grid_build_nodes, share tokens có thể thu hồi |
| Chiến thuật | strategies, strategy_versions, strategy_team_slots, video/resource links |
| Tier | tier_sources, tier_versions, tier_entries theo pair/mode/role/điều kiện |
| Lodge | lodge_trainers/topics/answers và phiên bản nguồn |
| Event/Gems | events, reward_entries; chỉ Free Gems dự phóng theo ngày, chưa cần member_reward_claims |
| Tra cứu | resource_links, resource_categories |
| Kiểm soát | lịch sử sửa log/nội dung, người sửa, thời gian, lý do, trước–sau |
| Tính sát thương/mô phỏng | combat_rule_versions, calculation_configs, simulation_scenarios/steps; tham chiếu snapshot team/build, opponent và seed nếu cần |

Giữ khóa pair_id thống nhất; dữ liệu ngoài cần bảng ánh xạ ổn định. Dữ liệu lịch sử cần snapshot cấu hình quan trọng. Chính sách xóa tài khoản phải giữ log cần thiết như cơ chế member_name hiện có. Nếu muốn mở rộng nhiều gym cần thiết kế gym_id và cô lập RLS trước khi thêm dữ liệu chia sẻ; chưa đưa việc này vào phạm vi mặc định.

## 6. Phụ thuộc và rủi ro triển khai

1. Dữ liệu game chi tiết là phụ thuộc chính của Grid, Moves/Passives, Lodge và gợi ý đội hình. Cần kiểm chứng nguồn trước khi chốt thiết kế và khối lượng.
2. Tier phải được chuẩn hóa trước khi dùng để đề xuất; tạo trang Resources không tự giải quyết bài toán xếp hạng.
3. Role, điểm mặc định, stage type theo boss weakness và quyền timestamp sau mùa đã chốt. Timestamp chỉ phục vụ lịch sử, không thay luật vé/round; cần kiểm tra ngoại lệ admin tại database; luồng log muộn sau mùa cần xác nhận chính sách riêng.
4. Mọi thay đổi phải cập nhật cả Supabase API và demo backend, i18n Anh/Việt, RLS/trigger và màn hình. Kiểm tra quyền bằng API trực tiếp, không chỉ bằng nút ẩn/hiện.
5. Các kiểm tra cap/vé/round cần tính nguyên tử khi nhiều thành viên log cùng lúc. Đây là tiêu chí xác minh khi phát triển, không phải kết luận đã tìm thấy lỗi đồng thời trong production.
6. Giao diện main.js tập trung lớn; nên tách từng module khi thêm tính năng để kiểm soát ảnh hưởng. Chưa cần đổi framework chỉ để đáp ứng các yêu cầu này.
7. Định dạng link, giới hạn nguồn ngoài và thay đổi schema cần có fallback/cache, trạng thái dữ liệu cũ và thao tác đồng bộ chủ động.

## 7. Backlog và thứ tự đề xuất

| Gói | Phạm vi | Điều kiện để bắt đầu/nghiệm thu |
|---|---|---|
| Discovery | Khảo sát dữ liệu, Type Move, nguồn tier TQ, mẫu rotation; chốt review hỗ trợ và log muộn | Có mẫu đầu vào–đầu ra và chính sách quyền |
| A — Điều phối và tiện ích | Một role + main type/mùa, lọc điểm/stage, review hỗ trợ, timestamp/đối soát, timezone, ảnh Tower và dashboard gym, Resources/HSE | Quyền và review được kiểm tra tại database; log muộn chốt trước triển khai |
| B — Nội dung và tra cứu | Thư viện chiến thuật có duyệt + video, datamine dữ liệu sẵn có, Lodge tĩnh, Free Gems theo ngày | Dữ liệu chuẩn hóa, workflow duyệt và nguồn xác minh |
| C — Grid và gợi ý | Grid Editor + Moves/Passives, tier TQ có phiên bản, gợi ý theo Type Move | Đủ dữ liệu node/move/tier và checklist tương đương |
| D — Phase sau | Damage Calculator, Battle Simulator, Lodge tư vấn theo lượt | Engine/công thức được kiểm chứng, đặc tả thuật toán và dữ liệu đầy đủ |

Đây là thứ tự đề xuất để trao đổi, chưa là lịch hoặc cam kết ngày công. Calculator/Simulator được phép chuyển phase sau theo làm rõ mới nhất, không là điều kiện nghiệm thu Grid phase đầu. Điểm đóng góp quy đổi và HSE grading không thuộc phạm vi.

## 8. Những điểm còn cần chốt

Các câu hỏi role, stage weakness, timestamp kết thúc trận, ưu tiên tier TQ, duyệt chiến thuật, phạm vi datamine, Tower ảnh/dashboard, Lodge theo phase và Free Gems đã có câu trả lời; không hỏi lại.

1. Review hỗ trợ: có đồng ý tự nhận diện Main/Support theo main type tại lúc kết thúc trận, mod/admin review và trạng thái review không làm thay đổi điểm thực tế không? Có cần lưu lịch sử hiệu lực main type khi chuyển phân công giữa mùa không?
2. Log muộn: sau mùa member/mod được sửa timestamp trực tiếp hay vẫn chỉ admin như đã chốt trước? Có cần tạo log mới sau mùa, và có đồng ý luồng gửi yêu cầu → staff duyệt trong FR-06L không?
3. Type Move: áp dụng move thường, sync, B-move hay hệ sau chuyển đổi? Việc ưu tiên tier TQ đã chốt, chưa giải đáp tiêu chí Type Move.
4. Public share build có cần cho người chưa đăng nhập không?
5. Các chi tiết để thiết kế: ngày reset Gems, reward còn hạn trước hôm nay, ngôn ngữ Lodge, mẫu ảnh Tower và mẫu import chiến thuật. Có thể đề xuất phương án khi làm từng module, không cần chặn toàn bộ phân tích.

## 9. Bộ tình huống UAT tối thiểu

- Trong mùa: member sửa timestamp của mình; mod/admin sửa mọi log. Sau mùa: chỉ admin sửa timestamp; quyền sửa score/team/round không được mở theo ngoại lệ này.
- Sửa timestamp qua ranh giới ngày/mùa không phá quy tắc vé/round đã thống nhất; truy được trước–sau.
- Mỗi member một role/main type trong mùa; Support ngoài hệ tách biệt role Helper; review không đổi điểm/vé; chuyển phân công không làm mất lịch sử hỗ trợ.
- Chiến thuật chưa duyệt không xuất hiện ở thư viện published; sửa published tạo revision chờ duyệt.
- Log muộn không được âm thầm bỏ qua khóa mùa/cap/vé và không tạo trùng khi duyệt lặp.
- Tower xuất PNG rõ, dashboard gym chỉ mod/admin; Copy Image lỗi có tải xuống thay thế.
- Team thư viện thiếu pair vẫn xem được, nhưng áp dụng plan phải xử lý rõ phần thiếu.
- Tier nguồn thay đổi không âm thầm đổi đội đã chốt; đề xuất có giải thích/fallback.
- Grid thiếu điều kiện không bị trình bày thành build dùng được; link thu hồi không còn xem được.
- Free Gems breakdown theo ngày khớp tổng; loại Paid Gems; thưởng có điều kiện/còn hạn và event qua tháng không cộng lặp.
- Timezone khác ngày/DST và người chưa khai báo hiển thị đúng.
- Nguồn dữ liệu/video lỗi vẫn giữ được phần thông tin đã lưu.
- Các luồng mới hoạt động cả demo và backend thật, tiếng Anh/Việt và màn hình điện thoại.

## 10. Dấu vết mã nguồn đã đối chiếu

- src/main.js: renderOverview, runForm/submit run-editor, renderInfo, planLeaders, planStrategy, planFacilitator, renderRoster, towerTab, renderMember.
- src/api.js: profiles, runs, assignments, facilitators, sheet, tower, seasons và results.
- src/catalog.js: loadCatalog chỉ chuẩn hóa metadata pair; loadTags lấy WTZ/rebuff; loadGyms/seasonFromGym và leaderRule/leaderFocus phục vụ datamine.
- src/rules.js: circuitAt, seasonState, validateRun, pairWeight, readiness, suggestTeam.
- src/sheet.js: SHEET_SLOTS, rankForSlot, autoFill, suggestFacilitator.
- supabase/migrations/20260929000000_gym_manager.sql: schema, RLS và trigger nghiệp vụ; migration 20261021000000_sub_dps_split.sql: chuyển slot sub-DPS.
- README.md, src/demo.js, test/e2e.html và supabase/tests/: kiến trúc, backend demo và kiểm thử hiện có; chưa chạy trong đợt phân tích này.


## 11. Danh mục tham khảo bổ sung và kết quả khảo sát

Trạng thái ngày 26/10/2026. Đọc được trang không đồng nghĩa đã kiểm chứng toàn bộ tính năng, thuật toán hoặc có dữ liệu đồng bộ được.

| Nguồn | URL | Kết quả và vai trò trong đặc tả |
|---|---|---|
| PoMastersTool | https://www.pomatools.site/#/ | Đã mở bằng trình duyệt, thấy mục chọn ngôn ngữ và ngoại hình sáng/tối/theo hệ thống. Đã vào /#/sync và thấy grid, chỉ số energy, node và các mục thông tin pair/damage. Chưa khảo sát hết các thiết lập. Nhận xét “không có settings” của khách hàng được hiểu là mong muốn tùy chỉnh nhiều hơn, nhất là kích thước node; không dùng làm kết luận tuyệt đối về phiên bản hiện tại. |
| PoMaTools cũ | https://pomatools.github.io/#/pairs/900000/2500 | Công cụ đọc web chỉ nhận thông báo cần JavaScript. Node vừa phải và settings dễ dùng là đánh giá do người dùng cung cấp; chưa xác minh trực tiếp tình trạng cập nhật. |
| Pasio Tower | https://www.pomatowers.com/tracker | Chưa đọc được trang qua công cụ web. Dùng làm tham chiếu tracker/overview/copy theo yêu cầu, chưa coi checklist tương đương là hoàn tất. |
| Lodge Topics | https://www.serebii.net/pokemonmasters/trainerlodgetopics.shtml | Đọc được trang nội dung dài theo trainer/topic. Đây là nguồn tra cứu; chưa đủ để xác nhận thuật toán lựa chọn tuần tự tối ưu. |
| D.C Ranking | https://docs.google.com/spreadsheets/d/14C_CPMRC8xHslf7id6wMqTdQeCvPA-_X4w9URrHNRzE/edit?gid=1658000195 | Không đọc được nội dung bằng công cụ web; chưa kết luận tài liệu riêng tư. Dự kiến nguồn thư viện D.C/video. |
| GvG Clear List | https://docs.google.com/spreadsheets/d/1MxUU8SIMW7-EfehXIETsvXC5rlcRPinuHJkayrgr0xQ/edit?gid=617849742 | Không đọc được nội dung bằng công cụ web. Dự kiến nguồn thư viện GvG/video. |
| Gems Sheet | https://docs.google.com/spreadsheets/d/1Vu8af6bU3hXuHCDZHr-ppVwkVjJfO2QZ3iSitcViYts/edit | Không đọc được nội dung bằng công cụ web. Chưa xác định được cột, quy tắc tính, chu kỳ cập nhật. |
| Event Programme | https://pokemon.brybry.ch/masters/programme.html | Đọc được bộ chọn ngày đầu/cuối và thao tác tải dữ liệu; nội dung event chưa hiển thị trong kết quả đọc. Chưa xác minh API/format tải. |
| Tier TQ | https://docs.qq.com/sheet/DSWp2aXZHSUphT1lW?tab=n44aze | Đọc được giao diện tài liệu và tên tab, chưa đọc được nội dung ô tier. |
| Spark Tier | https://docs.google.com/document/u/0/d/1vF42uzF-xpkcfIU2gVEY4Dl7sS_I3ITj8g5X2lo1usA/mobilebasic | Chưa đọc được nội dung. Chưa xác định phân loại hoặc ánh xạ pair. |
| Tier Nhật | https://gamewith.jp/pokemonmasters/article/show/164462 | Đọc được bài xếp hạng và tiêu chí đánh giá. Là một nguồn độc lập, không mặc định quy đổi cùng thang TQ/Spark. |
| HSE | https://docs.google.com/spreadsheets/d/1B4sI4jcaSJzKBZ4kZlXSAU9VOLMG7BUxXnr5eW8crn0/edit?gid=223785772 | Nguồn bổ sung mới: High Score Grading. Chưa đọc được nội dung. Đã chốt chỉ đưa vào trang Resources dạng tài liệu tham khảo; không xây công cụ HSE grading. |

### Yêu cầu UX cho Grid đã rút ra từ phản hồi khách hàng

- Grid tương tác trực tiếp trong app; node kích thước vừa phải, có điều chỉnh scale/zoom và thao tác phù hợp màn hình điện thoại.
- Cho phép xem mô tả node rõ ràng khi chạm/click; không phụ thuộc hover trên mobile.
- Tận dụng Settings sáng/tối và giao diện hiện có; lưu tùy chọn grid theo người dùng hoặc thiết bị, cần quyết định khi thiết kế.
- Tạo, đặt tên, lưu nhiều build/pair và chia sẻ; dữ liệu game cập nhật có phiên bản.
- Moves/Passives hiển thị cùng ngữ cảnh pair/build. Damage calculator và battle simulator nội bộ liên kết cấu hình pair/build/team, được phép để phase sau theo làm rõ mới nhất. Cần khảo sát chi tiết để lập checklist tương đương từng chức năng.

### Quy tắc tích hợp nội dung ngoài

Thư viện nội bộ cần lưu dữ liệu chuẩn hóa và liên kết nguồn, thay vì chỉ nhúng nguyên trang. Bảng nguồn cần khảo sát cột, pair ID, type, mode, score, cấu hình yêu cầu, rotation/video, ngày cập nhật và cách phát hiện bản ghi trùng trước khi thiết kế import. Giữ bản ghi nguồn và phiên bản để staff rà soát thay đổi; chưa giả định đồng bộ tự động từ tài liệu chưa đọc được.


## 12. Quyết định phạm vi mới nhất — Business Clarifications

Bản làm rõ mới nhất thay thế các giả định cũ: một main type/member/mùa, ngoài hệ là hỗ trợ và cần cơ chế review; mỗi stage hiện tại một weakness chung; timestamp là lúc kết thúc trận và cần hỗ trợ đối soát sau mùa; Calculator/Simulator có thể ở phase sau; tier TQ ưu tiên; chiến thuật phải qua mod/admin; datamine có dữ liệu nào hiển thị dữ liệu đó; Tower xuất ảnh cá nhân và dashboard toàn gym cho staff; Lodge tĩnh trước, tư vấn theo lượt sau; chỉ dự phóng Free Gems theo ngày; HSE chỉ tham khảo.

Quyền sửa timestamp sau mùa trước đó là admin; phản hồi mới chưa chỉ rõ mở thêm quyền cho ai. Giữ chính sách cũ cho sửa trực tiếp và tách đề xuất log muộn để khách hàng xác nhận, không suy diễn thành mở khóa mọi log. Các cơ chế FR-02R/FR-06L là thiết kế BA đề xuất. Tài liệu chưa đồng nghĩa tính năng đã được triển khai.
