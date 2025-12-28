# 原生插件集成指南

SPlayer 使用 Rust 编写的原生插件 (`smtc-for-splayer`) 来实现更深度的系统集成，目前主要包括：

- **SMTC (System Media Transport Controls)**: Windows 系统原生的媒体控制支持（系统音量浮窗、锁屏控制、任务栏缩略图控制）。
- **Discord RPC**: 支持在 Discord 状态中展示“正在播放”的歌曲信息。

## 环境准备

在开始开发或构建原生插件之前，您需要确保本地环境满足以下要求。

### 1. 安装 Rust 工具链

项目使用 Rust 编写，需要安装 Rust 编译器和 Cargo 包管理器。

- 访问 [Rust 官网](https://www.rust-lang.org/tools/install) 下载 `rustup-init.exe` 并安装。
- 安装完成后，在终端运行以下命令验证安装：
  ```bash
  rustc --version
  cargo --version
  ```

### 2. 安装 C++ 构建工具 (Windows)

Rust 在 Windows 上通常依赖 MSVC 工具链进行链接。

- 安装 **Visual Studio Build Tools** (或者 Visual Studio Community)。
- 在安装选项中，勾选 **"使用 C++ 的桌面开发" (Desktop development with C++)**。
- 确保勾选了 **MSVC v14x ... C++ x64/x86 build tools** 和 **Windows 10/11 SDK**。

### 3. 安装 Node.js 依赖

项目使用 `@napi-rs/cli` 来构建 Node.js 扩展。通常在运行 `pnpm install` 时会自动安装所需的构建工具。

---

## 构建与安装

项目内置了方便的脚本来处理原生插件的编译和集成。

### 自动构建

在项目根目录下运行以下命令，会自动编译 Rust 代码并将生成的 `.node` 文件移动到正确的位置：

```bash
pnpm build:native
```

此命令会执行以下操作：

1.  调用 `script/build-native.mjs` 脚本。
2.  进入 `native/smtc-for-splayer` 目录。
3.  运行 `napi build --release` 进行优化的发布版编译。
4.  生成的二进制文件会被放置在项目所需的位置，供 Electron 加载。

### 手动构建 (调试用)

如果您需要调试 Rust 代码，可以进入插件目录手动构建：

```bash
cd native/smtc-for-splayer
pnpm build         # 构建 release 版本
pnpm build:debug   # 构建 debug 版本
```

---

## 常见问题排查

### 1. `Error: The specified module could not be found`

如果在启动 Electron 时遇到此错误，通常是因为：

- **未编译插件**：请先运行 `pnpm build:native`。
- **架构不匹配**：确保您的 Node.js/Electron 架构（通常是 x64）与 Rust 编译目标一致。

### 2. `LINK : fatal error LNK1181: cannot open input file ...`

这是缺少 Windows SDK 或 C++ 构建工具的典型错误。

- 请检查 Visual Studio Build Tools 是否正确安装了 C++ 桌面开发组件。

### 3. 插件功能未生效

- **SMTC**: 仅在 Windows 10/11 上可用。请检查系统设置中的“系统 > 声音”或锁屏界面是否出现了媒体控件。
- **Discord RPC**: 需要 Discord 客户端在后台运行。可以在设置中检查“显示 Discord 状态”开关是否开启。

### 4. 日志查看

原生插件的日志默认记录在应用数据目录下的 `logs/smtc/` 文件夹中。

- 开发环境日志路径参考: `native/smtc-for-splayer/smtc-for-splayer.log` (取决于具体配置)
- 生产环境：`%APPDATA%/SPlayer/logs/smtc/`

---

## 开发指南

如果您希望贡献或修改原生插件代码，请参考以下结构：

- **入口**: `native/smtc-for-splayer/src/lib.rs` (定义了导出给 JS 的函数)
- **核心逻辑**:
  - `smtc_core.rs`: SMTC 的核心实现，处理 Windows API 调用。
  - `discord.rs`: Discord RPC 的连接与状态更新逻辑，包含重连机制和防抖处理。
- **类型定义**: `native/smtc-for-splayer/index.d.ts` (自动生成，供 TypeScript 使用)
