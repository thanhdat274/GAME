import { DATA, validateLevels, validateProducts, type Category, type GameData } from './data';
import events from '../data/events.json';
import { validateEventsData } from './effects';
import { validateRecipes } from './recipes';
import { validateShopTypes } from './shopTypes';

const CATEGORIES: readonly Category[] = ['dry', 'snack', 'household', 'drink', 'fresh', 'frozen', 'counter', 'food', 'beverage'];
const SLOTS = ['sign', 'wall', 'floor', 'counter'];
const QUEST_METRICS = ['soldCategory', 'soldProduct', 'soldTotal', 'served', 'happy', 'revenue', 'itemsScanned', 'counterServed', 'leftAtMost', 'noSpoil', 'debtCollected'];
const WEEKLY_METRICS = ['soldCategory', 'soldTotal', 'served', 'revenue'];
const ACHIEVEMENT_METRICS = ['sold', 'served', 'landsOpened', 'debtsCollected', 'loveStreak', 'taxOnTime'];

type Row = { id?: string };

/** Ghi lỗi gọn: `file.id: nội dung`. */
class Report {
  readonly errors: string[] = [];
  add(at: string, message: string): void { this.errors.push(`${at}: ${message}`); }
}

function ids(list: readonly Row[], file: string, report: Report): Set<string> {
  const seen = new Set<string>();
  list.forEach((item, i) => {
    if (typeof item.id !== 'string' || !item.id) { report.add(`${file}[${i}]`, 'thiếu id'); return; }
    if (seen.has(item.id)) report.add(`${file}.${item.id}`, 'trùng id');
    seen.add(item.id);
  });
  return seen;
}

function num(report: Report, at: string, key: string, value: unknown, min = 0, strict = false): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || (strict ? value <= min : value < min)) report.add(at, `${key} phải là số ${strict ? '>' : '>='} ${min}`);
}

function text(report: Report, at: string, key: string, value: unknown): void {
  if (typeof value !== 'string' || !value.trim()) report.add(at, `thiếu ${key}`);
}

/**
 * Kiểm tra toàn bộ dữ liệu nội dung (src/data/*.json): schema từng file và tham chiếu chéo giữa các file.
 * Trả danh sách lỗi; rỗng nghĩa là hợp lệ. Chỉ chạy ở dev/build/test, không nằm trên đường chơi.
 */
