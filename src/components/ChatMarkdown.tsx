import type { ReactNode } from 'react';

interface ChatMarkdownProps {
  content: string;
}

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\n]+\*|_[^_\n]+_)/g);

  return parts.map((part, index) => {
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
      return <strong key={index} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index} className="rounded bg-ink/10 px-1 py-0.5 font-mono text-[0.85em]">{part.slice(1, -1)}</code>;
    }
    if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

function isUnorderedListItem(line: string) {
  return line.match(/^\s*[-*+]\s+(.+)$/);
}

function isOrderedListItem(line: string) {
  return line.match(/^\s*\d+[.)]\s+(.+)$/);
}

export default function ChatMarkdown({ content }: ChatMarkdownProps) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      blocks.push(<h3 key={`heading-${index}`} className="mt-4 first:mt-0 font-semibold text-base">{renderInline(heading[1])}</h3>);
      index += 1;
      continue;
    }

    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (index < lines.length && lines[index].startsWith('> ')) {
        quoteLines.push(lines[index].slice(2));
        index += 1;
      }
      blocks.push(<blockquote key={`quote-${index}`} className="my-3 border-l-2 border-sage/60 pl-3 text-ink/75">{quoteLines.map((quoteLine, quoteIndex) => <span key={quoteIndex}>{renderInline(quoteLine)}{quoteIndex < quoteLines.length - 1 && <br />}</span>)}</blockquote>);
      continue;
    }

    const unorderedItem = isUnorderedListItem(line);
    if (unorderedItem) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = isUnorderedListItem(lines[index]);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      blocks.push(<ul key={`unordered-${index}`} className="my-3 list-disc space-y-1 pl-5 marker:text-sage">{items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}</ul>);
      continue;
    }

    const orderedItem = isOrderedListItem(line);
    if (orderedItem) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = isOrderedListItem(lines[index]);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      blocks.push(<ol key={`ordered-${index}`} className="my-3 list-decimal space-y-1 pl-5 marker:text-sage">{items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}</ol>);
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length && lines[index].trim() && !lines[index].match(/^#{1,3}\s+/) && !lines[index].startsWith('> ') && !isUnorderedListItem(lines[index]) && !isOrderedListItem(lines[index])) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push(<p key={`paragraph-${index}`} className="my-3 first:mt-0 last:mb-0">{paragraphLines.map((paragraphLine, paragraphIndex) => <span key={paragraphIndex}>{renderInline(paragraphLine)}{paragraphIndex < paragraphLines.length - 1 && <br />}</span>)}</p>);
  }

  return <div>{blocks}</div>;
}
