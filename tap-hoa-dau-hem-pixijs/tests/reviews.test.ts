import { describe, expect, it } from 'vitest';
import { DATA } from '../src/core/data';
import { DaySession, openShop } from '../src/core/day';
import type { Customer } from '../src/core/customers';
import { averageRating } from '../src/core/progression';
import {
  ARGUE_RATING, MAX_REVIEWS, SORRY_RATING, addReview, customerIssue, ratingBreakdown, replyOptions, replyToReview, unrepliedCount,
} from '../src/core/reviews';
import { activateStore, addStoreSnapshot, createNewGame, lotsFrom } from '../src/core/state';
import { migrate } from '../src/core/save';

function customer(over: Partial<Customer> = {}): Customer {
  return {
    id: 1, type: DATA.customers[0], order: [], patience: 10, patienceMax: 10, status: 'done', bill: 0, total: 0, changeDue: 0,
    changeStartedAt: 0, undos: 0, shortAttempts: 0, penalty: 0, browseIndex: 0, shopBudget: 10, browseTimer: 0, browsePicking: false,
    basketMissing: 0, scanStartedAt: null, autoScanned: false, comboTipEligible: false, counterRequestSeconds: 0,
    counterRequestLeft: null, counterRequestResolved: true, ...over,
  } as Customer;
}

describe('đánh giá cửa hàng', () => {
  it('nêu đúng lý do chính khách chấm sao', () => {
    const line = (o: object) => ({ productId: 'mi_goi', qty: 1, picked: 0, scanned: 0, missing: 0, pickedFrom: [], ...o });
    expect(customerIssue(customer(), 'patience', 1).issue).toBe('gaveUp');
    expect(customerIssue(customer({ order: [line({ missing: 1 })] }), 'nothing', 1)).toEqual({ issue: 'missing', productId: 'mi_goi' });
    expect(customerIssue(customer({ order: [line({ missing: 1, declined: 'price' })] }), 'served', 3)).toEqual({ issue: 'price', productId: 'mi_goi' });
    expect(customerIssue(customer({ order: [line({ missing: 1, declined: 'cold' })] }), 'served', 3).issue).toBe('notCold');
    expect(customerIssue(customer({ shortAttempts: 1 }), 'served', 3).issue).toBe('change');
    expect(customerIssue(customer({ patience: 3 }), 'served', 4).issue).toBe('slow');
    expect(customerIssue(customer(), 'served', 5).issue).toBe('fast');
  });

  it('khách viết đánh giá trong giờ bán; giữ tối đa MAX_REVIEWS', () => {
    const s = createNewGame();
    s.zones = s.zones.map((_, i) => (i < 2 ? 'dry' : null));
    s.shelves[0][0] = { productId: 'mi_goi', qty: 30 };
    s.warehouse = lotsFrom({ mi_goi: 20 });
    s.settings.autoChange = true;
    s.settings.autoScan = true;
    openShop(s);
    const d = new DaySession(s, 11);
    d.autoPlayer = true;
    const posted: number[] = [];
    d.events.on('review', (r) => posted.push(r.id));
    for (let i = 0; i < 20000 && !d.ended; i++) d.tick(0.1);
    expect(s.reviews.length).toBeGreaterThan(0);
    expect(posted.length).toBe(s.reviews.length);
    expect(s.reviews.every((r) => r.text.length > 0 && r.stars >= 1 && r.stars <= 5)).toBe(true);
    for (let i = 0; i < MAX_REVIEWS + 10; i++) addReview(s, { day: 1, minute: 600, name: 'A', stars: 5, issue: 'fast' }, i);
    expect(s.reviews.length).toBe(MAX_REVIEWS);
    expect(s.reviews[0].id).toBeGreaterThan(s.reviews[1].id);
  });

  it('xin lỗi đánh giá xấu còn mới gỡ lại sao; cãi khách thì mất sao; không trả lời hai lần', () => {
    const s = createNewGame();
    s.day = 5;
    s.ratings = [1, 1, 1, 1];
    const bad = addReview(s, { day: 5, minute: 600, name: 'Cô Ba', stars: 1, issue: 'missing', productId: 'mi_goi' }, 1);
    expect(replyOptions(bad).map((o) => o.kind)).toEqual(['sorry', 'argue']);
    expect(unrepliedCount(s)).toBe(1);
    expect(replyToReview(s, bad.id, 'sorry')).toBe('recovered');
    expect(s.ratings.at(-1)).toBe(SORRY_RATING);
    expect(bad.reply?.text).toContain('mì gói');
    expect(replyToReview(s, bad.id, 'argue')).toBeNull();
    expect(unrepliedCount(s)).toBe(0);

    const old = addReview(s, { day: 1, minute: 600, name: 'Chú Tư', stars: 2, issue: 'slow' }, 2);
    const before = s.ratings.length;
    expect(replyToReview(s, old.id, 'sorry')).toBe('none');
    expect(s.ratings.length).toBe(before);

    const rude = addReview(s, { day: 5, minute: 600, name: 'Anh Năm', stars: 2, issue: 'price', productId: 'mi_goi' }, 3);
    const avg = averageRating(s);
    expect(replyToReview(s, rude.id, 'argue')).toBe('hurt');
    expect(s.ratings.at(-1)).toBe(ARGUE_RATING);
    expect(averageRating(s)).not.toBe(avg);

    const good = addReview(s, { day: 5, minute: 600, name: 'Bé Na', stars: 5, issue: 'fast' }, 4);
    expect(replyOptions(good).map((o) => o.kind)).toEqual(['thanks']);
    expect(replyToReview(s, good.id, 'thanks')).toBe('none');
  });

  it('thống kê sao theo mức và bản lưu cũ không có đánh giá', () => {
    const s = createNewGame();
    s.ratings = [5, 5, 4, 1];
    expect(ratingBreakdown(s)).toEqual([{ stars: 5, count: 2 }, { stars: 4, count: 1 }, { stars: 3, count: 0 }, { stars: 2, count: 0 }, { stars: 1, count: 1 }]);
    const raw = structuredClone(createNewGame()) as unknown as Record<string, unknown>;
    delete raw.reviews;
    expect(migrate({ version: raw.version as number, state: raw }).reviews).toEqual([]);
  });

  it('mỗi cửa hàng có đánh giá riêng', () => {
    const s = createNewGame();
    addReview(s, { day: 1, minute: 600, name: 'A', stars: 5, issue: 'fast' }, 1);
    addStoreSnapshot(s, { id: 'b2', name: 'Chi nhánh', kind: 'branch' } as never);
    s.stores.find((x) => x.id === 'b2')!.data.reviews = [];
    activateStore(s, 'b2');
    expect(s.reviews).toEqual([]);
    activateStore(s, 'main');
    expect(s.reviews.length).toBe(1);
  });
});
