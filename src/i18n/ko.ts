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
} as const;

export type MessageKey = keyof typeof ko;
