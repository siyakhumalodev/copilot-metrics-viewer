import { describe, expect, it } from 'vitest'
import { createNpmConfig } from '../scripts/npm-private-registry.mjs'

describe('createNpmConfig', () => {
  it('creates Azure Artifacts registry and authentication entries', () => {
    const config = createNpmConfig(
      'https://pkgs.dev.azure.com/example/project/_packaging/feed/npm/registry/',
      'build-user',
      'example-pat',
    )

    expect(config).toContain('registry=https://pkgs.dev.azure.com/example/project/_packaging/feed/npm/registry/')
    expect(config).toContain('//pkgs.dev.azure.com/example/project/_packaging/feed/npm/registry/:username=build-user')
    expect(config).toContain('//pkgs.dev.azure.com/example/project/_packaging/feed/npm/:username=build-user')
    expect(config).toContain(':_password=ZXhhbXBsZS1wYXQ=')
    expect(config).not.toContain('example-pat')
  })

  it('rejects an insecure registry URL', () => {
    expect(() => createNpmConfig('http://registry.example.test/npm/', 'user', 'pat'))
      .toThrow('REGISTRY_FEED_URL must use HTTPS')
  })

  it('rejects credentials containing line breaks', () => {
    expect(() => createNpmConfig('https://registry.example.test/npm/', 'user\nadmin', 'pat'))
      .toThrow('Registry credentials must not contain line breaks')
  })
})