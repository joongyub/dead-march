# 데드 마치 (Dead March) — 작업 규칙

좌우 스와이프로 생존자 무리를 이끌고, 숫자 게이트로 인원을 불리고, 같은 병과끼리 합체해 좀비 떼를 뚫는 러너형 전투 + 피난처 기지 메타의 모바일 게임.
1인 개발이며 코드는 Claude가 전부 작성한다. 사용자는 휴대폰으로 테스트하고 느낌을 알려 준다.

- 로드맵(단계별 계획과 프롬프트): https://claude.ai/code/artifact/43043f0f-3b01-41be-a86d-edd040a18110
- 휴대폰 테스트 주소: https://joongyub.github.io/dead-march/ (성능 수치는 `?debug=1`)

## 기술 스택

- Phaser 3.90 (WebGL, 캔버스 대체) + TypeScript(strict) + Vite
- 전투 화면은 3D: Three.js 0.186이 Phaser와 같은 WebGL2 화면(`world3d/context.ts`)에 먼저 그리고, Phaser가 그 위에 숫자·HUD를 그린다. 로비 뒤 행군 장면(`BattleWorld.beginParade`)과 피난처(`ShelterWorld`)도 3D다. WebGL2가 없는 기기는 전투 대신 안내 문구가 뜨고, 로비는 그린 배경, 피난처는 이름표만 나온다.
- 세로 화면. 설계 해상도 720×1280, `Scale.EXPAND`로 긴 화면은 높이가 늘어난다. 위치는 항상 `layout(width, height)`에서 현재 크기로 계산한다(`BaseScene`).
- 배포: `main`에 머지되면 GitHub Actions가 GitHub Pages로 배포. PR마다 타입 검사, 규칙 검사, 빌드와 성능 검사(흐름 검사, 30판 누수 검사, CPU 4배 느린 조건 측정)가 돌고, 예산을 넘으면 실패한다.
- 안드로이드 앱: Capacitor 8 (`android/`, `capacitor.config.ts`, 앱 ID `com.joongyub.deadmarch`). 세로 고정, 전체 화면(`MainActivity`가 시스템 바를 숨김), 노치 여백은 앱이 넣는 `--safe-area-inset-*` CSS 변수로 받는다. 웹 빌드를 그대로 싣기 때문에 경로는 상대 경로(`base: './'`)를 유지한다.
- 앱 빌드는 GitHub Actions(`android.yml`)에서만 한다. 이 작업 환경은 Google Maven 저장소에 접속하지 못한다. PR(앱 관련 파일이 바뀔 때)과 `main`은 디버그 APK, Run workflow에서 `release`를 고르면 업로드 키로 서명한 AAB. 버전 이름은 `package.json`, 버전 코드는 실행 번호.
- 업로드 키(`*.jks`)와 비밀번호는 저장소에 넣지 않는다. GitHub 비밀값 `ANDROID_KEYSTORE_BASE64/PASSWORD`, `ANDROID_KEY_ALIAS/PASSWORD`로만 쓴다. 사용자 안내는 `docs/android.md`.

## 성능 예산

목표 기기: 3~4년 된 보급형 안드로이드(예: 갤럭시 A 시리즈)에서 전투 중 60fps.

| 항목 | 예산 |
| --- | --- |
| 한 프레임 전체 | 16.6ms 이하 |
| 게임 로직 | 프레임당 4ms 이하 |
| 화면에 그리는 유닛 | 최대 250개 (아군 90 + 좀비 160, 실제 병력은 숫자로 표시) |
| 드로우 콜 | 전투 중 20회 이하 |
| 처음 내려받는 용량 | 10MB 이하 |
| 메모리 | 250MB 이하 |

## 최적화 원칙 9가지

