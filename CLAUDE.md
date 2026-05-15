# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SPlayer is a desktop music player built with **Electron + Vue 3 + TypeScript**. It uses Naive UI for components, Pinia for state management, and integrates with NetEase Cloud Music API, Last.fm, and Subsonic/Navidrome streaming services. Native Rust modules provide OS-level features (taskbar lyrics on Windows, MPRIS on Linux, SMTC on Windows, Discord RPC).

## Commands

```bash
pnpm dev                # Start dev environment (builds native modules + launches Electron)
pnpm build              # Full production build (typecheck + electron-vite build)
pnpm build:win          # Package for Windows
pnpm build:mac          # Package for macOS
pnpm build:linux        # Package for Linux
pnpm lint               # ESLint (--max-warnings=0, zero tolerance)
pnpm format             # Prettier
pnpm typecheck          # Full TypeScript check (node + web)
pnpm typecheck:node     # Main process + preload TypeScript check
pnpm typecheck:web      # Renderer process TypeScript check
```

Set `SKIP_NATIVE_BUILD=true` to skip Rust native module compilation during dev.

## Architecture

### Process Model (Electron)

- **Main process** (`electron/main/`): Window management, IPC handlers, SQLite database, system tray, global shortcuts, Fastify API server, native module integration
- **Preload** (`electron/preload/`): Context bridge exposing `window.api.store` and `window.logger` to renderer
- **Renderer** (`src/`): Vue 3 SPA — the UI

### IPC Layer

18 IPC modules in `electron/main/ipc/` handle all main↔renderer communication: `ipc-cache`, `ipc-file`, `ipc-lyric`, `ipc-media`, `ipc-mpv`, `ipc-socket`, `ipc-store`, `ipc-taskbar`, `ipc-tray`, `ipc-window`, `ipc-system`, `ipc-shortcut`, `ipc-update`, `ipc-protocol`, `ipc-mac-statusbar`, `ipc-thumbar`, `ipc-renderer-log`.

### Renderer Architecture (`src/`)

- **Stores** (`stores/`): Pinia with persistedstate — `data` (songs/user), `status` (playback), `setting` (config), `local` (local music), `music`, `streaming`, `shortcut`
- **Core** (`core/`): `audio-player/` (playback engine), `automix/`, `player/` (state), `resource/` (caching)
- **API** (`api/`): Axios-based, organized by domain (song, playlist, login, streaming, lastfm)
- **Composables** (`composables/`): `useInit`, `useSongMenu`, `useQualityControl`, etc.
- **Components** (`components/`): AMLL (lyrics), Card, Common, Global, Layout, List, Menu, Modal, Player, Search, Setting, UI

### Native Modules (`native/`)

Rust-based, built via `scripts/build-native.ts`:

- `taskbar-lyric` — Windows taskbar lyrics display
- `external-media-integration` — OS media integration
- `smtc-for-splayer` — Windows System Media Transport Controls
- `mpris-for-splayer` — Linux MPRIS support
- `discord-rpc-for-splayer` — Discord Rich Presence
- `ferrous-opencc-wasm` — Chinese character conversion (WASM)

### Embedded Server

`electron/server/` runs a Fastify instance (port 25884 default) wrapping NetEase Cloud Music API, proxied via `/api` in dev.

## Path Aliases

```
@/       → src/
@emi/    → native/external-media-integration
@shared/ → src/types/shared
@opencc/ → native/ferrous-opencc-wasm/pkg
@native/ → native/
```

## Code Conventions

- **Language**: Comments and commit messages in Chinese
- **Vue**: Composition API with `<script setup>`, TypeScript throughout
- **Auto-imports**: Vue, vue-router, @vueuse/core, and naive-ui composables are auto-imported (no explicit imports needed)
- **Naive UI components**: Auto-resolved via `unplugin-vue-components`
- **Unused variables**: Prefix with `_` to suppress lint warnings
- **Prettier**: Double quotes, trailing commas, 2-space indent, 100 char width
- **Workers**: Heavy computation (audio analysis) runs in worker threads (`electron/main/workers/`)
- **TypeScript**: Composite project — `tsconfig.node.json` (main/preload/scripts) and `tsconfig.web.json` (renderer)

