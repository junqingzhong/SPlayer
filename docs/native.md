# 原生插件集成指南

SPlayer 使用 Rust 编写的原生插件来实现更深度的系统集成。项目包含两个独立的原生模块：

| 模块            | 目录                             | 功能                     |
| --------------- | -------------------------------- | ------------------------ |
| **SMTC**        | `native/smtc-for-splayer`        | Windows 系统媒体控制集成 |
| **Discord RPC** | `native/discord-rpc-for-splayer` | Discord 状态同步         |

## SMTC 模块 (smtc-for-splayer)

### 功能介绍

SMTC (System Media Transport Controls) 是 Windows 10/11 系统原生的媒体控制接口，本模块提供以下功能：

- **系统媒体浮窗**：在调节音量时显示当前播放歌曲信息和封面
- **锁屏媒体控制**：在锁屏界面显示媒体控件
- **任务栏缩略图按钮**：鼠标悬停在任务栏图标时显示播放控制按钮
- **全局媒体键支持**：响应键盘上的媒体控制键

### 技术实现

- 使用 `windows-rs` crate 调用 Windows Runtime API
- 通过 N-API 导出函数供 Electron 主进程调用
- 支持元数据更新、播放状态同步、进度条控制等

### 目录结构

```
native/smtc-for-splayer/
├── src/
│   ├── lib.rs          # 模块入口，导出 N-API 函数
│   ├── smtc_core.rs    # SMTC 核心实现
│   ├── model.rs        # 数据模型定义
│   └── logger.rs       # 日志模块
├── Cargo.toml          # Rust 依赖配置
└── index.d.ts          # 自动生成的 TypeScript 类型定义
```

### 构建命令

```bash
cd native/smtc-for-splayer
pnpm build           # 构建 release 版本
pnpm build:debug     # 构建 debug 版本
```

### 日志路径

- **开发环境**：`native/smtc-for-splayer/logs/`
- **生产环境**：`%APPDATA%/SPlayer/logs/smtc/`

## Discord RPC 模块 (discord-rpc-for-splayer)

### 功能介绍

Discord RPC (Rich Presence) 模块用于在 Discord 状态中显示正在播放的歌曲信息：

- **状态同步**：在 Discord 个人资料显示 "正在听 - XXX"
- **歌曲卡片**：显示歌曲名、歌手、专辑封面
- **进度显示**：显示播放进度条
- **快捷按钮**：一键跳转到网易云音乐歌曲页面

### 显示模式

用户可以在设置中选择左下角状态栏的显示内容：

| 模式       | 显示内容               | 说明         |
| ---------- | ---------------------- | ------------ |
| 仅歌曲名   | `正在听 歌曲名`        | 默认选项     |
| 完整信息   | `正在听 歌曲名 - 歌手` | 显示完整信息 |
| 仅播放状态 | `正在听 SPlayer`       | 仅显示应用名 |

### 技术实现

- 使用 `discord-rich-presence` crate (v1.0) 与 Discord IPC 通信
- 实现自动重连机制，Discord 未运行时每 5 秒尝试连接
- 暂停时使用时间戳 hack 实现进度条静止效果
- 支持 `StatusDisplayType` 控制状态栏显示内容

### 目录结构

```
native/discord-rpc-for-splayer/
├── src/
│   ├── lib.rs           # 模块入口，导出 N-API 函数
│   ├── discord_core.rs  # Discord RPC 核心逻辑
│   └── model.rs         # 数据模型和枚举定义
├── Cargo.toml           # Rust 依赖配置
└── index.d.ts           # 自动生成的 TypeScript 类型定义
```

### 构建命令

```bash
cd native/discord-rpc-for-splayer
pnpm build           # 构建 release 版本
pnpm build:debug     # 构建 debug 版本
```

## 统一构建

在项目根目录运行以下命令可一次性构建所有原生模块：

```bash
pnpm build:native
```

此命令会执行 `scripts/build-native.mjs` 脚本，依次构建：

1. Discord RPC 模块
2. SMTC 模块

构建产物会自动放置到各模块目录，供 Electron 加载使用。

## 环境要求

### Rust 工具链

```bash
# 安装 Rust (访问 https://rustup.rs/)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 验证安装
rustc --version
cargo --version
```

### Windows 构建工具

SMTC 模块依赖 Windows SDK，需要安装：

1. 下载 [Visual Studio Build Tools](https://visualstudio.microsoft.com/zh-hans/visual-cpp-build-tools/)
2. 安装时勾选 **"使用 C++ 的桌面开发"**
3. 确保包含以下组件：
   - MSVC v14x C++ x64/x86 build tools
   - Windows 10/11 SDK

## 常见问题

### 模块加载失败

```
Error: The specified module could not be found
```

**解决方案**：

- 运行 `pnpm build:native` 编译原生模块
- 确保系统架构 (x64/arm64) 与编译目标匹配

### 链接错误

```
LINK : fatal error LNK1181: cannot open input file
```

**解决方案**：

- 检查 Visual Studio Build Tools 是否正确安装
- 确保 Windows SDK 已安装

### SMTC 不生效

- 仅 Windows 10/11 支持
- 检查系统设置 → 系统 → 声音 中是否显示媒体控件

### Discord RPC 不显示

- 确保 Discord 客户端在后台运行
- 检查设置 → 活动隐私 → 允许其他人看到你的活动
- 查看应用设置中 Discord 状态开关是否开启
