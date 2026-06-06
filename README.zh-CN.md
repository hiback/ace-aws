# ace-aws

<p align="center">
  <img src="./public/logo.png" alt="ace-aws logo" width="88" />
</p>

<p align="center">
  <strong>专注的 AWS 认证刷题应用。</strong>
</p>

<p align="center">
  <a href="https://aws.hiback.net">在线体验</a>
  ·
  <a href="./README.md">English</a>
</p>

<p align="center">
  <img alt="AWS CLF-C02" src="https://img.shields.io/badge/AWS-CLF--C02-5277c3?style=flat-square" />
  <img alt="AWS DVA-C02" src="https://img.shields.io/badge/AWS-DVA--C02-5277c3?style=flat-square" />
  <img alt="AWS SAA-C03" src="https://img.shields.io/badge/AWS-SAA--C03-5277c3?style=flat-square" />
  <img alt="AWS SAP-C02" src="https://img.shields.io/badge/AWS-SAP--C02-5277c3?style=flat-square" />
  <img alt="English and Chinese" src="https://img.shields.io/badge/Language-English%20%2F%20Chinese-2d3748?style=flat-square" />
  <img alt="Docker ready" src="https://img.shields.io/badge/Deploy-Docker-2496ed?style=flat-square" />
</p>

ace-aws 是一个移动端优先的 AWS 认证刷题应用。它把体验压缩到最常用的学习动作：选择认证、刷题、复习错题、收藏重点题，并在准备好时进入限时模拟考试。

游客进度只保存在当前浏览器。需要多设备同步时，可以使用 GitHub 登录。

> ace-aws 是独立学习工具，与 Amazon Web Services 无官方关联。

## 功能展示

### 双语界面

整个应用支持英文和中文。

<p>
  <img src="./assets/readme/home-en.png" alt="ace-aws 英文首页" width="220" />
  <img src="./assets/readme/home-zh.png" alt="ace-aws 中文首页" width="220" />
</p>
<p><sub>English · 中文</sub></p>

### 刷题

使用干净、专注的移动端界面完成题库练习。应用支持单选题、多选题、中英文题干和解析。

<p>
  <img src="./assets/readme/practice-zh.png" alt="刷题题目页面" width="180" />
  <img src="./assets/readme/practice-correct-zh.png" alt="答对后的刷题页面" width="180" />
  <img src="./assets/readme/practice-wrong-zh.png" alt="答错后的刷题页面" width="180" />
  <img src="./assets/readme/practice-explanation-zh.png" alt="刷题解析页面" width="180" />
</p>
<p><sub>题目 · 答对后 · 答错后 · 解析</sub></p>

### 题目列表与复习

错题和收藏题会自动归档，方便回看、重做，也可以从列表直接跳回具体题目。

<p>
  <img src="./assets/readme/list-all-zh.png" alt="全部题目列表页面" width="200" />
  <img src="./assets/readme/list-wrong-zh.png" alt="错题列表页面" width="200" />
  <img src="./assets/readme/list-bookmarks-zh.png" alt="收藏题列表页面" width="200" />
</p>
<p><sub>全部题目 · 错题 · 收藏题</sub></p>

### 模拟考试

模拟考试包含倒计时、答题卡、标记题目、保存退出和成绩报告，更接近真实考试节奏。

<p>
  <img src="./assets/readme/mock-exam-zh.png" alt="模拟考试题目页面" width="180" />
  <img src="./assets/readme/mock-exam-sheet-zh.png" alt="模拟考试答题卡页面" width="180" />
  <img src="./assets/readme/mock-exam-result-zh.png" alt="模拟考试成绩结果页面" width="180" />
  <img src="./assets/readme/mock-exam-history-zh.png" alt="模拟考试历史记录页面" width="180" />
</p>
<p><sub>题目 · 答题卡 · 成绩结果 · 历史记录</sub></p>

### 设置与同步

游客模式适合本地练习；使用 GitHub 登录后可以跨设备同步进度。主题和语言都可以随时切换。

<p>
  <img src="./assets/readme/settings-zh.png" alt="登录后的设置页面" width="220" />
  <img src="./assets/readme/settings-dark-zh.png" alt="深色模式设置页面" width="220" />
</p>
<p><sub>登录后 · 深色模式</sub></p>

## 支持内容

ace-aws 目前支持：

- AWS Certified Cloud Practitioner: `CLF-C02`
- AWS Certified Developer - Associate: `DVA-C02`
- AWS Certified Solutions Architect - Associate: `SAA-C03`
- AWS Certified Solutions Architect - Professional: `SAP-C02`
- 中英文界面
- 游客本地进度
- GitHub 登录后的跨设备同步
- 收藏、错题复习、智能刷题和模拟考试

更多 AWS 认证预计会在后续版本中追加。

## 在线体验

打开 Demo 网站：

**https://aws.hiback.net**

你可以直接以游客身份继续，不需要注册账号。只有在需要同步进度时才需要 GitHub 登录。

## 自行部署

ace-aws 提供 Docker Compose 部署方式，包含应用和 PostgreSQL。

### 1. 准备服务器

你需要：

- Docker 和 Docker Compose
- 一个域名，或已有的反向代理入口
- 如果需要登录和同步，准备一个 GitHub OAuth App

### 2. 创建 GitHub OAuth App

在 GitHub OAuth App 中填写：

- Homepage URL：你的公开访问地址，例如 `https://ace.example.com`
- Authorization callback URL：`https://ace.example.com/api/auth/callback/github`

### 3. 配置环境变量

在 `docker-compose.yml` 同级目录创建 `.env`：

```env
AUTH_GITHUB_ID=replace-with-github-oauth-client-id
AUTH_GITHUB_SECRET=replace-with-github-oauth-client-secret
AUTH_SECRET=replace-with-openssl-rand-base64-32
AUTH_URL=https://ace.example.com

POSTGRES_DB=ace-aws
POSTGRES_USER=ace_aws
POSTGRES_PASSWORD=replace-with-strong-postgres-password
```

可以用下面的命令生成 `AUTH_SECRET`：

```bash
openssl rand -base64 32
```

### 4. 启动应用

```bash
docker compose pull
docker compose up -d
```

应用监听 `3000` 端口。生产环境建议放在 HTTPS 反向代理之后，例如 Caddy、Traefik、nginx 或平台自带入口。

## 隐私

- 游客进度只保存在浏览器本地。
- 登录后的进度保存在你自托管的 PostgreSQL 数据库中。
- GitHub 登录只用于身份识别和同步；本地游客练习不需要登录。

## License

MIT. See [LICENSE](./LICENSE).
