# 광고, 인앱 결제, 통계 실제로 켜기

10단계에서 게임에 광고·결제·통계 연결을 다 넣어 두었습니다. 지금은 이렇게 돌아갑니다.

| | 웹 (GitHub Pages) | 안드로이드 앱 (지금) | 아래 단계를 마친 뒤 |
| --- | --- | --- | --- |
| 광고 | 3초짜리 가짜 광고 화면 | Google 테스트 광고 (돈이 오가지 않음) | 진짜 AdMob 보상형 광고 |
| 결제 | 가짜 결제 창 (돈이 나가지 않음) | Google Play 결제 창 (상품을 만들기 전에는 "상품 없음") | 진짜 결제 |
| 통계 | 브라우저 안에만 기록 (`?debug=1`에서 `__dm.events`) | 보내지 않음 | Firebase로 전송 |

게임 안 위치:

- **광고**: 전투 결과 화면의 **"광고 보고 보상 2배"** 버튼. 끝까지 보면 받은 자원만큼 한 번 더 받습니다.
- **상점**: 로비 왼쪽 위 카트 버튼. **광고 제거**(₩3,900, 한 번 사면 영구, 결과 화면에서 광고 없이 바로 2배)와 **보급 상자**(₩1,200, 식량 400·고철 400·연료 30, 여러 번 살 수 있음), **구매 복원** 버튼.
- **통계 이벤트**: `stage_start`, `stage_end`(스테이지, 승패, 걸린 초, 남은 병력), `upgrade`(건물, 레벨), `tutorial_step`, `ad_reward`, `shop_open`, `purchase`, `restore`.

가격과 보상량은 `src/data/shop.json`에서 바꿉니다(스토어 가격은 Play Console에서 따로 정합니다).

아래는 모두 **[사용자]** 단계입니다. 돈이 들거나 계정·정산 정보가 필요한 일이라 Claude가 대신 누르지 않습니다. 순서는 자유지만 1 → 2 → 3이 자연스럽습니다.

## 1. 인앱 상품 만들기 (Play Console) [사용자]

먼저 [android.md](android.md)의 4단계까지 해서 Play Console에 앱과 AAB가 올라가 있어야 합니다(결제 권한이 든 AAB를 한 번 올려야 상품 메뉴가 열립니다).

1. Play Console → **설정 → 결제 프로필**(판매자 계정)을 만듭니다. 이름, 주소, 은행 계좌를 넣습니다.
2. 앱 선택 → 왼쪽 **수익 창출 → 제품 → 인앱 상품** → **상품 만들기**.
3. 첫 번째 상품
   - 제품 ID: `remove_ads` (철자 그대로, 나중에 못 바꿈)
   - 이름: 광고 제거 / 설명: 결과 화면 보상 2배를 광고 없이 바로 받습니다.
   - 가격: ₩3,900 → **저장** → **활성화**
4. 두 번째 상품
   - 제품 ID: `supply_crate`
   - 이름: 보급 상자 / 설명: 식량 400, 고철 400, 연료 30
   - 가격: ₩1,200 → **저장** → **활성화**
5. 돈을 내지 않고 시험하려면: Play Console 첫 화면 → **설정 → 라이선스 테스트**에 본인 Gmail을 넣습니다. 그 계정으로는 "테스트 카드, 항상 승인"이 나오고 청구되지 않습니다.

## 2. AdMob 광고 연결 [사용자]

