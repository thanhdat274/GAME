import events from '../src/data/events.json';
import { validateEventsData } from '../src/core/effects';

const errors = validateEventsData(events);
if (errors.length) throw new Error(errors.join('\n'));
console.log(`events.json hợp lệ (${events.seasonal.length} sự kiện theo mùa, ${events.random.length} sự kiện ngẫu nhiên).`);