1. **보이는 것과 계산하는 것을 분리**: 병력이 5,000이어도 대표 유닛 최대 250개와 숫자만 그린다. 전투 결과는 숫자 계산으로 정한다.
2. **물리 엔진 미사용**: Arcade/Matter 물리를 켜지 않는다. 무리 단위 사각형 비교와 격자(그리드) 검색으로 충돌을 판정한다.
3. **오브젝트 풀링**: 총알, 좀비, 파티클, 데미지 숫자는 `src/core/Pool.ts`로 재사용한다. `update()` 안에서 `new`, 배열/객체 리터럴, 클로저 생성, `filter/map` 금지.
4. **텍스처 아틀라스 하나로**: 2D 그림은 한 장의 아틀라스에 모은다. 3D는 모델마다 인스턴싱 메시 하나(유닛 수와 상관없이 드로우 콜 1회), 빛은 꼭짓점 색에 미리 구워 `MeshBasicMaterial`만 쓰고, 효과는 3회(더하기, 반투명, 파편)로 그린다. 매 프레임 바뀌는 글자는 `BitmapText`로 쓴다(`Text`는 바뀔 때마다 텍스처를 다시 올린다). `Graphics`를 매 프레임 다시 그리지 않는다.
5. **고정 시간 간격 로직**: 게임 로직은 `src/core/FixedTimestep.ts`로 1/60초 단위로 돌리고, 그리기는 화면 주사율을 따른다. 120Hz 폰에서도 결과가 같아야 한다.
6. **해상도 상한**: 캔버스 픽셀/CSS 픽셀 비율은 최대 2(`MAX_DPR`). 저사양 모드에서는 캔버스를 75%로 그린다(`core/quality.ts`).
7. **발열과 배터리**: 앱이 뒤로 가면 루프가 멈추고 전투는 일시정지 창으로 돌아온다. 움직임이 적은 화면(로비, 기지)은 30fps로 낮춘다(6단계).
8. **항상 측정**: `?debug=1`이면 FPS, 프레임/로직/렌더 시간, 스프라이트 수, 드로우 콜이 화면 구석에 뜬다(`src/debug/`, 일반 플레이어는 이 코드를 내려받지 않는다). 모든 작업의 완료 보고에 이 수치를 포함한다.
9. **자동 성능 검사**: `npm run build && npm run smoke`가 휴대폰 크기 헤드리스 브라우저로 타이틀 → 로비 → 전투 → 일시정지 → 결과 → 피난처 흐름, 저장 복구, 스트레스 장면(병력 5,000)과 저사양 모드, 로직 시간, 드로우 콜, 화면 전환 시간을 검사하고 `artifacts/`에 스크린샷을 남긴다. `npm run leak`은 전투 30판 뒤 메모리·텍스처·리스너가 늘지 않는지, `npm run perf`는 CPU를 4·6배 느리게 한 조건의 프레임 시간을 잰다(`docs/perf.md`). 셋 다 PR마다 CI에서 돈다.

헤드리스 브라우저는 GPU가 없어 픽셀을 CPU로 그리므로 FPS가 휴대폰보다 훨씬 낮게 나온다(빈 화면도 약 17fps). 그 FPS로 판단하지 말고 로직 시간과 드로우 콜을 보고, 실제 FPS는 휴대폰의 `?debug=1`로 확인한다.

## 저사양 모드

- 설정의 저사양 모드는 자동/켜기/끄기. 자동이면 전투 중 평균 프레임이 20ms를 3초 넘게 넘을 때 켜지고(`SlowFrameDetector`), 그 기기에서는 다음 실행에도 켜진다(`save.data.device.lowSpec`).
- 켜지면 캔버스 75% 해상도, 파티클 절반, 화면 유닛 최대 120개(`quality.renderScale/particleScale/unitScale`, 좀비는 아군이 쓰고 남은 만큼). 전투 중에 켜지면 이미 그린 좀비도 뒷줄부터 줄인다.
- 캔버스 크기가 설계 단위와 달라질 수 있으므로 장면은 크기를 `layout(width, height)` 인자나 `viewWidth/viewHeight(this.scale)`로 얻고, 포인터 좌표는 `quality.renderScale`로 나눈다. 카메라 확대는 `BaseScene`이 맞춘다.

## 폴더 구조

