import type { Customer } from './customers';
import { DATA, product } from './data';
import { recordRating } from './progression';
import type { GameState } from './state';

/** Lý do chính khách nhắc tới trong đánh giá. */
export type ReviewIssue =
  | 'change' | 'missing' | 'notCold' | 'price' | 'bargain' | 'slow' | 'gaveUp' | 'noStock'
  | 'late' | 'onTime' | 'friendly' | 'fast' | 'ok';
export type ReplyKind = 'thanks' | 'sorry' | 'argue';

export interface ReviewReply { kind: ReplyKind; text: string; day: number }

export interface Review {
  id: number;
  day: number;
  /** Giờ trong ngày (phút). */
  minute: number;
  name: string;
  stars: number;
  issue: ReviewIssue;
  text: string;
  productId?: string;
  reply?: ReviewReply;
}

/** Giữ tối đa bấy nhiêu đánh giá gần nhất. */
export const MAX_REVIEWS = 60;
/** Trả lời xin lỗi trong vòng bấy nhiêu ngày thì còn gỡ lại được uy tín. */
export const REPLY_WINDOW_DAYS = 2;
/** Sao "gỡ lại" khi xin lỗi tử tế / sao mất khi cãi khách (tính như một lượt chấm). */
export const SORRY_RATING = 4;
export const ARGUE_RATING = 2;

