import { Marked, type MarkedToken, type Token } from 'marked';
import { clip } from '@/shared/ask-about';
import { isPlainAnswer } from '@/shared/answer-presentation';
import type { AnswerSpec } from '@/shared/answer/spec';
import { MARKDOWN_OPTIONS } from '@/shared/components/markdown-loader';

const QUOTE_MAX = 200;
const markdown = new Marked(MARKDOWN_OPTIONS);

// shortcut: six named entities and no C1 remap; add the full HTML table if replies use others.
const NAMED = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ['nbsp', '\u00a0'],
]);
// The references marked leaves for the browser: a name or a 1-7 digit or 1-6 hex number, then a semicolon.
const ENTITY = /&(?:#(\d{1,7})|#x([\da-f]{1,6})|(\w+));/gi;

/** Text with its character references as the browser shows them. */
function decoded(text: string): string {
  return text.replace(ENTITY, (ref, dec?: string, hex?: string, name?: string) => {
    if (name !== undefined) return NAMED.get(name) ?? ref;
    const cp = dec !== undefined ? Number.parseInt(dec, 10) : Number.parseInt(hex ?? '', 16);
    return cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)
      ? '\uFFFD'
      : String.fromCodePoint(cp);
  });
}

/** The text a token shows in the panel: code and raw HTML as their source, Markdown marks and markers gone. */
function shown(token: Token): string {
  // A Generic token comes only from an extension, and this lexer has none.
  const t = token as MarkedToken;
  switch (t.type) {
    case 'code':
    case 'codespan':
    case 'escape':
      return t.text;
    case 'html':
      // A block shows as code; inline HTML shows as text, where the browser decodes its entities.
      return t.block ? t.text : decoded(t.text);
    case 'text':
      return t.tokens ? inline(t.tokens) : decoded(t.text);
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