```
src/
  main.ts              게임 설정, 장면 등록, ?debug=1이면 성능 측정기 로드
  config.ts            설계 해상도, 장면/텍스처 키, 색, 폰트
  core/                장면과 무관한 엔진 도구 (FixedTimestep, Pool, frameRate: 로비/결과/일시정지 30fps, quality: 저사양 모드)
  sim/                 전투 규칙 (Phaser 없음). 게임과 노드 시뮬레이터가 같은 코드를 씀
  meta/                피난처 규칙 (건물 비용·효과, 방치 보상, 시간 되돌림 방지). 역시 Phaser 없음
  data/                units/zombies/levels/economy/shelter JSON. 수치는 여기서만 바꾼다
  art/                 그림을 코드로 그려 아틀라스 한 장 + 숫자 비트맵 폰트로 만듦 (로비 배경·로고는 lobbyArt.ts)
                       캔버스 텍스처는 canvasTexture.ts로 등록한다 (Phaser addCanvas는 픽셀을 다시 읽어 수 초 걸림)
  audio/               효과음과 음악을 Web Audio로 합성 (파일 없음). 동시 8개, 같은 소리 최소 간격
  world3d/             3D 세계 (Three.js). 모델은 코드로 만든 상자·원기둥(models.ts, 피난처는 shelterModels.ts), 걷기·흔들기는 셰이더(actorMaterial.ts),
                       ActorPool(살아 있는 유닛 + 날아가는 시체), Fx3D(불꽃·피·폭발·파편·연기), Shells3D(게이트 포격 포탄), 도로와 건물(Scenery), 하늘(Sky), 카메라 흔들림(World3D)
                       BattleWorld(전투 + 로비 행군), ShelterWorld(피난처 마당, 건물 15모양, 모닥불, 생존자)
                       따로 내려받는 조각이라 타이틀에서 미리 받고 둘 다 예열한다(registry.ts의 load3D). 이 조각 밖에서는 three를 import하지 않는다(layout.ts처럼)
  battle/              전투 화면의 2D 층 (세계 위치에 붙는 숫자 WorldLabels, 효과, HUD, 1스테이지 튜토리얼)
  i18n/                화면 문구 ko.ts / en.ts와 t('키'). 기기 언어로 자동 선택, 설정에서 바꿀 수 있음
  game/                저장(버전, 백업, 마이그레이션)과 보상/진행
  platform/            브라우저/기기 대응 (URL 플래그, 저장소, 진동, 확대·스크롤 방지, 노치 여백, 뒤로 가기)
                       app.ts는 앱 안에서만 native.ts(앱 저장소, 뒤로 가기 버튼, 스플래시)를 동적으로 불러온다
  debug/               성능 측정기와 오버레이 (?debug=1 전용)
  services/            광고·결제·통계 인터페이스. web.ts는 웹용 가짜(광고 3초, 가짜 결제 창), native.ts는 AdMob·Play 결제·Firebase
  ui/                  공용 UI 위젯 (Button, IconButton, Toggle, Coach: 튜토리얼 손가락과 한 줄 글)
  scenes/              Boot → Preload → Title → Lobby ⇄ Shelter → Battle (+ Pause, Result, Settings, Shop 오버레이)
public/                manifest.webmanifest, 아이콘, licenses.txt, privacy.html (그대로 복사됨)
android/               Capacitor 안드로이드 프로젝트 (아이콘·스플래시는 npm run icons가 그림)
scripts/smoke.mjs      헤드리스 휴대폰 검사
scripts/perf.mjs       CPU 4·6배 느린 조건 측정 → docs/perf.md (--profile: 함수별 CPU 표)
scripts/leak.mjs       전투 30판 메모리 누수 검사
scripts/make-icons.mjs 웹·안드로이드 아이콘과 스플래시를 캔버스로 그려 PNG 저장
scripts/store-art.mjs  Play 스토어 스크린샷(한/영)과 그래픽 이미지 → artifacts/store/
scripts/gen-levels.ts  스테이지 20개 생성 + 시뮬레이터로 난이도 맞춤 (levelCurve.ts의 목표 곡선)
scripts/balance.ts     스테이지별 승률/남은 병력 표 → docs/balance.md
scripts/gen-shelter.ts 피난처 건물 레벨 1~20 비용·효과 곡선 → src/data/shelter.json
scripts/playtime.ts    가상 플레이어로 20스테이지까지 걸리는 플레이 시간 추정 → docs/playtime.md
tests/                 브라우저 없이 도는 규칙 검사 (npm test, PR마다 실행)
docs/                  android.md(앱 출시 안내), monetization.md(광고·결제·통계 켜기), store-listing.md(스토어 문구), perf.md, balance.md, playtime.md
.github/workflows/     ci.yml (PR 검사), deploy.yml (Pages 배포), android.yml (APK/AAB)
```

