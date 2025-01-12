const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    startRecording: () => ipcRenderer.invoke('start-recording'),
    pauseRecording: () => ipcRenderer.invoke('pause-recording'),
    stopRecording: () => ipcRenderer.invoke('stop-recording'),
    saveRecording: async (blob) => {
        try {
            const buffer = new Uint8Array(blob);
            return await ipcRenderer.invoke('save-recording', Array.from(buffer));
        } catch (error) {
            console.error('Error in saveRecording:', error);
            return { success: false, error: error.message };
        }
    },
    getSources: (options) => ipcRenderer.invoke('get-sources', options),
    onRecordingStart: (callback) => {
        const subscription = () => callback();
        ipcRenderer.on('start-recording', subscription);
        return () => ipcRenderer.removeListener('start-recording', subscription);
    },
    onRecordingPause: (callback) => {
        const subscription = () => callback();
        ipcRenderer.on('pause-recording', subscription);
        return () => ipcRenderer.removeListener('pause-recording', subscription);
    },
    onRecordingStop: (callback) => {
        const subscription = () => callback();
        ipcRenderer.on('stop-recording', subscription);
        return () => ipcRenderer.removeListener('stop-recording', subscription);
    },
});
