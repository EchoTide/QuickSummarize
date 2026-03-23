# QuickSummarize

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

[中文说明](README.zh-CN.md)

QuickSummarize is an open-source Chrome extension for working with both YouTube videos and ordinary webpages in Chrome Side Panel.

It opens in Chrome Side Panel as a source-aware workspace. On YouTube, it uses a transcript-first workflow for summaries, chat, timeline chunks, and subtitle export. On ordinary webpages, it can summarize the current page and answer questions about the current page context through the same side panel.

The current release supports YouTube watch pages plus normal HTTP(S) webpages.

| Overview | Webpage |
| --- | --- |
| ![QuickSummarize demo](assets/example.png) | ![QuickSummarize webpage demo](assets/example1.png) |
| ![QuickSummarize X translation demo 1](assets/x-1.png) | ![QuickSummarize X translation demo 2](assets/x-2.png) |

## What It Does

- Generate AI summaries for YouTube videos
- Chat about the current video in a transcript-first workspace
- Summarize ordinary webpages in the side panel
- Chat about the current webpage or current text selection
- Show timeline-based subtitle segments for YouTube
- Export subtitles as SRT-formatted text files for YouTube
- Support English and Chinese UI
- Work with OpenAI-compatible APIs
- Work with Anthropic-style APIs

## Current Scope

- Platform support: YouTube watch pages and ordinary HTTP(S) webpages
- Browser support: Chrome / Chromium browsers with Side Panel support
- Distribution: source install only for now

I do not currently expect this project to be reliably accepted in the Chrome Web Store, so the recommended installation method is loading it in Developer Mode.

## How It Works

1. Open a YouTube video or an ordinary webpage
2. For YouTube, manually turn on captions in the player
3. Open the extension side panel
4. Use the workspace tabs to summarize, chat, inspect the timeline, or export subtitles when available

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

Speed recommendations:

- For OpenAI-compatible endpoints, prefer smaller fast models such as the `gpt-nano` class or similar lightweight variants
- For other vendors, prefer their low-latency `flash` class models when available
- Larger reasoning models can work, but summary/chat streaming will usually feel slower in the side panel

Optional:

- Enable `Automatically try to open captions (risky)` only if you understand the risk of automation-like behavior
- Enable `Selection translation with DeepL` if you want the floating translate button after selecting text
- Add your own DeepL key and optionally choose a fixed translation target language
- For translation, you need a DeepL API plan/key; this feature calls DeepL directly and does not use your LLM provider key

## Usage

When a YouTube video is active, the side panel exposes a transcript-first workspace with three modes:

- `Summary`: generate or regenerate a readable summary
- `Chat`: ask questions about the current video through a transcript-first agent loop
- `Timeline`: inspect transcript chunks and refresh timeline output

When a normal webpage is active, the side panel exposes a page workspace with:

- `Summary`: summarize the current page or selected text
- `Chat`: ask questions about the current page in a page-context agent flow

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

### Summarize a webpage

1. Open a normal article, blog post, documentation page, or other readable webpage
2. Optionally select text first if you want the summary to focus on a passage
3. Open QuickSummarize
4. Click `Summarize`

### Chat with the current webpage

1. Open a normal webpage
2. Optionally select text first if you want the chat to focus on a passage
3. Open QuickSummarize
4. Switch to the `Chat` tab
5. Ask a question about the page

The webpage chat flow is page-context grounded. It uses the current page content, prioritizes selected text when present, and does not use YouTube-only timeline or timestamp affordances.

### Translate selected text

1. Open a normal webpage or a YouTube page
2. Select some text
3. Wait for the floating toolbar to appear near the selection
4. Click `Translate`

DeepL setup notes:

- You need your own DeepL API key in the extension settings
- A regular DeepL website account alone is not enough; the translation feature expects API access
- Free API keys use the DeepL free endpoint, and paid API keys use the standard DeepL endpoint automatically

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
- Some webpages do not expose enough readable text for reliable extraction
- The extension sends subtitle text to your configured API provider
- The extension sends extracted webpage text to your configured API provider when you summarize or chat with a webpage
- The extension sends selected text to DeepL only when you explicitly click the floating translate button
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
- `extension/lib/page-chat-agent.js` - page-context chat agent loop for ordinary webpages
- `extension/lib/chat-context.js` - transcript chunking and retrieval helpers
- `extension/lib/chat-session.js` - chat session state and turn compaction
- `extension/lib/video-chat-controller.js` - session synchronization around the active video
- `extension/lib/transcript-source.js` - transcript retrieval from current YouTube state
- `extension/lib/webpage-context.js` - webpage extraction and normalization helpers
- `extension/lib/selection-translate.js` - floating selection toolbar and translation UI
- `extension/lib/deepl.js` - local-key DeepL request helper

## Privacy Reminder

When you use summarization, subtitle text is sent to the API endpoint you configure.

Make sure you trust that provider before using the extension.

## License

This project is licensed under the GNU General Public License v3.0.

See `LICENSE` for the full text.
