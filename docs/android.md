# 안드로이드 앱 만들기와 Play 스토어 올리기

게임 코드는 Claude가 다 준비해 두었고, 아래에서 **[사용자]** 표시가 붙은 단계만 직접 하시면 됩니다. 돈이 드는 단계(Play Console 가입비 $25)는 항상 직접 누르셔야 합니다.

## 0. 지금 바로 폰에 설치해 보기 (무료, 선택)

`main`에 코드가 들어갈 때마다 GitHub Actions가 테스트용 APK를 만듭니다.

1. **[사용자]** https://github.com/joongyub/dead-march/actions/workflows/android.yml 을 엽니다.
2. 맨 위의 초록 체크(✓) 실행을 누릅니다.
3. 아래쪽 **Artifacts**에서 `dead-march-debug-apk`를 눌러 내려받습니다(zip).
4. 폰에서 zip을 풀고 `app-debug.apk`를 누릅니다. "출처를 알 수 없는 앱" 경고가 나오면 **설정 → 이 출처 허용**을 켭니다.
5. 설치 후 실행. 저장 데이터는 웹 버전과 따로입니다.

## 1. Play Console 가입 [사용자, $25]

1. https://play.google.com/console/signup 접속, Google 계정으로 로그인.
2. **개인** 계정을 고릅니다(회사가 없으면).
3. 이름, 주소, 전화번호 입력 → 신분증 확인 → 등록비 **$25 결제**.
4. 확인 메일이 오면 끝(며칠 걸릴 수 있음).

## 2. 업로드 키 등록 [사용자, 무료]

앱 파일에 서명하는 열쇠 파일(`upload-keystore.jks`)과 비밀번호는 Claude가 만들어 프로젝트 파일 `dead-march-keys/`에 잠깐 두었습니다. GitHub에 비밀값으로 넣으면 Actions가 서명된 AAB를 만듭니다.

1. **[사용자]** 프로젝트 파일에서 `dead-march-keys/upload-keystore.jks`와 `dead-march-keys/secrets.txt`를 내려받아 **안전한 곳(구글 드라이브 비공개 폴더 등)에 백업**합니다. 이 파일을 잃어버려도 Play 고객센터에서 업로드 키를 다시 등록할 수 있지만 며칠 걸립니다.
2. https://github.com/joongyub/dead-march/settings/secrets/actions 를 엽니다.
3. **New repository secret**을 눌러 `secrets.txt`에 적힌 4개를 하나씩 넣습니다. 이름(Name)과 값(Secret)을 그대로 복사합니다.
   - `ANDROID_KEYSTORE_BASE64`
   - `ANDROID_KEYSTORE_PASSWORD`
   - `ANDROID_KEY_ALIAS`
   - `ANDROID_KEY_PASSWORD`
4. 다 넣었으면 Claude에게 **"등록 끝"** 이라고 알려 주세요. 프로젝트 파일에 둔 열쇠 파일은 그때 지웁니다.

## 3. 서명된 AAB 만들기

1. **[사용자]** https://github.com/joongyub/dead-march/actions/workflows/android.yml → 오른쪽 **Run workflow** → `release`에 체크 → **Run workflow**.
2. 끝나면(약 10분) 실행을 눌러 **Artifacts → dead-march-release-aab**를 내려받아 압축을 풉니다(`app-release.aab`).

버전 번호(versionCode)는 실행 번호로 자동으로 올라갑니다.

## 4. Play Console에 앱 만들기 [사용자]

1. Play Console → **앱 만들기**.
   - 앱 이름: `데드 마치: 좀비 생존 행진`, 기본 언어: 한국어, 앱/게임: **게임**, 무료/유료: **무료**.
   - 선언 체크 2개 → **앱 만들기**.
2. **대시보드 → 앱 설정** 항목을 위에서부터 채웁니다. 문구는 [store-listing.md](store-listing.md)에 다 있습니다.
   - 개인정보처리방침: `https://joongyub.github.io/dead-march/privacy.html`
   - 앱 액세스 권한: 제한 없음
   - 광고: **예, 광고가 포함되어 있습니다**
   - 콘텐츠 등급: store-listing.md의 설문 답변대로
   - 타겟층: 13세 이상 (13~15, 16~17, 18세 이상 체크)
   - 데이터 보안: store-listing.md의 표대로
   - 스토어 등록정보: 문구 붙여 넣기 + 그림 파일 올리기
3. **테스트 → 내부 테스트 → 새 버전 만들기** → `app-release.aab` 올리기 → 출시 노트 "첫 테스트 버전" → 저장 → 검토 → 출시.
   - 처음 올릴 때 **Play 앱 서명** 사용에 동의합니다(권장 기본값).
4. **테스터** 탭에서 본인 이메일 목록을 만들고 링크로 설치해 봅니다.

## 5. 비공개 테스트 12명 × 14일 [사용자]

2023년 11월 이후 만든 개인 계정은 정식 출시 전에 **비공개 테스트에 12명 이상이 14일 연속 참여**해야 합니다.

1. **테스트 → 비공개 테스트 → 트랙 만들기** → 같은 AAB로 버전 만들기.
2. 테스터 12명 이상의 Gmail을 목록에 넣고, **참여 링크**를 보냅니다. 테스터는 링크에서 "테스터 되기"를 누르고 앱을 설치해 14일 동안 지우지 않아야 합니다.
3. 14일이 지나면 대시보드에 **프로덕션 액세스 신청**이 열립니다. 설문(테스트 소감 등)을 쓰고 신청 → 승인 후 프로덕션 출시.

## 6. 광고·결제·통계 실제 연결 (10단계 이후) [사용자]

10단계에서 넣은 광고·결제·통계는 지금 **테스트 ID**로 돌아갑니다(돈이 오가지 않음). 실제로 켜려면 [monetization.md](monetization.md)를 보세요.
