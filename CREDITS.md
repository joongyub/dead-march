# 출처와 라이선스

게임에 들어간 그림과 소리는 모두 코드로 직접 만든 것이라 외부 저작물이 없습니다. 새 외부 자료를 넣으면 이 파일에 출처와 라이선스를 적습니다.

## 그림

| 무엇 | 만든 방법 | 위치 |
| --- | --- | --- |
| 전투 그림 전부(생존자, 좀비, 보스, 게이트, 소품, 아이콘, 글자) | 시작할 때 캔버스로 그려 아틀라스 한 장에 모음 | `src/art/sprites.ts`, `src/art/atlas.ts` |
| 숫자 글꼴 | 위와 같은 아틀라스 안에 그린 비트맵 글꼴 | `src/art/atlas.ts` |
| 로비 배경, 로고 | 시작할 때 캔버스로 그림 | `src/art/lobbyArt.ts` |
| 앱 아이콘, 스플래시 | `npm run icons`가 브라우저 캔버스로 그려 PNG로 저장 | `scripts/make-icons.mjs` → `public/icons/`, `assets/` |

## 소리

| 무엇 | 만든 방법 | 위치 |
| --- | --- | --- |
| 효과음 17종(총소리, 폭발, 게이트, 합체, 보스 등) | Web Audio로 시작할 때 합성 | `src/audio/recipes.ts` |
| 배경음악 2곡(전투, 로비) | 같은 방식으로 합성한 반복 구간 | `src/audio/recipes.ts` |

## 글꼴

화면 글자는 기기에 이미 있는 시스템 글꼴(안드로이드 Noto Sans KR/Roboto, iOS Apple SD Gothic Neo)을 씁니다. 글꼴 파일을 내려받지 않습니다.

## 사용한 라이브러리

| 이름 | 버전 | 라이선스 | 용도 |
| --- | --- | --- | --- |
| [Phaser](https://phaser.io) | 3.90.0 | MIT | 게임 엔진 (게임에 포함) |
| [three.js](https://threejs.org) | 0.186.1 | MIT | 3D 전투 화면 (게임에 포함) |
| [TypeScript](https://www.typescriptlang.org) | 5.9.3 | Apache-2.0 | 개발 도구 (게임에 포함되지 않음) |
| [Vite](https://vite.dev) | 8.3.1 | MIT | 개발 도구 |
| [Playwright](https://playwright.dev) | 1.56.1 | Apache-2.0 | 자동 검사, 아이콘 생성 |
| [tsx](https://tsx.is) | 4.23.15 | MIT | 밸런스 스크립트 실행 |

Phaser와 three.js의 MIT 라이선스는 저작권 표시를 함께 배포하라고 요구합니다. 그 전문을 `public/licenses.txt`로 게임과 함께 배포합니다(설정 화면 아래 "오픈소스 라이선스"에서 열림).
