const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage } = require('electron')
const {
  collectGlbEntries,
  mergeUniquePaths,
  readGlb,
  repairMany,
} = require('./repair')
const {
  convertIveToGlb,
  isIvePath,
  iveConversionAvailable,
  missingIveHelperMessage,
  resolveIveHelper,
} = require('./ive')
const { inspect } = require('./inspect')

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
      // 关掉后台节流：窗口被遮挡/在后台时页面若被判为 hidden，requestAnimationFrame 会被
      // 节流到几乎不跑，Cesium 一帧都不渲染（frameNumber 恒为 0、resourcesLoaded 仍为
      // false），"模型就绪"的 afterRender 回调于是永不执行——预览会一直停在「正在加载…」
      // （TASK-008 的接线冒烟就是这样超时的）。桌面工具没有省电的必要，一律关掉。
      backgroundThrottling: false,
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

ipcMain.handle('pick-inputs', async (_, mode, current) => {
  const options = {
    properties: mode === 'directory'
      ? ['openDirectory']
      : ['openFile', 'multiSelections'],
    filters: [{ name: '三维模型（GLB / IVE）', extensions: ['glb', 'ive'] }],
  }
  const result = await dialog.showOpenDialog(mainWindow, options)
  if (result.canceled) return normalizeSelection(current)
  // 「选择文件」累加去重（逐个点选不会顶掉之前的）；「选择目录」是替换语义（新目录取代旧选择）
  return mode === 'directory'
    ? normalizeSelection(result.filePaths)
    : mergeUniquePaths(normalizeSelection(current), result.filePaths)
})

ipcMain.handle('app-capabilities', () => ({
  ive: iveConversionAvailable(),
  platform: `${process.platform}-${process.arch}`,
  iveHelperSearched: resolveIveHelper().searched,
}))

ipcMain.handle('pick-output-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] })
  if (result.canceled) return ''
  return result.filePaths[0] || ''
})

ipcMain.handle('repair-glb', async (event, payload) => {
  const inputPaths = normalizeSelection(payload?.inputPaths)
  const outputDir = payload?.outputDir
  if (!inputPaths.length) {
    throw new Error('请选择一个或多个 GLB / IVE 文件，或一个目录。')
  }
  if (!outputDir) {
    throw new Error('请选择输出目录。')
  }

  fs.mkdirSync(outputDir, { recursive: true })
  const options = {}
  if (payload?.freezePose) options.poseTime = 'start'
  const sender = event.sender
  const sendProgress = (progress) => {
    if (sender.isDestroyed()) return
    sender.send('repair-progress', progress)
  }
  options.onProgress = sendProgress

  // IVE 不是 GLB，先用原生助手转换成 GLB，再统一进入修复管线，
  // 这样转换结果同样会经历贴图归一化、蒙皮烘焙与 Cesium 兼容处理。
  let temporaryDir = ''
  try {
    const entries = collectGlbEntries(inputPaths, ['.glb', '.ive'])
    const repairEntries = entries.filter((entry) => !isIvePath(entry.inputPath))
    const iveEntries = entries.filter((entry) => isIvePath(entry.inputPath))

    if (iveEntries.length > 0) {
      if (!iveConversionAvailable()) throw new Error(missingIveHelperMessage())
      temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-repair-ive-'))
      iveEntries.forEach((entry, index) => {
        sendProgress({
          phase: 'convert-start',
          index,
          total: iveEntries.length,
          relativePath: entry.relativePath,
        })
        const target = path.join(temporaryDir, entry.relativePath.replace(/\.ive$/i, '.glb'))
        // 轴转换/贴地/归心的默认值在 src/ive.js 里，这里只做透传，便于后续把开关搬到界面上。
        const report = convertIveToGlb(entry.inputPath, target, {
          keepJpeg: options.keepJpeg,
          upAxis: options.upAxis,
          ground: options.ground,
          centerXZ: options.centerXZ,
        })
        sendProgress({
          phase: 'convert-done',
          index,
          total: iveEntries.length,
          relativePath: entry.relativePath,
          status: report.status,
          error: report.error,
          newBytes: report.newBytes,
          images: report.images,
          meshes: report.meshes,
          prunedNodes: report.prunedNodes,
          axis: report.axis,
          worldSize: report.worldSize,
          vertices: report.vertices,
          verticesBefore: report.verticesBefore,
          triangles: report.triangles,
        })
        // 沿用源 IVE 的 relativePath 输出，目录扫描时保留相对子目录结构。
        if (report.status === 'success') {
          repairEntries.push({ inputPath: target, relativePath: entry.relativePath.replace(/\.ive$/i, '.glb') })
        }
      })
    }

    // 只有「选了 IVE 但一个都没转成功」才需要中断；空目录仍交给 repairMany 走它原有的
    // 「未找到模型」提示，保持既有交互不变。
    if (!repairEntries.length && iveEntries.length > 0) {
      throw new Error('所选的 IVE 文件都未能转换成功，请查看转换错误后重试。')
    }

    return await repairMany(inputPaths, outputDir, { ...options, entries: repairEntries })
  } finally {
    if (temporaryDir) fs.rmSync(temporaryDir, { recursive: true, force: true })
  }
})

