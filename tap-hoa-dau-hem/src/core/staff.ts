import { DATA, hasFeature, type StaffRole, type StaffStats, type StatKey } from './data';
import { Rng, daySeed } from './rng';
import { doubleShift, removeFromSchedule, scheduleEnabled, setShift, shiftsOn, weekday, SHIFTS } from './schedule';
import type { Candidate, GameState, Staff } from './state';

export const STAT_KEYS: StatKey[] = ['speed', 'accuracy', 'friendly', 'stamina'];
export const STAT_NAMES: Record<StatKey, string> = { speed: 'Tốc độ', accuracy: 'Chính xác', friendly: 'Thân thiện', stamina: 'Thể lực' };

const cfg = () => DATA.balance.staff;
const clampStat = (v: number) => Math.max(1, Math.min(10, v));
const roundWage = (v: number) => Math.max(cfg().wageStep, Math.round(v / cfg().wageStep) * cfg().wageStep);

export function roleDef(role: StaffRole) {
  const r = DATA.staff.roles.find((item) => item.id === role);
  if (!r) throw new Error(`Không có vai trò ${role}`);
  return r;
}

export function personalityDef(id: string) {
  return DATA.staff.personalities.find((p) => p.id === id) ?? DATA.staff.personalities[DATA.staff.personalities.length - 1];
}

/** Số chỗ nhân viên theo level (L10: 1, L12: 2, L15: 4, L20: 6). */
export function staffSlots(level: number): number {
  let slots = 0;
  for (const l of DATA.levels.levels) if (l.level <= level && l.staffSlots !== undefined) slots = l.staffSlots;
  return slots;
}

/** Level mở thêm chỗ nhân viên tiếp theo (null: đã tối đa). */
export function nextSlotLevel(level: number): number | null {
  const now = staffSlots(level);
  return DATA.levels.levels.find((l) => l.level > level && (l.staffSlots ?? 0) > now)?.level ?? null;
}

export function roleUnlocked(state: GameState, role: StaffRole): boolean {
  return hasFeature(state.level, roleDef(role).unlockFeature);
}

export function unlockedRoles(state: GameState): StaffRole[] {
  return DATA.staff.roles.filter((r) => hasFeature(state.level, r.unlockFeature)).map((r) => r.id);
}

/** Lương thị trường theo tổng chỉ số (dùng cho lương đề nghị và tâm trạng). */
export function marketWage(stats: StaffStats): number {
  const sum = STAT_KEYS.reduce((acc, k) => acc + stats[k], 0);
  return roundWage(cfg().wageBase + sum * cfg().wagePerStat);
}

// ---------- Bảng ứng viên ----------

function makeCandidate(rng: Rng, id: string, roles: StaffRole[]): Candidate {
  const { min, max } = DATA.staff.statRange;
  const role = rng.pick(roles);
  const stats = { speed: rng.int(min, max), accuracy: rng.int(min, max), friendly: rng.int(min, max), stamina: rng.int(min, max) };
  // Ứng viên hợp vai trò: chỉ số chính cao hơn một chút.
  const main = roleDef(role).mainStat;
  stats[main] = clampStat(stats[main] + 1);
  return {
    id,
    name: rng.pick(DATA.staff.names),
    personality: rng.pick(DATA.staff.personalities).id,
    look: rng.pick(DATA.staff.looks),
    role,
    stats,
    wage: marketWage(stats),
  };
}

function fixedCandidate(): Candidate {
  const f = DATA.staff.fixedCandidate;
  return { id: f.id, name: f.name, personality: f.personality, look: f.look, role: f.role, stats: { ...f.stats }, wage: f.wage };
}

/** Tạo/làm mới bảng ứng viên mỗi `refreshDays` ngày; luôn có "Bé Lan" cho tới khi được thuê. */
export function ensureBoard(state: GameState): Candidate[] {
  if (!hasFeature(state.level, 'staff')) return [];
  const board = state.staffBoard;
  if (board && state.day - board.day < cfg().refreshDays) return board.list;
  const rng = new Rng(daySeed(state.day, 0x57aff));
  const roles = unlockedRoles(state);
  const count = rng.int(cfg().candidateMin, cfg().candidateMax);
  const list: Candidate[] = [];
  const names = new Set(state.staff.map((s) => s.name));
  if (!state.fixedCandidateUsed) {
    list.push(fixedCandidate());
    names.add(DATA.staff.fixedCandidate.name);
  }
  for (let i = 0; list.length < count && i < 30; i++) {
    const c = makeCandidate(rng, `c${state.day}_${i}`, roles);
    if (names.has(c.name)) continue;
    names.add(c.name);
    list.push(c);
  }
  state.staffBoard = { day: state.day, list };
  return list;
}

export type HireResult = 'ok' | 'full' | 'missing' | 'role' | 'locked';

