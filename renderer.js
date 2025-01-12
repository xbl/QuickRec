const { ipcRenderer } = window.electronAPI;
import {
    startRecording,
    pauseRecording,
    stopRecording,
} from './recorder.js';

// IPC 事件监听
ipcRenderer.on('start-recording', async () => {
    console.log('收到开始录制信号');
    await startRecording();
});

ipcRenderer.on('pause-recording', async () => {
    console.log('收到暂停录制信号');
    pauseRecording();
});

ipcRenderer.on('stop-recording', async () => {
    console.log('收到停止录制信号');
    stopRecording();
});
