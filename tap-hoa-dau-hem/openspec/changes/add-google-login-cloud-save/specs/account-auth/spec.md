## ADDED Requirements

### Requirement: Chơi khách không cần đăng nhập
Game SHALL cho chơi đầy đủ mà không cần đăng nhập; SDK Firebase MUST không được tải cho tới khi người chơi bấm đăng nhập hoặc đã từng đăng nhập trên thiết bị đó.

#### Scenario: Người chơi mới
- **WHEN** người chơi mở game lần đầu
- **THEN** vào chơi được ngay và không có yêu cầu mạng nào tới Firebase

### Requirement: Đăng nhập bằng Google
Màn tiêu đề và màn Cài đặt SHALL có nút "Đăng nhập Google để lưu tiến trình"; desktop dùng popup, điện thoại dùng redirect; đăng nhập được giữ cho các lần mở sau.

#### Scenario: Đăng nhập thành công
- **WHEN** người chơi bấm nút và chọn tài khoản Google
- **THEN** HUD hiện ảnh đại diện nhỏ, màn Tài khoản hiện tên Google và trạng thái "Đã đồng bộ"

#### Scenario: Hủy đăng nhập
- **WHEN** người chơi đóng cửa sổ Google hoặc từ chối
- **THEN** game quay lại chế độ khách, không mất tiến trình và hiện "Chưa đăng nhập"

#### Scenario: Mở lại game
- **WHEN** người chơi đã đăng nhập hôm trước mở lại game
- **THEN** game tự đăng nhập, không cần bấm lại

### Requirement: Gắn tiến trình khách vào tài khoản
Khi người chơi khách đăng nhập lần đầu, hệ thống SHALL gắn tiến trình trên máy vào tài khoản theo luật đồng bộ của cloud-save.

#### Scenario: Tài khoản mới
- **WHEN** người chơi khách level 3 đăng nhập bằng tài khoản chưa có dữ liệu cloud
- **THEN** tiến trình level 3 được đẩy lên cloud và gắn với tài khoản

### Requirement: Trình duyệt trong app
Khi phát hiện trình duyệt nhúng (Facebook, Messenger, Instagram, Zalo, TikTok, Line, Android WebView), game MUST không gọi đăng nhập Google mà hiện hướng dẫn mở bằng Chrome/Safari, kèm nút sao chép link (và nút mở Chrome trên Android).

#### Scenario: Mở từ Messenger
- **WHEN** người chơi mở game từ link trong Messenger và bấm đăng nhập
- **THEN** hiện "Google không cho đăng nhập trong Messenger. Bấm ⋯ → Mở bằng trình duyệt" và nút "Sao chép link"

#### Scenario: Vẫn chơi khách
- **WHEN** người chơi đóng hướng dẫn
- **THEN** tiếp tục chơi khách bình thường

### Requirement: Đăng xuất
Màn Tài khoản SHALL có nút Đăng xuất; trước khi đăng xuất hệ thống MUST thử đồng bộ lần cuối và cảnh báo nếu còn thay đổi chưa đồng bộ.

#### Scenario: Còn thay đổi chưa đồng bộ khi mất mạng
- **WHEN** người chơi bấm Đăng xuất khi đang mất mạng và bản lưu còn `dirty`
- **THEN** hiện "Tiến trình gần nhất chưa lên cloud. Vẫn đăng xuất?" với lựa chọn Hủy / Vẫn đăng xuất

#### Scenario: Sau khi đăng xuất
- **WHEN** đăng xuất xong
- **THEN** bản local vẫn giữ để chơi khách, và cờ tự tải Firebase bị xóa

### Requirement: Xóa tài khoản và dữ liệu
Màn Tài khoản SHALL có "Xóa tài khoản và dữ liệu cloud" với xác nhận hai bước; hệ thống xóa toàn bộ dữ liệu `users/{uid}` rồi xóa tài khoản Firebase, yêu cầu đăng nhập lại nếu phiên quá cũ.

#### Scenario: Xóa thành công
- **WHEN** người chơi xác nhận hai lần
- **THEN** dữ liệu cloud và tài khoản bị xóa, game hỏi có xóa luôn bản trên máy không

#### Scenario: Phiên quá cũ
- **WHEN** Firebase trả lỗi cần đăng nhập gần đây
- **THEN** game yêu cầu đăng nhập Google lại rồi tự thực hiện xóa tiếp

### Requirement: Chính sách quyền riêng tư
Game SHALL có trang `privacy.html` bằng tiếng Việt nêu dữ liệu thu thập (mã tài khoản Google, tiến trình game), mục đích, nơi lưu (Google Firebase), cách xóa; màn Tài khoản và màn đồng ý OAuth MUST liên kết tới trang này.

#### Scenario: Xem chính sách
- **WHEN** người chơi bấm "Quyền riêng tư" ở màn Tài khoản
- **THEN** trang chính sách mở trong tab mới