export function validateContent(data: GameData = DATA): string[] {
  const report = new Report();
  const productIds = new Set(data.products.map((p) => p.id));
  const decorIds = ids(data.decor, 'decor', report);
  const furnitureIds = ids(data.furniture, 'furniture', report);
  const customerIds = ids(data.customers, 'customers', report);
  const supplierIds = ids(data.suppliers, 'suppliers', report);
  const plotIds = new Set(data.land.plots.map((p) => p.id));
  const features = new Set(data.levels.levels.flatMap((l) => l.features ?? []));
  const isCategory = (c: string): boolean => (CATEGORIES as readonly string[]).includes(c);

  // Validator có sẵn theo từng file.
  report.errors.push(...validateProducts(data.products));
  report.errors.push(...validateLevels(data.levels));
  report.errors.push(...validateRecipes(data.recipes));
  report.errors.push(...validateShopTypes(data.shopTypes, data.branches));
  report.errors.push(...validateEventsData(events));

  for (const l of data.levels.levels) {
    const at = `levels.${l.level}`;
    for (const c of l.categories) if (!isCategory(c)) report.add(at, `nhóm hàng "${c}" không hợp lệ`);
    num(report, at, 'shelves', l.shelves, 1);
  }

  for (const f of data.furniture) {
    const at = `furniture.${f.id}`;
    text(report, at, 'name', f.name);
    text(report, at, 'icon', f.icon);
    num(report, at, 'w', f.w, 0, true);
    num(report, at, 'h', f.h, 0, true);
    num(report, at, 'cost', f.cost);
    num(report, at, 'slots', f.slots);
    num(report, at, 'power', f.power);
    num(report, at, 'unlockLevel', f.unlockLevel, 1);
    if (f.unlockLevel > data.levels.maxLevel) report.add(at, 'unlockLevel vượt maxLevel');
    if (f.requiresPlot && !plotIds.has(f.requiresPlot)) report.add(at, `requiresPlot "${f.requiresPlot}" không có trong land.json`);
    if ((f.kind === 'shelf' || f.kind === 'fridge' || f.kind === 'freezer') && f.slots <= 0) report.add(at, `${f.kind} cần slots > 0`);
  }

  for (const c of data.customers) {
    const at = `customers.${c.id}`;
    text(report, at, 'name', c.name);
    for (const [cat, weight] of Object.entries(c.prefs)) {
      if (!isCategory(cat)) report.add(at, `prefs có nhóm "${cat}" không hợp lệ`);
      num(report, at, `prefs.${cat}`, weight);
    }
    num(report, at, 'weight', c.weight, 0, true);
    num(report, at, 'patience', c.patience, 0, true);
    num(report, at, 'maxItems', c.maxItems, 0, true);
    for (const key of ['counterRequestChance', 'bargainChance', 'creditChance'] as const) {
      const v = c[key];
      if (v !== undefined && !(v >= 0 && v <= 1)) report.add(at, `${key} phải trong 0..1`);
    }
  }

  for (const s of data.suppliers) {
    const at = `suppliers.${s.id}`;
    text(report, at, 'name', s.name);
    if (!(s.discount >= 0 && s.discount < 1)) report.add(at, 'discount phải trong 0..1');
    num(report, at, 'delayDays', s.delayDays);
    num(report, at, 'minOrder', s.minOrder);
    num(report, at, 'unlockLevel', s.unlockLevel, 1);
    if (!(s.deliverMinute >= 0 && s.deliverMinute < 1440)) report.add(at, 'deliverMinute phải trong 0..1439');
  }
  if (!supplierIds.has('co_tu')) report.add('suppliers', 'thiếu mối sỉ mặc định "co_tu"');

  for (const d of data.decor) {
    const at = `decor.${d.id}`;
    text(report, at, 'name', d.name);
    if (!SLOTS.includes(d.slot)) report.add(at, `slot "${d.slot}" không hợp lệ`);
    num(report, at, 'cost', d.cost);
    num(report, at, 'attraction', d.attraction);
    num(report, at, 'unlockLevel', d.unlockLevel, 1);
  }

  const checkQuest = (file: string, q: { id: string; metric: string; arg?: string; target: number; money: number; exp: number }, metrics: string[]): void => {
    const at = `${file}.${q.id}`;
    if (!metrics.includes(q.metric)) report.add(at, `metric "${q.metric}" không hợp lệ`);
    num(report, at, 'target', q.target, 0, true);
    num(report, at, 'money', q.money);
    num(report, at, 'exp', q.exp);
    if (q.metric === 'soldCategory' && (!q.arg || !isCategory(q.arg))) report.add(at, `arg "${q.arg}" không phải nhóm hàng`);
    if (q.metric === 'soldProduct' && (!q.arg || !productIds.has(q.arg))) report.add(at, `arg "${q.arg}" không phải mặt hàng`);
  };
  ids(data.quests, 'quests', report);
  data.quests.forEach((q) => checkQuest('quests', q, QUEST_METRICS));
  ids(data.weeklyQuests, 'weeklyQuests', report);
  data.weeklyQuests.forEach((q) => checkQuest('weeklyQuests', q, WEEKLY_METRICS));
  ids(data.achievements, 'achievements', report);
  for (const a of data.achievements) {
    const at = `achievements.${a.id}`;
    if (!ACHIEVEMENT_METRICS.includes(a.metric)) report.add(at, `metric "${a.metric}" không hợp lệ`);
    num(report, at, 'target', a.target, 0, true);
    if (a.decor && !decorIds.has(a.decor)) report.add(at, `decor "${a.decor}" không có trong decor.json`);
  }

  ids(data.partyOrders, 'partyOrders', report);
  for (const o of data.partyOrders) {
    const at = `partyOrders.${o.id}`;
    num(report, at, 'deadlineDays', o.deadlineDays, 0, true);
    for (const [key, qty] of Object.entries(o.items)) {
      // Khóa là id mặt hàng, hoặc tên nhóm hàng (đơn tiệc chọn ngẫu nhiên trong nhóm).
      if (!productIds.has(key) && !isCategory(key)) report.add(at, `items có "${key}" không phải mặt hàng hay nhóm hàng`);
      num(report, at, `items.${key}`, qty, 0, true);
    }
  }

  const land = data.land;
  const inGrid = (r: { x: number; y: number; w: number; h: number }): boolean => r.x >= 0 && r.y >= 0 && r.w > 0 && r.h > 0 && r.x + r.w <= land.cols && r.y + r.h <= land.rows;
  land.initial.forEach((r, i) => { if (!inGrid(r)) report.add(`land.initial[${i}]`, 'vùng nằm ngoài lưới'); });
  ids(land.plots, 'land.plots', report);
  for (const p of land.plots) {
    const at = `land.${p.id}`;
    p.rects.forEach((r, i) => { if (!inGrid(r)) report.add(`${at}.rects[${i}]`, 'vùng nằm ngoài lưới'); });
    num(report, at, 'cost', p.cost);
    num(report, at, 'level', p.level, 1);
  }
  for (const f of land.defaultLayout) if (!furnitureIds.has(f.type)) report.add('land.defaultLayout', `nội thất "${f.type}" không tồn tại`);

  const roleIds = new Set(data.staff.roles.map((r) => r.id));
  for (const r of data.staff.roles) {
    if (!features.has(r.unlockFeature)) report.add(`staff.${r.id}`, `unlockFeature "${r.unlockFeature}" không có trong levels.json`);
  }
  if (!roleIds.has(data.staff.fixedCandidate.role)) report.add('staff.fixedCandidate', `role "${data.staff.fixedCandidate.role}" không tồn tại`);
  if (!data.staff.personalities.some((p) => p.id === data.staff.fixedCandidate.personality)) report.add('staff.fixedCandidate', 'personality không tồn tại');

  for (const b of data.branches) {
    if (b.feature && !features.has(b.feature)) report.add(`branches.${b.id}`, `feature "${b.feature}" không có trong levels.json`);
  }
  for (const t of data.shopTypes) {
    for (const c of t.customers) if (!customerIds.has(c)) report.add(`shopTypes.${t.id}`, `khách "${c}" không tồn tại`);
  }

  ids(data.story, 'story', report);
  const chapters = new Set<number>();
  for (const s of data.story) {
    const at = `story.${s.id}`;
    if (chapters.has(s.chapter)) report.add(at, `trùng chapter ${s.chapter}`);
    chapters.add(s.chapter);
    if (!(s.unlockLevel >= 1 && s.unlockLevel <= data.levels.maxLevel)) report.add(at, 'unlockLevel ngoài khoảng level');
    if (!s.dialog?.length) report.add(at, 'thiếu dialog');
  }
  ids(data.titles, 'titles', report);
  data.titles.forEach((t, i) => { if (i > 0 && t.stars <= data.titles[i - 1].stars) report.add(`titles.${t.id}`, 'stars phải tăng dần'); });

  return report.errors;
}