1. https://admob.google.com 에 Google 계정으로 가입합니다(무료). 국가, 시간대, 결제 통화(KRW)를 고릅니다.
2. **앱 → 앱 추가** → Android → "앱이 지원되는 앱 스토어에 등록되어 있나요?" Play에 아직 공개 전이면 **아니요** → 앱 이름 `데드 마치` → **앱 추가**.
3. 앱 화면에 나오는 **앱 ID**(`ca-app-pub-숫자~숫자`)를 복사해 둡니다.
4. **광고 단위 → 광고 단위 추가 → 보상형** → 이름 `결과 2배` → 보상 설정은 그대로(수량 1) → **광고 단위 만들기**. 나오는 **광고 단위 ID**(`ca-app-pub-숫자/숫자`)를 복사합니다.
5. https://github.com/joongyub/dead-march/settings/variables/actions 를 엽니다(Settings → Secrets and variables → Actions → **Variables** 탭).
6. **New repository variable**로 두 개를 넣습니다. 비밀값이 아니라 변수입니다.
   - Name `ADMOB_APP_ID`, Value: 3번의 앱 ID
   - Name `ADMOB_REWARDED_ID`, Value: 4번의 광고 단위 ID
7. AdMob → **개인정보 보호 및 메시지 → GDPR** → 메시지 만들기 → 앱 선택 → 게시. 유럽 사용자에게 동의 창이 뜹니다(게임에 이미 연결되어 있고, 필요한 나라에서는 설정 화면에 "광고 개인정보" 버튼이 생깁니다).
8. AdMob → **결제** 메뉴에서 주소와 계좌를 넣어야 수익을 받을 수 있습니다.

주의: 진짜 광고 ID를 넣은 버전에서 **본인 광고를 직접 누르지 마세요**. AdMob 계정이 정지될 수 있습니다. 테스트는 Actions의 디버그 APK(항상 테스트 광고)로 하세요.

### app-ads.txt

AdMob은 Play 스토어 등록정보의 "웹사이트" 주소의 **맨 위 도메인**에서 `app-ads.txt`를 찾습니다. 이 게임의 웹사이트가 `https://joongyub.github.io/dead-march/`이면 AdMob은 `https://joongyub.github.io/app-ads.txt`를 봅니다. 그래서 파일 하나짜리 저장소가 더 필요합니다.

1. AdMob → **앱 → 모든 앱 → app-ads.txt 설정 방법**에서 한 줄(`google.com, pub-…, DIRECT, f08c47fec0942fa0`)을 복사합니다.
2. GitHub에서 새 저장소 `joongyub.github.io`(공개)를 만들고 `app-ads.txt` 파일에 그 줄을 붙여 넣습니다. Settings → Pages에서 main 브랜치로 배포를 켭니다. Claude에게 "app-ads 저장소 만들어 줘"라고 하셔도 됩니다.
3. 이 저장소의 `public/app-ads.txt`도 같은 줄로 바꿔 두면 기록이 맞습니다.

## 3. Firebase 통계 연결 [사용자, 무료]

1. https://console.firebase.google.com → **프로젝트 추가** → 이름 `dead-march` → Google 애널리틱스 **사용** → 계정 선택 → 만들기.
2. 프로젝트 첫 화면 → 안드로이드 아이콘 → 패키지 이름 `com.joongyub.deadmarch` → 앱 등록.
3. **google-services.json 다운로드**. 나머지 단계(SDK 추가)는 이미 되어 있으니 **다음 → 콘솔로 이동**.
4. https://github.com/joongyub/dead-march/settings/secrets/actions → **New repository secret**
   - Name `GOOGLE_SERVICES_JSON`
   - Secret: 내려받은 파일을 메모장으로 열어 **전체 내용**을 붙여 넣기

## 4. 실제 버전 만들기

https://github.com/joongyub/dead-march/actions/workflows/android.yml → **Run workflow** → `release` 체크 → 실행. 끝난 실행의 요약(Summary)에 "AdMob: ca-app-pub-…, Firebase: 1"이 보이면 진짜 ID가 들어간 것입니다. 이 AAB를 Play Console에 올립니다.

- 디버그 APK는 계속 테스트 광고만 쓰고 통계를 보내지 않습니다.
- Firebase 통계는 첫 사용 후 하루 정도 지나야 콘솔에 보입니다. 바로 보려면 Firebase → Analytics → **DebugView**.
