import type { BuildingId } from '../meta/shelter';
import type { MessageKey } from './ko';

/** English text. Missing keys fail the type check. */
export const en: Record<MessageKey, string> = {
  loading: 'Loading',
  'title.subtitle': 'Zombie Runner',
  'title.tap': 'Tap to start',

  'common.retry': 'Retry',
  'common.lobby': 'Lobby',
  'common.settings': 'Settings',
  'common.close': 'Close',
  'common.level': 'Lv.{n}',

  'lobby.start': 'Deploy',
  'lobby.shelter': 'Shelter',
  'lobby.debugAll': 'Dev: every stage unlocked',
  'lobby.new': 'New: {what}',
  'lobby.best': 'Best: cleared with {n} left',
  'lobby.notCleared': 'Not cleared yet',

  'battle.stress': 'Stress test',
  'battle.boss': 'Boss · {name}',

  'pause.title': 'Paused',
  'pause.resume': 'Resume',

  'settings.sound': 'Sound',
  'settings.vibration': 'Vibration',
  'settings.shake': 'Screen shake',
  'settings.language': 'Language',
  'settings.langAuto': 'Auto',
  'settings.langNote': 'The game restarts to switch language',
  'settings.licenses': 'Open-source licenses',
  'settings.lowSpec': 'Low-spec mode',
  'settings.on': 'On',
  'settings.off': 'Off',
  'battle.no3d': 'This device cannot show the 3D battle',
  'battle.lowSpec': 'Switched to low-spec mode (see Settings)',

  'result.powerLeft': 'Army left {n}',
  'result.kills': 'Zombies killed {n}',
  'result.time': 'Time {t}',
  'result.survived': 'Survived {t}',
  'result.unlocked': 'Stage {n} unlocked!',
  'result.allClear': 'Every stage cleared!',
  'result.upgradeHint': 'Upgrade the shelter to get stronger',
  'result.next': 'Next stage',
  'result.shelter': 'Shelter',
  'result.shelterUpgrade': 'Upgrade shelter',

  'shelter.title': 'Shelter',
  'shelter.start': 'Deploy · Stage {n}',
  'shelter.max': 'Max level',
  'shelter.upgrade': 'Upgrade',
  'shelter.short': 'Not enough resources',

  'effect.wall': 'Starting survivors +{n}',
  'effect.armory': 'Gun damage +{n}%',
  'effect.garage': 'Merge bonus +{n}%',
  'effect.farm': 'Food {n}/h',
  'effect.radio': 'Scrap {s}/h, fuel {f}/h',

  'res.food': 'Food',
  'res.scrap': 'Scrap',
  'res.fuel': 'Fuel',

  'word.merge': 'MERGE!',
  'word.split': 'SPLIT!',
  'word.smash': 'SMASH!',
  'word.kill': 'KILLED!',
  'word.boss': 'BOSS!',
  'word.win': 'VICTORY!',
  'word.lose': 'WIPED OUT',
  'gate.merge': 'MERGE',
  'gate.split': 'SPLIT',

  'tut.swipe': 'Drag left and right to steer',
  'tut.gate': 'Take the gate that grows your army',
  'tut.merge': 'Same units merge into stronger ones',
  'tut.shelterLobby': 'Upgrade buildings in the shelter',
  'tut.shelterTap': 'Tap a building to upgrade it',
  'tut.upgradeTap': 'Tap Upgrade',

  'result.doubleAd': 'Watch ad: 2× reward',
  'result.doubleFree': 'Get 2× reward',
  'result.adLoading': 'Loading ad…',
  'result.adMissed': 'No reward this time. Try again',
  'result.doubled': 'Reward doubled',

  'shop.title': 'Shop',
  'shop.remove_ads.name': 'Remove ads',
  'shop.remove_ads.desc': 'Double battle rewards instantly, no ads',
  'shop.supply_crate.name': 'Supply crate',
  'shop.supply_crate.desc': 'Food 400, scrap 400, fuel 30',
  'shop.owned': 'Owned',
  'shop.restore': 'Restore purchases',
  'shop.waiting': 'Contacting the store…',
  'shop.thanks': '{name} purchased!',
  'shop.cancelled': 'Purchase cancelled',
  'shop.restored': 'Purchases restored',
  'shop.nothingToRestore': 'Nothing to restore',
  'shop.unavailable': 'Could not reach the store',

  'settings.adPrivacy': 'Ad privacy',
  'settings.open': 'Open',

  'fake.adTitle': 'Ad (test)',
  'fake.adBody': 'A real ad plays here\n{n}s',
  'fake.adDone': 'Ad finished',
  'fake.skip': 'Skip',
  'fake.claim': 'Claim reward',
  'fake.payTitle': 'Checkout (test)',
  'fake.payBody': '{name}\n{price}\n\nWeb test: no money is charged',
  'fake.buy': 'Buy',
  'fake.cancel': 'Cancel',
};

export const EN_STAGE_NAMES: readonly string[] = [
  'Abandoned Highway', 'Gas Station Ruins', 'Empty Market', 'School Field', 'Police Station',
  'Subway Entrance', 'Construction Site', 'Hospital Parking', 'Chemical Plant', 'Army Checkpoint',
  'Harbor Warehouse', 'Amusement Park', 'Broken Bridge', 'Shopping Mall', 'Broadcast Tower',
  'Airport Runway', 'Power Plant', 'Lab Outskirts', 'Infection Core', "Queen's Nest",
];

export const EN_STAGE_INTROS: Record<number, string> = {
  1: 'Plus and multiply gates',
  2: 'Minus gates and hordes you can dodge',
  3: 'Merge gates',
  4: 'Barricades',
  5: 'Runner zombies, first boss: Butcher',
  6: 'Split gates and unit gates',
  7: 'Brute zombies',
  8: 'Divide traps and back-to-back raids',
  9: 'Bloater zombies',
  10: 'Boss: Hulk',
  11: 'Barricades across the road',
  12: 'Triple gates',
  15: 'Boss: Abomination',
  20: 'Final boss: Infected Queen',
};

export const EN_UNIT_NAMES: Record<string, string> = {
  survivor: 'Survivor',
  soldier: 'Soldier',
  gunner: 'Machine Gunner',
  tank: 'APC',
};

export const EN_ZOMBIE_NAMES: Record<string, string> = {
  walker: 'Zombie',
  runner: 'Runner',
  brute: 'Brute',
  exploder: 'Bloater',
  alpha: 'Alpha Zombie',
  butcher: 'Butcher',
  hulk: 'Hulk',
  abomination: 'Abomination',
  queen: 'Infected Queen',
};

export const EN_BUILDINGS: Record<BuildingId, { name: string; desc: string }> = {
  wall: { name: 'Wall', desc: 'More survivors march out with you.' },
  armory: { name: 'Armory', desc: 'Every unit deals more gun damage.' },
  garage: { name: 'Garage', desc: 'Merges give you bonus units.' },
  farm: { name: 'Farm', desc: 'Food piles up while you are away (up to 8 hours).' },
  radio: { name: 'Radio Room', desc: 'Supply drops bring scrap and fuel (up to 8 hours).' },
};
