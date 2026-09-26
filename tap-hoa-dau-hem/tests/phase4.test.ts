import { describe, expect, it } from 'vitest';
import { calendarDate, seasonDemandMultiplier } from '../src/core/calendar';
import { EffectStack, validateEventsData } from '../src/core/effects';
import { scheduleEvents } from '../src/core/eventScheduler';
import { activateStore, addStoreSnapshot, createNewGame, lotsFrom } from '../src/core/state';
import { migrate } from '../src/core/save';
import saveV4 from './fixtures/save-v4.json';
import eventData from '../src/data/events.json';
import { DATA } from '../src/core/data';
import { endDay } from '../src/core/day';
import { validateRecipes, prepareRecipe, setRecipeActive } from '../src/core/recipes';

describe('nền tảng phase 4a', () => {
  it('lịch 10 ngày/tháng, 12 tháng/năm; ngày cũ bắt đầu ở tháng 3', () => {
    expect(calendarDate(10)).toMatchObject({ day: 10, month: 1, year: 1 });
    expect(calendarDate(11)).toMatchObject({ day: 1, month: 2, year: 1 });
    expect(calendarDate(1, { month: 3, year: 1 })).toMatchObject({ day: 1, month: 3, year: 1 });
    expect(calendarDate(101)).toMatchObject({ day: 1, month: 11, year: 1 });
    expect(calendarDate(111)).toMatchObject({ day: 1, month: 12, year: 1 });
    expect(calendarDate(121)).toMatchObject({ day: 1, month: 1, year: 2 });
  });

  it('mùa hè/đông lấy hệ số từ calendar.json', () => {
    expect(seasonDemandMultiplier('summer', 'drink')).toBe(1.8);
    expect(seasonDemandMultiplier('summer', 'frozen')).toBe(2);
    expect(seasonDemandMultiplier('winter', 'dry')).toBe(1.3);
    expect(seasonDemandMultiplier('spring', 'drink')).toBe(1);
  });

  it('EffectStack nhân các hiệu ứng đồng thời và mặc định là 1', () => {
    const base = EffectStack.forDay(1, 1, 1, []);
    expect(base.multiply('trafficMul')).toBe(1);
    const effects = new EffectStack([{ trafficMul: 3 }, { trafficMul: 0.6 }, { demandCategory: { snack: 2 } }]);
    expect(effects.multiply('trafficMul')).toBeCloseTo(1.8);
    expect(effects.demand('snack')).toBe(2);
  });

  it('kiểm tra cấu trúc events.json và từ chối event sai', () => {
    expect(validateEventsData({ seasonal: [{ id: 'tet', name: 'Tết', dialog: 'Tết đến.', duration: 7, start: { month: 1, day: 1 }, end: { month: 1, day: 7 }, effects: [] }], random: [{ id: 'rain', name: 'Mưa', dialog: 'Trời mưa.', duration: 1, chance: 0.2, effects: [] }] })).toEqual([]);
    expect(validateEventsData(eventData)).toEqual([]);
    expect(validateEventsData({ seasonal: [{ id: 'bad', duration: 0, effects: [] }], random: [{ id: 'bad', duration: 1, chance: 2, effects: [] }] })).not.toEqual([]);
  });

  it('migrate v4 → v5 giữ dữ liệu nhân viên và đóng gói tiệm chính', () => {
    const state = migrate(structuredClone(saveV4) as unknown as { version: number; state: Record<string, unknown> });
    expect(state.version).toBe(5);
    expect(state.money).toBe(2450000);
    expect(state.level).toBe(20);
    expect(state.calendarStartMonth).toBe(3);
    expect(state.activeStoreId).toBe('main');
    expect(state.stores).toHaveLength(1);
    expect(state.staff[0].name).toBe('Bé Lan');
    expect(state.stores[0].data.staff).toEqual(state.staff);
    expect(JSON.stringify(state).length).toBeLessThan(1_000_000);
  });

  it('cửa hàng có kho và nhân viên riêng nhưng dùng chung tiền/level', () => {
    const state = createNewGame();
    state.warehouse = lotsFrom({ mi_goi: 30 });
    state.money = 900000;
    state.level = 30;
    expect(addStoreSnapshot(state, { id: 'market', name: 'Tiệm Chợ', kind: 'market' })).toBe(true);
    expect(activateStore(state, 'market')).toBe(true);
    state.warehouse = lotsFrom({ gao: 20 });
    state.money -= 100000;
    expect(activateStore(state, 'main')).toBe(true);
    expect(state.warehouse[0].productId).toBe('mi_goi');
    expect(state.money).toBe(800000);
    expect(state.level).toBe(30);
    expect(activateStore(state, 'market')).toBe(true);
    expect(state.warehouse[0].productId).toBe('gao');
  });

  it('sự kiện mùa được lập lịch theo lịch game và sự kiện ngẫu nhiên tối đa một lần/ngày', () => {
    const state = createNewGame();
    state.level = 22;
    state.day = 41;
    state.calendarStartMonth = 1;
    const events = scheduleEvents(state);
    expect(events.some((event) => event.id === 'summer')).toBe(true);
    expect(scheduleEvents(state)).toEqual([]);
    expect(state.activeEvents.filter((event) => event.day === state.day && event.id !== 'summer').length).toBeLessThanOrEqual(1);
    const locked = createNewGame();
    locked.level = 21;
    locked.day = 51;
    locked.calendarStartMonth = 1;
    expect(scheduleEvents(locked).some((event) => event.id === 'summer')).toBe(false);
  });

  it('công thức hợp lệ; chế biến trừ nguyên liệu và đưa thành phẩm ra quầy', () => {
    const state = createNewGame();
    state.level = 21;
    state.fixtures.push({ uid: 99, type: 'food_grill', x: 0, y: 0, rot: 0 });
    state.warehouse = lotsFrom({ xuc_xich: 2 });
    expect(validateRecipes()).toEqual([]);
    expect(setRecipeActive(state, 'xuc_xich_nuong', true)).toBe(true);
    expect(prepareRecipe(state, 'xuc_xich_nuong')).toMatchObject({ ok: true, output: 'xuc_xich_nuong_tp' });
    expect(state.warehouse[0].qty).toBe(1);
    expect(state.counter.some((slot) => slot.productId === 'xuc_xich_nuong_tp' && slot.qty === 1)).toBe(true);
  });

  it('mở chi nhánh trừ tiền chung, tạo kho riêng, ghé lại tiệm chính vẫn giữ kho cũ', async () => {
    const { openBranch, visitStore, simulateBranches } = await import('../src/core/branches');
    const state = createNewGame();
    state.level = 30;
    state.money = 2_000_000;
    state.warehouse = lotsFrom({ mi_goi: 12 });
    expect(openBranch(state, 'market').ok).toBe(true);
    expect(state.activeStoreId).toBe('market');
    expect(state.warehouse).toEqual([]);
    expect(state.money).toBe(1_100_000);
    expect(visitStore(state, 'main')).toBe(true);
    expect(state.warehouse[0].productId).toBe('mi_goi');
    state.stores.find((store) => store.id === 'market')!.data.analytics = [{ profit: 10000 }];
    expect(simulateBranches(state, 1).market).toBe(8370);
    expect(state.money).toBe(1_108_370);
  });

  it('mỗi hồ sơ chi nhánh có lưới và nội thất mặc định riêng, không chặn lối vào', async () => {
    const { openBranch } = await import('../src/core/branches');
    const layouts: string[] = [];
    for (const def of DATA.branches) {
      const state = createNewGame();
      state.level = def.unlockLevel;
      state.money = 5_000_000;
      expect(openBranch(state, def.id).ok).toBe(true);
      expect(state.fixtures.map(({ type, x, y, rot, shelf }) => ({ type, x, y, rot, shelf }))).toEqual(def.defaultLayout);
      expect(state.shelves).toHaveLength(3);
      expect(def.defaultLayout.some((fixture) => fixture.x === 0 && fixture.y === 7)).toBe(false);
      layouts.push(JSON.stringify(def.defaultLayout));
    }
    expect(new Set(layouts).size).toBe(3);
  });

  it('xe hàng trừ kho theo FEFO và giao đến khu nhận ngày sau, giữ hạn dùng', async () => {
    const { openBranch, visitStore, sendBranchShipment } = await import('../src/core/branches');
    const state = createNewGame();
    state.level = 30;
    state.money = 2_000_000;
    state.warehouse = [{ productId: 'banh_tet', qty: 2, exp: 6 }, { productId: 'banh_tet', qty: 3, exp: 9 }];
    expect(openBranch(state, 'market').ok).toBe(true);
    expect(visitStore(state, 'main')).toBe(true);
    expect(sendBranchShipment(state, 'market', 'banh_tet', 4).ok).toBe(true);
    expect(state.warehouse).toEqual([{ productId: 'banh_tet', qty: 1, exp: 9 }]);
    expect(state.branchShipments[0]).toMatchObject({ arriveDay: 2, fee: 900 });
    const { startNextDay } = await import('../src/core/day');
    startNextDay(state);
    const market = state.stores.find((store) => store.id === 'market')!;
    expect(market.data.holding).toEqual([{ productId: 'banh_tet', qty: 2, exp: 6 }, { productId: 'banh_tet', qty: 2, exp: 9 }]);
    expect(state.branchShipments).toHaveLength(0);
  });

  it('cốt truyện yêu cầu mở chương trước khi nhận thưởng', async () => {
    const { beginChapter, claimChapter } = await import('../src/core/story');
    const state = createNewGame();
    const initial = state.money;
    expect(beginChapter(state, 'homecoming')).toBe(true);
    expect(claimChapter(state, 'homecoming')).toBe(false);
    state.lifetime.served = 1;
    expect(claimChapter(state, 'homecoming')).toBe(true);
    expect(state.money).toBe(initial + 50000);
  });

  it('đối thủ làm giảm khách trong 10 ngày và chương cần sao cùng khách quen', async () => {
    const { beginChapter, chapterComplete } = await import('../src/core/story');
    const state = createNewGame();
    state.level = 24;
    state.storyProgress = ['homecoming', 'growing_shop', 'first_helper'];
    expect(beginChapter(state, 'rival_supermarket')).toBe(true);
    expect(state.activeEvents.find((event) => event.id === 'supermarket_rival')?.endsDay).toBe(10);
    state.day = 10;
    state.analytics = Array.from({ length: 10 }, (_, index) => ({ day: index + 1, revenue: 0, profit: 0, cogs: 0, wages: 0, electricity: 0, spoiled: 0, theft: 0, customers: 1, avgRating: 4.8, sold: {}, hourly: [], staff: {}, manager: false }));
    expect(chapterComplete(state, DATA.story.find((chapter) => chapter.id === 'rival_supermarket')!)).toBe(false);
    state.regulars = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`neighbor-${index}`, 1]));
    expect(chapterComplete(state, DATA.story.find((chapter) => chapter.id === 'rival_supermarket')!)).toBe(true);
  });

  it('nhiệm vụ sự kiện tích lũy doanh số và trả thưởng đúng một lần', () => {
    const state = createNewGame();
    state.level = 22;
    state.calendarStartMonth = 1;
    state.activeEvents = [{ id: 'tet', day: 1, endsDay: 7 }];
    state.today.sold.banh_tet = 20;
    const money = state.money;
    endDay(state);
    expect(state.money).toBeGreaterThanOrEqual(money + 60000);
    expect(state.eventRewards).toContain('quest:tet_basket:1');
  });

  it('nhiệm vụ tuần cộng dồn qua nhiều ngày và trao hộp quà khi nhận đủ ba mục tiêu', async () => {
    const { updateWeeklyQuestProgress, claimWeeklyQuest } = await import('../src/core/weeklyQuests');
    const state = createNewGame();
    state.level = 27;
    state.weeklyQuests = { week: 0, giftClaimed: false, list: [
      { id: 'weekly_sales', progress: 0, claimed: false },
      { id: 'weekly_customers', progress: 0, claimed: false },
      { id: 'weekly_revenue', progress: 0, claimed: false },
    ] };
    state.today.sold.mi_goi = 250;
    state.today.served = 70;
    state.today.revenue = 1_500_000;
    updateWeeklyQuestProgress(state);
    expect(state.weeklyQuests.list.map((q) => q.progress)).toEqual([250, 70, 1_500_000]);
    const startingMoney = state.money;
    expect(claimWeeklyQuest(state, 0).ok).toBe(true);
    expect(claimWeeklyQuest(state, 1).ok).toBe(true);
    expect(state.weeklyQuests.giftClaimed).toBe(false);
    expect(claimWeeklyQuest(state, 2).ok).toBe(true);
    expect(state.weeklyQuests.giftClaimed).toBe(true);
    expect(state.money).toBeGreaterThanOrEqual(startingMoney + 425_000);
    expect(state.decorOwned.length).toBeGreaterThan(0);
  });

  it('đơn tiệc chỉ giao khi đủ hàng, tiêu thụ tồn kho và tăng thân thiết khách', async () => {
    const { fulfillPartyOrder } = await import('../src/core/partyOrders');
    const state = createNewGame();
    state.partyOrder = { id: 'party:test', week: 0, customer: 'Cô Sáu', items: { mi_goi: 2, nuoc_ngot: 1 }, offerDay: 1, deadlineDay: 2, rewardMoney: 26000, status: 'accepted' };
    state.warehouse = lotsFrom({ mi_goi: 1 });
    state.shelves[0][0] = { productId: 'mi_goi', qty: 1, lots: [{ qty: 1, exp: null }] };
    state.counter[0] = { productId: 'nuoc_ngot', qty: 1, lots: [{ qty: 1, exp: null }] };
    expect(fulfillPartyOrder(state)).toEqual({ ok: true, reward: 26000 });
    expect(state.warehouse).toEqual([]);
    expect(state.shelves[0][0].qty).toBe(0);
    expect(state.counter[0].qty).toBe(0);
    expect(state.regulars['Cô Sáu']).toBe(1);
    expect(state.partyOrder.status).toBe('fulfilled');
  });

  it('đầu bếp được miễn lương ba ngày đầu, nhân viên khác vẫn nhận lương bình thường', async () => {
    const { payroll } = await import('../src/core/staff');
    const state = createNewGame();
    const staff = (id: string, role: 'chef' | 'barista') => ({
      id, name: id, personality: 'diem_tinh', look: { shirt: '#fff', pants: '#000', hair: '#000', skin: '#fff' }, role,
      stats: { speed: 5, accuracy: 5, friendly: 5, stamina: 5 }, wage: 20000, level: 1, exp: 0, mood: 70,
      hiredDay: 1, streak: 0, lowMoodDays: 0, quitting: false, scoldedDay: null,
      lifetime: { served: 0, mistakes: 0, ratingSum: 0, ratingCount: 0, jobs: 0 },
    });
    state.staff = [staff('chef', 'chef'), staff('barista', 'barista')];
    expect(payroll(state).total).toBe(20000);
  });
});
