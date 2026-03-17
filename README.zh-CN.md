# QuickSummarize

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

[English README](README.md)

![QuickSummarize 演示图](assets/example.png)

QuickSummarize 是一个开源的 Chrome 扩展，用来基于字幕总结 YouTube 视频内容。

它运行在 Chrome Side Panel 中，会读取可用字幕数据，并把字幕文本发送到兼容 OpenAI 接口或 Anthropic 风格接口的模型服务，生成可读性更好的总结。

目前这个项目只支持 YouTube，后续会逐步扩展到更多平台。

## 功能简介

- 为 YouTube 视频生成 AI 总结
- 查看按时间轴整理的字幕内容
- 导出 SRT 格式内容的字幕文本文件
- 支持中英文界面
- 支持 OpenAI 兼容接口
- 支持 Anthropic 风格接口

## 当前范围

- 平台支持：仅 YouTube
- 浏览器支持：支持 Side Panel 的 Chrome / Chromium 浏览器
- 分发方式：目前建议源码安装

我目前不太看好它能稳定通过 Chrome Web Store 审核，所以更推荐通过开发者模式手动安装。

## 使用逻辑

1. 打开 YouTube 视频
2. 先在播放器里手动打开字幕
3. 打开扩展侧边栏
4. 生成总结或导出字幕

默认情况下，扩展不会主动帮你打开字幕。

设置页里提供了一个可选开关，可以让扩展尝试自动打开字幕，但它默认关闭，因为这种行为可能会被 YouTube 识别为自动化操作。

不建议自动打开字幕，因为这通常意味着扩展需要主动操作 YouTube 播放器、触发额外的字幕请求，让整体行为更像自动化脚本而不是正常用户操作。这会让字幕获取链路更不稳定，也可能增加被平台风控识别的风险。

更稳妥的使用方式是：先手动打开字幕，确认视频画面中已经显示字幕，再使用 QuickSummarize。

## 从源码安装

### 1. 克隆仓库

```bash
git clone https://github.com/SlyPaws/QuickSummarize.git
cd QuickSummarize
```

### 2. 安装依赖

```bash
npm install
```

### 3. 构建扩展

```bash
npm run build
```

### 4. 打开 Chrome 开发者模式

1. 打开 `chrome://extensions/`
2. 在右上角开启 `开发者模式`

### 5. 手动加载扩展

1. 点击 `加载已解压的扩展程序`
2. 选择仓库中的 `extension` 目录

## 从 Release 安装

如果你不想在本地自己构建，也可以直接下载 GitHub Releases 里的打包产物。

1. 打开仓库的 `Releases` 页面
2. 下载最新的 `quicksummarize-vX.Y.Z.zip`
3. 在本地解压
4. 打开 `chrome://extensions/`
5. 开启 `开发者模式`
6. 点击 `加载已解压的扩展程序`
7. 打开解压后的目录，选择里面那个包含 `manifest.json` 的 `extension` 子目录

当前 release zip 里会包含一个 `extension/` 目录，所以在 Chrome 里加载时要选解压后的内部 `extension` 目录。

## 自动发布流程

仓库现在可以通过 GitHub Actions 自动发布打包产物。

当你推送类似 `v0.1.0` 的 tag 时，流程会自动：

1. 安装依赖
2. 运行测试
3. 构建扩展
4. 把 `extension` 目录打成 zip
5. 自动挂到 GitHub Release

示例：

```bash
git tag v0.1.0
git push origin v0.1.0
```

## 初始配置

加载完成后：

1. 打开扩展设置页
2. 填写以下信息：
   - `Provider`
   - `API Base URL`
   - `Model`
   - `API Key`
   - `Language`
3. 保存配置

Provider 说明：

- `OpenAI-compatible`：调用 `{baseUrl}/chat/completions`
- `Anthropic-style`：调用 `{baseUrl}/messages`，并按标准 Anthropic 风格 SSE 事件流解析返回

可选项：

- 只有在你明确了解风险时，才开启 `自动尝试打开字幕（有风险）`

## 使用方法

### 生成视频总结

1. 打开 YouTube 视频页面
2. 先在 YouTube 播放器里手动打开字幕
3. 确认视频画面中已经显示字幕
4. 打开 QuickSummarize
5. 点击 `生成总结`

### 导出字幕

1. 打开 YouTube 视频页面
2. 先在 YouTube 播放器里手动打开字幕
3. 打开 QuickSummarize
4. 点击 `导出字幕（.txt）`

导出的文件内容是 SRT 格式，但文件后缀是 `.txt`。

## 说明

- 部分视频可能没有可用字幕
- 自动生成字幕取决于 YouTube 是否提供
- 总结质量依赖字幕质量
- 扩展会把字幕文本发送到你配置的模型服务

## 开发

### 常用命令

```bash
npm run build
npm test
npm run test:watch
```

### 项目结构

```text
QuickSummarize/
|- extension/        Chrome 扩展源码
|- tests/            Vitest 测试
|- build.js          扩展构建脚本
```

## 隐私提醒

当你使用总结功能时，字幕文本会被发送到你配置的 API 服务。

请确保你信任该服务提供方后再使用。

## License

本项目使用 GNU General Public License v3.0 协议开源。

完整协议内容请查看 `LICENSE`。
