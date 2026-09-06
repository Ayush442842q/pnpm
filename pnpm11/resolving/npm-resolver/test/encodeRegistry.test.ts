import path from 'node:path'

import { describe, expect, test } from '@jest/globals'
import { ABBREVIATED_META_DIR } from '@pnpm/constants'

import { decodeRegistry, encodeRegistry } from '../src/encodeRegistry.js'
import { getPkgMirrorPath } from '../src/pickPackage.js'

describe('encodeRegistry', () => {
  test('host only', () => {
    expect(encodeRegistry('https://registry.npmjs.org/')).toBe('registry.npmjs.org')
    expect(encodeRegistry('https://registry.npmjs.org')).toBe('registry.npmjs.org')
    expect(encodeRegistry('https://npm.example:8443/')).toBe('npm.example+8443')
    expect(encodeRegistry('https://npm.example:443/')).toBe('npm.example')
    expect(encodeRegistry('http://[::1]:8080/')).toBe('%5B%3A%3A1%5D+8080')
  })
  test('keeps the path', () => {
    expect(encodeRegistry('https://releases.jfrog.io/artifactory/api/npm/team-a/'))
      .toBe('releases.jfrog.io_artifactory+api+npm+team-a')
    expect(encodeRegistry('https://npm.example/registry'))
      .toBe(encodeRegistry('https://npm.example/registry/'))
  })
  test('same host, different paths never share a directory', () => {
    expect(encodeRegistry('https://releases.jfrog.io/artifactory/api/npm/team-a/'))
      .not.toBe(encodeRegistry('https://releases.jfrog.io/artifactory/api/npm/team-b/'))
  })
  test('escapes the delimiters', () => {
    const registries = [
      'https://repo.example/foo-bar/',
      'https://repo.example-foo/bar/',
      'https://repo.example/foo/',
      'https://repo.example_foo/',
      'https://npm.example/team/a/',
      'https://npm.example/team+a/',
      'https://npm.example/a%2Fb/',
      'https://npm.example/a%3Ab/',
    ]
    expect(new Set(registries.map(encodeRegistry)).size).toBe(registries.length)
    expect(encodeRegistry('https://repo.example_foo/')).toBe('repo.example%5Ffoo')
    expect(encodeRegistry('https://npm.example/team+a/')).toBe('npm.example_team%2Ba')
  })
  test('escapes filesystem and glob metacharacters', () => {
    expect(encodeRegistry('https://npm.example/a*b/')).toBe('npm.example_a%2Ab')
    expect(encodeRegistry('https://npm.example/a|b/')).toBe('npm.example_a%7Cb')
    // The URL parser reads a backslash in a special-scheme path as a separator.
    expect(encodeRegistry('https://npm.example/a\\b/')).toBe('npm.example_a+b')
    expect(encodeRegistry('https://npm.example/a%5Cb/'))
      .toBe('npm.example_a%255Cb_f323ed1d3ec091d56df73b036cd0f4b4b20aa1bc06272a13cfd84f36894ed440')
  })
  test('hashes a mixed-case path', () => {
    expect(encodeRegistry('https://npm.example:8443/registry/A/'))
      .toBe('npm.example+8443_registry+A_f5296609e0eaab0d2f8fe3c4503600ed349a61793535d2c95505f0710b272e65')
    expect(encodeRegistry('https://npm.example:8443/registry/a/')).toBe('npm.example+8443_registry+a')
  })
  test('hashes an oversized key', () => {
    const longPath = 'a'.repeat(300)
    const key = encodeRegistry(`https://npm.example/${longPath}/`)
    expect(key).toMatch(/^[0-9a-f]{64}$/)
    expect(key).not.toBe(encodeRegistry(`https://npm.example/${longPath}b/`))
  })
  test('rejects a registry that is not a URL with a host', () => {
    expect(() => encodeRegistry('invalid-url')).toThrow('Failed to parse registry URL "invalid-url"')
    expect(() => encodeRegistry('invalid-url')).toThrow(expect.objectContaining({ code: 'ERR_PNPM_INVALID_REGISTRY_URL' }))
    expect(() => encodeRegistry('file:///tmp/registry')).toThrow('has no host')
  })
  test('keeps credentials out of the error message', () => {
    expect(() => encodeRegistry('https://user:secret@')).toThrow('Failed to parse registry URL "https://"')
  })
})

test('decodeRegistry', () => {
  expect(decodeRegistry('registry.npmjs.org')).toBe('registry.npmjs.org')
  expect(decodeRegistry('localhost+4873')).toBe('localhost:4873')
  expect(decodeRegistry('%5B%3A%3A1%5D+8080')).toBe('[::1]:8080')
  expect(decodeRegistry('releases.jfrog.io_artifactory+api+npm+team-a'))
    .toBe('releases.jfrog.io/artifactory/api/npm/team-a')
  expect(decodeRegistry('npm.example_team%2Ba')).toBe('npm.example/team+a')
  expect(decodeRegistry('npm.example+8443_registry+A_f5296609e0eaab0d2f8fe3c4503600ed349a61793535d2c95505f0710b272e65'))
    .toBe('npm.example:8443/registry/A')
  expect(decodeRegistry('%FF')).toBe('%FF')
  expect(decodeRegistry('npm.example_%FF')).toBe('npm.example_%FF')
  expect(decodeRegistry('%not-a-key')).toBe('%not-a-key')
})

test('getPkgMirrorPath keeps same-host registries apart', () => {
  const mirrorPath = (registry: string): string => getPkgMirrorPath('/cache', ABBREVIATED_META_DIR, registry, 'is-positive')
  expect(mirrorPath('https://registry.npmjs.org/'))
    .toBe(path.join('/cache', ABBREVIATED_META_DIR, 'registry.npmjs.org', 'is-positive.jsonl'))
  expect(mirrorPath('https://releases.jfrog.io/artifactory/api/npm/team-a/'))
    .not.toBe(mirrorPath('https://releases.jfrog.io/artifactory/api/npm/team-b/'))
})
