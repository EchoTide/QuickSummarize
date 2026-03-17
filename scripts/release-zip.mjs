import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, rm, mkdir, cp } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const execFileAsync = promisify(execFile)

export function getReleaseVersion({ packageVersion, releaseTag } = {}) {
  const candidate = String(releaseTag || packageVersion || '').trim()
  if (!candidate) {
    throw new Error('Missing package version and release tag')
  }

  return candidate.replace(/^v/, '')
}

export function getReleaseArchiveName(version) {
  return `quicksummarize-v${version}.zip`
}

async function readPackageVersion(rootDir) {
  const packageJsonPath = path.join(rootDir, 'package.json')
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
  return packageJson.version
}

async function createZipOnWindows(sourceDir, outputFile) {
  await execFileAsync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path '${sourceDir}${path.sep}*' -DestinationPath '${outputFile}' -Force`,
    ],
    { windowsHide: true }
  )
}

async function createZipOnUnix(sourceDir, outputFile) {
  await execFileAsync('zip', ['-r', outputFile, '.'], {
    cwd: sourceDir,
  })
}

async function main() {
  const rootDir = process.cwd()
  const packageVersion = await readPackageVersion(rootDir)
  const version = getReleaseVersion({
    packageVersion,
    releaseTag: process.env.RELEASE_TAG,
  })

  const archiveName = getReleaseArchiveName(version)
  const releaseDir = path.join(rootDir, 'release')
  const stagingDir = path.join(releaseDir, `quicksummarize-v${version}`)
  const outputFile = path.join(releaseDir, archiveName)
  const extensionDir = path.join(rootDir, 'extension')

  await rm(stagingDir, { recursive: true, force: true })
  await rm(outputFile, { force: true })
  await mkdir(releaseDir, { recursive: true })
  await cp(extensionDir, path.join(stagingDir, 'extension'), { recursive: true })

  if (process.platform === 'win32') {
    await createZipOnWindows(stagingDir, outputFile)
  } else {
    await createZipOnUnix(stagingDir, outputFile)
  }

  console.log(`Release archive created: ${path.relative(rootDir, outputFile)}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
