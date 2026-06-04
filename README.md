# ace-aws

<p align="center">
  <img src="./public/logo.png" alt="ace-aws logo" width="88" />
</p>

<p align="center">
  <strong>A focused practice app for AWS certification prep.</strong>
</p>

<p align="center">
  <a href="https://aws.hiback.net">Live demo</a>
  ·
  <a href="./README.zh-CN.md">中文</a>
</p>

<p align="center">
  <img alt="AWS CLF-C02" src="https://img.shields.io/badge/AWS-CLF--C02-5277c3?style=flat-square" />
  <img alt="AWS DVA-C02" src="https://img.shields.io/badge/AWS-DVA--C02-5277c3?style=flat-square" />
  <img alt="AWS SAA-C03" src="https://img.shields.io/badge/AWS-SAA--C03-5277c3?style=flat-square" />
  <img alt="English and Chinese" src="https://img.shields.io/badge/Language-English%20%2F%20Chinese-2d3748?style=flat-square" />
  <img alt="Docker ready" src="https://img.shields.io/badge/Deploy-Docker-2496ed?style=flat-square" />
</p>

ace-aws is a mobile-first AWS certification practice app. It keeps the experience simple: pick a certification, answer questions, review mistakes, save bookmarks, and run a timed mock exam when you are ready.

Anonymous progress stays in your browser. Sign in with GitHub when you want progress sync across devices.

> ace-aws is an independent study tool and is not affiliated with Amazon Web Services.

## Features

### Bilingual Interface

The whole app supports both English and Chinese.

<p>
  <img src="./assets/readme/home-en.png" alt="ace-aws English home screen" width="220" />
  <img src="./assets/readme/home-zh.png" alt="ace-aws Chinese home screen" width="220" />
</p>
<p><sub>English · Chinese</sub></p>

### Practice Questions

Work through the question bank with a clean, distraction-free mobile layout. Single-choice and multiple-choice questions are supported, with bilingual question text and explanations.

<p>
  <img src="./assets/readme/practice-en.png" alt="Practice question screen" width="180" />
  <img src="./assets/readme/practice-correct-en.png" alt="Practice correct answer result" width="180" />
  <img src="./assets/readme/practice-wrong-en.png" alt="Practice wrong answer result" width="180" />
  <img src="./assets/readme/practice-explanation-en.png" alt="Practice explanation view" width="180" />
</p>
<p><sub>Question · Correct result · Wrong result · Explanation</sub></p>

### Question Lists and Review

Mistakes and saved questions stay easy to find. Use the list views to scan all questions, revisit wrong answers, open bookmarks, or jump back into a specific item.

<p>
  <img src="./assets/readme/list-all-en.png" alt="All questions list screen" width="200" />
  <img src="./assets/readme/list-wrong-en.png" alt="Wrong answer list screen" width="200" />
  <img src="./assets/readme/list-bookmarks-en.png" alt="Bookmarked questions list screen" width="200" />
</p>
<p><sub>All questions · Wrong answers · Bookmarks</sub></p>

### Mock Exam

Run a timed mock exam that mirrors the pressure of the real test: countdown timer, answer sheet, question flags, save-and-exit, and a final score report.

<p>
  <img src="./assets/readme/mock-exam-en.png" alt="Mock exam question screen" width="180" />
  <img src="./assets/readme/mock-exam-sheet-en.png" alt="Mock exam answer sheet screen" width="180" />
  <img src="./assets/readme/mock-exam-result-en.png" alt="Mock exam result screen" width="180" />
  <img src="./assets/readme/mock-exam-history-en.png" alt="Mock exam history screen" width="180" />
</p>
<p><sub>Question · Answer sheet · Results · History</sub></p>

### Settings and Sync

Use guest mode for local-only study, or sign in with GitHub to sync progress. Switch theme and language at any time.

<p>
  <img src="./assets/readme/settings-en.png" alt="Signed-in settings screen" width="220" />
  <img src="./assets/readme/settings-dark-en.png" alt="Dark mode settings screen" width="220" />
</p>
<p><sub>Signed in · Dark mode</sub></p>

## What You Can Study

ace-aws currently supports:

- AWS Certified Cloud Practitioner: `CLF-C02`
- AWS Certified Developer - Associate: `DVA-C02`
- AWS Certified Solutions Architect - Associate: `SAA-C03`
- English and Chinese UI
- Local guest progress
- GitHub sign-in for cross-device progress sync
- Bookmarks, wrong-answer review, smart practice, and mock exams

More AWS certifications are planned for future updates.

## Try It

Open the hosted demo:

**https://aws.hiback.net**

You can continue as a guest without creating an account. GitHub sign-in is only needed when you want synchronized progress.

## Deploy Your Own

ace-aws ships as a Docker Compose stack with the app and PostgreSQL.

### 1. Prepare a Server

You need:

- Docker and Docker Compose
- A domain name or reverse proxy target
- A GitHub OAuth App if you want sign-in and sync

### 2. Create a GitHub OAuth App

Set these values in the GitHub OAuth App:

- Homepage URL: your public app URL, for example `https://ace.example.com`
- Authorization callback URL: `https://ace.example.com/api/auth/callback/github`

### 3. Configure Environment Variables

Create a `.env` file next to `docker-compose.yml`:

```env
AUTH_GITHUB_ID=replace-with-github-oauth-client-id
AUTH_GITHUB_SECRET=replace-with-github-oauth-client-secret
AUTH_SECRET=replace-with-openssl-rand-base64-32
AUTH_URL=https://ace.example.com

POSTGRES_DB=ace-aws
POSTGRES_USER=ace_aws
POSTGRES_PASSWORD=replace-with-strong-postgres-password
```

Generate `AUTH_SECRET` with:

```bash
openssl rand -base64 32
```

### 4. Start the App

```bash
docker compose pull
docker compose up -d
```

The app listens on port `3000`. Put it behind your preferred HTTPS reverse proxy, such as Caddy, Traefik, nginx, or a platform ingress.

## Privacy

- Guest progress is stored only in the browser.
- Signed-in progress is stored in your self-hosted PostgreSQL database.
- GitHub sign-in is used for identity and sync; it is not required for guest study.

## License

MIT. See [LICENSE](./LICENSE).
