# 그림을 바꾸고 싶을 때 (선택)

지금 그림은 전부 코드로 그린 것이라 바로 출시할 수 있습니다. 더 공들인 그림으로 바꾸고 싶으면 아래 프롬프트를 이미지 생성 도구(예: ChatGPT 이미지, Midjourney)에 그대로 붙여 넣어 만들고, 결과 파일을 이 대화에 올려 주세요. 제가 크기를 맞추고 게임에 넣은 뒤 성능 수치를 다시 확인합니다.

올리기 전에 확인할 것:
- 그 도구의 약관에서 **상업적 이용**이 허용되는지 확인합니다. 허용되지 않으면 쓰지 않습니다.
- 다른 게임의 캐릭터나 로고를 닮지 않았는지 봅니다.
- 올린 그림은 `CREDITS.md`에 어떤 도구로 만들었는지 적습니다.

## 1. 앱 아이콘 (1024×1024)

```
Mobile game app icon, 1024x1024, bold and readable at small size. A glossy blue rounded sign with a big white "x2" in thick cartoon lettering, floating above a crowd of tiny chibi soldiers in green helmets marching up a cracked highway toward a blood-red sunset. A few green zombie hands reach in from the bottom corners. Thick dark outlines, saturated colors, soft lighting, casual mobile game style. No text other than "x2", no border, no rounded corners, full-bleed background.
```

받으면 `assets/icon-only.png`를 이 그림으로 바꾸고 안드로이드 아이콘을 다시 만듭니다.

## 2. 로고 (가로 1600×800, 투명 배경)

```
Game logo for "DEAD MARCH", transparent background, 1600x800. Two stacked words: "DEAD" in heavy blood-red block letters with dripping paint, "MARCH" below in bone-white distressed military stencil letters. Thick black outline around both words, slight 3D bevel, casual mobile game style. No other text, no background.
```

받으면 로비의 코드 로고(`src/art/lobbyArt.ts`의 `buildLogo`) 대신 이 그림을 씁니다. 용량은 200KB 이하로 줄여서 넣습니다.

## 3. 로비 배경 (세로 1440×2560)

```
Vertical mobile game background, 1440x2560, portrait. A ruined city at dusk on fire, a long empty highway leading from the bottom center to the horizon in the middle of the image, wrecked cars on the shoulders, smoke columns, red-orange sky. Leave the top third and the center calm and dark enough for a logo and menu buttons on top. Stylized casual mobile game art, soft painterly shading, no characters, no text.
```

받으면 WebP로 바꿔 400KB 이하로 넣습니다. 처음 내려받는 용량(10MB 예산)에 들어갑니다.

## 4. 스토어 대표 이미지 (1024×500, 9단계에서 필요)

```
Google Play feature graphic, 1024x500, landscape. A huge crowd of chibi survivors and soldiers with a tank in the middle charging up a highway through a blue "x2" gate, a giant zombie boss and a horde of green zombies waiting ahead, explosions and muzzle flashes, red sunset sky. Bright, energetic casual mobile game style, thick outlines. Leave the left third slightly darker for a title. No text.
```
