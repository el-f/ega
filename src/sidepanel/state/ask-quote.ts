import { Marked, type MarkedToken, type Token } from 'marked';
import { clip } from '@/shared/ask-about';
import { isPlainAnswer } from '@/shared/answer-presentation';
import type { AnswerSpec } from '@/shared/answer/spec';
import { MARKDOWN_OPTIONS } from '@/shared/components/markdown-loader';

const QUOTE_MAX = 200;
const markdown = new Marked(MARKDOWN_OPTIONS);

/** The text a token shows in the panel: code and raw HTML as their source, Markdown marks and markers gone. */
function shown(token: Token): string {
  // A Generic token comes only from an extension, and this lexer has none.
  const t = token as MarkedToken;
  switch (t.type) {
    case 'code':
    case 'html':
    case 'codespan':
    case 'escape':
      return t.text;
    case 'text':
      return t.tokens ? inline(t.tokens) : t.text;
    case 'heading':
    case 'paragraph':
    case 'strong':
    case 'em':
    case 'del':
    case 'link':
    case 'image':
      return inline(t.tokens);
    case 'blockquote':
    case 'list_item':
      return blocks(t.tokens);
    case 'list':
      return t.items.map((item) => blocks(item.tokens)).join('\n');
    case 'table':
      return [t.header, ...t.rows]
        .map((row) => row.map((cell) => inline(cell.tokens)).join(' '))
        .join('\n');
    case 'br':
      return '\n';
    case 'space':
    case 'hr':
    case 'def':
    case 'checkbox':
      return '';
  }
}

function inline(tokens: Token[]): string {
  return tokens.map(shown).join('');
}

function blocks(tokens: Token[]): string {
  return tokens.map(shown).join('\n');
}

/** The quote a question shows: a reply's first line of text as the panel shows it. A Markdown reply goes through the
 *  panel's own lexer; a plain one (a custom task's answer) keeps every character. */
export function askQuote(reply: {
  content: string;
  answer?: { spec: Pick<AnswerSpec, 'join'> } | undefined;
}): string {
  const text = isPlainAnswer(reply.answer?.spec, reply.content)
    ? reply.content
    : blocks(markdown.lexer(reply.content));
  const first = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l !== '');
  return clip(first ?? '', QUOTE_MAX);
}
