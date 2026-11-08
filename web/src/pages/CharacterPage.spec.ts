import { describe, expect, it } from 'vitest'
import { parse } from 'svelte/compiler'
import source from './CharacterPage.svelte?raw'

type Node = Record<string, unknown>

const page = parse(source, { modern: true })

function getNodes(root: unknown, match: (node: Node) => boolean): Node[] {
  const found: Node[] = []
  const seen = new Set<unknown>()

  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return
    if (seen.has(value)) return
    seen.add(value)

    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry))
      return
    }

    const node = value as Node
    if (typeof node.type === 'string' && match(node)) found.push(node)
    Object.values(node).forEach((entry) => visit(entry))
  }

  visit(root)
  return found
}

function getStrings(root: unknown): string[] {
  const strings: string[] = []
  const seen = new Set<unknown>()

  const visit = (value: unknown) => {
    if (typeof value === 'string') {
      strings.push(value)
      return
    }
    if (!value || typeof value !== 'object') return
    if (seen.has(value)) return
    seen.add(value)
    Object.values(value as Node).forEach((entry) => visit(entry))
  }

  visit(root)
  return strings
}

function getPart(value: unknown, key: string): unknown {
  const node = value as Node | null
  return node ? node[key] : null
}

function getName(value: unknown): string {
  const node = value as Node | null
  return node && typeof node.name === 'string' ? node.name : ''
}

function isSheet(node: Node, name: string): boolean {
  if (node.type !== 'RegularElement') return false
  if (!Array.isArray(node.attributes)) return false

  const classes = node.attributes.find((attribute) => getName(attribute) === 'class')
  return classes ? getStrings(getPart(classes, 'value')).includes(name) : false
}

describe('the sheet holds until the routed character loads', () => {
  it('starts with loaded false', () => {
    const declarations = getNodes(
      page.instance,
      (node) => node.type === 'VariableDeclarator' && getName(node.id) === 'loaded'
    )

    expect(declarations).toHaveLength(1)

    const init = declarations[0].init as Node
    expect(getName(init.callee)).toBe('$state')
    expect((init.arguments as Node[])[0].value).toBe(false)
  })

  it('renders no part of the sheet outside the loaded gate', () => {
    const gates = getNodes(
      page.fragment,
      (node) => node.type === 'IfBlock' && getName(node.test) === 'loaded'
    )

    expect(gates).toHaveLength(1)
    expect(gates[0].alternate).toBeNull()

    for (const name of ['sheet-crown', 'sheet-grid']) {
      const all = getNodes(page.fragment, (node) => isSheet(node, name))
      expect(all).toHaveLength(1)
      expect(getNodes(gates[0], (node) => isSheet(node, name))).toEqual(all)
    }
  })

  it('reads the routed character on every open, behind no condition', () => {
    const reads = getNodes(
      page.instance,
      (node) =>
        node.type === 'CallExpression' &&
        getName(node.callee) === 'getCharacter'
    )

    expect(reads).toHaveLength(1)
    expect(getName((reads[0].arguments as Node[])[0])).toBe('characterId')

    const branches = getNodes(
      page.instance,
      (node) => node.type === 'IfStatement' || node.type === 'ConditionalExpression'
    )

    for (const branch of branches) {
      expect(getNodes(branch, (node) => node === reads[0])).toEqual([])
    }
  })

  it('opens the gate only when the read settles', () => {
    const assignments = getNodes(
      page.instance,
      (node) => node.type === 'AssignmentExpression' && getName(node.left) === 'loaded'
    )

    expect(assignments).toHaveLength(1)
    expect((assignments[0].right as Node).value).toBe(true)

    const settled = getNodes(
      page.instance,
      (node) =>
        node.type === 'CallExpression' &&
        getName(getPart(node.callee, 'property')) === 'finally' &&
        getNodes(node, (inner) => inner === assignments[0]).length === 1
    )

    expect(settled).toHaveLength(1)
  })
})
