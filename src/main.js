const path = require('node:path')
const fs = require('node:fs')
const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage } = require('electron')
const { readGlb, repairMany } = require('./repair')

let mainWindow
const appIconPath = path.join(__dirname, '..', 'assets', 'app-icon.png')

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 900,
    minHeight: 640,
    frame: false,
    icon: appIconPath,
    backgroundColor: '#111827',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.loadFile(path.join(__dirname, 'index.html'))
  mainWindow.setMenuBarVisibility(false)
  mainWindow.setAutoHideMenuBar(true)
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window-maximize-state', true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window-maximize-state', false)
  })
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.send('window-maximize-state', mainWindow?.isMaximized() || false)
  })
}

function normalizeSelection(paths) {
  return Array.isArray(paths) ? paths.filter(Boolean) : []
}

ipcMain.handle('pick-inputs', async (_, mode) => {
  const options = {
    properties: mode === 'directory'
      ? ['openDirectory']
      : ['openFile', 'multiSelections'],
    filters: [{ name: 'GLB Files', extensions: ['glb'] }],
  }
  const result = await dialog.showOpenDialog(mainWindow, options)
  if (result.canceled) return []
  return normalizeSelection(result.filePaths)
})

ipcMain.handle('pick-output-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] })
  if (result.canceled) return ''
  return result.filePaths[0] || ''
})

ipcMain.handle('repair-glb', async (_, payload) => {
  const inputPaths = normalizeSelection(payload?.inputPaths)
  const outputDir = payload?.outputDir
  if (!inputPaths.length) {
    throw new Error('请选择一个或多个 GLB 文件，或一个目录。')
  }
  if (!outputDir) {
    throw new Error('请选择输出目录。')
  }

  fs.mkdirSync(outputDir, { recursive: true })
  return repairMany(inputPaths, outputDir)
})

ipcMain.handle('read-glb-data-url', async (_, filePath) => {
  if (typeof filePath !== 'string' || !filePath.toLowerCase().endsWith('.glb')) {
    throw new Error('只能加载 GLB 文件。')
  }
  const bytes = fs.readFileSync(filePath)
  const { json } = readGlb(filePath)
  const bounds = getPositionBounds(json)
  const metadata = getGlbMetadata(json)
  return {
    filePath,
    bytes: bytes.length,
    bounds,
    metadata,
    dataUrl: `data:model/gltf-binary;base64,${bytes.toString('base64')}`,
  }
})

function getGlbMetadata(json) {
  const images = json.images || []
  return {
    meshCount: (json.meshes || []).length,
    materialCount: (json.materials || []).length,
    imageCount: images.length,
    skinCount: (json.skins || []).length,
    animationCount: (json.animations || []).length,
    hasSkinnedMeshes: (json.meshes || []).some((mesh) => (mesh.primitives || []).some((primitive) => (
      primitive.attributes?.JOINTS_0 !== undefined || primitive.attributes?.WEIGHTS_0 !== undefined
    ))),
    externalImageUris: images
      .map((image) => image.uri)
      .filter((uri) => typeof uri === 'string' && !uri.startsWith('data:')),
    extensionsUsed: json.extensionsUsed || [],
    extensionsRequired: json.extensionsRequired || [],
  }
}

ipcMain.handle('window-minimize', () => {
  mainWindow?.minimize()
})

ipcMain.handle('window-toggle-maximize', () => {
  if (!mainWindow) return false
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize()
    return false
  }
  mainWindow.maximize()
  return true
})

ipcMain.handle('window-close', () => {
  mainWindow?.close()
})

function getPositionBounds(json) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  let found = false

  for (const mesh of json.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      const accessorIndex = primitive.attributes?.POSITION
      const accessor = typeof accessorIndex === 'number' ? json.accessors?.[accessorIndex] : null
      if (!accessor?.min || !accessor?.max || accessor.min.length < 3 || accessor.max.length < 3) continue
      found = true
      for (let index = 0; index < 3; index += 1) {
        min[index] = Math.min(min[index], accessor.min[index])
        max[index] = Math.max(max[index], accessor.max[index])
      }
    }
  }

  if (!found) return null
  return {
    min,
    max,
    center: min.map((value, index) => (value + max[index]) / 2),
    radius: Math.max(...max.map((value, index) => value - min[index])) / 2,
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  if (process.platform === 'darwin') {
    app.dock?.setIcon(nativeImage.createFromPath(appIconPath))
  }
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
