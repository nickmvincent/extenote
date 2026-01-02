import { useMemo } from 'react'

interface MarkdownPreviewProps {
  content: string
  className?: string
}

interface ParsedBlock {
  type: 'paragraph' | 'heading' | 'code' | 'list' | 'blockquote' | 'hr'
  content: string
  level?: number
  language?: string
}

export function MarkdownPreview({ content, className = '' }: MarkdownPreviewProps) {
  const blocks = useMemo(() => parseMarkdown(content), [content])

  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none ${className}`}>
      {blocks.map((block, idx) => renderBlock(block, idx))}
    </div>
  )
}

function parseMarkdown(content: string): ParsedBlock[] {
  const lines = content.split('\n')
  const blocks: ParsedBlock[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Empty line
    if (line.trim() === '') {
      i++
      continue
    }

    // Horizontal rule
    if (/^---+$|^\*\*\*+$|^___+$/.test(line.trim())) {
      blocks.push({ type: 'hr', content: '' })
      i++
      continue
    }

    // Code block
    if (line.startsWith('```')) {
      const language = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      blocks.push({ type: 'code', content: codeLines.join('\n'), language })
      i++
      continue
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        content: headingMatch[2],
        level: headingMatch[1].length
      })
      i++
      continue
    }

    // Blockquote
    if (line.startsWith('>')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].startsWith('>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      blocks.push({ type: 'blockquote', content: quoteLines.join('\n') })
      continue
    }

    // List
    if (/^[-*+]\s/.test(line) || /^\d+\.\s/.test(line)) {
      const listLines: string[] = []
      while (i < lines.length && (/^[-*+]\s/.test(lines[i]) || /^\d+\.\s/.test(lines[i]) || /^\s+/.test(lines[i]))) {
        listLines.push(lines[i])
        i++
      }
      blocks.push({ type: 'list', content: listLines.join('\n') })
      continue
    }

    // Paragraph (collect consecutive non-empty lines)
    const paraLines: string[] = []
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('#') && !lines[i].startsWith('```') && !lines[i].startsWith('>')) {
      paraLines.push(lines[i])
      i++
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', content: paraLines.join(' ') })
    }
  }

  return blocks
}

function renderBlock(block: ParsedBlock, key: number) {
  switch (block.type) {
    case 'heading':
      return renderHeading(block.content, block.level || 1, key)
    case 'code':
      return <CodeBlock key={key} code={block.content} language={block.language} />
    case 'blockquote':
      return (
        <blockquote key={key} className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic text-gray-600 dark:text-gray-400">
          {block.content}
        </blockquote>
      )
    case 'list':
      return <List key={key} content={block.content} />
    case 'hr':
      return <hr key={key} className="my-4 border-gray-200 dark:border-gray-700" />
    case 'paragraph':
    default:
      return <p key={key} className="mb-4 text-gray-800 dark:text-gray-200">{renderInline(block.content)}</p>
  }
}

function renderHeading(content: string, level: number, key: number) {
  const classes = {
    1: 'text-2xl font-bold mt-6 mb-4 text-gray-900 dark:text-white',
    2: 'text-xl font-bold mt-5 mb-3 text-gray-900 dark:text-white',
    3: 'text-lg font-semibold mt-4 mb-2 text-gray-900 dark:text-white',
    4: 'text-base font-semibold mt-3 mb-2 text-gray-900 dark:text-white',
    5: 'text-sm font-semibold mt-2 mb-1 text-gray-900 dark:text-white',
    6: 'text-sm font-medium mt-2 mb-1 text-gray-700 dark:text-gray-300',
  }
  const Tag = `h${level}` as keyof JSX.IntrinsicElements
  return <Tag key={key} className={classes[level as keyof typeof classes]}>{renderInline(content)}</Tag>
}