export function hire(state: GameState, candidateId: string, role?: StaffRole): HireResult {
  if (!hasFeature(state.level, 'staff')) return 'locked';
  const board = state.staffBoard;
  const c = board?.list.find((item) => item.id === candidateId);
  if (!c || !board) return 'missing';
  if (state.staff.length >= staffSlots(state.level)) return 'full';
  const chosen = role ?? c.role;
  if (!roleUnlocked(state, chosen)) return 'role';
  const staff: Staff = {
    id: c.id,
    name: c.name,
    personality: c.personality,
    look: c.look,
    role: chosen,
    stats: { ...c.stats },
    wage: c.wage,
    level: 1,
    exp: 0,
    mood: cfg().mood.start,
    hiredDay: state.day,
    streak: 0,
    lowMoodDays: 0,
    quitting: false,
    scoldedDay: null,
    lifetime: { served: 0, mistakes: 0, ratingSum: 0, ratingCount: 0, jobs: 0 },
  };
  state.staff.push(staff);
  board.list = board.list.filter((item) => item !== c);
  if (c.id === DATA.staff.fixedCandidate.id) state.fixedCandidateUsed = true;
  // Đã có lịch ca: người mới làm cả tuần (người chơi chỉnh sau).
  if (scheduleEnabled(state)) for (let d = 0; d < 7; d++) for (const s of SHIFTS) setShift(state, staff.id, d, s, true);
  return 'ok';
}

export function staffById(state: GameState, id: string): Staff | undefined {
  return state.staff.find((s) => s.id === id);
}

/** Sa thải: trả thêm lương trợ cấp, xóa khỏi lịch ca. */
export function fire(state: GameState, id: string): number {
  const s = staffById(state, id);
  if (!s) return 0;
  const severance = s.wage * cfg().severanceDays;
  state.money -= severance;
  state.today.wages += severance;
  state.staff = state.staff.filter((item) => item !== s);
  removeFromSchedule(state, id);
  return severance;
}

export function changeRole(state: GameState, id: string, role: StaffRole): boolean {
  const s = staffById(state, id);
  if (!s || !roleUnlocked(state, role)) return false;
  s.role = role;
  return true;
}

// ---------- Chỉ số → hiệu suất ----------

/** Chỉ số hiệu lực trong ngày: tính tính cách và nhắc nhở. */
export function effectiveStat(s: Staff, key: StatKey, day: number): number {
  let v = s.stats[key];
  if (key === 'accuracy') {
    v += personalityDef(s.personality).accuracyMod;
    if (s.scoldedDay === day) v += cfg().scoldAccuracy;
  }
  return clampStat(v);
}

/** Hệ số thời gian làm việc: gốc × (1.4 − 0.08·tốc độ); mệt ÷0.7; tâm trạng thấp ÷0.8. */
export function timeFactor(s: Staff, tired: boolean): number {
  let f = cfg().timeBase - cfg().timePerSpeed * s.stats.speed;
  if (tired) f /= cfg().tiredSpeedMul;
  if (s.mood < cfg().lowMoodThreshold) f /= cfg().lowMoodSpeedMul;
  return f;
}

/** Xác suất thối sai = 12% − 1.1%·chính xác (tối thiểu 1%). */
export function errorChance(s: Staff, day: number): number {
  return Math.max(cfg().errorMin, cfg().errorBase - cfg().errorPerAccuracy * effectiveStat(s, 'accuracy', day));
}

/** Số phút làm trước khi mệt: (3 + 0.5·thể lực) giờ. */
export function tiredAfterMinutes(s: Staff): number {
  return (cfg().staminaBaseHours + cfg().staminaPerPoint * s.stats.stamina) * 60;
}

/** Xác suất khách được +1 sao nhờ nhân viên thân thiện (0.1 mỗi điểm trên 5). */
export function friendlyStarChance(s: Staff): number {
  return Math.max(0, (s.stats.friendly - 5) * cfg().friendlyStarPerPoint);
}

/** Hệ số tip theo thân thiện (+5% mỗi điểm trên 5). */
export function friendlyTipMul(s: Staff): number {
  return 1 + Math.max(0, s.stats.friendly - 5) * cfg().friendlyTipPerPoint;
}

// ---------- EXP và lên cấp ----------

export function expToNext(s: Staff): number {
  return cfg().expPerLevel * s.level;
}

/** Cộng EXP; mỗi lần lên cấp: +1 chỉ số chính, lương +8%. Trả về số cấp vừa lên. */
export function addStaffExp(s: Staff, amount: number): number {
  s.exp += amount;
  let ups = 0;
  while (s.exp >= expToNext(s)) {
    s.exp -= expToNext(s);
    s.level++;
    const main = roleDef(s.role).mainStat;
    s.stats[main] = clampStat(s.stats[main] + 1);
    s.wage = roundWage(s.wage * cfg().levelWageMul);
    ups++;
  }
  return ups;
}

