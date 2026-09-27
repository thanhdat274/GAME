import { defineConfig } from 'vitest/config';

// Test quy tắc Firestore và Cloud Functions trong Firebase Emulator: `npm run test:emulator`.
export default defineConfig({
  test: {
    include: ['tests-emulator/**/*.{rules,functions}.ts'],
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
