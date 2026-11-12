// 把模型回答里常见的 Markdown 写法（标题、加粗、列表、表格、引用、代码）排成页面元素。
// 全程只生成文字节点和固定的几种标签，不解析也不执行回答里的任何 HTML；链接只接受 http/https。
import { h, type VNode } from 'vue'

type Node = VNode | string

const INLINE = /(`[^`\n]+`)|(\*\*[^\n]+?\*\*)|(\*[^*\s][^*\n]*?\*)|(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/
const NUMERIC = /^[+\-−]?\d[\d,]*(\.\d+)?%?$/

function inline(text: string): Node[] {
  const nodes: Node[] = []
  let last = 0
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const token = match[0]
    if (match[1]) nodes.push(h('code', token.slice(1, -1)))
    else if (match[2]) nodes.push(h('strong', inline(token.slice(2, -2))))
    else if (match[3]) nodes.push(h('em', inline(token.slice(1, -1))))
    else {
      const split = token.indexOf('](')
      nodes.push(h('a', { href: token.slice(split + 2, -1), target: '_blank', rel: 'noopener noreferrer' }, token.slice(1, split)))
    }
    last = match.index + token.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
}

function isBlockStart(lines: string[], index: number): boolean {
  const line = lines[index]
  return /^\s*(#{1,6}\s|>|```)/.test(line) || LIST_ITEM.test(line) || /^\s*([-*_])\1{2,}\s*$/.test(line) || (line.includes('|') && TABLE_RULE.test(lines[index + 1] ?? ''))
}

function table(lines: string[], start: number): { node: VNode; next: number } {
  const head = cells(lines[start])
  const rows: string[][] = []
  let index = start + 2
  while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
    rows.push(cells(lines[index]))
    index += 1
  }
  const node = h('div', { class: 'md-table' }, h('table', [
    h('thead', h('tr', head.map((cell) => h('th', inline(cell))))),
    h('tbody', rows.map((row) => h('tr', head.map((_, column) => {
      const cell = row[column] ?? ''
      return h('td', { class: NUMERIC.test(cell) ? 'md-num' : undefined }, inline(cell))
    })))),
  ]))
  return { node, next: index }
}

/** 连续的列表行组成一个列表；缩进更深的行归到上一项里，作为嵌套内容再排一遍。 */
function list(lines: string[], start: number): { node: VNode; next: number } {
  const first = LIST_ITEM.exec(lines[start])!
  const indent = first[1].length
  const ordered = /\d/.test(first[2])
  const items: { text: string; nested: string[] }[] = []
  let index = start
  while (index < lines.length) {
    const line = lines[index]
    const match = LIST_ITEM.exec(line)
    if (match && match[1].length === indent && /\d/.test(match[2]) === ordered) {
      items.push({ text: match[3], nested: [] })
    } else if (items.length && line.trim() && line.search(/\S/) > indent) {
      items[items.length - 1].nested.push(line)
    } else if (!line.trim() && LIST_ITEM.test(lines[index + 1] ?? '') && (lines[index + 1].search(/\S/) >= indent)) {
      // 列表项之间的空行不打断列表。
    } else {
      break
    }
    index += 1
  }
  const node = h(ordered ? 'ol' : 'ul', items.map((item) => h('li', [...inline(item.text), ...(item.nested.length ? blocks(item.nested.join('\n')) : [])])))
  return { node, next: index }
}

export function blocks(source: string): VNode[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const out: VNode[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index += 1
      continue
    }
    if (/^\s*```/.test(line)) {
      const body: string[] = []
      index += 1
      while (index < lines.length && !/^\s*```/.test(lines[index])) {
        body.push(lines[index])
        index += 1
      }
      index += 1
      out.push(h('pre', h('code', body.join('\n'))))
      continue
    }
    const heading = /^\s*(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (heading) {
      // 回答里的标题最多用到三、四级，不抢页面自己的标题层级。
      out.push(h(heading[1].length <= 2 ? 'h3' : 'h4', inline(heading[2])))
      index += 1
      continue
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      out.push(h('hr'))
      index += 1
      continue
    }
    if (/^\s*>/.test(line)) {
      const quoted: string[] = []
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quoted.push(lines[index].replace(/^\s*>\s?/, ''))
        index += 1
      }
      out.push(h('blockquote', blocks(quoted.join('\n'))))
      continue
    }
    if (line.includes('|') && TABLE_RULE.test(lines[index + 1] ?? '')) {
      const result = table(lines, index)
      out.push(result.node)
      index = result.next
      continue
    }
    if (LIST_ITEM.test(line)) {
      const result = list(lines, index)
      out.push(result.node)
      index = result.next
      continue
    }
    const paragraph: string[] = [line]
    index += 1
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) {
      paragraph.push(lines[index])
      index += 1
    }
    out.push(h('p', inline(paragraph.join('\n'))))
  }
  return out
}
