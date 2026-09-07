const fs = require('node:fs')
const https = require('node:https')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const CESIUM_VERSION = '1.128'
const DOWNLOAD_URL = `https://github.com/CesiumGS/cesium/releases/download/${CESIUM_VERSION}/Cesium-${CESIUM_VERSION}.zip`
const rootDir = path.join(__dirname, '..')
const targetDir = path.join(rootDir, 'vendor', 'cesium', CESIUM_VERSION, 'Build', 'Cesium')
const requiredFiles = [
  path.join(targetDir, 'Cesium.js'),
  path.join(targetDir, 'Widgets', 'widgets.css'),
]

function hasCesiumFiles() {
  return requiredFiles.every((filePath) => fs.existsSync(filePath))
}

function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume()
        downloadFile(response.headers.location, outputPath).then(resolve, reject)
        return
      }

      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`Download failed: HTTP ${response.statusCode}`))
        return
      }

      const file = fs.createWriteStream(outputPath)
      response.pipe(file)
      file.on('finish', () => {
        file.close(resolve)
      })
      file.on('error', reject)
    })
    request.on('error', reject)
  })
}

function findCesiumBuildDir(root) {
  const stack = [root]
  while (stack.length > 0) {
    const current = stack.pop()
    if (
      fs.existsSync(path.join(current, 'Build', 'Cesium', 'Cesium.js')) &&
      fs.existsSync(path.join(current, 'Build', 'Cesium', 'Widgets', 'widgets.css'))
    ) {
      return path.join(current, 'Build', 'Cesium')
    }

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) stack.push(path.join(current, entry.name))
    }
  }
  return null
}

async function ensureCesium() {
  if (hasCesiumFiles()) {
    console.log(`Cesium ${CESIUM_VERSION} is already available locally.`)
    return
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cesium-'))
  const zipPath = path.join(tempDir, `Cesium-${CESIUM_VERSION}.zip`)
  const extractDir = path.join(tempDir, 'extract')
  fs.mkdirSync(extractDir)

  try {
    console.log(`Downloading Cesium ${CESIUM_VERSION}...`)
    await downloadFile(DOWNLOAD_URL, zipPath)
    console.log('Extracting Cesium...')
    execFileSync('unzip', ['-q', zipPath, '-d', extractDir])

    const cesiumBuildDir = findCesiumBuildDir(extractDir)
    if (!cesiumBuildDir) {
      throw new Error('Cesium.js was not found in the downloaded archive.')
    }

    fs.rmSync(targetDir, { recursive: true, force: true })
    fs.mkdirSync(path.dirname(targetDir), { recursive: true })
    fs.cpSync(cesiumBuildDir, targetDir, { recursive: true })
    console.log(`Cesium ${CESIUM_VERSION} installed at ${targetDir}`)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

ensureCesium().catch((error) => {
  console.error(`Failed to prepare Cesium ${CESIUM_VERSION}: ${error.message}`)
  process.exit(1)
})
