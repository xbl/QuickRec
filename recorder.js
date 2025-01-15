let mediaRecorder;
let recordedChunks = [];
let isInitialized = false;

/**
 * 初始化录音
 * @returns {Promise<boolean>} 初始化是否成功
 */
async function initializeRecording() {
    if (isInitialized) {
        console.log('录制已初始化，跳过重复初始化');
        return true;
    }

    try {
        console.log('开始设置录音...');
        // 获取音频源
        const audioSource = await getAudioSource();
        
        // 创建音频流
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: audioSource.id,
                },
            },
        });

        console.log('音频流创建成功');
        mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'video/webm; codecs=vp8,opus',
        });
        console.log('MediaRecorder 创建成功');

        setupRecordingHandlers();
        isInitialized = true;
        return true;
    } catch (error) {
        console.error('初始化录音时出错:', error);
        isInitialized = false;
        return false;
    }
}

/**
 * 设置录音事件处理器
 */
function setupRecordingHandlers() {
    mediaRecorder.ondataavailable = (e) => {
        console.log('收到音频数据块:', e.data.size, 'bytes');
        if (e.data.size > 0) {
            recordedChunks.push(e.data);
        }
    };

    mediaRecorder.onstop = async () => {
        console.log('onstop 事件触发，开始处理录音数据');
        try {
            await handleRecordingData();
        } catch (error) {
            console.error('处理录音数据时出错:', error);
        }
    };
}

/**
 * 处理录音数据
 */
async function handleRecordingData() {
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

        cleanup();
    } catch (error) {
        console.error('处理录音数据时出错:', error);
        cleanup();
    }
}

/**
 * 清理录音资源
 */
function cleanup() {
    console.log('清理录音数据');
    recordedChunks = [];
    isInitialized = false;
}

/**
 * 开始录音
 * @returns {Promise<boolean>} 是否成功开始录音
 */
async function startRecording() {
    try {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
            console.log('初始化 mediaRecorder...');
            const success = await initializeRecording();
            if (!success) {
                console.error('录制初始化失败');
                return false;
            }
        }

        if (mediaRecorder.state === 'paused') {
            console.log('恢复录制');
            mediaRecorder.resume();
        } else {
            mediaRecorder.start(1000); // 每秒收集一次数据
            console.log('开始录制');
        }
        return true;
    } catch (error) {
        console.error('开始录制时出错:', error);
        return false;
    }
}

/**
 * 暂停录音
 */
function pauseRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.pause();
        console.log('录制已暂停');
    }
}

/**
 * 停止录音
 */
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        console.log('录制已停止');
    }
}

/**
 * 获取当前录音状态
 * @returns {string} 录音状态
 */
function getRecordingState() {
    return mediaRecorder ? mediaRecorder.state : 'inactive';
}

/**
 * 获取系统音频源
 * @returns {Promise<MediaDeviceInfo>} 音频源信息
 * @throws {Error} 如果找不到可用的音频源
 */
async function getAudioSource() {
    console.log('开始获取系统音频源...');
    const sources = await window.electronAPI.getSources({
        types: ['screen', 'window', 'audio'],
    });

    // 详细打印每个音频源的信息
    sources.forEach((source, index) => {
        console.log(`音频源 ${index}:`, {
            id: source.id,
            name: source.name,
            type: source.type,
        });
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

    console.log('找到音频源:', {
        id: audioSource.id,
        name: audioSource.name,
        type: audioSource.type,
    });

    return audioSource;
}

export {
    initializeRecording,
    startRecording,
    pauseRecording,
    stopRecording,
    getRecordingState,
};
