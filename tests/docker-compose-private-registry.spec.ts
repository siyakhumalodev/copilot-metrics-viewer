// @vitest-environment node

import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

interface ComposeService {
  build?: {
    secrets?: Array<{
      source: string
      target: string
    }>
  }
}

interface ComposeConfig {
  services: Record<string, ComposeService>
  secrets?: Record<string, { file?: string }>
}

describe('Docker Compose private registry configuration', () => {
  const compose = parse(readFileSync('docker-compose.yml', 'utf8')) as ComposeConfig

  it('provides the npm environment secret to every image build', () => {
    const buildServices = Object.entries(compose.services)
      .filter(([, service]) => service.build)

    expect(buildServices.length).toBeGreaterThan(0)
    for (const [serviceName, service] of buildServices) {
      expect(service.build?.secrets, `${serviceName} build secrets`).toContainEqual({
        source: 'npm_env',
        target: 'npm_env',
      })
    }
  })

  it('sources the npm environment secret from the ignored local environment file', () => {
    expect(compose.secrets?.npm_env?.file).toBe('.env')
  })

  it.each(['Dockerfile', 'Dockerfile.sync'])('%s mounts npm credentials for the node user', (dockerfile) => {
    const contents = readFileSync(dockerfile, 'utf8')
    const npmSecretMounts = contents.match(/--mount=type=secret,id=npm_env[^\s]*/g) ?? []

    expect(npmSecretMounts.length).toBeGreaterThan(0)
    for (const mount of npmSecretMounts) {
      expect(mount).toContain('uid=1000')
    }
  })
})