ipcMain.handle('read-glb-data-url', async (_, filePath) => {
  if (typeof filePath !== 'string') {
    throw new Error('只能加载 GLB 或 IVE 文件。')
  }

  // IVE 预览同样先转换成临时 GLB；data URL 读取完成后即可清理临时文件。
  let targetPath = filePath
  let temporaryDir = ''
  try {
    if (isIvePath(filePath)) {
      if (!iveConversionAvailable()) throw new Error(missingIveHelperMessage())
      temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-repair-ive-view-'))
      targetPath = path.join(temporaryDir, path.basename(filePath).replace(/\.ive$/i, '.glb'))
      const report = convertIveToGlb(filePath, targetPath, { keepJpeg: true })
      if (report.status !== 'success') throw new Error(report.error)
    }
    if (!targetPath.toLowerCase().endsWith('.glb')) {
      throw new Error('只能加载 GLB 或 IVE 文件。')
    }

    const bytes = fs.readFileSync(targetPath)
    const { json } = readGlb(targetPath)
    const bounds = getPositionBounds(json)
    const metadata = getGlbMetadata(json)
    return {
      filePath,
      sourcePath: targetPath,
      bytes: bytes.length,
      bounds,
      metadata,
      dataUrl: `data:model/gltf-binary;base64,${bytes.toString('base64')}`,
    }
  } finally {
    if (temporaryDir) fs.rmSync(temporaryDir, { recursive: true, force: true })
  }
})

// 模型体检：只读，产出一份 JSON 报告供界面展示。**绝不 reject** —— 渲染进程要么拿到
// { ok: true, report }，要么拿到 { ok: false, error: 中文原因 }，因此体检失败不会连带打断
// Cesium 预览。
ipcMain.handle('inspect-glb', async (_, filePath) => {
  if (typeof filePath !== 'string') {
    return { ok: false, error: '只能体检 GLB 或 IVE 文件。' }
  }

  // IVE 与预览同样先转成临时 GLB 再体检：报告里的盒/贴图规格必须是转换后的真实数据，
  // 而 inspect() 只认 .glb。临时目录用完即删。
  let targetPath = filePath
  let temporaryDir = ''
  try {
    if (isIvePath(filePath)) {
      if (!iveConversionAvailable()) throw new Error(missingIveHelperMessage())
      temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-repair-ive-inspect-'))
      targetPath = path.join(temporaryDir, path.basename(filePath).replace(/\.ive$/i, '.glb'))
      const report = convertIveToGlb(filePath, targetPath, { keepJpeg: true })
      if (report.status !== 'success') throw new Error(report.error)
    }
    if (!targetPath.toLowerCase().endsWith('.glb')) {
      throw new Error('只能体检 GLB 或 IVE 文件。')
    }
    // inspect() 同步读完整份文件，因此必须在 finally 删除临时目录之前调用。
    const report = inspect(targetPath)
    // report.ok === false 表示连读取/解析都没成功（不可读、非 GLB、解析失败），此时报告里
    // 没有可用数据：直接按 ok:false 上报第一条错误的中文 message，别让渲染进程去分辨
    // "通道成功但报告失败"这层区别。report.ok === true 但 partial === true 时仍返回报告，
    // 界面会显式标注"报告不完整"。
    if (report.ok !== true) {
      const firstError = (Array.isArray(report.issues) ? report.issues : [])
        .find((issue) => issue?.level === 'error')
      return { ok: false, filePath, sourcePath: targetPath, error: firstError?.message || '体检没有产出可用报告。' }
    }
    return { ok: true, filePath, sourcePath: targetPath, report }
  } catch (error) {
    return { ok: false, filePath, error: `体检失败：${error.message}` }
  } finally {
    // 临时目录清理自身也可能抛（权限/占用）：本 handler 承诺"绝不 reject"，所以单独兜一层
    if (temporaryDir) {
      try {
        fs.rmSync(temporaryDir, { recursive: true, force: true })
      } catch (error) {
        console.error(`清理 IVE 体检临时目录失败：${error.message}`)
      }
    }
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
