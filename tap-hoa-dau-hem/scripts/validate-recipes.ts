import { validateRecipes } from '../src/core/recipes';

const errors = validateRecipes();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('recipes.json hợp lệ.');
}