/** Số giả ngẫu nhiên 0..1 từ các số nguyên (không dùng RNG của phiên bán để không làm lệch mô phỏng). */
export function hash01(...parts: number[]): number {
  let h = 2166136261;
  for (const p of parts) {
    h ^= Math.floor(p) | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  return ((h >>> 0) % 10007) / 10007;
}

function pick<T>(list: T[], r: number): T {
  return list[Math.floor(r * list.length) % list.length];
}

/** Khách chấm càng lệch (rất vui / rất bực) càng hay viết đánh giá. */
export function writeChance(stars: number): number {
  return stars <= 2 ? 0.75 : stars === 3 ? 0.4 : stars === 4 ? 0.3 : 0.45;
}

function productName(id?: string): string {
  if (!id) return 'món mình cần';
  try { return product(id).name.toLowerCase(); } catch { return 'món mình cần'; }
}

const TEXT: Record<ReviewIssue, string[]> = {
  change: ['Thối tiền thiếu, phải nhắc mới đưa lại. Cẩn thận chút nha chủ tiệm.', 'Tính tiền lộn, thối thiếu cho mình. Hơi mất vui.'],
  missing: ['Ghé mua {p} mà hết hàng, phải chạy qua tiệm khác.', 'Kệ trống {p}, lần sau nhập thêm nha.', 'Tiệm dễ thương nhưng hay hết {p} quá.'],
  notCold: ['{P} để tủ mà không lạnh, uống chán ghê.', 'Mua {p} mà còn ấm, trời nóng muốn xỉu.'],
  price: ['{P} bán đắt hơn chỗ khác, mình không lấy.', 'Giá {p} hơi chát nha tiệm ơi.'],
  bargain: ['Xin bớt chút xíu mà không cho, hơi cứng.', 'Mua quen mà không bớt được đồng nào.'],
  slow: ['Chờ tính tiền hơi lâu.', 'Xếp hàng mỏi chân, quầy chậm quá.'],
  gaveUp: ['Đứng chờ mãi không ai tính tiền, bỏ về luôn.', 'Chờ lâu quá, bỏ giỏ lại đi về.'],
  noStock: ['Vào tiệm không có món nào mình cần.', 'Tiệm gì mà trống trơn, không mua được gì.'],
  late: ['Đặt giao hàng mà tới trễ quá.', 'Giao hàng chậm, đồ tới thì hết cần rồi.'],
  onTime: ['Gọi điện đặt là có người giao liền, tiện ghê.', 'Giao hàng nhanh, đúng giờ. Cảm ơn tiệm!'],
  friendly: ['Bạn thu ngân vui vẻ, dễ thương ghê.', 'Nhân viên nhiệt tình, sẽ quay lại!'],
  fast: ['Tính tiền nhanh gọn, đồ đầy đủ. 10 điểm!', 'Tiệm gọn gàng, đủ đồ, chủ nhanh nhẹn.', 'Tiệm đầu hẻm mà cái gì cũng có, tiện ghê.'],
  ok: ['Mua được đồ, tạm ổn.', 'Cũng được, không có gì đặc biệt.', 'Đồ đủ dùng, giá chấp nhận được.'],
};

const REPLY: Record<ReplyKind, Partial<Record<ReviewIssue, string>> & { any: string }> = {
  thanks: {
    any: 'Cảm ơn anh/chị đã ủng hộ tiệm, hẹn gặp lại ạ!',
    friendly: 'Cảm ơn anh/chị, tiệm sẽ khen bạn nhân viên ạ!',
    onTime: 'Cảm ơn anh/chị đã đặt hàng, lần sau cứ gọi tiệm nha!',
  },
  sorry: {
    any: 'Tiệm xin lỗi anh/chị, lần sau tiệm sẽ làm tốt hơn ạ.',
    change: 'Tiệm xin lỗi, anh/chị ghé lại tiệm gửi lại tiền và sẽ đếm kỹ hơn ạ.',
    missing: 'Tiệm xin lỗi, mai tiệm nhập thêm {p} ạ!',
    notCold: 'Tiệm xin lỗi, tiệm sẽ để {p} vào tủ lạnh ngay ạ.',
    price: 'Cảm ơn góp ý, tiệm sẽ xem lại giá {p} ạ.',
    bargain: 'Tiệm xin lỗi, lần sau khách quen tiệm bớt chút nha.',
    slow: 'Tiệm xin lỗi đã để anh/chị chờ, tiệm sẽ thêm người đứng quầy ạ.',
    gaveUp: 'Tiệm xin lỗi đã để anh/chị chờ, tiệm sẽ thêm người đứng quầy ạ.',
    noStock: 'Tiệm xin lỗi, tiệm đang nhập thêm hàng, mời anh/chị ghé lại ạ.',
    late: 'Tiệm xin lỗi vì giao trễ, lần sau tiệm giao sớm hơn ạ.',
  },
  argue: { any: 'Tiệm bán vậy đó, chê thì qua tiệm khác mua!' },
};

function fill(text: string, productId?: string): string {
  const p = productName(productId);
  return text.replace('{p}', p).replace('{P}', p.charAt(0).toUpperCase() + p.slice(1));
}

/** Lý do chính của một lượt chấm sao (theo thứ tự khách hay để ý nhất). */
export function customerIssue(c: Customer, reason: 'served' | 'patience' | 'nothing', stars: number): { issue: ReviewIssue; productId?: string } {
  if (reason === 'patience') return { issue: 'gaveUp' };
  // Món khách tự bỏ (chê đắt / không lạnh) cũng ghi là thiếu, nên tách riêng.
  const missing = c.order.find((line) => line.missing > 0 && !line.declined);
  const notCold = c.order.find((line) => line.declined === 'cold');
  const price = c.order.find((line) => line.declined === 'price');
  if (reason === 'nothing') {
    const first = missing ?? notCold ?? price;
    return first ? { issue: first === missing ? 'missing' : first === notCold ? 'notCold' : 'price', productId: first.productId } : { issue: 'noStock' };
  }
  if (c.shortChanged || c.shortAttempts > 0) return { issue: 'change' };
  if (missing) return { issue: 'missing', productId: missing.productId };
  if (notCold) return { issue: 'notCold', productId: notCold.productId };
  if (price) return { issue: 'price', productId: price.productId };
  if (c.maxStars !== undefined && !c.discountPct && stars <= c.maxStars) return { issue: 'bargain' };
  if (c.patience / c.patienceMax < 0.5) return { issue: 'slow' };
  if (c.bonusStars) return { issue: 'friendly' };
  return { issue: stars >= 5 ? 'fast' : 'ok' };
}

function nextId(state: GameState): number {
  return (state.reviews[0]?.id ?? 0) + 1;
}

/** Thêm một đánh giá (mới nhất đứng đầu), giữ tối đa MAX_REVIEWS. */
export function addReview(state: GameState, r: Omit<Review, 'id' | 'text'> & { text?: string }, salt: number): Review {
  const review: Review = { ...r, id: nextId(state), text: r.text ?? fill(pick(TEXT[r.issue], hash01(salt, state.day, 7)), r.productId) };
  state.reviews.unshift(review);
  if (state.reviews.length > MAX_REVIEWS) state.reviews.length = MAX_REVIEWS;
  return review;
}

/** Khách rời tiệm: có thể để lại đánh giá (không phải ai cũng viết). */
export function maybeCustomerReview(
  state: GameState, c: Customer, reason: 'served' | 'patience' | 'nothing', stars: number,
): Review | null {
  if (hash01(c.id, state.day, 1) >= writeChance(stars)) return null;
  const { issue, productId } = customerIssue(c, reason, stars);
  return addReview(state, { day: state.day, minute: Math.floor(state.clock), name: c.name ?? c.type.name, stars, issue, productId }, c.id);
}

/** Đơn giao hàng: khách đặt qua điện thoại cũng hay chấm. */
export function maybeDeliveryReview(state: GameState, orderId: number, onTime: boolean, stars: number): Review | null {
  if (hash01(orderId, state.day, 2) >= writeChance(stars)) return null;
  return addReview(state, { day: state.day, minute: Math.floor(state.clock), name: 'Khách đặt giao', stars, issue: onTime ? 'onTime' : 'late' }, 5000 + orderId);
}

/** Các cách trả lời hợp với đánh giá. */
export function replyOptions(r: Review): { kind: ReplyKind; label: string; text: string }[] {
  const text = (kind: ReplyKind) => fill(REPLY[kind][r.issue] ?? REPLY[kind].any, r.productId);
  if (r.stars >= 4) return [{ kind: 'thanks', label: '🙏 Cảm ơn', text: text('thanks') }];
  return [
    { kind: 'sorry', label: '🙇 Xin lỗi', text: text('sorry') },
    { kind: 'argue', label: '😤 Cãi lại', text: text('argue') },
  ];
}

export type ReplyEffect = 'recovered' | 'hurt' | 'none';

/**
 * Chủ tiệm trả lời. Xin lỗi tử tế một đánh giá xấu còn mới (≤ 2 ngày): người khác đọc thấy thiện chí,
 * tính như một lượt chấm 4 sao. Cãi khách: tính như một lượt chấm 2 sao. Cảm ơn: chỉ là phép lịch sự.
 */
export function replyToReview(state: GameState, id: number, kind: ReplyKind): ReplyEffect | null {
  const r = state.reviews.find((item) => item.id === id);
  if (!r || r.reply) return null;
  const option = replyOptions(r).find((o) => o.kind === kind);
  if (!option) return null;
  r.reply = { kind, text: option.text, day: state.day };
  if (kind === 'argue') { recordRating(state, ARGUE_RATING); return 'hurt'; }
  if (kind === 'sorry' && state.day - r.day <= REPLY_WINDOW_DAYS) { recordRating(state, SORRY_RATING); return 'recovered'; }
  return 'none';
}

export function unrepliedCount(state: GameState): number {
  return state.reviews.filter((r) => !r.reply).length;
}

/** Số lượt chấm theo từng mức sao (5 → 1) trong cửa sổ tính sao trung bình. */
export function ratingBreakdown(state: GameState): { stars: number; count: number }[] {
  return [5, 4, 3, 2, 1].map((stars) => ({ stars, count: state.ratings.filter((x) => Math.round(x) === stars).length }));
}

export function ratingWindow(): number {
  return DATA.balance.ratingWindow;
}
