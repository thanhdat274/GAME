import { validateContent } from '../src/core/content';

const errors = validateContent();
if (errors.length) {
  console.error(`Dữ liệu nội dung có ${errors.length} lỗi:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Dữ liệu nội dung (src/data/*.json) hợp lệ.');
}