// ---------- Thưởng, nhắc nhở, tâm trạng ----------

function addMood(s: Staff, delta: number): void {
  const gain = delta > 0 ? delta * personalityDef(s.personality).gainMul : delta;
  s.mood = Math.max(0, Math.min(100, Math.round(s.mood + gain)));
}

export function bonusStaff(state: GameState, id: string, amount = cfg().bonusAmount): boolean {
  const s = staffById(state, id);
  if (!s || state.money < amount) return false;
  state.money -= amount;
  state.today.bonuses += amount;
  addMood(s, cfg().mood.bonus);
  return true;
}

export function scoldStaff(state: GameState, id: string): boolean {
  const s = staffById(state, id);
  if (!s || s.scoldedDay === state.day) return false;
  s.scoldedDay = state.day;
  addMood(s, -cfg().mood.scold * personalityDef(s.personality).scoldMul);
  return true;
}

export interface PayrollResult {
  total: number;
  paid: number;
  debt: number;
}

/** Lương cuối ngày cho người có ca (nửa lương mỗi ca); thiếu tiền thì thành nợ lương và mọi người −20 tâm trạng. */
export function payroll(state: GameState): PayrollResult {
  let total = state.wageDebt;
  for (const s of state.staff) {
    if (s.quitting || (s.role === 'chef' && state.day - s.hiredDay < 3)) continue;
    total += Math.round((s.wage * shiftsOn(state, s.id, state.day)) / 2);
  }
  const paid = Math.max(0, Math.min(total, state.money));
  state.money -= paid;
  state.today.wages += paid;
  state.wageDebt = total - paid;
  if (state.wageDebt > 0) for (const s of state.staff) addMood(s, -cfg().mood.unpaid);
  return { total, paid, debt: state.wageDebt };
}

export interface MoodNote {
  staffId: string;
  text: string;
}

/** Cập nhật tâm trạng cuối ngày (lương, ngày nghỉ, làm liên tục, ca đôi, tính cách) và đánh dấu người muốn nghỉ. */
export function updateMoods(state: GameState): MoodNote[] {
  const m = cfg().mood;
  const notes: MoodNote[] = [];
  const dow = weekday(state.day);
  for (const s of state.staff) {
    const p = personalityDef(s.personality);
    const worked = shiftsOn(state, s.id, state.day) > 0;
    if (!worked) {
      s.streak = 0;
      addMood(s, m.dayOff);
    } else {
      s.streak++;
      // Trước khi mở xếp ca người chơi chưa cho nghỉ được, nên chưa trừ tâm trạng vì làm liên tục.
      if (scheduleEnabled(state) && s.streak > m.overworkDays) {
        addMood(s, -m.overworkPenalty * p.overworkMul);
        if (s.streak >= m.tiredBubbleDays) notes.push({ staffId: s.id, text: `${s.name}: "Mệt quá chủ ơi..."` });
      }
      if (scheduleEnabled(state) && doubleShift(state, s.id, dow)) addMood(s, -m.doubleShift * p.overworkMul);
    }
    const wageDelta = Math.max(-m.wageCap, Math.min(m.wageCap, (s.wage / marketWage(s.stats) - 1) * m.wageWeight));
    addMood(s, wageDelta + p.dailyMood);
    s.lowMoodDays = s.mood < m.quitThreshold ? s.lowMoodDays + 1 : 0;
    if (s.lowMoodDays >= m.quitDays && !s.quitting) {
      s.quitting = true;
      notes.push({ staffId: s.id, text: `${s.name} xin nghỉ việc.` });
    }
  }
  return notes;
}

/** Giữ người muốn nghỉ: +15% lương, +30 tâm trạng. */
export function retainStaff(state: GameState, id: string): boolean {
  const s = staffById(state, id);
  if (!s?.quitting) return false;
  s.wage = roundWage(s.wage * (1 + cfg().mood.retainRaise));
  s.mood = Math.min(100, s.mood + cfg().mood.retainMood);
  s.quitting = false;
  s.lowMoodDays = 0;
  return true;
}

/** Để người muốn nghỉ ra đi (không trợ cấp). */
export function letGo(state: GameState, id: string): boolean {
  const s = staffById(state, id);
  if (!s?.quitting) return false;
  state.staff = state.staff.filter((item) => item !== s);
  removeFromSchedule(state, id);
  return true;
}

export function moodLabel(mood: number): { icon: string; text: string } {
  if (mood >= 70) return { icon: '😄', text: 'Vui' };
  if (mood >= cfg().lowMoodThreshold) return { icon: '🙂', text: 'Ổn' };
  if (mood >= cfg().mood.quitThreshold) return { icon: '😓', text: 'Mệt' };
  return { icon: '😠', text: 'Bực' };
}
