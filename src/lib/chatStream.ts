// Helpers for streaming chat replies: the server reads Gemini's partial JSON,
// and the browser reads the server-sent events built from it.

export type StreamingReply = {
  safetyCategory?: string;
  content: string;
  contentComplete: boolean;
};

const simpleEscapes: Record<string, string> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
};

// Reads the fields Cache needs from an incomplete JSON object such as
// {"safetyCategory":"none","content":"Try a two-minute warn
// Only fully received escape sequences are decoded, so the returned content
// only ever grows as more text arrives.
export function extractStreamingReply(raw: string): StreamingReply {
  const category = raw.match(/"safetyCategory"\s*:\s*"([a-z_]+)"/);
  const start = raw.match(/"content"\s*:\s*"/);
  const reply: StreamingReply = { content: '', contentComplete: false };
  if (category) reply.safetyCategory = category[1];
  if (!start || start.index === undefined) return reply;

  let index = start.index + start[0].length;
  let content = '';
  while (index < raw.length) {
    const character = raw[index];
    if (character === '"') {
      reply.contentComplete = true;
      break;
    }
    if (character !== '\\') {
      content += character;
      index += 1;
      continue;
    }
    const escape = raw[index + 1];
    if (escape === undefined) break;
    if (escape === 'u') {
      const hex = raw.slice(index + 2, index + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) break;
      content += String.fromCharCode(parseInt(hex, 16));
      index += 6;
      continue;
    }
    content += simpleEscapes[escape] ?? escape;
    index += 2;
  }
  reply.content = content;
  return reply;
}

export function formatServerSentEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export type ServerSentEvent = { event: string; data: unknown };

// Splits a buffer of server-sent events into complete events and the
// unfinished remainder, which the caller keeps for the next chunk.
export function parseServerSentEvents(buffer: string): { events: ServerSentEvent[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const blocks = normalized.split('\n\n');
  const rest = blocks.pop() ?? '';
  const events = blocks.flatMap((block): ServerSentEvent[] => {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
    }
    if (!dataLines.length) return [];
    try {
      return [{ event, data: JSON.parse(dataLines.join('\n')) }];
    } catch {
      return [];
    }
  });
  return { events, rest };
}
