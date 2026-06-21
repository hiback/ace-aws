# README Screenshot Assets

The README screenshots are generated locally for maintainer-controlled documentation updates.
They are not a visual regression suite and are not updated by CI.

## Command

```bash
pnpm screenshots:readme
```

By default the command starts a local Next.js dev server on `127.0.0.1:3107`, opens Chromium with the Playwright library API, seeds deterministic browser state, and writes PNG files to `assets/readme`.

## Browser Configuration

The runner looks for Chromium in this order:

1. `CHROMIUM_EXECUTABLE_PATH`, when set to an existing Chromium or Chrome binary.
2. Common system Chromium or Chrome install paths.
3. Playwright-managed Chromium.

If no compatible browser is available, install Playwright Chromium:

```bash
pnpm exec playwright install chromium
```

Or point the runner at an existing browser:

```bash
CHROMIUM_EXECUTABLE_PATH=/path/to/chromium pnpm screenshots:readme
```

## Existing Base URL

To capture against an already running local app instead of letting the runner start `next dev`, set `README_SCREENSHOT_BASE_URL`:

```bash
README_SCREENSHOT_BASE_URL=http://127.0.0.1:3000 pnpm screenshots:readme
```

The URL is used as-is after trimming one trailing slash.

## Generated Assets

The manifest covers every current PNG in `assets/readme`:

```text
home-en.png
home-zh.png
list-all-en.png
list-all-zh.png
list-bookmarks-en.png
list-bookmarks-zh.png
list-wrong-en.png
list-wrong-zh.png
mock-exam-en.png
mock-exam-history-en.png
mock-exam-history-zh.png
mock-exam-result-en.png
mock-exam-result-zh.png
mock-exam-sheet-en.png
mock-exam-sheet-zh.png
mock-exam-zh.png
practice-correct-en.png
practice-correct-zh.png
practice-en.png
practice-explanation-en.png
practice-explanation-zh.png
practice-wrong-en.png
practice-wrong-zh.png
practice-zh.png
settings-dark-en.png
settings-dark-zh.png
settings-en.png
settings-zh.png
stats-en.png
stats-zh.png
```

English and Chinese captures are generated for Home, Practice, Question Lists, Stats, Mock Exam, and Settings. Dark mode is generated only for Settings to match the README image structure.

## Deterministic State

The runner seeds fixed `CLF-C02` fixture questions, anonymous practice progress, bookmarks, a mock exam draft, submitted mock exam history, preferences, and account-backed Settings state. Stats screenshots use a richer anonymous progress fixture with seven days of daily question stats and submitted mock exam history. Settings uses a mocked signed-in GitHub session and mocked account progress/mock exam sync endpoints. Other screenshots use anonymous local state.

Browser time is frozen to keep countdowns, submitted-at ordering, and sync metadata stable. Screenshots use Playwright `scale: 'css'`, so one output pixel maps to one CSS pixel.

## Expected Git Workflow

1. Run `pnpm screenshots:readme`.
2. Review the changed PNG files under `assets/readme`.
3. Keep README `<img width="...">` markup unchanged unless the README layout itself is intentionally changing.
4. Commit the script/doc changes and any intentionally regenerated PNG assets together.

## Troubleshooting

- Missing browser: set `CHROMIUM_EXECUTABLE_PATH` or run `pnpm exec playwright install chromium`.
- Port conflict: start the app yourself on another port and pass `README_SCREENSHOT_BASE_URL`.
- Missing fixture questions: regenerate committed data only when raw refs intentionally change, then ensure the fixed `CLF-C02` question IDs required by `scripts/readme-screenshots/fixtures.ts` still exist.
- Noisy `build:data` output: `pnpm dev` and `pnpm build` run `build:data || true`; missing gitignored raw refs can be noisy but does not mean committed `src/data/*.json` changed.