function renderInline(text: string): React.ReactNode {
  // Handle inline formatting: bold, italic, code, links
  const parts: React.ReactNode[] = []
  let remaining = text
  let partKey = 0

  while (remaining.length > 0) {
    // Inline code
    const codeMatch = remaining.match(/^`([^`]+)`/)
    if (codeMatch) {
      parts.push(
        <code key={partKey++} className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm font-mono text-pink-600 dark:text-pink-400">
          {codeMatch[1]}
        </code>
      )
      remaining = remaining.slice(codeMatch[0].length)
      continue
    }

    // Bold
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/) || remaining.match(/^__([^_]+)__/)
    if (boldMatch) {
      parts.push(<strong key={partKey++} className="font-bold">{boldMatch[1]}</strong>)
      remaining = remaining.slice(boldMatch[0].length)
      continue
    }

    // Italic
    const italicMatch = remaining.match(/^\*([^*]+)\*/) || remaining.match(/^_([^_]+)_/)
    if (italicMatch) {
      parts.push(<em key={partKey++} className="italic">{italicMatch[1]}</em>)
      remaining = remaining.slice(italicMatch[0].length)
      continue
    }

    // Link
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/)
    if (linkMatch) {
      parts.push(
        <a key={partKey++} href={normalizeUrl(linkMatch[2])} className="text-indigo-600 dark:text-indigo-400 hover:underline" target="_blank" rel="noopener noreferrer">
          {linkMatch[1]}
        </a>
      )
      remaining = remaining.slice(linkMatch[0].length)
      continue
    }

    // Plain text (up to next special character)
    const plainMatch = remaining.match(/^[^`*_\[]+/)
    if (plainMatch) {
      parts.push(plainMatch[0])
      remaining = remaining.slice(plainMatch[0].length)
    } else {
      // Single special char that's not part of formatting
      parts.push(remaining[0])
      remaining = remaining.slice(1)
    }
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const highlighted = useMemo(() => highlightCode(code, language), [code, language])

  return (
    <div className="my-4 rounded-lg overflow-hidden">
      {language && (
        <div className="bg-gray-800 px-4 py-1 text-xs text-gray-400 border-b border-gray-700">
          {language}
        </div>
      )}
      <pre className="bg-gray-900 p-4 overflow-x-auto">
        <code className="text-sm font-mono" dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
    </div>
  )
}

function highlightCode(code: string, _language?: string): string {
  // Simple syntax highlighting without external deps
  // Note: _language is available for future language-specific highlighting
  let result = escapeHtml(code)

  // Keywords for common languages
  const keywords = ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'import', 'export', 'from', 'async', 'await', 'try', 'catch', 'throw', 'new', 'this', 'typeof', 'instanceof', 'true', 'false', 'null', 'undefined', 'def', 'self', 'print', 'type', 'interface', 'extends', 'implements']

  // Strings (single and double quotes)
  result = result.replace(/(["'`])(?:(?!\1)[^\\]|\\.)*\1/g, '<span class="text-green-400">$&</span>')

  // Comments
  result = result.replace(/(\/\/.*$|#.*$)/gm, '<span class="text-gray-500">$&</span>')
  result = result.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="text-gray-500">$&</span>')

  // Numbers
  result = result.replace(/\b(\d+\.?\d*)\b/g, '<span class="text-orange-400">$1</span>')

  // Keywords
  for (const kw of keywords) {
    result = result.replace(new RegExp(`\\b(${kw})\\b`, 'g'), '<span class="text-purple-400">$1</span>')
  }

  // Functions
  result = result.replace(/\b([a-zA-Z_]\w*)\s*\(/g, '<span class="text-blue-400">$1</span>(')

  return result
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  // Already has a protocol
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return trimmed
  }
  // Relative paths, anchors, or mailto-style links - leave as-is
  if (trimmed.startsWith('/') || trimmed.startsWith('#') || trimmed.startsWith('./') || trimmed.startsWith('../')) {
    return trimmed
  }
  // Add https:// for URLs that look like domains
  return `https://${trimmed}`
}

function List({ content }: { content: string }) {
  const lines = content.split('\n')
  const isOrdered = /^\d+\./.test(lines[0])
  const Tag = isOrdered ? 'ol' : 'ul'
  const className = isOrdered
    ? 'list-decimal list-inside mb-4 text-gray-800 dark:text-gray-200'
    : 'list-disc list-inside mb-4 text-gray-800 dark:text-gray-200'

  return (
    <Tag className={className}>
      {lines.map((line, idx) => (
        <li key={idx} className="mb-1">
          {renderInline(line.replace(/^[-*+]\s|^\d+\.\s/, ''))}
        </li>
      ))}
    </Tag>
  )
}
