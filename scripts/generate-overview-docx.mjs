import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const outDir = path.join(root, 'docs', '.docx-build')
const outFile = path.join(root, 'docs', 'QuickSummarize-概要设计说明书.docx')

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function textRun(text, extra = '') {
  return `<w:r>${extra}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`
}

function paragraph(text, opts = {}) {
  const style = opts.style ? `<w:pStyle w:val="${opts.style}"/>` : ''
  const center = opts.align ? `<w:jc w:val="${opts.align}"/>` : ''
  const pageBreakBefore = opts.pageBreakBefore ? '<w:pageBreakBefore/>' : ''
  const spacing = opts.spacingAfter ? `<w:spacing w:after="${opts.spacingAfter}"/>` : ''
  const ind = opts.firstLine ? `<w:ind w:firstLine="${opts.firstLine}"/>` : ''
  return `<w:p><w:pPr>${style}${center}${pageBreakBefore}${spacing}${ind}</w:pPr>${textRun(text)}</w:p>`
}

function blank() {
  return '<w:p/>'
}

function pageBreak() {
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
}

function table(rows, widths) {
  const cols = widths
    .map((w) => `<w:gridCol w:w="${w}"/>`)
    .join('')
  const body = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((cell, index) => {
          const width = widths[index]
          const shaded = rowIndex === 0 ? '<w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/>' : ''
          return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${shaded}</w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${textRun(cell)}</w:p></w:tc>`
        })
        .join('')
      return `<w:tr>${cells}</w:tr>`
    })
    .join('')
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="8" w:space="0" w:color="000000"/><w:left w:val="single" w:sz="8" w:space="0" w:color="000000"/><w:bottom w:val="single" w:sz="8" w:space="0" w:color="000000"/><w:right w:val="single" w:sz="8" w:space="0" w:color="000000"/><w:insideH w:val="single" w:sz="8" w:space="0" w:color="000000"/><w:insideV w:val="single" w:sz="8" w:space="0" w:color="000000"/></w:tblBorders></w:tblPr><w:tblGrid>${cols}</w:tblGrid>${body}</w:tbl>`
}

function bullets(items) {
  return items.map((item) => paragraph(`- ${item}`, { firstLine: 0 })).join('')
}

const tocItems = [
  '1 引言',
  '2 任务概述',
  '3 总体设计',
  '4 模块概要设计',
  '5 接口设计',
  '6 数据结构设计',
  '7 运行设计',
  '8 安全设计',
  '9 部署与运维设计',
  '10 尚待解决的问题',
]

const content = [
  paragraph('QuickSummarize', { style: 'Title', align: 'center', spacingAfter: 240 }),
  paragraph('概要设计说明书', { style: 'TitleCn', align: 'center', spacingAfter: 240 }),
  blank(),
  blank(),
  paragraph('项目名称：QuickSummarize 视频智能摘要系统', { align: 'center' }),
  paragraph('文档编号：QS-SD-概要-001', { align: 'center' }),
  paragraph('版本号：V1.0', { align: 'center' }),
  paragraph('状态：正式版', { align: 'center' }),
  paragraph('编制日期：2026-03-09', { align: 'center' }),
  blank(),
  blank(),
  paragraph('编制单位：QuickSummarize 项目组', { align: 'center' }),
  pageBreak(),

  paragraph('修订记录', { style: 'Heading1Cn', pageBreakBefore: false }),
  table(
    [
      ['版本', '修订日期', '修订人', '修订说明'],
      ['V1.0', '2026-03-09', 'OpenCode', '根据项目当前实现整理首版概要设计说明书'],
    ],
    [1200, 1800, 1800, 5400]
  ),
  blank(),
  paragraph('审批信息', { style: 'Heading1Cn' }),
  table(
    [
      ['角色', '姓名', '签字', '日期'],
      ['编制', '', '', ''],
      ['审核', '', '', ''],
      ['批准', '', '', ''],
    ],
    [1800, 2200, 2200, 2200]
  ),
  pageBreak(),

  paragraph('目录', { style: 'Heading1Cn' }),
  ...tocItems.map((item) => paragraph(item)),
  pageBreak(),

  paragraph('1 引言', { style: 'Heading1Cn' }),
  paragraph('1.1 编写目的', { style: 'Heading2Cn' }),
  paragraph('本文档用于说明 QuickSummarize 视频智能摘要系统的总体技术方案、模块划分、接口关系、运行机制及主要约束，为后续详细设计、编码实现、测试验收、部署上线和项目交付提供依据。', { firstLine: 420 }),
  paragraph('1.2 项目背景', { style: 'Heading2Cn' }),
  paragraph('QuickSummarize 是一个面向 YouTube 视频场景的智能摘要系统。系统当前以 Chrome 扩展为核心载体，为用户提供视频识别、字幕提取、实时摘要生成、时间线分段总结和中英文切换等能力，并配套提供基于 Next.js 的产品官网用于功能介绍和下载指引。', { firstLine: 420 }),
  paragraph('1.3 术语、定义和缩略语', { style: 'Heading2Cn' }),
  table(
    [
      ['术语', '说明'],
      ['LLM', '大语言模型，用于根据字幕生成结构化摘要与分段总结'],
      ['SSE', '服务端事件流，用于模型输出的实时流式返回'],
      ['MV3', 'Chrome 扩展 Manifest V3 运行规范'],
      ['Side Panel', 'Chrome 浏览器侧边栏扩展界面'],
      ['timedtext', 'YouTube 字幕接口数据'],
    ],
    [2200, 6200]
  ),
  paragraph('1.4 参考资料', { style: 'Heading2Cn' }),
  bullets([
    'GB/T 8567 软件文档编制规范相关要求。',
    '项目源码中的 README、manifest、后台脚本、内容脚本、侧边栏脚本和公共库模块。',
    '项目中的测试用例，用于反向验证主要设计意图和处理边界。',
  ]),

  paragraph('2 任务概述', { style: 'Heading1Cn' }),
  paragraph('2.1 建设目标', { style: 'Heading2Cn' }),
  paragraph('在不依赖自建后端摘要服务的前提下，实现面向 YouTube 视频的轻量化摘要系统。系统应能够在浏览器端获取视频字幕，调用兼容 OpenAI 协议的模型接口进行流式总结，并以侧边栏和页面内嵌方式输出结果。', { firstLine: 420 }),
  paragraph('2.2 设计范围', { style: 'Heading2Cn' }),
  bullets([
    'Chrome 扩展端的总体架构、模块划分和主要处理流程。',
    '字幕抓取、摘要生成、时间线总结、本地配置存储等关键能力设计。',
    '扩展内部消息接口、页面桥接接口和外部模型调用接口设计。',
    '官网子系统的功能定位、部署方式和预留接口说明。',
  ]),
  paragraph('2.3 运行环境', { style: 'Heading2Cn' }),
  table(
    [
      ['项目', '要求'],
      ['浏览器环境', 'Chrome 浏览器，支持 Manifest V3 与 Side Panel API'],
      ['视频站点', 'https://www.youtube.com/*'],
      ['模型接口', '兼容 OpenAI /chat/completions 协议，支持流式返回'],
      ['官网运行环境', 'Node.js + Next.js 标准运行环境'],
    ],
    [2400, 6000]
  ),
  paragraph('2.4 假设与约束', { style: 'Heading2Cn' }),
  bullets([
    '系统默认用户自行配置模型服务地址、模型名称和 API Key。',
    '系统依赖 YouTube 页面可获取字幕或可拦截到字幕数据。',
    '当前版本不包含账号体系、计费体系和后端统一鉴权能力。',
  ]),

  paragraph('3 总体设计', { style: 'Heading1Cn' }),
  paragraph('3.1 设计原则', { style: 'Heading2Cn' }),
  bullets([
    '本地优先：核心摘要链路在浏览器扩展内完成。',
    '模块解耦：按页面识别、字幕、模型、存储、展示等能力拆分。',
    '可扩展：官网服务端接口保留后续承载统一服务的扩展空间。',
    '可维护：核心领域逻辑具备测试覆盖，便于演进。',
  ]),
  paragraph('3.2 系统总体架构', { style: 'Heading2Cn' }),
  paragraph('系统总体上采用“浏览器扩展主导 + 官网展示辅助 + 第三方模型服务外部提供”的分层架构。表现层由 Side Panel、页面内嵌面板和官网页面组成；业务控制层由后台脚本、内容脚本和侧边栏控制逻辑构成；领域能力层由字幕解析、时间线总结、国际化、存储和模型调用模块构成；外部依赖层包括 YouTube 页面数据、兼容 OpenAI 协议的模型服务和 Chrome 扩展运行环境。', { firstLine: 420 }),
  paragraph('3.3 系统功能结构', { style: 'Heading2Cn' }),
  table(
    [
      ['子系统', '主要功能'],
      ['Chrome 扩展子系统', '视频识别、字幕提取、摘要生成、分段总结、结果展示、本地配置'],
      ['官网子系统', '产品展示、功能说明、下载引导、多语言页面展示'],
      ['外部模型服务', '根据字幕生成结构化摘要和时间线分段总结'],
    ],
    [2500, 5900]
  ),
  paragraph('3.4 逻辑处理流程', { style: 'Heading2Cn' }),
  bullets([
    '用户打开 YouTube 视频页面。',
    '内容脚本识别视频并注入页面钩子。',
    '页面钩子捕获字幕轨道或 timedtext 响应。',
    '侧边栏请求字幕并发起模型摘要。',
    '后台代理流式结果返回，界面实时渲染。',
    '按需生成时间线分段总结并支持定位回看。',
  ]),

  paragraph('4 模块概要设计', { style: 'Heading1Cn' }),
  paragraph('4.1 后台模块设计', { style: 'Heading2Cn' }),
  paragraph('后台模块对应 extension/background.js，负责打开 Side Panel、接收 PROXY_FETCH 请求、建立 QS_SSE_PROXY 流式代理通道，并在权限范围内协助前端模块访问外部模型服务。该模块不负责业务编排，只提供运行时公共基础能力。', { firstLine: 420 }),
  paragraph('4.2 内容脚本模块设计', { style: 'Heading2Cn' }),
  paragraph('内容脚本对应 extension/content.js，负责识别当前页面是否为 YouTube 视频页，提取视频编号与标题，注入 page-hook.js，监听路由变化，并对侧边栏提供 REQUEST_TRANSCRIPT_V2、REQUEST_VIDEO_INFO、SEEK_TO 等消息服务。', { firstLine: 420 }),
  paragraph('4.3 页面钩子模块设计', { style: 'Heading2Cn' }),
  paragraph('页面钩子对应 extension/page-hook.js，运行于页面上下文，通过 Hook fetch/XMLHttpRequest 拦截 timedtext 响应，同时从播放器对象中提取字幕轨道信息，完成字幕轨道切换、字幕预热及字幕数据回传。该模块是系统获取字幕的关键能力点。', { firstLine: 420 }),
  paragraph('4.4 Side Panel 模块设计', { style: 'Heading2Cn' }),
  paragraph('Side Panel 对应 extension/sidepanel.js，是系统的主交互控制器。模块采用状态驱动方式，支持未配置、无视频、就绪、加载中、已完成、分段总结、错误等状态切换，并负责配置加载、字幕请求、摘要生成、Markdown 渲染、复制、取消、重试及视频跳转等操作。', { firstLine: 420 }),
  paragraph('4.5 模型调用模块设计', { style: 'Heading2Cn' }),
  paragraph('模型调用模块对应 extension/lib/llm.js，负责构造请求体、处理 SSE 数据流、清理思维链或无关文本，并按中英文场景选择不同系统提示词。模块支持“端口代理优先、消息代理降级、直接 fetch 兜底”的调用策略。', { firstLine: 420 }),
  paragraph('4.6 字幕与时间线处理模块设计', { style: 'Heading2Cn' }),
  paragraph('字幕与时间线处理模块对应 transcript.js、subtitles.js、timeline-summary.js，负责解析 YouTube 字幕、合并碎片字幕、按块生成时间线摘要，并在模型输出不满足预期时执行修正或降级处理。', { firstLine: 420 }),
  paragraph('4.7 存储与国际化模块设计', { style: 'Heading2Cn' }),
  paragraph('存储模块基于 chrome.storage.local 保存 baseUrl、model、apiKey、language 四类配置；国际化模块负责扩展端与官网端的中英文切换。扩展端语言可持久化，官网端当前主要基于前端上下文管理。', { firstLine: 420 }),
  paragraph('4.8 官网模块设计', { style: 'Heading2Cn' }),
  paragraph('官网模块对应 web/src/app/page.tsx 及其组件集合，负责 Header、Hero、Features、HowItWorks、Download、Footer 等页面展示内容。web/src/app/api/summarize/route.ts 目前仅为预留接口，返回 501，尚未承担正式业务职责。', { firstLine: 420 }),

  paragraph('5 接口设计', { style: 'Heading1Cn' }),
  paragraph('5.1 扩展内部消息接口', { style: 'Heading2Cn' }),
  table(
    [
      ['接口标识', '发送方', '接收方', '说明'],
      ['REQUEST_VIDEO_INFO', 'Side Panel', 'Content Script', '获取当前视频编号和标题'],
      ['REQUEST_TRANSCRIPT_V2', 'Side Panel', 'Content Script', '获取字幕文本及时间片段'],
      ['SEEK_TO', 'Side Panel', 'Content Script', '控制视频跳转到指定时间点'],
      ['PROXY_FETCH', '前端模块', 'Background', '由后台代理外部 HTTP 请求'],
      ['QS_SSE_PROXY', 'Side Panel', 'Background', '建立模型流式输出通道'],
    ],
    [2400, 1700, 1700, 3500]
  ),
  paragraph('5.2 页面桥接接口', { style: 'Heading2Cn' }),
  table(
    [
      ['消息标识', '说明'],
      ['REQUEST_CAPTION_TRACKS', '请求页面上下文返回字幕轨道信息'],
      ['CAPTION_TRACK_URLS', '页面上下文返回可用字幕轨道 URL'],
      ['PREFETCH_TIMEDTEXT', '触发字幕接口预热请求'],
      ['TIMEDTEXT_RESPONSE', '回传捕获到的 timedtext 字幕数据'],
      ['SWITCH_CAPTION_LANGUAGE', '切换字幕语言'],
    ],
    [3200, 5200]
  ),
  paragraph('5.3 外部服务接口', { style: 'Heading2Cn' }),
  table(
    [
      ['接口名称', '方式', '说明'],
      ['模型摘要接口', 'HTTP POST', '向 {baseUrl}/chat/completions 发送字幕文本并接收流式摘要结果'],
      ['官网预留接口', 'HTTP POST', 'web/src/app/api/summarize/route.ts 当前返回 501，仅作为后续扩展预留'],
    ],
    [2200, 1800, 5200]
  ),

  paragraph('6 数据结构设计', { style: 'Heading1Cn' }),
  paragraph('6.1 主要数据项', { style: 'Heading2Cn' }),
  table(
    [
      ['数据对象', '关键字段', '说明'],
      ['系统配置对象', 'baseUrl, model, apiKey, language', '保存模型服务配置与语言设置'],
      ['视频信息对象', 'videoId, title', '保存当前视频上下文信息'],
      ['字幕片段对象', 'startSec, text', '保存带时间戳的字幕片段'],
      ['字幕缓存对象', 'transcriptText, segments, mergedSegments, timelineByLanguage', '保存运行时字幕和时间线结果缓存'],
    ],
    [2200, 2600, 4200]
  ),
  paragraph('6.2 数据存储策略', { style: 'Heading2Cn' }),
  bullets([
    '持久化配置存储在 chrome.storage.local。',
    '字幕与时间线缓存主要保存在内容脚本和侧边栏的内存状态中。',
    '官网当前无独立业务数据库。',
  ]),

  paragraph('7 运行设计', { style: 'Heading1Cn' }),
  paragraph('7.1 初始化流程', { style: 'Heading2Cn' }),
  paragraph('扩展加载后，后台模块注册 Side Panel 打开行为；内容脚本在 YouTube 页面中启动视频识别和路由监听；侧边栏加载后读取本地配置，根据是否已配置和是否识别到视频切换到对应状态。', { firstLine: 420 }),
  paragraph('7.2 摘要生成流程', { style: 'Heading2Cn' }),
  paragraph('用户点击“生成总结”后，侧边栏向内容脚本请求字幕。内容脚本优先使用页面钩子捕获的字幕数据解析文本与片段，再调用模型服务进行流式摘要；后台负责在需要时代理网络访问和流式返回；侧边栏实时渲染摘要内容并支持取消与重试。', { firstLine: 420 }),
  paragraph('7.3 分段总结流程', { style: 'Heading2Cn' }),
  paragraph('当用户查看分段总结时，系统会在已有字幕片段基础上执行片段合并与分块处理，再由模型按块生成时间线结构化结果。结果按语言缓存，可减少重复计算，并支持点击时间点回跳到视频播放位置。', { firstLine: 420 }),
  paragraph('7.4 异常处理设计', { style: 'Heading2Cn' }),
  bullets([
    '未配置模型参数时，系统提示用户前往设置页。',
    '未打开 YouTube 视频页时，系统进入无视频状态。',
    '无字幕、字幕为空或字幕获取失败时，系统提示错误并允许重试。',
    '模型请求失败或流式中断时，系统转入错误状态并保留再试入口。',
    '用户主动取消时，系统终止当前摘要任务并反馈取消结果。',
  ]),
  paragraph('7.5 性能考虑', { style: 'Heading2Cn' }),
  bullets([
    '采用 SSE 流式输出降低用户等待感。',
    '通过字幕缓存、轨道 URL 缓存和预热机制减少重复抓取。',
    '通过分块时间线总结控制长字幕输入规模。',
  ]),

  paragraph('8 安全设计', { style: 'Heading1Cn' }),
  paragraph('8.1 安全现状', { style: 'Heading2Cn' }),
  bullets([
    'API Key 当前保存在 chrome.storage.local 中，未加密。',
    '扩展具有较宽的主机访问权限，用于兼容不同模型服务地址。',
    '页面钩子修改页面网络请求行为，但作用域限定为 YouTube 页面。',
    '模型输出通过 Markdown 渲染，当前未发现独立 HTML 安全净化链路。',
  ]),
  paragraph('8.2 风险控制建议', { style: 'Heading2Cn' }),
  bullets([
    '后续版本建议增加 API Key 的加密存储或服务端托管。',
    '对 Markdown 渲染结果增加白名单净化与 XSS 防护。',
    '对扩展权限与代理能力进行发布前专项审计。',
    '建立对 YouTube 页面结构变化的兼容性监测与回归测试机制。',
  ]),

  paragraph('9 部署与运维设计', { style: 'Heading1Cn' }),
  paragraph('9.1 部署方式', { style: 'Heading2Cn' }),
  table(
    [
      ['部署对象', '部署方式'],
      ['Chrome 扩展', '在项目根目录执行 npm run build，生成 extension/dist 后以开发者模式加载 extension 目录'],
      ['官网', '在 web 目录执行 npm install、npm run build、npm run start 完成标准 Next.js 部署'],
    ],
    [2200, 6200]
  ),
  paragraph('9.2 运维说明', { style: 'Heading2Cn' }),
  bullets([
    '当前版本以本地运行和前端日志诊断为主，未形成完整后端运维体系。',
    '若后续启用服务端摘要接口，应补充日志、监控、限流、鉴权和告警方案。',
  ]),

  paragraph('10 尚待解决的问题', { style: 'Heading1Cn' }),
  bullets([
    '官网预留摘要接口尚未实现，当前主链路完全依赖扩展直连第三方模型服务。',
    '本地敏感配置保护能力不足。',
    '对模型输出内容的安全净化仍需增强。',
    '缺少统一的版本发布、运行监控和问题追踪机制。',
  ]),

  paragraph('附：设计结论', { style: 'Heading1Cn' }),
  paragraph('QuickSummarize 当前版本已经形成较完整的浏览器扩展式视频摘要架构。其核心特征为：以 Chrome 扩展为执行主体，以 YouTube 页面字幕捕获为数据来源，以第三方兼容 OpenAI 协议的模型服务为智能能力来源，以官网为展示辅助入口。该方案部署轻量、实现清晰，适合作为后续详细设计和产品化增强的基础版本。', { firstLine: 420 }),
]

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" mc:Ignorable="w14 wp14">
  <w:body>
    ${content.join('')}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800" w:header="851" w:footer="992" w:gutter="0"/>
      <w:cols w:space="425"/>
      <w:docGrid w:type="lines" w:linePitch="312"/>
    </w:sectPr>
  </w:body>
</w:document>`

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="宋体" w:cs="Times New Roman"/>
        <w:lang w:val="zh-CN" w:eastAsia="zh-CN" w:bidi="ar-SA"/>
        <w:sz w:val="24"/>
        <w:szCs w:val="24"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:line="360" w:lineRule="auto" w:after="120"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:pPr><w:jc w:val="center"/></w:pPr>
    <w:rPr><w:rFonts w:eastAsia="黑体"/><w:b/><w:sz w:val="36"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="TitleCn">
    <w:name w:val="TitleCn"/>
    <w:basedOn w:val="Title"/>
    <w:rPr><w:rFonts w:eastAsia="黑体"/><w:b/><w:sz w:val="40"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1Cn">
    <w:name w:val="Heading1Cn"/>
    <w:pPr><w:outlineLvl w:val="0"/><w:spacing w:before="240" w:after="120"/></w:pPr>
    <w:rPr><w:rFonts w:eastAsia="黑体"/><w:b/><w:sz w:val="32"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2Cn">
    <w:name w:val="Heading2Cn"/>
    <w:pPr><w:outlineLvl w:val="1"/><w:spacing w:before="180" w:after="60"/></w:pPr>
    <w:rPr><w:rFonts w:eastAsia="黑体"/><w:b/><w:sz w:val="28"/></w:rPr>
  </w:style>
  <w:style w:type="table" w:styleId="TableGrid">
    <w:name w:val="Table Grid"/>
  </w:style>
</w:styles>`

const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`

const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`

const documentRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>QuickSummarize 概要设计说明书</dc:title>
  <dc:subject>概要设计说明书</dc:subject>
  <dc:creator>OpenCode</dc:creator>
  <cp:keywords>QuickSummarize,概要设计,软件设计</cp:keywords>
  <dc:description>按照中国项目交付习惯整理的概要设计说明书</dc:description>
  <cp:lastModifiedBy>OpenCode</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">2026-03-09T00:00:00Z</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">2026-03-09T00:00:00Z</dcterms:modified>
</cp:coreProperties>`

const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>OpenCode</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <Company>QuickSummarize</Company>
  <LinksUpToDate>false</LinksUpToDate>
  <SharedDoc>false</SharedDoc>
  <HyperlinksChanged>false</HyperlinksChanged>
  <AppVersion>1.0</AppVersion>
</Properties>`

async function main() {
  await fs.rm(outDir, { recursive: true, force: true })
  await fs.mkdir(path.join(outDir, '_rels'), { recursive: true })
  await fs.mkdir(path.join(outDir, 'docProps'), { recursive: true })
  await fs.mkdir(path.join(outDir, 'word', '_rels'), { recursive: true })

  await fs.writeFile(path.join(outDir, '[Content_Types].xml'), contentTypesXml)
  await fs.writeFile(path.join(outDir, '_rels', '.rels'), rootRelsXml)
  await fs.writeFile(path.join(outDir, 'docProps', 'core.xml'), coreXml)
  await fs.writeFile(path.join(outDir, 'docProps', 'app.xml'), appXml)
  await fs.writeFile(path.join(outDir, 'word', 'document.xml'), documentXml)
  await fs.writeFile(path.join(outDir, 'word', 'styles.xml'), stylesXml)
  await fs.writeFile(path.join(outDir, 'word', '_rels', 'document.xml.rels'), documentRelsXml)

  console.log(outFile)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