## Git 操作说明

### 合并远程 dev 分支

```bash
# 拉取远程更新
git fetch music
# 切换到 master 分支
git checkout master
# 以远程 dev 分支代码为准合并
git merge -X theirs music/dev
# 如果有冲突，解决后继续
git add .
git commit -m "merge: 合并远程dev分支"
```
### 远程分支

- `music/master` - 主分支
- `music/dev` - 开发分支（包含最新功能和破解音源接口）

## 活动列表功能

### 功能位置

- 活动列表页面: `src/views/Activities/index.vue`
- API 服务: `api/app.py`
- 活动数据表: `activities`

### 活动列表参数

| 参数 | 类型 | 说明 |
|------|------|------|
| id | number | 活动ID |
| name | string | 活动名称 |
| date | string | 活动日期 |
| address | string | 活动地址 |
| remark | string | 备注说明 |
| categoryId | number | 分类ID |
| status | string | 状态（已完成/进行中/未开始） |

### API 端点

- `GET /activities` - 获取活动列表
- `POST /activities` - 创建活动
- `PUT /activities/{id}` - 更新活动
- `DELETE /activities/{id}` - 删除活动
- `PUT /update_activity_status/{id}` - 更新活动状态

## 破解音源接口

### 音源服务器枚举 (`SongUnlockServer`)

定义在 [SongManager.ts](file:///c:/Users/admin/Desktop/tea/src/core/player/SongManager.ts#L23-L31):

| 枚举值 | 服务商 | 当前状态 |
|--------|--------|----------|
| NETEASE | 网易云音乐 | 已废弃 |
| BODIAN | 波点音乐 | 已废弃 |
| KUWO | 酷我音乐 | 正常 |
| GEQUBAO | 歌曲宝 | 已废弃 |
| QQ | QQ音乐 | 不稳定 |
| KUGOU | 酷狗音乐 | 正常 |
| BILIBILI | 哔哩哔哩 | 不稳定 |
| XIAOWAI | 小歪音乐 | 正常（默认启用） |
| PILI | PILI音乐 | 正常（默认启用） |

### 默认启用的音源

在 [setting.ts](file:///c:/Users/admin/Desktop/tea/src/stores/setting.ts#L562-L571) 中配置：

```typescript
songUnlockServer: [
  { key: SongUnlockServer.XIAOWAI, enabled: true },
  { key: SongUnlockServer.KUGOU, enabled: true },
  { key: SongUnlockServer.KUWO, enabled: true },
  { key: SongUnlockServer.PILI, enabled: true },
  { key: SongUnlockServer.QQ, enabled: false },
  { key: SongUnlockServer.NETEASE, enabled: false },
  { key: SongUnlockServer.BODIAN, enabled: false },
  { key: SongUnlockServer.GEQUBAO, enabled: false },
  { key: SongUnlockServer.BILIBILI, enabled: false },
]
```

### API 调用

解锁接口定义在 [song.ts](file:///c:/Users/admin/Desktop/tea/src/api/song.ts#L64-L107):

```typescript
unlockSongUrl(id, keyword, server, level, timeout)
// server 可选值: qq | kugou | kuwo | netease | bilibili | bodian | gequbao | xiaowai | pili
```

### 音质等级

| 等级 | 参数 | 说明 |
|------|------|------|
| standard | l | 标准音质 |
| higher | m | 较高音质 |
| exhigh | h | 极高音质（默认） |
| lossless | s | 无损音质 |
| hires | e | Hi-Res |
| jyeffect | j | 鲸鱼音效 |
| sky | d | 天空音效 |
| jymaster | a | 鲸鱼母带 |

### 配置路径

- 解锁API地址: `src/config.ts` 中的 `unblockApiUrl`
- 音源设置UI: `src/components/Modal/Setting/SongUnlockManager.vue`