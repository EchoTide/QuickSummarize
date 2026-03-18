# QuickSummarize

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

[中文说明](README.zh-CN.md)

![QuickSummarize demo](assets/example.png)

QuickSummarize is an open-source Chrome extension for working with YouTube videos through captions.

It opens in Chrome Side Panel as a transcript-first workspace. The extension can fetch caption data, generate summaries, answer questions about the current video, show timeline-based transcript chunks, and export subtitles through either an OpenAI-compatible API or an Anthropic-style API.

Right now the product is focused on YouTube. Support for more platforms may be added over time.

## What It Does

- Generate AI summaries for YouTube videos
- Chat about the current video in a transcript-first workspace
- Show timeline-based subtitle segments
- Export subtitles as SRT-formatted text files
- Support English and Chinese UI
- Work with OpenAI-compatible APIs
- Work with Anthropic-style APIs

## Current Scope

- Platform support: YouTube only
- Browser support: Chrome / Chromium browsers with Side Panel support
- Distribution: source install only for now

I do not currently expect this project to be reliably accepted in the Chrome Web Store, so the recommended installation method is loading it in Developer Mode.

## How It Works

1. Open a YouTube video
2. Manually turn on captions in the player
3. Open the extension side panel
4. Use the workspace tabs to summarize, chat, inspect the timeline, or export subtitles

By default, the extension does not try to open captions for you.

There is an optional setting to auto-try opening captions, but it is disabled by default because it may look like automation behavior to YouTube.

Automatic caption opening is not recommended because it may require the extension to interact with the YouTube player, trigger extra caption requests, and behave more like automation than a normal user action. That can make subtitle retrieval less stable and may increase the risk of being flagged by platform defenses.

For the safest workflow, manually turn on captions first, confirm they are visible on the video, and then use QuickSummarize.

## Install From Source

### 1. Clone the repository

```bash
git clone https://github.com/EchoTide/QuickSummarize.git
cd QuickSummarize
```

### 2. Install dependencies

```bash
npm install
```

### 3. Build the extension

```bash
npm run build
```

### 4. Enable Developer Mode in Chrome

1. Open `chrome://extensions/`
2. Turn on `Developer mode` in the top-right corner

### 5. Load the extension manually

1. Click `Load unpacked`
2. Select the `extension` folder in this repository

## Install From Release

If you do not want to build locally, you can download a packaged archive from GitHub Releases.

1. Open the repository `Releases` page
2. Download the latest `quicksummarize-vX.Y.Z.zip`
3. Unzip it locally
4. Open `chrome://extensions/`
5. Turn on `Developer mode`
6. Click `Load unpacked`
7. Open the unzipped folder and select the inner `extension` folder that contains `manifest.json`

The release zip contains an `extension/` directory, so Chrome should be pointed to that inner folder after extraction.

## Release Workflow

This repository can publish release packages automatically.

When a tag like `v0.1.0` is pushed, GitHub Actions will:

1. Install dependencies
2. Run tests
3. Build the extension
4. Package the `extension` folder into a zip file
5. Attach that zip file to a GitHub Release

Example:

```bash
git tag v0.1.0
git push origin v0.1.0
```

## Initial Setup

After loading the extension:

1. Open the extension settings page
2. Fill in:
   - `Provider`
   - `API Base URL`
   - `Model`
   - `API Key`
   - `Language`
3. Save the configuration

Provider notes:

- `OpenAI-compatible`: uses `{baseUrl}/chat/completions`
- `Anthropic-style`: uses `{baseUrl}/messages` with standard Anthropic-style SSE events

Optional:

- Enable `Automatically try to open captions (risky)` only if you understand the risk of automation-like behavior

## Usage

When a YouTube video is active, the side panel exposes a workspace with three modes:

- `Summary`: generate or regenerate a readable summary
- `Chat`: ask questions about the current video through a transcript-first agent loop
- `Timeline`: inspect transcript chunks and refresh timeline output

### Summarize a video

1. Open a YouTube video page
2. Turn on captions manually in the YouTube player
3. Confirm captions are visible on the video
4. Open QuickSummarize
5. Click `Summarize`

### Chat with the current video

1. Open a YouTube video page
2. Turn on captions manually in the YouTube player
3. Confirm captions are visible on the video
4. Open QuickSummarize
5. Switch to the `Chat` tab
6. Ask a question about the video

The chat flow is transcript-first. Summary output can help with orientation, but the assistant is designed to use transcript context as the main factual source when answering.

### Browse the timeline

1. Open a YouTube video page
2. Turn on captions manually in the YouTube player
3. Open QuickSummarize
4. Open the `Timeline` tab, or use `Timeline summary` from the summary panel
5. Refresh the timeline if needed

### Export subtitles

1. Open a YouTube video page
2. Turn on captions manually in the YouTube player
3. Open QuickSummarize
4. Click `Export SRT (.txt)`

The export uses SRT content with a `.txt` filename.

## Notes

- Some videos do not provide usable captions
- Auto-generated captions depend on YouTube availability
- Summary and chat quality depend on subtitle quality
- The extension sends subtitle text to your configured API provider
- The transcript is the main source of truth for video chat answers

## Development

### Scripts

```bash
npm run build
npm test
npm run test:watch
```

### Project Structure

```text
QuickSummarize/
|- extension/        Chrome extension source
|- tests/            Vitest test suite
|- build.js          Extension build script
```

Relevant current modules:

- `extension/sidepanel.html` / `extension/sidepanel.css` / `extension/sidepanel.js` - sidepanel workspace UI and runtime
- `extension/lib/video-chat-agent.js` - transcript-first video chat agent loop
- `extension/lib/chat-context.js` - transcript chunking and retrieval helpers
- `extension/lib/chat-session.js` - chat session state and turn compaction
- `extension/lib/video-chat-controller.js` - session synchronization around the active video
- `extension/lib/transcript-source.js` - transcript retrieval from current YouTube state

## Privacy Reminder

When you use summarization, subtitle text is sent to the API endpoint you configure.

Make sure you trust that provider before using the extension.

## License

This project is licensed under the GNU General Public License v3.0.

See `LICENSE` for the full text.
