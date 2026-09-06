const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('repairApp', {
  pickInputs: (mode) => ipcRenderer.invoke('pick-inputs', mode),
  pickOutputDir: () => ipcRenderer.invoke('pick-output-dir'),
  repairGlb: (payload) => ipcRenderer.invoke('repair-glb', payload),
  readGlbDataUrl: (filePath) => ipcRenderer.invoke('read-glb-data-url', filePath),
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowToggleMaximize: () => ipcRenderer.invoke('window-toggle-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  onWindowMaximizeState: (callback) => {
    ipcRenderer.on('window-maximize-state', (_, value) => callback(value))
  },
})
