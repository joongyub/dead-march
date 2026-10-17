/**
 * Korean text, the source language. Every key here must exist in en.ts (the compiler checks).
 * `{name}` marks a value filled in by t(). Stage, unit, zombie and building names in Korean come from
 * the data files (src/data/*.json); their English names are in en.ts.
 */
export const ko = {
  loading: '불러오는 중',
  'title.subtitle': '데드 마치',
  'title.tap': '화면을 눌러 시작',

  'common.retry': '다시 하기',
  'common.lobby': '로비로',
  'common.settings': '설정',
  'common.close': '닫기',
  'common.level': 'Lv.{n}',

  'lobby.start': '출격',
  'lobby.shelter': '피난처',
  'lobby.debugAll': '개발용: 모든 스테이지 선택 가능',
  'lobby.new': '새로 등장: {what}',
  'lobby.best': '최고 기록: 병력 {n} 남기고 클리어',
  'lobby.notCleared': '아직 깨지 않은 스테이지',

  'battle.stress': '스트레스 테스트',
  'battle.boss': '보스 · {name}',

  'pause.title': '일시정지',
  'pause.resume': '계속하기',

  'settings.sound': '소리',
  'settings.vibration': '진동',
  'settings.shake': '화면 흔들림',
  'settings.language': '언어',
  'settings.langAuto': '자동',
  'settings.langNote': '언어를 바꾸면 게임이 다시 시작돼요',
  'settings.licenses': '오픈소스 라이선스',
  'settings.lowSpec': '저사양 모드',
  'settings.on': '켜기',
  'settings.off': '끄기',
  'battle.no3d': '이 기기는 3D 화면을 지원하지 않아요',
  'battle.lowSpec': '저사양 모드로 바꿨어요 (설정에서 변경)',

  'result.powerLeft': '남은 병력 {n}',
  'result.kills': '처치한 좀비 {n}',
  'result.time': '걸린 시간 {t}',
  'result.survived': '버틴 시간 {t}',
  'result.unlocked': '스테이지 {n} 열림!',
  'result.allClear': '모든 스테이지를 깼습니다!',
  'result.upgradeHint': '피난처를 강화하면 더 강해져요',
  'result.next': '다음 스테이지',
  'result.shelter': '피난처',
  'result.shelterUpgrade': '피난처 강화하기',

  'shelter.title': '피난처',
  'shelter.start': '출격 · 스테이지 {n}',
  'shelter.max': '최고 레벨입니다',
  'shelter.upgrade': '업그레이드',
  'shelter.short': '자원이 부족해요',

  'effect.wall': '시작 생존자 +{n}',
  'effect.armory': '사격 피해 +{n}%',
  'effect.garage': '합체 덤 +{n}%',
  'effect.farm': '식량 시간당 {n}',
  'effect.radio': '시간당 고철 {s}, 연료 {f}',

  'res.food': '식량',
  'res.scrap': '고철',
  'res.fuel': '연료',

  'word.merge': '합체!',
  'word.split': '분해!',
  'word.smash': '돌파!',
  'word.boss': '보스 출현',
  'word.win': '승리!',
  'word.lose': '전멸',
  'gate.merge': '합체',
  'gate.split': '분해',

  'tut.swipe': '손가락으로 좌우로 밀어 무리를 움직이세요',
  'tut.gate': '숫자가 커지는 문으로 지나가세요',
  'tut.merge': '같은 병과가 모이면 합체해서 강해져요',
  'tut.shelterLobby': '피난처에서 건물을 강화하세요',
  'tut.shelterTap': '건물을 눌러 강화하세요',
  'tut.upgradeTap': '업그레이드를 누르세요',

  'result.doubleAd': '광고 보고 보상 2배',
  'result.doubleFree': '보상 2배 받기',
  'result.adLoading': '광고 불러오는 중…',
  'result.adMissed': '보상을 받지 못했어요. 다시 해 보세요',
  'result.doubled': '보상 2배 받음',

  'shop.title': '상점',
  'shop.remove_ads.name': '광고 제거',
  'shop.remove_ads.desc': '광고 없이 결과 화면에서 보상 2배를 바로 받아요',
  'shop.supply_crate.name': '보급 상자',
  'shop.supply_crate.desc': '식량 400, 고철 400, 연료 30',
  'shop.owned': '구매함',
  'shop.restore': '구매 복원',
  'shop.waiting': '스토어와 연결하는 중…',
  'shop.thanks': '{name} 구매 완료!',
  'shop.cancelled': '구매를 취소했어요',
  'shop.restored': '구매를 복원했어요',
  'shop.nothingToRestore': '복원할 구매가 없어요',
  'shop.unavailable': '스토어에 연결하지 못했어요',

  'settings.adPrivacy': '광고 개인정보',
  'settings.open': '열기',

  'fake.adTitle': '광고 (테스트)',
  'fake.adBody': '여기에 진짜 광고가 나옵니다\n{n}초',
  'fake.adDone': '광고를 끝까지 봤어요',
  'fake.skip': '건너뛰기',
  'fake.claim': '보상 받기',
  'fake.payTitle': '결제 (테스트)',
  'fake.payBody': '{name}\n{price}\n\n웹 테스트용이라 돈이 나가지 않아요',
  'fake.buy': '구매',
  'fake.cancel': '취소',
} as const;

export type MessageKey = keyof typeof ko;
