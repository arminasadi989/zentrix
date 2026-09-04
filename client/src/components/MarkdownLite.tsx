import { Fragment, type ReactNode } from 'react';

/**
 * Minimal, dependency-free renderer for the subset of Markdown the model emits:
 * headings, bullet lists, numbered lists, bold and inline code. Text is placed
 * as React children (never innerHTML), so model output cannot inject markup.
 */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    const key = `${keyPrefix}-i${index}`;
    index += 1;
    if (token.startsWith('**')) nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export function MarkdownLite({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let listBuffer: string[] = [];
  let listKind: 'ul' | 'ol' | null = null;

  const flushList = (key: string) => {
    if (!listBuffer.length || !listKind) return;
    const items = listBuffer.map((item, i) => <li key={`${key}-li${i}`}>{renderInline(item, `${key}-li${i}`)}</li>);
    blocks.push(listKind === 'ul' ? <ul key={key}>{items}</ul> : <ol key={key}>{items}</ol>);
    listBuffer = [];
    listKind = null;
  };

  lines.forEach((rawLine, lineIndex) => {
    const line = rawLine.trimEnd();
    const key = `b${lineIndex}`;

    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);

    if (bullet?.[1] !== undefined) {
      if (listKind === 'ol') flushList(`${key}-flush`);
      listKind = 'ul';
      listBuffer.push(bullet[1]);
      return;
    }
    if (numbered?.[2] !== undefined) {
      if (listKind === 'ul') flushList(`${key}-flush`);
      listKind = 'ol';
      listBuffer.push(numbered[2]);
      return;
    }

    flushList(`${key}-flush`);

    if (heading?.[2] !== undefined) {
      const level = heading[1]?.length ?? 2;
      const Tag = (level <= 2 ? 'h3' : 'h4') as 'h3' | 'h4';
      blocks.push(<Tag key={key}>{renderInline(heading[2], key)}</Tag>);
      return;
    }
    if (!line.trim()) {
      blocks.push(<div key={key} className="md-gap" />);
      return;
    }
    blocks.push(<p key={key}>{renderInline(line, key)}</p>);
  });

  flushList('b-final');
  return <Fragment>{blocks}</Fragment>;
}
