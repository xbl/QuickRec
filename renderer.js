const { ipcRenderer } = window.electronAPI;

let mediaRecorder;
let recordedChunks = [];

async function handlePauseRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.pause();
    }
}

async function handleStopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
}

async function setupRecording() {
    try {
        console.log('开始设置录音...');
        // 获取系统音频源
        const sources = await window.electronAPI.getSources({
            types: ['screen', 'window', 'audio'],
            thumbnailSize: { width: 0, height: 0 },
        });

        // 详细打印每个音频源的信息
        sources.forEach((source, index) => {
            console.log(`音频源 ${index}:`, `{
                id: ${source.id},
                name: ${source.name},
                type: ${source.type}
            }`);
        });

        // 查找系统音频源
        const audioSource = sources.find((source) => source.id.startsWith('audio:')
            || source.id.startsWith('screen:')
            || source.name.toLowerCase().includes('system audio')
            || source.name.toLowerCase().includes('系统音频'));

        if (!audioSource) {
            console.error('可用的音频源:', sources.map((s) => ({ id: s.id, name: s.name })));
            throw new Error('找不到系统音频源');
        }

        console.log('使用音频源:', {
            id: audioSource.id,
            name: audioSource.name,
            type: audioSource.type,
        });

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: audioSource.id,
                },
            },
            video: false,
        });

        console.log('音频流创建成功');
        mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'audio/webm;codecs=opus',
        });
        console.log('MediaRecorder 创建成功');

        mediaRecorder.ondataavailable = (e) => {
            console.log('收到音频数据块:', e.data.size, 'bytes');
            if (e.data.size > 0) {
                recordedChunks.push(e.data);
            }
        };

        mediaRecorder.onstop = async () => {
            console.log('onstop 事件触发，开始处理录音数据');
            try {
                console.log('创建 Blob，数据块数量:', recordedChunks.length);
                const blob = new Blob(recordedChunks, {
                    type: 'audio/webm; codecs=opus',
                });

                console.log('转换为 ArrayBuffer...');
                const arrayBuffer = await blob.arrayBuffer();

                console.log('调用保存对话框...');
                const result = await window.electronAPI.saveRecording(arrayBuffer);

                if (!result.success) {
                    console.error('保存失败:', result.error);
                } else {
                    console.log('文件保存成功');
                }

                console.log('清理录音数据');
                recordedChunks = [];
            } catch (error) {
                console.error('处理录音数据时出错:', error);
            }
        };

        // 设置数据收集间隔
        mediaRecorder.start(1000); // 每秒收集一次数据
        console.log('MediaRecorder 开始收集数据');

        return true;
    } catch (e) {
        console.error('设置录音时出错:', e);
        return false;
    }
}

// 使用 window.electronAPI
ipcRenderer.on('start-recording', async () => {
    console.log('收到开始录制信号');
    try {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
            console.log('初始化 mediaRecorder...');
            const success = await setupRecording();
            if (success) {
                console.log('录制开始成功');
            } else {
                console.error('录制初始化失败');
            }
        } else if (mediaRecorder.state === 'paused') {
            console.log('恢复录制');
            mediaRecorder.resume();
        }
    } catch (error) {
        console.error('开始录制时出错:', error);
    }
});

ipcRenderer.on('pause-recording', async () => {
    console.log('收到暂停录制信号');
    await handlePauseRecording();
});

ipcRenderer.on('stop-recording', async () => {
    console.log('收到停止录制信号');
    try {
        await handleStopRecording();
    } catch (error) {
        console.error('停止录制时出错:', error);
    }
});

// 初始化设置
setupRecording();
