import { validateRecipes } from '../src/core/recipes';
import { validateShopTypes } from '../src/core/shopTypes';

const errors = [...validateRecipes(), ...validateShopTypes()];
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('recipes.json và shopTypes.json hợp lệ.');
}