전투 규칙(`src/sim/`)은 결정적이고 난수를 쓰지 않는다. 아군과 좀비는 서로 닿지 않는다: 좀비 무리는 아군 앞 전선(`frontLine` = 무리 반지름 + `FRONT_GAP`)에서 멈춰 총에 쓰러지고, 전선에 붙어 있는 동안 아군이 줄어든다(멀리서 쓰러뜨릴수록 이득). 게이트를 지날 때마다 앞쪽 가장 가까운 무리에 포탄 일제 사격(`SALVO_*`)이 날아간다. 바리케이드만 몸으로 부순다(`CONTACT`). 규칙이나 `units.json`/`zombies.json`을 바꾸면 `npm run gen-levels`로 스테이지를 다시 맞추고 `npm run balance`로 표를 갱신한다. 피난처 비용이나 전투 보상(`economy.json`)을 바꾸면 `npm run gen-shelter && npm run playtime`으로 플레이 시간을 다시 확인한다.

## 코딩 규칙

- TypeScript strict, `any` 금지. 장면/텍스처 키는 `config.ts`의 상수를 쓴다.
- 장면은 `BaseScene`을 상속하고 위치 계산은 `layout()`에만 둔다. 노치 여백은 `this.insets`.
- 장면이 `game.events`나 `scale`에 등록한 리스너는 `SHUTDOWN`에서 해제한다.
- 광고·결제·통계는 `services.ads / purchases / analytics`로만 부른다. 상품, 가격 표시, 광고 보상 배수는 `data/shop.json`. 결제가 끝나면 `game/shop.ts`의 `grantProduct`로만 지급한다(바로 저장, 비소모품은 한 번만).
- 앱은 기본으로 Google 테스트 광고를 쓴다. 진짜 AdMob ID와 Firebase는 release 빌드 때 GitHub 변수 `ADMOB_APP_ID`, `ADMOB_REWARDED_ID`와 비밀값 `GOOGLE_SERVICES_JSON`으로만 들어간다(`docs/monetization.md`). 코드에 진짜 ID를 쓰지 않는다.
- 통계 이벤트: `stage_start`, `stage_end`, `upgrade`, `tutorial_step`, `ad_reward`, `shop_open`, `purchase`, `restore`. 이름은 소문자와 밑줄, 40자 이내. 새로 넣으면 `docs/monetization.md` 목록도 고친다.
- 뒤로 가기(안드로이드 뒤로 버튼, 웹은 Escape)는 맨 위에서 돌고 있는 장면의 `onBack()`이 처리한다. 겹쳐 뜨는 창은 닫고, 전투는 일시정지, 결과·피난처는 로비로. `false`를 돌려주면(타이틀, 로비) 앱이 백그라운드로 간다.
- 앱에서만 도는 코드는 `platform/native.ts`(와 거기서 부르는 파일)에 둔다. 웹 사용자는 그 코드를 내려받지 않는다.
- 버튼은 손을 뗄 때 실행한다(`ui/Button.ts`). 터치 영역은 최소 80×80 게임 단위.
- URL 플래그: `?debug=1` 성능 오버레이와 모든 스테이지 선택(전투 중 `window.__battle`), `?stress=1` 병력 5,000 스트레스 스테이지, `?bench=N` 전투 장면에 움직이는 스프라이트 N개.
- 화면 문구는 코드에 쓰지 않고 `src/i18n/ko.ts`에 키로 넣은 뒤 `en.ts`에도 같은 키를 넣는다(`npm test`가 빠진 키와 `{자리표시}` 차이를 잡는다). 스테이지·유닛·좀비·건물 이름은 한국어는 JSON, 영어는 `en.ts`의 표.
- 저장 형식에서 기존 필드의 모양이나 뜻을 바꾸면 `SAVE_VERSION`을 올리고 `MIGRATIONS`에 이전 버전 변환 함수를 넣는다. 기본값이 있는 새 필드는 `freshSave`와 정규화(normalize)에 넣는 것으로 충분하다. 저장소 접근은 `platform/storage.ts` 한 곳(앱에서는 Capacitor 저장소로 교체).
- 튜토리얼은 손가락 + 한 줄 글(`ui/Coach.ts`)만 쓰고, 배운 단계는 `save.data.tutorial`에 남긴다.
- 화면 전환은 0.3초 이내: 장면 `create()` 작업 + 0.16초 페이드. 큰 그림은 처음 한 번만 그리고 텍스처를 재사용한다.
- 3D 세계는 종류마다 게임 전체에 하나(`battleWorld()`, `shelterWorld()`)이고, 렌더러 하나를 같이 쓴다. 전투마다 `begin()`(로비는 `beginParade()`)으로 초기화한다. 전투 중에 지오메트리·재질·텍스처를 새로 만들지 않는다(누수 검사가 Three.js 자원 수도 본다). 새 재질을 넣으면 `warmUp()`이 미리 컴파일하는지 확인한다(처음 보일 때 멈칫한다).
- 3D 좌표: x = 전투 규칙의 x(도로 60~660), z = -거리, y는 위. 화면 글자 위치는 `World3D.project()`로 구한다. `layout()`에서는 먼저 `world.sync()`로 카메라를 맞춘 뒤 투영한다(피난처 건물의 터치 영역과 이름표는 `ShelterWorld.rect()`).
- 매 프레임 `setDepth`를 부르지 않는다. 깊이를 바꾸면 장면 전체가 다시 정렬된다. 순서가 실제로 바뀔 때만 바꾸고, 블렌드 모드가 다른 것끼리는 깊이 대역을 나눈다. 위치·크기·투명도도 값이 바뀔 때만 쓰고, `BitmapText` 너비는 글자가 바뀔 때만 잰다([docs/perf-fixes.md](docs/perf-fixes.md)).
- 외부 그림·소리·글꼴을 넣으면 `CREDITS.md`에 출처와 라이선스를 적는다. 상업적 이용이 안 되는 자료는 넣지 않는다.
- 의존성 버전은 고정(`^` 없이)하고, 새 라이브러리는 용량과 성능 영향을 확인한 뒤 추가한다.

## 명령어

```
npm install          # 처음 한 번
npm run dev          # 개발 서버 (같은 와이파이의 휴대폰에서도 접속 가능)
npm run build        # 타입 검사 + 빌드 → dist/
npm run smoke        # 빌드 결과를 휴대폰 크기 헤드리스 브라우저로 검사
npm run leak         # 전투 30판 메모리 누수 검사 (빌드 후)
npm run perf         # CPU 4·6배 느린 조건 측정 → docs/perf.md (빌드 후, --quick: 4배만)
npm run gen-levels   # 스테이지 다시 생성 (약 10분)
npm run balance      # 밸런스 표 docs/balance.md
npm run icons        # 웹·안드로이드 아이콘/스플래시 다시 그리기
npm run store-art    # Play 스토어 그림 (빌드 후)
npx cap sync android # 웹 빌드를 안드로이드 프로젝트로 복사 (Actions가 함)
npm test             # 규칙 검사 (피난처, 방치 보상, 저장 복구, 언어 파일)
npm run gen-shelter  # 피난처 비용·효과 데이터 다시 생성
npm run playtime     # 플레이 시간 추정 docs/playtime.md
```
