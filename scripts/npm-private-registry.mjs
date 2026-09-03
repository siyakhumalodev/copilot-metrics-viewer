import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { loadEnvFile } from 'node:process'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const ENV_KEYS = ['REGISTRY_FEED_URL', 'REGISTRY_USERNAME', 'REGISTRY_PASSWORD']

export function createNpmConfig(feedUrl, username, password) {
  const registryUrl = new URL(feedUrl)
  if (registryUrl.protocol !== 'https:') {
    throw new Error('REGISTRY_FEED_URL must use HTTPS')
  }

  if (registryUrl.hostname === 'pkgs.dev.azure.com'
    && !registryUrl.pathname.endsWith('/npm/registry/')) {
    throw new Error('Azure Artifacts REGISTRY_FEED_URL must end with /npm/registry/')
  }

  if ([username, password].some(value => /[\r\n]/.test(value))) {
    throw new Error('Registry credentials must not contain line breaks')
  }

  registryUrl.pathname = `${registryUrl.pathname.replace(/\/+$/, '')}/`
  const registryTarget = `//${registryUrl.host}${registryUrl.pathname}`
  const authTargets = new Set([
    registryTarget,
    registryTarget.replace(/\/registry\/$/, '/'),
  ])
  const encodedPat = Buffer.from(password, 'utf8').toString('base64')
  const authConfig = [...authTargets].flatMap(target => [
    `${target}:username=${username}`,
    `${target}:_password=${encodedPat}`,
    `${target}:email=npm@example.invalid`,
  ])

  return [
    `registry=${registryUrl.toString()}`,
    ...authConfig,
    '',
  ].join('\n')
}

function loadRegistryEnvironment() {
  const envFile = process.env.NPM_REGISTRY_ENV_FILE ?? '.env'
  if (existsSync(envFile)) {
    loadEnvFile(envFile)
  }

  const configuredKeys = ENV_KEYS.filter(key => process.env[key])
  if (configuredKeys.length === 0) {
    return null
  }

  const missingKeys = ENV_KEYS.filter(key => !process.env[key])
  if (missingKeys.length > 0) {
    throw new Error(`Missing private registry settings: ${missingKeys.join(', ')}`)
  }

  return Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]))
}

function runNpm() {
  const npmArguments = process.argv.slice(2)
  if (npmArguments.length === 0) {
    throw new Error('Specify an npm command, for example: ci or install')
  }

  const registryEnvironment = loadRegistryEnvironment()
  const temporaryDirectory = registryEnvironment
    ? mkdtempSync(join(tmpdir(), 'copilot-metrics-npm-'))
    : null

  try {
    const childEnvironment = { ...process.env }
    if (registryEnvironment && temporaryDirectory) {
      const npmConfigPath = join(temporaryDirectory, '.npmrc')
      const npmConfig = createNpmConfig(
        registryEnvironment.REGISTRY_FEED_URL,
        registryEnvironment.REGISTRY_USERNAME,
        registryEnvironment.REGISTRY_PASSWORD,
      )
      writeFileSync(npmConfigPath, npmConfig, { encoding: 'utf8', mode: 0o600 })
      childEnvironment.NPM_CONFIG_USERCONFIG = npmConfigPath
    }

    const npmCliPath = process.env.npm_execpath
      ?? join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
    const useNpmCli = existsSync(npmCliPath)
    const npmExecutable = useNpmCli ? process.execPath : 'npm'
    const commandArguments = useNpmCli ? [npmCliPath, ...npmArguments] : npmArguments
    const result = spawnSync(npmExecutable, commandArguments, {
      env: childEnvironment,
      stdio: 'inherit',
    })

    if (result.error) {
      throw result.error
    }
    process.exitCode = result.status ?? 1
  }
  finally {
    if (temporaryDirectory) {
      rmSync(temporaryDirectory, { recursive: true, force: true })
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runNpm()
}