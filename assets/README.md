# Required Assets for Production Build

Place the following image files in this directory before building:

## 1. `icon.png` (1024 x 1024 px)
- App icon shown on home screen and app stores
- Square, no transparency, no rounded corners (OS applies rounding)
- Use the Chaffle logo centered on #4697AF background

## 2. `splash.png` (1284 x 2778 px)
- Native splash screen image shown while the app loads
- Use the Chaffle logo centered on #4697AF background
- Keep logo small and centered — the OS scales this image

## 3. `adaptive-icon.png` (1024 x 1024 px)
- Android adaptive icon foreground layer
- Use the Chaffle logo centered with transparent background
- Android composites this over the `backgroundColor` (#4697AF) from app.json

## 4. `chaffle-logo.png` (already exists)
- Used by HomeScreen, PreviewRaffle, About screens
- The horizontal Chaffle wordmark/logo

## Quick way to generate these
Use https://icon.expo.fyi or any design tool to create properly sized assets.
