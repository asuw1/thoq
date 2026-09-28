This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## Thoq specifics

- Business logic lives in `src/reco/` and `src/store/state.ts` as pure TypeScript with vitest tests. Keep React and storage out of them. Run `npm test`, `npm run typecheck` and `npm run lint` before declaring anything done.
- Expo's docs host may be unreachable from sandboxed sessions. Check APIs against the installed `node_modules/expo-router/*.d.ts` rather than memory. `Stack` comes from `expo-router/stack`, `Tabs` from `expo-router/js-tabs`.
- `npx expo install` needs network access to Expo's API. When that's blocked, look up the version in `node_modules/expo/bundledNativeModules.json` and pin it exactly.

## Design rules (do not drift)

Thoq should read like a well-set magazine, not a SaaS template.

- **Palette**: paper, ink and one accent (roasted clay), all in `src/theme/tokens.ts`. Nothing else. The accent is only for the active tab or segment, scores of 9.0+, text links and the “Top pick” label.
- **Never**: gradients, glows, blurred blobs, glassmorphism, shadows used as decoration, sparkle or “magic” icons, pill-shaped buttons, coloured status dots, or three identical feature columns.
- **Type**: Newsreader (serif) for names and titles, IBM Plex Sans for UI, IBM Plex Mono for every number, time, distance and price. Headings are left-aligned; there are no centred hero blocks.
- **Shape**: 2px corner radius. Primary buttons are ink-filled rectangles; secondary buttons are ink outlines.
- **Structure**: flat rows separated by hairlines (`PlaceRow`), no cards inside cards. Use asymmetric splits (e.g. 3:2 score columns) instead of equal grids.
- **Copy**: specific and plain. Say what happens (“Save and compare”), never “Unlock AI-powered insights”. Explain recommendations with their actual reasons.
