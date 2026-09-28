## ADDED Requirements

### Requirement: Hướng dẫn cách chơi tự phục vụ
Màn "Cách chơi" SHALL giải thích vòng bán hàng mới: khách tự chọn hàng theo khu, người chơi giữ khu hàng đầy, quét hàng và thối tiền ở quầy, và đưa hàng sau quầy khi khách xin; trang đầu tiên MUST hiện được với người chơi level 1 mà không nhắc tới tính năng chưa mở.

#### Scenario: Mở hướng dẫn ở level 1
- **WHEN** người chơi mới mở "Cách chơi"
- **THEN** các trang nói về khu hàng, quét hàng và thối tiền, không có trang hàng sau quầy

#### Scenario: Hướng dẫn hàng sau quầy
- **WHEN** người chơi lên level 3 lần đầu
- **THEN** popup mở khóa kèm minh họa ngắn về hàng sau quầy và "Cách chơi" có thêm trang đó
