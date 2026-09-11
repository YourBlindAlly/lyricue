# Project identity — read this first

**The app is called LyriCue.** That has been true since 2026-09-05. Any new
file, folder, module, native class, variable, or identifier you create in
this repo from now on uses `lyricue`/`LyriCue` as its naming prefix, never
`cueme`, `cueme2`, or any other variant — no exceptions, this is a hard rule,
not a style preference.

This rule exists because it was already broken once: the
`modules/cueme-language-detection` native module was created 2026-09-10,
five days after the rename, and even after a 2026-09-07 session had already
gone through and renamed leftover "CueMe" references elsewhere in the code.
Whoever wrote it didn't check this file (which barely existed at the time)
or the git history for the established name before creating brand new code.
Don't repeat that — if you're about to create something new in this repo,
check this section first, it takes five seconds.

## Current naming-cleanup status

The repo predates the rename and still has real "cueme" references left
in it. Status as of 2026-09-11, update this list as items get done:

- **Renamed already**: GitHub repo (`YourBlindAlly/lyricue`), user-facing
  app name/display name/icon/About screen/privacy policy, TestFlight/unsigned
  `.ipa` release artifact filenames, code comments.
- **Being renamed now** (safe, no live dependents): local folder name,
  `package.json`/`package-lock.json`/`backend/package.json` project name
  metadata, GitHub Actions workflow file naming.
- **Deliberately left alone, do not rename without asking first**:
  - AsyncStorage key strings (e.g. `'cueme.librarySortMode'`, and every
    other `cueme.*` key across `src/**/*Preference.ts`, `*Storage.ts`,
    `*Bus.ts`). These are the actual keys real TestFlight testers' saved
    data (library, setlists, voice/pedal preferences) lives under right
    now. Renaming the string orphans everyone's existing saved data on
    their next update for zero user-visible benefit — nobody ever sees
    this string. Leave these as `cueme.*` permanently; this is a decision,
    not a TODO.
  - Native module names (`modules/cueme-pedal-input`,
    `modules/cueme-language-detection`, and their Swift-facing class names
    like `CuemePedalInputModule`). These are wired into the native bridge —
    renaming needs a real build and an on-device test (pedal input
    especially) before it's trusted, not a plain find-and-replace.
  - The app's URL scheme (`app.config.js` → `scheme: 'cueme'`), because
    Dropbox's App Console has this exact string registered as the OAuth
    redirect URI. Changing it requires updating that redirect URI on
    Dropbox's side in the same window, or Dropbox connect breaks for any
    tester still on an old build until they update. Needs explicit
    sequencing, not a quick rename.
  - The iOS bundle identifier — changing it after real TestFlight testers
    exist effectively creates a new app from Apple's side and loses build
    history. Rusty has explicitly said to leave this one alone.

## Known drift/duplication hotspots

- `docs/editor.html` (the web Lyric Editor, GitHub Pages, plain JS) and
  `src/parsing/mergeChordOnlyLines.ts` (the app, TypeScript) are two
  **separately maintained copies** of near-identical chord-merging logic.
  A bug fixed in one does NOT automatically apply to the other — confirmed
  live 2026-09-11 when a section-marker-corruption bug was fixed in the web
  copy and only found missing from the app copy after a tester reported a
  stray number showing up in displayed lyrics. When touching one, check
  whether the other needs the same fix.

# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.
