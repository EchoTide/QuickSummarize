import { describe, it, expect } from 'vitest'
import {
  parseTranscriptXml,
  parseTranscriptJson3,
  parseTranscriptDetailedResponse,
  parseTranscriptResponse,
} from '../extension/lib/transcript.js'

describe('parseTranscriptXml', () => {
  it('parses XML transcript into plain text', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<transcript>
  <text start="0" dur="5.2">Hello world</text>
  <text start="5.2" dur="3.1">This is a test</text>
  <text start="8.3" dur="4.0">Thank you for watching</text>
</transcript>`
    const result = parseTranscriptXml(xml)
    expect(result).toBe('Hello world This is a test Thank you for watching')
  })

  it('handles HTML entities in transcript', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<transcript>
  <text start="0" dur="3">It&#39;s a &amp; b &lt; c</text>
</transcript>`
    const result = parseTranscriptXml(xml)
    expect(result).toBe("It's a & b < c")
  })

  it('returns empty string for empty transcript', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?><transcript></transcript>`
    expect(parseTranscriptXml(xml)).toBe('')
  })
})

describe('parseTranscriptJson3', () => {
  it('parses JSON3 format transcript', () => {
    const json = JSON.stringify({
      events: [
        { tStartMs: 0, dDurationMs: 5000, segs: [{ utf8: 'Hello ' }, { utf8: 'world' }] },
        { tStartMs: 5000, dDurationMs: 3000, segs: [{ utf8: 'This is a test' }] },
      ],
    })
    expect(parseTranscriptJson3(json)).toBe('Hello world This is a test')
  })

  it('returns empty string for invalid JSON', () => {
    expect(parseTranscriptJson3('not json')).toBe('')
  })

  it('parses JSON3 with XSSI prefix', () => {
    const payload = JSON.stringify({
      events: [{ segs: [{ utf8: 'Hello from xssi' }] }],
    })
    expect(parseTranscriptJson3(`)]}'\n${payload}`)).toBe('Hello from xssi')
  })
})

describe('parseTranscriptResponse', () => {
  it('parses XML format', () => {
    const xml = `<transcript><text start="0" dur="3">Hello</text></transcript>`
    expect(parseTranscriptResponse(xml)).toBe('Hello')
  })

  it('parses JSON3 format', () => {
    const json = JSON.stringify({
      events: [{ tStartMs: 0, segs: [{ utf8: 'Hello' }] }],
    })
    expect(parseTranscriptResponse(json)).toBe('Hello')
  })

  it('returns empty string for unknown format', () => {
    expect(parseTranscriptResponse('random garbage')).toBe('')
  })

  it('parses srv3 XML format used by some YouTube caption tracks', () => {
    const srv3 = `<timedtext><body><p t="0" d="1200"><s t="0" ac="0">Hello</s><s t="300" ac="0"> world</s></p><p t="1200" d="800">second line</p></body></timedtext>`
    expect(parseTranscriptResponse(srv3)).toBe('Hello world second line')
  })

  it('parses WEBVTT subtitle format', () => {
    const vtt = `WEBVTT

00:00:00.000 --> 00:00:01.200
Hello world

00:00:01.200 --> 00:00:02.000
Second line`
    expect(parseTranscriptResponse(vtt)).toBe('Hello world Second line')
  })
})

describe('parseTranscriptDetailedResponse', () => {
  it('returns timestamped segments for json3 transcript', () => {
    const json = JSON.stringify({
      events: [
        { tStartMs: 2400, segs: [{ utf8: 'line one' }] },
        { tStartMs: 5200, segs: [{ utf8: 'line two' }] },
      ],
    })

    const result = parseTranscriptDetailedResponse(json)
    expect(result.text).toBe('line one line two')
    expect(result.segments).toEqual([
      { startSec: 2.4, text: 'line one' },
      { startSec: 5.2, text: 'line two' },
    ])
  })
})
