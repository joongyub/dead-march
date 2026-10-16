# Play 스토어 등록 문구

Play Console → 앱 → **스토어 등록정보 → 기본 스토어 등록정보**에 그대로 붙여 넣는 문구입니다. 글자 수 제한(앱 이름 30자, 간단한 설명 80자, 자세한 설명 4,000자)에 맞춰 두었습니다. 영어는 **번역 추가 → 영어(미국)**에 넣습니다.

그림 파일은 `npm run store-art`로 `artifacts/store/`에 만들어집니다.

| 항목 | 파일 | 크기 |
| --- | --- | --- |
| 앱 아이콘 | `artifacts/store/icon-512.png` | 512×512 |
| 그래픽 이미지 | `artifacts/store/feature-1024x500.png` | 1024×500 |
| 휴대전화 스크린샷 4장 | `artifacts/store/phone-1.png` ~ `phone-4.png` | 1080×1920 |

## 한국어

**앱 이름**

```
데드 마치: 좀비 생존 행진
```

**간단한 설명**

```
손가락 하나로 생존자 무리를 이끌고 숫자 게이트로 불려 좀비 떼를 뚫어라!
```

**자세한 설명**

```
도시는 무너졌고, 살아남은 사람들은 하나둘 길 위로 모여듭니다.
당신은 이 무리를 이끌고 좀비가 가득한 도로를 끝까지 행진해야 합니다.

■ 한 손가락 조작
좌우로 밀기만 하면 무리가 따라옵니다. 어려운 버튼은 없습니다.

■ 숫자 게이트로 병력 불리기
+, ×, − 게이트 중 더 좋은 쪽을 골라 지나가세요. 한 번의 선택이 수십 명을 수천 명으로 바꿉니다.

■ 같은 병과끼리 합체
생존자가 모이면 무장 병사로, 병사가 모이면 기관총 사수로, 마지막엔 장갑차로 진화합니다. 숫자가 아니라 힘으로 밀어붙이세요.

■ 좀비 떼와 보스
달려드는 주자 좀비, 단단한 탱커 좀비, 터지는 폭발 좀비, 바리케이드, 그리고 5스테이지마다 거대한 보스가 길을 막습니다.

■ 피난처 키우기
전투에서 얻은 식량·고철·연료로 방벽, 무기고, 정비고, 농장, 무전실을 강화하세요. 앱을 꺼 둔 동안에도 자원이 쌓입니다(최대 8시간).

■ 가볍고 부드럽게
보급형 휴대폰에서도 60fps를 목표로 만들었습니다. 느린 기기에서는 저사양 모드가 자동으로 켜집니다.

20개 스테이지, 오프라인 플레이, 계정 가입 없음.
지금 바로 생존자들을 이끌고 행진을 시작하세요!
```

## English

**App name**

```
Dead March: Zombie Survival Run
```

**Short description**

```
Swipe to lead your survivors, grow the crowd through number gates, smash zombies!
```

**Full description**

```
The city has fallen. Survivors gather on the road, one by one.
Lead them all the way through streets full of the undead.

■ One-finger control
Just drag left and right and your crowd follows. No complicated buttons.

■ Grow your army through number gates
Pick the better gate: +, × or −. One good choice turns a few dozen survivors into thousands.

■ Merge into stronger units
Survivors merge into soldiers, soldiers into machine gunners, and finally into armored trucks. Win with power, not just numbers.

■ Hordes and bosses
Runners, tank zombies, exploders, barricades, and a giant boss every fifth stage block the way.

■ Build your shelter
Spend food, scrap and fuel from battles to upgrade the wall, armory, garage, farm and radio room. Resources pile up while you are away (up to 8 hours).

■ Light and smooth
Built to run at 60fps on budget phones. Slow devices switch to low-spec mode automatically.

20 stages, play offline, no account needed.
Gather your survivors and start the march!
```

## 분류와 연락처

- 앱 또는 게임: **게임**, 카테고리: **액션** (보조: 캐주얼)
- 태그 추천: 좀비, 러너, 캐주얼 액션, 군대, 기지 건설
- 이메일: Play Console 계정 이메일 (스토어에 공개됨)
- 웹사이트: https://joongyub.github.io/dead-march/
- 개인정보처리방침: https://joongyub.github.io/dead-march/privacy.html

## 콘텐츠 등급 설문 답변 (IARC)

- 카테고리: 게임
- 폭력: **예** → 비현실적인 캐릭터(좀비)에 대한 폭력, 피 표현 있음(작은 붉은 조각, 사실적이지 않음)
- 공포: 약한 공포 요소(좀비) → 예
- 성적 콘텐츠, 욕설, 약물, 도박: 아니요
- 사용자 간 소통·위치 공유: 아니요
- 디지털 상품 구매: **예** (광고 제거 등, 10단계)

예상 등급: 12세 이용가(한국 GRAC 자동 등급) / Teen 수준.

## 데이터 보안 양식 답변

Play Console → 앱 콘텐츠 → **데이터 보안**에서:

- 데이터를 수집하거나 공유하나요? **예** (광고와 통계 SDK 때문)
- 전송 중 암호화: **예** (Google SDK는 HTTPS 사용)
- 사용자가 데이터 삭제를 요청할 수 있나요? 계정이 없으므로 앱 삭제로 지워짐 → "데이터 삭제 요청 방법 제공 안 함"이 아니라, 개인정보처리방침의 삭제 방법을 안내

| 데이터 유형 | 수집 | 공유 | 목적 | 선택 사항 |
| --- | --- | --- | --- | --- |
| 기기 또는 기타 ID (광고 ID) | 예 | 예 (AdMob) | 광고, 분석 | 아니요 |
| 앱 활동 → 앱 상호작용 | 예 | 아니요 | 분석 | 아니요 |
| 앱 정보 및 성능 → 비정상 종료 로그, 진단 | 예 | 아니요 | 분석 | 아니요 |
| 대략적인 위치 | 예 (IP로 추정) | 예 (AdMob) | 광고 | 아니요 |
| 구매 내역 | 예 | 아니요 | 앱 기능 | 아니요 |

광고: **예, 앱에 광고가 있습니다** (보상형 광고).
타겟층: 만 13세 이상 (아동 대상 아님).
