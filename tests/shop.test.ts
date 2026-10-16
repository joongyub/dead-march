import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { freshSave, migrate, save } from '../src/game/save';
import { AD_REWARD_MULTIPLIER, adBonus, grantAdBonus, grantProduct, PRODUCTS, restoreProducts } from '../src/game/shop';

beforeEach(() => {
  save.data = freshSave();
});

test('shop data: two products, the ad doubles rewards', () => {
  assert.equal(AD_REWARD_MULTIPLIER, 2);
  assert.deepEqual(
    PRODUCTS.map((p) => [p.id, p.type]),
    [
      ['remove_ads', 'nonConsumable'],
      ['supply_crate', 'consumable'],
    ],
  );
  for (const p of PRODUCTS) assert.match(p.webPrice, /^₩[\d,]+$/);
});

test('remove ads is granted once and remembered', () => {
  assert.equal(grantProduct('remove_ads'), true);
  assert.equal(save.data.shop.noAds, true);
  assert.deepEqual(save.data.shop.owned, ['remove_ads']);
  assert.equal(grantProduct('remove_ads'), false);
  assert.deepEqual(save.data.shop.owned, ['remove_ads']);
});

test('supply crate adds resources every time', () => {
  grantProduct('supply_crate');
  grantProduct('supply_crate');
  assert.deepEqual(save.data.resources, { food: 800, scrap: 800, fuel: 60 });
  assert.equal(save.data.shop.noAds, false);
  assert.deepEqual(save.data.shop.owned, []);
});

test('restore only brings back missing non-consumables', () => {
  assert.deepEqual(restoreProducts(['supply_crate', 'remove_ads']), ['remove_ads']);
  assert.equal(save.data.resources.food, 0);
  assert.deepEqual(restoreProducts(['remove_ads']), []);
});

test('ad bonus equals the reward again, added on top', () => {
  save.data.resources = { food: 10, scrap: 20, fuel: 0 };
  const reward = { food: 75, scrap: 120, fuel: 9 };
  assert.deepEqual(adBonus(reward), reward);
  grantAdBonus(reward);
  assert.deepEqual(save.data.resources, { food: 85, scrap: 140, fuel: 9 });
});

test('old saves get an empty shop', () => {
  const data = migrate({ version: 2, unlocked: 3, shop: { noAds: true } });
  assert.deepEqual(data.shop, { noAds: true, owned: [] });
  assert.deepEqual(migrate({ version: 2 }).shop, { noAds: false, owned: [] });
});
