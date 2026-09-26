import { DATA, type StoryChapter } from './data';
import type { GameState } from './state';

export function chapterAvailable(state: GameState, chapter: StoryChapter): boolean {
  const index = DATA.story.findIndex((item) => item.id === chapter.id);
  return state.level >= chapter.unlockLevel && (index === 0 || state.storyProgress.includes(DATA.story[index - 1].id));
}

export function chapterStarted(state: GameState, id: string): boolean { return state.storyStarted[id] !== undefined; }

export function beginChapter(state: GameState, id: string): boolean {
  const chapter = DATA.story.find((item) => item.id === id);
  if (!chapter || !chapterAvailable(state, chapter) || state.storyProgress.includes(id)) return false;
  if (chapter.rivalDays) {
    state.activeEvents = state.activeEvents.filter((event) => event.id !== 'supermarket_rival');
    state.activeEvents.push({ id: 'supermarket_rival', day: state.day, endsDay: state.day + chapter.rivalDays - 1 });
  }
  state.storyStarted[id] = state.day;
  return true;
}

export function chapterComplete(state: GameState, chapter: StoryChapter): boolean {
  if (!chapterStarted(state, chapter.id)) return false;
  if (chapter.id === 'homecoming') return state.lifetime.served > 0;
  if (chapter.id === 'growing_shop') return state.level >= 10;
  if (chapter.id === 'first_helper') return state.level >= 15 && state.staff.length > 0;
  if (chapter.id === 'rival_supermarket') {
    const start = state.storyStarted[chapter.id] ?? state.day;
    const end = start + (chapter.rivalDays ?? 1) - 1;
    const rivalryDays = state.analytics.filter((record) => record.day >= start && record.day <= end && record.customers > 0);
    const starAverage = rivalryDays.length ? rivalryDays.reduce((sum, record) => sum + record.avgRating, 0) / rivalryDays.length : 0;
    const regularCustomers = Object.keys(state.regulars).length;
    return state.day >= end && starAverage >= 4.5 && regularCustomers >= 20;
  }
  if (chapter.id === 'grandma_visit') {
    const meals = new Set(DATA.recipes.filter((recipe) => recipe.category === 'food').map((recipe) => recipe.output));
    return state.analytics.reduce((total, record) => total + Object.entries(record.sold).reduce((n, [id, qty]) => n + (meals.has(id) ? qty : 0), 0), 0) >= 10;
  }
  if (chapter.id === 'open_chain') return state.stores.some((store) => store.kind !== 'main');
  return false;
}

export function claimChapter(state: GameState, id: string): boolean {
  const chapter = DATA.story.find((item) => item.id === id);
  if (!chapter || state.storyProgress.includes(id) || !chapterComplete(state, chapter)) return false;
  state.storyProgress.push(id);
  state.money += chapter.rewardMoney;
  state.exp += chapter.rewardExp;
  state.today.journal.push({ m: state.clock, t: `Hoàn thành chương ${chapter.chapter}: ${chapter.title}` });
  return true;
}
