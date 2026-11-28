import { describe, expect, it } from 'vitest';
import { extractStreamingReply, formatServerSentEvent, parseServerSentEvents } from './chatStream';

describe('extractStreamingReply', () => {
  const full = JSON.stringify({
    safetyCategory: 'none',
    content: 'Try a "two-minute" warning.\n\n- Use a timer\\clock é',
    usedMemoryIds: [],
  });

  it('decodes the complete reply', () => {
    expect(extractStreamingReply(full)).toEqual({
      safetyCategory: 'none',
      content: 'Try a "two-minute" warning.\n\n- Use a timer\\clock é',
      contentComplete: true,
    });
  });

  it('only grows as more raw text arrives, including across split escapes', () => {
    let previous = '';
    for (let length = 0; length <= full.length; length += 1) {
      const { content } = extractStreamingReply(full.slice(0, length));
      expect(content.startsWith(previous)).toBe(true);
      previous = content;
    }
    expect(previous).toBe('Try a "two-minute" warning.\n\n- Use a timer\\clock é');
  });

  it('decodes unicode escapes once all four digits arrive', () => {
    expect(extractStreamingReply('{"content":"caf\\u00').content).toBe('caf');
    expect(extractStreamingReply('{"content":"caf\\u00e9').content).toBe('café');
  });

  it('reports no category until the model has written it', () => {
    expect(extractStreamingReply('{"safetyCat').safetyCategory).toBeUndefined();
    expect(extractStreamingReply('{"safetyCategory":"emergency","content":"x').safetyCategory).toBe('emergency');
  });
});

describe('parseServerSentEvents', () => {
  it('returns complete events and keeps the unfinished remainder', () => {
    const stream = formatServerSentEvent('delta', { text: 'Hi' }) + formatServerSentEvent('done', { ok: true }) + 'event: delta\ndata: {"te';
    expect(parseServerSentEvents(stream)).toEqual({
      events: [{ event: 'delta', data: { text: 'Hi' } }, { event: 'done', data: { ok: true } }],
      rest: 'event: delta\ndata: {"te',
    });
  });

  it('ignores comments and malformed data', () => {
    expect(parseServerSentEvents(': keep-alive\n\nevent: delta\ndata: {bad\n\n').events).toEqual([]);
  });
});
