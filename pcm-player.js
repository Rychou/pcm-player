class PCMPlayer {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.initializeElements();
        this.setupAnalyser();
        this.setupConfig();
        this.setupEventListeners();
        this.resetState();
        
        // 添加进度相关元素
        this.progressBar = document.querySelector('.progress-bar');
        this.progressCurrent = document.querySelector('.progress-current');
        this.currentTimeDisplay = document.querySelector('.current-time');
        this.totalTimeDisplay = document.querySelector('.total-time');
        
        // 添加进度条事件监听
        this.progressBar.addEventListener('click', this.handleProgressClick.bind(this));
        
        // 添加播放进度追踪
        this.startTime = 0;
        this.pausedTime = 0;
        
        // 添加播放结束事件监听
        this.onPlaybackEnd = this.onPlaybackEnd.bind(this);
        
        // 初始化时设置 canvas 尺寸
        this.setupCanvases();
        
        // 添加拖动和缩放状态
        this.dragState = {
            isDragging: false,
            startX: 0,
            startOffset: 0
        };
        
        // 添加帧控制按钮
        this.createFrameControls();
        
        // 添加缩放动画相关状态
        this.zoomAnimation = {
            start: 1,
            end: 1,
            startTime: 0,
            duration: 300, // 动画持续时间（毫秒）
            isAnimating: false
        };
        
        // 添加缩放比例显示
        this.zoomDisplay = document.createElement('div');
        this.zoomDisplay.className = 'zoom-display';
        controls.appendChild(this.zoomDisplay);
        
        // 添加双击事件监听
        this.waveformCanvas.addEventListener('dblclick', this.handleDoubleClick.bind(this));
        
        // 扩展选择状态
        this.selection = {
            start: 0,
            end: 0,
            startTime: 0,
            endTime: 0,
            isSelecting: false
        };
    }

    initializeElements() {
        // 获取所有DOM元素
        this.playButton = document.getElementById('playButton');
        this.stopButton = document.getElementById('stopButton');
        this.fileInput = document.getElementById('fileInput');
        this.waveformCanvas = document.getElementById('waveformCanvas');
        this.spectrumCanvas = document.getElementById('spectrumCanvas');
        this.sampleRateSelect = document.getElementById('sampleRate');
        this.bitDepthSelect = document.getElementById('bitDepth');
        this.endianSelect = document.getElementById('endian');
        this.zoomInButton = document.getElementById('zoomInButton');
        this.zoomOutButton = document.getElementById('zoomOutButton');
        this.exportButton = document.getElementById('exportButton');
        
        // 获取拖放区域
        this.dropZone = document.querySelector('.drop-zone');
        
        // 获取画布上下文
        this.waveformCtx = this.waveformCanvas.getContext('2d');
        this.spectrumCtx = this.spectrumCanvas.getContext('2d');
        
        // 创建显示元素
        this.createDisplayElements();
    }

    createDisplayElements() {
        const controls = document.querySelector('.controls');
        
        // 时长显示
        this.durationDisplay = document.createElement('div');
        this.durationDisplay.className = 'duration-display';
        controls.appendChild(this.durationDisplay);
        
        // 音量显示
        this.volumeDisplay = document.createElement('div');
        this.volumeDisplay.className = 'volume-display';
        controls.appendChild(this.volumeDisplay);
    }

    setupAnalyser() {
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = 0.3;
        this.analyser.connect(this.audioContext.destination);
    }

    setupConfig() {
        this.config = {
            channels: 1,
            sampleRate: 48000,
            bitDepth: 32,
            isFloat: true,
            endian: 'little'
        };
        
        this.zoomLevel = 1;
        this.offset = 0;
    }

    setupEventListeners() {
        // 文件选择事件
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        
        // 播放控制事件
        this.playButton.addEventListener('click', () => this.togglePlay());
        this.stopButton.addEventListener('click', () => this.stop());
        
        // 缩放控制事件
        this.zoomInButton.addEventListener('click', () => this.setZoom(this.zoomLevel * 1.5));
        this.zoomOutButton.addEventListener('click', () => this.setZoom(this.zoomLevel / 1.5));
        
        // 导出按钮事件
        this.exportButton.addEventListener('click', () => this.exportSelection());
        
        // 修改选区相关事件监听
        this.waveformCanvas.addEventListener('contextmenu', (e) => {
            e.preventDefault(); // 阻止默认右键菜单
        });
        this.waveformCanvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.waveformCanvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.waveformCanvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        
        // 双击重置视图
        this.waveformCanvas.addEventListener('dblclick', () => this.resetView());
        
        // 拖放相关事件
        this.setupDragAndDrop();
        
        // 窗口调整事件
        window.addEventListener('resize', () => this.resizeCanvases());
        
        // 添加滚轮缩放事件
        this.waveformCanvas.addEventListener('wheel', this.handleWheel.bind(this));
        this.spectrumCanvas.addEventListener('wheel', this.handleWheel.bind(this));
        
        // 添加拖动事件
        this.waveformCanvas.addEventListener('mousedown', this.handleDragStart.bind(this));
        document.addEventListener('mousemove', this.handleDragMove.bind(this));
        document.addEventListener('mouseup', this.handleDragEnd.bind(this));
        
        // 添加鼠标样式
        this.waveformCanvas.style.cursor = 'grab';
    }

    resetState() {
        this.isPlaying = false;
        this.audioBuffer = null;
        this.audioSource = null;
        this.animationId = null;
        this.selection = { start: 0, end: 0 };
        this.markers = [];
        this.isSelecting = false;
    }

    resizeCanvases() {
        [this.waveformCanvas, this.spectrumCanvas].forEach(canvas => {
            const dpr = window.devicePixelRatio || 1;
            const displayWidth = canvas.clientWidth;
            const displayHeight = canvas.clientHeight;
            
            if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
                // 只在尺寸确实改变时才重新设置
                canvas.width = displayWidth * dpr;
                canvas.height = displayHeight * dpr;
                canvas.style.width = displayWidth + 'px';
                canvas.style.height = displayHeight + 'px';
                
                const ctx = canvas.getContext('2d');
                ctx.scale(dpr, dpr);
            }
        });
        
        // 重新绘制当前状态
        if (this.audioBuffer) {
            const channelData = this.audioBuffer.getChannelData(0);
            this.drawWaveform(channelData);
            
            const spectrumData = new Uint8Array(this.analyser.frequencyBinCount);
            this.analyser.getByteFrequencyData(spectrumData);
            this.drawSpectrum(spectrumData);
        }
    }

    async handleFileSelect(event) {
        await this.handleFile(event.target.files[0]);
    }

    enableControls() {
        this.playButton.disabled = false;
        this.stopButton.disabled = false;
        this.zoomInButton.disabled = false;
        this.zoomOutButton.disabled = false;
        this.exportButton.disabled = false;
        this.prevFrameButton.disabled = false;
        this.nextFrameButton.disabled = false;
    }

    calculateDuration(sampleCount, sampleRate) {
        const totalSeconds = sampleCount / sampleRate;
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = Math.floor(totalSeconds % 60);
        const milliseconds = Math.floor((totalSeconds % 1) * 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
    }

    validatePCMFormat(arrayBuffer, options) {
        const errors = [];
        
        // 检查文件大小
        const bytesPerSample = options.bitDepth / 8;
        const expectedSamplesPerSecond = options.sampleRate * options.channels;
        const expectedBytesPerSecond = expectedSamplesPerSecond * bytesPerSample;
        const durationInSeconds = arrayBuffer.byteLength / expectedBytesPerSecond;
        
        if (arrayBuffer.byteLength % (options.channels * bytesPerSample) !== 0) {
            errors.push(
                `文件大小不匹配：\n` +
                `- 当前文件大小：${arrayBuffer.byteLength} 字节\n` +
                `- 采样率：${options.sampleRate} Hz\n` +
                `- 声道数：${options.channels}\n` +
                `- 位深度：${options.bitDepth} bit\n` +
                `- 预期每秒数据量：${expectedBytesPerSecond} 字节\n` +
                `- 估算时长：${durationInSeconds.toFixed(3)} 秒\n` +
                `可能原因：文件大小与音频参数不匹配，请检查采样率和位深度设置是否正确`
            );
        }
        
        // 检查数据范围
        const view = new DataView(arrayBuffer);
        const invalidSamples = [];
        const maxValue = Math.pow(2, options.bitDepth - 1) - 1;
        
        // 只检查前1000个样本
        const samplesToCheck = Math.min(1000, Math.floor(arrayBuffer.byteLength / bytesPerSample));
        
        for (let i = 0; i < samplesToCheck; i++) {
            try {
                let value;
                const byteOffset = i * bytesPerSample;
                
                if (options.bitDepth === 16) {
                    value = view.getInt16(byteOffset, options.isLittleEndian);
                    if (Math.abs(value) > maxValue) {
                        invalidSamples.push({
                            index: i,
                            value: value,
                            position: byteOffset
                        });
                    }
                } else if (options.bitDepth === 32 && !options.isFloat) {
                    value = view.getInt32(byteOffset, options.isLittleEndian);
                    if (Math.abs(value) > maxValue) {
                        invalidSamples.push({
                            index: i,
                            value: value,
                            position: byteOffset
                        });
                    }
                } else if (options.bitDepth === 8) {
                    value = view.getInt8(byteOffset);
                    if (Math.abs(value) > maxValue) {
                        invalidSamples.push({
                            index: i,
                            value: value,
                            position: byteOffset
                        });
                    }
                }
            } catch (e) {
                errors.push(`读取数据出错：在位置 ${i * bytesPerSample} 处无法读取 ${options.bitDepth} 位数据`);
                break;
            }
        }
        
        if (invalidSamples.length > 0) {
            const sampleDetails = invalidSamples.slice(0, 5).map(sample => 
                `样本 #${sample.index}：值=${sample.value}，位置=${sample.position}字节`
            ).join('\n');
            
            errors.push(
                `检测到异常采样值：\n` +
                `- 位深度：${options.bitDepth} bit\n` +
                `- 有效值范围：${-maxValue} 到 ${maxValue}\n` +
                `- 发现 ${invalidSamples.length} 个超出范围��样本\n` +
                `- 前5个异常样本：\n${sampleDetails}\n` +
                `可能原因：\n` +
                `1. 文件格式可能不是原始PCM\n` +
                `2. 位深度设置可能不正确\n` +
                `3. 字节序可能不匹配`
            );
        }
        
        return errors;
    }

    analyzeAudio(floatData) {
        const stats = {
            peakLevel: 0,
            rmsLevel: 0,
            dcOffset: 0,
            crestFactor: 0,
            zeroCrossings: 0
        };
        
        let sum = 0;
        let sumSquares = 0;
        
        for (let i = 1; i < floatData.length; i++) {
            const sample = floatData[i];
            
            // 峰值电平
            stats.peakLevel = Math.max(stats.peakLevel, Math.abs(sample));
            
            // 直流偏置
            sum += sample;
            
            // RMS
            sumSquares += sample * sample;
            
            // 过零率
            if ((floatData[i - 1] * sample) < 0) {
                stats.zeroCrossings++;
            }
        }
        
        stats.dcOffset = sum / floatData.length;
        stats.rmsLevel = Math.sqrt(sumSquares / floatData.length);
        stats.crestFactor = stats.peakLevel / stats.rmsLevel;
        stats.zeroCrossings = (stats.zeroCrossings * 1000) / floatData.length; // 每秒过零次数
        
        return stats;
    }

    updateStatsDisplay(stats) {
        document.getElementById('peakLevel').textContent = `峰值电平: ${(stats.peakLevel * 100).toFixed(2)}%`;
        document.getElementById('rmsLevel').textContent = `RMS电平: ${(stats.rmsLevel * 100).toFixed(2)}%`;
        document.getElementById('dcOffset').textContent = `直流偏置: ${stats.dcOffset.toFixed(6)}`;
        document.getElementById('crestFactor').textContent = `波峰因数: ${stats.crestFactor.toFixed(2)}`;
        document.getElementById('zeroCrossings').textContent = `过零率: ${stats.zeroCrossings.toFixed(1)} 次/秒`;
    }

    togglePlay() {
        if (this.isPlaying) {
            this.stop();
        } else {
            this.play();
        }
    }

    play() {
        if (!this.audioBuffer) return;

        this.audioSource = this.audioContext.createBufferSource();
        this.audioSource.buffer = this.audioBuffer;
        this.audioSource.connect(this.analyser);
        
        // 添加播放结束事件监听
        this.audioSource.onended = this.onPlaybackEnd;
        
        // 从暂停位置开始播放
        this.startTime = this.audioContext.currentTime;
        this.audioSource.start(0, this.pausedTime);
        
        this.isPlaying = true;
        this.playButton.textContent = '暂停';
        
        this.startAnimation();
    }

    stop() {
        if (this.audioSource) {
            this.audioSource.stop();
            this.audioSource.onended = null;
            this.audioSource = null;
        }
        
        // 记录暂停时的播放位置
        if (this.isPlaying) {
            const currentTime = this.getCurrentTime();
            this.pausedTime = Math.min(currentTime, this.audioBuffer.duration);
        }
        
        this.isPlaying = false;
        this.playButton.textContent = '播放';
        
        // 停止动画但保持显示
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        // 不清空画布，而是重新绘制一次当前状态
        if (this.audioBuffer) {
            const channelData = this.audioBuffer.getChannelData(0);
            this.drawWaveform(channelData);
            
            // 绘制静态频谱
            const spectrumData = new Uint8Array(this.analyser.frequencyBinCount);
            this.analyser.getByteFrequencyData(spectrumData);
            this.drawSpectrum(spectrumData);
        }
        
        // 更新最终进度
        this.updateCurrentTime();
    }

    // 处理播放结束
    onPlaybackEnd() {
        if (this.isPlaying) {
            this.isPlaying = false;
            this.playButton.textContent = '播放';
            this.pausedTime = 0;
            this.stopAnimation();
            
            // 更新进度条到终点
            this.currentTimeDisplay.textContent = this.formatTime(this.audioBuffer.duration);
            this.progressCurrent.style.width = '100%';
        }
    }

    // 获取当前播放时间
    getCurrentTime() {
        if (!this.isPlaying) return this.pausedTime;
        return this.audioContext.currentTime - this.startTime + this.pausedTime;
    }

    // 更新当前播放时间
    updateCurrentTime() {
        if (!this.audioBuffer) return;
        
        const currentTime = this.getCurrentTime();
        const duration = this.audioBuffer.duration;
        
        // 确保时间不超过总时长
        const clampedTime = Math.min(currentTime, duration);
        const progress = (clampedTime / duration) * 100;
        
        this.currentTimeDisplay.textContent = this.formatTime(clampedTime);
        this.progressCurrent.style.width = `${progress}%`;
        
        // 更新波形和频谱显示
        const currentSample = Math.floor(clampedTime * this.audioBuffer.sampleRate);
        this.updateVisualization(currentSample);
    }

    // 跳转到指定位置
    seekTo(progress) {
        if (!this.audioBuffer) return;
        
        const wasPlaying = this.isPlaying;
        if (wasPlaying) {
            this.stop();
        }
        
        // 确保进度在有效范围内
        const clampedProgress = Math.max(0, Math.min(1, progress));
        this.pausedTime = clampedProgress * this.audioBuffer.duration;
        
        // 计算当前采样点位置
        const currentSample = Math.floor(this.pausedTime * this.audioBuffer.sampleRate);
        
        // 更新显示
        this.updateCurrentTime();
        
        // 更新波形和频谱
        this.updateVisualization(currentSample);
        
        if (wasPlaying) {
            this.play();
        }
    }

    // 处理进度条点击
    handleProgressClick(e) {
        if (!this.audioBuffer) return;
        
        const rect = this.progressBar.getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const progress = x / rect.width;
        
        this.seekTo(progress);
    }

    startAnimation() {
        const draw = () => {
            if (!this.isPlaying) return;
            
            // 获取当前播放时间
            const currentTime = this.getCurrentTime();
            const duration = this.audioBuffer.duration;
            
            // 更新进度显示
            this.currentTimeDisplay.textContent = this.formatTime(currentTime);
            this.progressCurrent.style.width = `${(currentTime / duration) * 100}%`;
            
            // 获取当前采样点位置
            const currentSample = Math.floor(currentTime * this.audioBuffer.sampleRate);
            
            // 更新波形和频谱
            this.updateVisualization(currentSample);
            
            // 检查是否播放结束
            if (currentTime >= duration) {
                this.onPlaybackEnd();
                return;
            }
            
            this.animationId = requestAnimationFrame(draw);
        };
        
        draw();
    }

    stopAnimation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        // 清空画布
        this.waveformCtx.clearRect(0, 0, this.waveformCanvas.width, this.waveformCanvas.height);
        this.spectrumCtx.clearRect(0, 0, this.spectrumCanvas.width, this.spectrumCanvas.height);
        
        // 重置音量显示
        this.volumeDisplay.textContent = '音量: 0%';
        this.volumeDisplay.style.background = this.getVolumeColor(0);
        
        // 更新最终进度
        this.updateCurrentTime();
    }

    calculateVolume(dataArray) {
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const db = 20 * Math.log10(Math.max(rms, 1e-10)) + 90;
        return Math.max(0, Math.min(100, db));
    }

    updateVolumeDisplay(volume) {
        this.volumeDisplay.textContent = `音量: ${Math.round(volume)}%`;
        this.volumeDisplay.style.background = this.getVolumeColor(volume);
    }

    getVolumeColor(volume) {
        if (volume < 30) return '#2196F3';
        if (volume < 70) return '#FFA500';
        return '#FF4444';
    }

    drawWaveform(dataArray) {
        const ctx = this.waveformCtx;
        const width = this.waveformCanvas.width / (window.devicePixelRatio || 1);
        const height = this.waveformCanvas.height / (window.devicePixelRatio || 1);
        const middleY = height / 2;
        const padding = 40;
        
        // 绘制坐标轴
        this.drawWaveformAxes(ctx, width, height);
        
        // 计算可见区域的数据范围
        const effectiveWidth = width - 2 * padding;
        const duration = this.audioBuffer.duration;
        const pixelsPerSecond = effectiveWidth * this.zoomLevel / duration;
        
        // 计算起始和结束采样点
        const startSample = Math.floor((this.offset / pixelsPerSecond) * this.audioBuffer.sampleRate);
        const endSample = Math.floor(((this.offset + effectiveWidth) / pixelsPerSecond) * this.audioBuffer.sampleRate);
        
        // 绘制波形
        ctx.beginPath();
        ctx.strokeStyle = '#2196F3';
        ctx.lineWidth = 1;
        
        // 计算每个采样点对应的x坐标
        const samplesInView = endSample - startSample;
        const pixelsPerSample = effectiveWidth / samplesInView;
        
        // 绘制所有可见的采样点
        for (let i = startSample; i < endSample; i++) {
            if (i >= 0 && i < dataArray.length) {
                const value = dataArray[i];
                const x = padding + (i - startSample) * pixelsPerSample;
                const y = middleY + (value * (height - 2 * padding) / 2);
                
                if (i === startSample) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
        }
        
        ctx.stroke();
        
        // 绘制选区
        if (this.selection.start !== this.selection.end) {
            this.drawSelection();
        }
    }

    drawWaveformAxes(ctx, width, height) {
        const padding = 40;
        const effectiveWidth = width - 2 * padding;
        const effectiveHeight = height - 2 * padding;
        const middleY = height / 2;
        
        // 清除整个画布
        ctx.clearRect(0, 0, width, height);
        
        // 创建裁剪区域
        ctx.save();
        ctx.beginPath();
        ctx.rect(padding, padding, effectiveWidth, effectiveHeight);
        ctx.clip();
        
        // 绘制中心线
        ctx.beginPath();
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;
        ctx.moveTo(padding, middleY);
        ctx.lineTo(width - padding, middleY);
        ctx.stroke();
        
        ctx.restore();
        
        // 绘制振幅刻度
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#666';
        ctx.font = '12px Arial';
        
        const amplitudeSteps = [-1, -0.5, 0, 0.5, 1];
        amplitudeSteps.forEach(step => {
            const y = middleY - (step * effectiveHeight / 2);
            if (y >= padding && y <= height - padding) {
                ctx.fillText(step.toFixed(1), padding - 5, y);
                
                // 绘制刻度线
                ctx.beginPath();
                ctx.moveTo(padding - 3, y);
                ctx.lineTo(padding, y);
                ctx.stroke();
            }
        });
        
        // 绘制时间刻度
        if (this.audioBuffer) {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            
            const duration = this.audioBuffer.duration;
            const pixelsPerSecond = effectiveWidth * this.zoomLevel / duration;
            const viewStartTime = this.offset / pixelsPerSecond;
            const viewDuration = effectiveWidth / pixelsPerSecond;
            
            // 计算合适的时间隔
            const timeInterval = this.calculateTimeInterval(viewDuration);
            const firstTickTime = Math.ceil(viewStartTime / timeInterval) * timeInterval;
            
            for (let time = firstTickTime; time <= viewStartTime + viewDuration; time += timeInterval) {
                const x = padding + (time - viewStartTime) * pixelsPerSecond;
                if (x >= padding && x <= width - padding) {
                    ctx.fillText(time.toFixed(3) + 's', x, height - padding + 5);
                    
                    // 绘制刻度线
                    ctx.beginPath();
                    ctx.moveTo(x, height - padding);
                    ctx.lineTo(x, height - padding + 3);
                    ctx.stroke();
                }
            }
        }
    }

    // 新增：计算合适的时间隔
    calculateTimeInterval(duration) {
        const baseIntervals = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5];
        const targetSteps = 10; // 期望的刻度数量
        const rawInterval = duration / targetSteps;
        
        // 找到最接近的合适间隔
        return baseIntervals.find(interval => interval >= rawInterval) || baseIntervals[baseIntervals.length - 1];
    }

    drawSpectrum(dataArray) {
        const ctx = this.spectrumCtx;
        const width = this.spectrumCanvas.width / (window.devicePixelRatio || 1);
        const height = this.spectrumCanvas.height / (window.devicePixelRatio || 1);
        const padding = 40;
        
        ctx.clearRect(0, 0, width, height);
        
        // 绘制频谱坐标轴
        this.drawSpectrumAxes(ctx, width, height);
        
        // 使用更深的渐变色
        const gradient = ctx.createLinearGradient(0, padding, 0, height - padding);
        gradient.addColorStop(0, '#FF0033');  // 高频：深红色
        gradient.addColorStop(0.3, '#FF6600'); // 中高频：深橙色
        gradient.addColorStop(0.6, '#00CC00'); // 中频：深绿色
        gradient.addColorStop(1, '#0033CC');   // 低频：深蓝色
        
        const barCount = dataArray.length;
        const barWidth = (width - 2 * padding) / barCount;
        const barSpacing = Math.max(1, barWidth * 0.2);
        const actualBarWidth = barWidth - barSpacing;
        
        // 增强发光效果
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(255, 255, 255, 0.7)';
        
        for (let i = 0; i < barCount; i++) {
            // 增强对数刻度的效果
            const value = dataArray[i];
            const logValue = Math.pow(value / 255, 0.8); // 减小指数以增强显示
            const barHeight = logValue * (height - 2 * padding);
            
            const x = padding + (i * barWidth);
            const y = height - padding - barHeight;
            
            ctx.fillStyle = gradient;
            ctx.fillRect(x + barSpacing/2, y, actualBarWidth, barHeight);
            
            // 增强顶部高亮
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.fillRect(x + barSpacing/2, y, actualBarWidth, 3);
        }
        
        // 重置阴影效果
        ctx.shadowBlur = 0;
    }

    drawSpectrumAxes(ctx, width, height) {
        const padding = 40;
        
        // 清除坐标轴区域
        ctx.clearRect(0, 0, padding, height);
        ctx.clearRect(0, height - padding, width, padding);
        
        // 绘制频率轴（X轴）
        ctx.beginPath();
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;
        ctx.moveTo(padding, height - padding);
        ctx.lineTo(width - padding, height - padding);
        ctx.stroke();
        
        // 绘制幅度轴（Y轴）
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, height - padding);
        ctx.stroke();
        
        // 绘制频率刻度
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#666';
        ctx.font = '12px Arial';
        
        const freqSteps = [0, 5000, 10000, 15000, 20000];
        const maxFreq = this.audioContext.sampleRate / 2;
        
        freqSteps.forEach(freq => {
            if (freq <= maxFreq) {
                const x = padding + ((width - 2 * padding) * freq / maxFreq);
                ctx.fillText(freq >= 1000 ? (freq/1000) + 'kHz' : freq + 'Hz', 
                           x, height - padding + 5);
                
                // 绘制刻度线
                ctx.beginPath();
                ctx.moveTo(x, height - padding);
                ctx.lineTo(x, height - padding + 3);
                ctx.stroke();
            }
        });
        
        // 绘制幅度刻度
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        
        const dbSteps = [-60, -48, -36, -24, -12, 0];
        dbSteps.forEach(db => {
            const y = padding + ((height - 2 * padding) * (1 - (db + 60) / 60));
            ctx.fillText(db + 'dB', padding - 5, y);
            
            // 绘制刻度线
            ctx.beginPath();
            ctx.moveTo(padding - 3, y);
            ctx.lineTo(padding, y);
            ctx.stroke();
        });
    }

    setZoom(level) {
        if (!this.audioBuffer) return;
        
        const oldZoom = this.zoomLevel;
        this.zoomLevel = Math.max(1, Math.min(50, level));
        
        // 计算新的偏移量，保持视图中心的时间点不变
        const effectiveWidth = this.waveformCanvas.width / (window.devicePixelRatio || 1) - 80; // 考虑padding
        const duration = this.audioBuffer.duration;
        
        // 计算当前视图中心的时间点
        const pixelsPerSecond = effectiveWidth * oldZoom / duration;
        const viewStartTime = this.offset / pixelsPerSecond;
        const viewCenterTime = viewStartTime + (duration / oldZoom / 2);
        
        // 用新的缩放级别计算偏移量
        const newPixelsPerSecond = effectiveWidth * this.zoomLevel / duration;
        const newOffset = (viewCenterTime - (duration / this.zoomLevel / 2)) * newPixelsPerSecond;
        
        // 限制偏移量范围
        this.offset = Math.max(0, Math.min(effectiveWidth * (this.zoomLevel - 1), newOffset));
        
        // 重绘波形
        if (this.audioBuffer) {
            this.drawWaveform(this.audioBuffer.getChannelData(0));
        }
    }

    handleSelectionStart(e) {
        if (!this.audioBuffer) return;
        
        this.selection.isSelecting = true;
        
        const rect = this.waveformCanvas.getBoundingClientRect();
        const padding = 40;
        const mouseX = e.clientX - rect.left - padding;
        const effectiveWidth = rect.width - 2 * padding;
        
        // 计算选择起点的时间
        const duration = this.audioBuffer.duration;
        const pixelsPerSecond = effectiveWidth * this.zoomLevel / duration;
        const viewStartTime = this.offset / pixelsPerSecond;
        
        // 计算相对于当前视图的时间位置
        const relativeTime = (mouseX / effectiveWidth) * (duration / this.zoomLevel);
        this.selection.startTime = viewStartTime + relativeTime;
        this.selection.endTime = this.selection.startTime;
        
        // 更新选择区域的像素位置
        this.selection.start = mouseX;
        this.selection.end = mouseX;
        
        // 重绘波形
        this.drawWaveform(this.audioBuffer.getChannelData(0));
    }

    handleSelectionMove(e) {
        if (!this.selection.isSelecting || !this.audioBuffer) return;
        
        const rect = this.waveformCanvas.getBoundingClientRect();
        const padding = 40;
        const mouseX = Math.max(0, Math.min(e.clientX - rect.left - padding, rect.width - 2 * padding));
        const effectiveWidth = rect.width - 2 * padding;
        
        // 计算选择终点的时间
        const duration = this.audioBuffer.duration;
        const pixelsPerSecond = effectiveWidth * this.zoomLevel / duration;
        const viewStartTime = this.offset / pixelsPerSecond;
        
        // 计算相对于当前视图的时间位置
        const relativeTime = (mouseX / effectiveWidth) * (duration / this.zoomLevel);
        this.selection.endTime = viewStartTime + relativeTime;
        this.selection.end = mouseX;
        
        // 重绘波形
        this.drawWaveform(this.audioBuffer.getChannelData(0));
    }

    handleSelectionEnd() {
        if (this.selection.isSelecting && this.hasValidSelection()) {
            // 如果有有效选区，直接放大
            this.zoomToSelection();
        }
        this.selection.isSelecting = false;
    }

    drawSelection() {
        if (!this.hasValidSelection()) return;
        
        const ctx = this.waveformCtx;
        const width = this.waveformCanvas.width / (window.devicePixelRatio || 1);
        const height = this.waveformCanvas.height / (window.devicePixelRatio || 1);
        const padding = 40;
        
        // 直接使用像素位置绘制选区
        const startX = padding + Math.min(this.selection.start, this.selection.end);
        const endX = padding + Math.max(this.selection.start, this.selection.end);
        
        // 绘制选区背景
        ctx.fillStyle = 'rgba(33, 150, 243, 0.2)';
        ctx.fillRect(startX, padding, endX - startX, height - 2 * padding);
        
        // 绘制选区边界
        ctx.strokeStyle = 'rgba(33, 150, 243, 0.8)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(startX, padding);
        ctx.lineTo(startX, height - padding);
        ctx.moveTo(endX, padding);
        ctx.lineTo(endX, height - padding);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // 显示选区时间范围
        const duration = Math.abs(this.selection.endTime - this.selection.startTime);
        const durationText = `选区: ${duration.toFixed(3)}s`;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(startX, padding - 20, ctx.measureText(durationText).width + 10, 20);
        
        ctx.fillStyle = 'white';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(durationText, startX + 5, padding - 2);
    }

    addMarker(position, label) {
        this.markers.push({ position, label });
        if (this.audioBuffer) {
            this.drawWaveform(this.audioBuffer.getChannelData(0));
        }
    }

    drawMarkers() {
        const ctx = this.waveformCtx;
        const height = this.waveformCanvas.height;
        
        this.markers.forEach(marker => {
            const x = marker.position * this.waveformCanvas.width;
            
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.strokeStyle = '#FF0000';
            ctx.stroke();
            
            ctx.fillStyle = '#FF0000';
            ctx.fillText(marker.label, x + 5, 15);
        });
    }

    exportSelection() {
        if (!this.audioBuffer || this.selection.start === this.selection.end) {
            alert('请先选择要导出的区域');
            return;
        }
        
        const startSample = Math.floor(this.selection.start * this.audioBuffer.length);
        const endSample = Math.floor(this.selection.end * this.audioBuffer.length);
        const channelData = this.audioBuffer.getChannelData(0);
        const selectedData = channelData.slice(
            Math.min(startSample, endSample),
            Math.max(startSample, endSample)
        );
        
        // 创建新的Blob并下载
        const blob = new Blob([selectedData], { type: 'audio/pcm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'selection.pcm';
        a.click();
        URL.revokeObjectURL(url);
    }

    // 格式化时间显示
    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    }

    // 更新总时长显示
    updateTotalTime() {
        if (this.audioBuffer) {
            const duration = this.audioBuffer.duration;
            this.totalTimeDisplay.textContent = this.formatTime(duration);
        }
    }

    setupDragAndDrop() {
        // 点击拖放区域触发文件选择
        this.dropZone.addEventListener('click', () => {
            this.fileInput.click();
        });
        
        // 阻止默认拖放行为
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            this.dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });
        
        // 拖放视觉反馈
        ['dragenter', 'dragover'].forEach(eventName => {
            this.dropZone.addEventListener(eventName, () => {
                this.dropZone.classList.add('drag-over');
            });
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            this.dropZone.addEventListener(eventName, () => {
                this.dropZone.classList.remove('drag-over');
            });
        });
        
        // 处理文件拖放
        this.dropZone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFile(files[0]);
            }
        });
    }

    // 统一的文件处理方法
    async handleFile(file) {
        if (!file) return;
        
        // 检查文件类型（可选）
        if (!file.name.toLowerCase().endsWith('.pcm')) {
            alert('请选择 PCM ���件');
            return;
        }
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            await this.processPCMData(arrayBuffer);
        } catch (error) {
            console.error('文件处理错误:', error);
            alert('文件处理失败');
        }
    }

    // 将文件处理逻辑抽取出来
    async processPCMData(arrayBuffer) {
        const sampleRate = parseInt(this.sampleRateSelect.value);
        const bitDepth = parseInt(this.bitDepthSelect.value);
        const isLittleEndian = this.endianSelect.value === 'little';
        
        // 验证PCM格式
        const validationErrors = this.validatePCMFormat(arrayBuffer, {
            sampleRate,
            bitDepth,
            channels: 1,
            isLittleEndian
        });
        
        if (validationErrors.length > 0) {
            alert('PCM格式验证警告：\n' + validationErrors.join('\n'));
        }
        
        const floatData = new Float32Array(arrayBuffer);
        
        // 分析音频数据
        const stats = this.analyzeAudio(floatData);
        this.updateStatsDisplay(stats);
        
        // 创建音频缓冲区
        this.audioBuffer = this.audioContext.createBuffer(
            1,
            floatData.length,
            sampleRate
        );
        
        this.audioBuffer.getChannelData(0).set(floatData);
        
        // 重置播放位置
        this.pausedTime = 0;
        this.updateTotalTime();
        this.updateCurrentTime();
        
        // 计算并显示时长
        const duration = this.calculateDuration(floatData.length, sampleRate);
        this.durationDisplay.textContent = `时长: ${duration}`;
        
        // 启用控制按钮
        this.enableControls();
    }

    // 新增方法：初始化设置 canvas
    setupCanvases() {
        [this.waveformCanvas, this.spectrumCanvas].forEach(canvas => {
            const dpr = window.devicePixelRatio || 1;
            const displayWidth = canvas.clientWidth;
            const displayHeight = canvas.clientHeight;
            
            // 设置实际尺寸
            canvas.width = displayWidth * dpr;
            canvas.height = displayHeight * dpr;
            
            // 设置显示尺寸
            canvas.style.width = displayWidth + 'px';
            canvas.style.height = displayHeight + 'px';
            
            // 设置缩放
            const ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);
        });
    }

    // 处理滚轮缩放
    handleWheel(e) {
        e.preventDefault();
        
        if (!this.audioBuffer) return;
        
        const padding = 40;
        const rect = e.target.getBoundingClientRect();
        const mouseX = e.clientX - rect.left - padding;
        const effectiveWidth = rect.width - 2 * padding;
        
        // 计算当前视图的时间范围
        const duration = this.audioBuffer.duration;
        const pixelsPerSecond = effectiveWidth * this.zoomLevel / duration;
        const viewStartTime = this.offset / pixelsPerSecond;
        
        // 计算鼠标位置对应的时间点
        const mouseTime = viewStartTime + (mouseX / effectiveWidth) * (duration / this.zoomLevel);
        
        // 优化缩放灵敏度
        const zoomFactor = Math.pow(1.1, -Math.sign(e.deltaY));
        const targetZoom = Math.max(1, Math.min(50, this.zoomLevel * zoomFactor));
        
        // 如果缩放级别发生变化，启动动画
        if (targetZoom !== this.zoomLevel) {
            this.animateZoom(targetZoom, mouseTime);
        }
    }

    // 添加缩放动画方法
    animateZoom(targetZoom, fixedTimePoint) {
        // 如果已经在动画中，取消之前的动画
        if (this.zoomAnimation.isAnimating) {
            cancelAnimationFrame(this.zoomAnimationFrame);
        }
        
        this.zoomAnimation = {
            start: this.zoomLevel,
            end: targetZoom,
            startTime: performance.now(),
            duration: 300,
            isAnimating: true
        };
        
        const animate = (currentTime) => {
            if (!this.zoomAnimation.isAnimating) return;
            
            const elapsed = currentTime - this.zoomAnimation.startTime;
            const progress = Math.min(elapsed / this.zoomAnimation.duration, 1);
            
            // 使用 easeOutCubic 缓动函数
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            
            const newZoom = this.zoomAnimation.start + (this.zoomAnimation.end - this.zoomAnimation.start) * easeProgress;
            this.zoomLevel = newZoom;
            
            // 更新偏移量以保持固定不变
            const effectiveWidth = this.waveformCanvas.width - 80;
            const duration = this.audioBuffer.duration;
            const pixelsPerSecond = effectiveWidth * newZoom / duration;
            const newOffset = (fixedTimePoint - (effectiveWidth / pixelsPerSecond / 2)) * pixelsPerSecond;
            
            // 限制偏移量范围
            this.offset = Math.max(0, Math.min(effectiveWidth * (newZoom - 1), newOffset));
            
            // 更新显示
            this.drawWaveform(this.audioBuffer.getChannelData(0));
            this.updateZoomDisplay();
            
            if (progress < 1) {
                this.zoomAnimationFrame = requestAnimationFrame(animate);
            } else {
                this.zoomAnimation.isAnimating = false;
            }
        };
        
        this.zoomAnimationFrame = requestAnimationFrame(animate);
    }

    // 添加双击处理方法
    handleDoubleClick(e) {
        if (!this.audioBuffer) return;
        
        const padding = 40;
        const rect = e.target.getBoundingClientRect();
        const mouseX = e.clientX - rect.left - padding;
        const effectiveWidth = rect.width - 2 * padding;
        
        // 计算双击位置对应的时间点
        const duration = this.audioBuffer.duration;
        const pixelsPerSecond = effectiveWidth * this.zoomLevel / duration;
        const viewStartTime = this.offset / pixelsPerSecond;
        const clickTime = viewStartTime + (mouseX / effectiveWidth) * (duration / this.zoomLevel);
        
        // 重置到原始缩放级别
        this.animateZoom(1, clickTime);
    }

    // 添加缩放比例显示更新方法
    updateZoomDisplay() {
        const percentage = Math.round((this.zoomLevel - 1) * 100);
        this.zoomDisplay.textContent = `缩放: ${percentage}%`;
        this.zoomDisplay.style.opacity = percentage > 0 ? '1' : '0';
    }

    // 处理拖动开始
    handleDragStart(e) {
        if (!this.audioBuffer || this.zoomLevel <= 1) return;
        
        this.dragState.isDragging = true;
        this.dragState.startX = e.clientX;
        this.dragState.startOffset = this.offset;
        
        // 更改鼠标样式
        this.waveformCanvas.style.cursor = 'grabbing';
    }

    // 处理拖动移动
    handleDragMove(e) {
        if (!this.dragState.isDragging) return;
        
        const deltaX = e.clientX - this.dragState.startX;
        let newOffset = this.dragState.startOffset - deltaX;
        
        // 限制偏移量范围
        const maxOffset = this.waveformCanvas.width * (this.zoomLevel - 1);
        newOffset = Math.max(0, Math.min(maxOffset, newOffset));
        
        if (this.offset !== newOffset) {
            this.offset = newOffset;
            this.drawWaveform(this.audioBuffer.getChannelData(0));
        }
    }

    // 处理拖动结束
    handleDragEnd() {
        this.dragState.isDragging = false;
        this.waveformCanvas.style.cursor = 'grab';
    }

    createFrameControls() {
        const controls = document.querySelector('.controls');
        
        // 创建帧控制按钮
        this.prevFrameButton = document.createElement('button');
        this.prevFrameButton.textContent = '上一帧';
        this.prevFrameButton.disabled = true;
        this.prevFrameButton.onclick = () => this.stepFrame(-1);
        
        this.nextFrameButton = document.createElement('button');
        this.nextFrameButton.textContent = '下一帧';
        this.nextFrameButton.disabled = true;
        this.nextFrameButton.onclick = () => this.stepFrame(1);
        
        // 添加到控制栏
        controls.appendChild(this.prevFrameButton);
        controls.appendChild(this.nextFrameButton);
    }

    // 帧步进控制
    stepFrame(direction) {
        if (!this.audioBuffer) return;
        
        const frameSize = this.audioBuffer.sampleRate / 50; // 假设50fps
        const currentSample = Math.floor(this.getCurrentTime() * this.audioBuffer.sampleRate);
        const newSample = currentSample + (direction * frameSize);
        
        // 确保在有效范围内
        const clampedSample = Math.max(0, Math.min(newSample, this.audioBuffer.length - 1));
        const newTime = clampedSample / this.audioBuffer.sampleRate;
        
        // 更新播放位置
        this.seekTo(newTime / this.audioBuffer.duration);
        
        // 更新波形和频谱
        this.updateVisualization(clampedSample);
    }

    // 新增方法：更新可视化
    updateVisualization(sampleIndex) {
        if (!this.audioBuffer) return;
        
        const channelData = this.audioBuffer.getChannelData(0);
        this.drawWaveform(channelData);
        
        // 计算当前帧的频谱
        const frameSize = 2048;
        const startIndex = Math.max(0, sampleIndex - frameSize/2);
        const frame = channelData.slice(startIndex, startIndex + frameSize);
        
        // 创建临时缓冲区来分析频谱
        const tempBuffer = this.audioContext.createBuffer(1, frameSize, this.audioBuffer.sampleRate);
        tempBuffer.getChannelData(0).set(frame);
        
        // 使用离线分析来获取频谱数据
        const offlineContext = new OfflineAudioContext(1, frameSize, this.audioBuffer.sampleRate);
        const offlineSource = offlineContext.createBufferSource();
        const offlineAnalyser = offlineContext.createAnalyser();
        
        offlineAnalyser.fftSize = 2048;
        offlineAnalyser.smoothingTimeConstant = 0.3;
        
        offlineSource.buffer = tempBuffer;
        offlineSource.connect(offlineAnalyser);
        offlineAnalyser.connect(offlineContext.destination);
        
        // 开始离线渲染
        offlineSource.start(0);
        
        offlineContext.startRendering().then(() => {
            const spectrumData = new Uint8Array(offlineAnalyser.frequencyBinCount);
            offlineAnalyser.getByteFrequencyData(spectrumData);
            
            // 绘制频谱
            this.drawSpectrum(spectrumData);
        }).catch(err => {
            console.error('频谱分析错误:', err);
        });
    }

    // 检查是否有有效的选区
    hasValidSelection() {
        return this.audioBuffer && 
               Math.abs(this.selection.endTime - this.selection.startTime) > 0.001; // 至少1ms的选区
    }

    // 添加放大到选区的方法
    zoomToSelection() {
        if (!this.hasValidSelection()) return;
        
        // 计算选区的时间范围
        const startTime = Math.min(this.selection.startTime, this.selection.endTime);
        const endTime = Math.max(this.selection.startTime, this.selection.endTime);
        const selectionDuration = endTime - startTime;
        const centerTime = (startTime + endTime) / 2;
        
        // 计算需要的缩放级别
        const effectiveWidth = this.waveformCanvas.width / (window.devicePixelRatio || 1) - 80;
        const duration = this.audioBuffer.duration;
        const targetZoom = (duration / selectionDuration) * 0.9;
        const newZoom = Math.min(50, Math.max(1, targetZoom));
        
        // 计算新的偏移量，使选区居中显示
        const pixelsPerSecond = effectiveWidth * newZoom / duration;
        const newOffset = Math.max(0, (centerTime - (duration / newZoom / 2)) * pixelsPerSecond);
        
        // 设置新的缩放级别和偏移量
        this.zoomLevel = newZoom;
        this.offset = newOffset;
        
        // 重绘波形
        this.drawWaveform(this.audioBuffer.getChannelData(0));
        this.updateZoomDisplay();
        
        // 清除选区
        this.clearSelection();
    }

    // 添加清除选区的方法
    clearSelection() {
        this.selection = {
            start: 0,
            end: 0,
            startTime: 0,
            endTime: 0,
            isSelecting: false
        };
    }

    // 添加鼠标按下处理方法
    handleMouseDown(e) {
        if (e.button === 2) { // 右键
            // 开始选区
            this.startSelection(e);
        } else if (e.button === 0) { // 左键
            // 开始拖动
            this.handleDragStart(e);
        }
    }

    // 添加鼠标移动处理方法
    handleMouseMove(e) {
        if (this.selection.isSelecting) {
            this.updateSelection(e);
        } else if (this.dragState.isDragging) {
            this.handleDragMove(e);
        }
    }

    // 添加鼠标松开处理方法
    handleMouseUp(e) {
        if (e.button === 2 && this.selection.isSelecting) {
            this.endSelection();
        } else if (e.button === 0 && this.dragState.isDragging) {
            this.handleDragEnd();
        }
    }

    // 开始选区
    startSelection(e) {
        if (!this.audioBuffer) return;
        
        this.selection.isSelecting = true;
        
        const rect = this.waveformCanvas.getBoundingClientRect();
        const padding = 40;
        const mouseX = e.clientX - rect.left - padding;
        const effectiveWidth = rect.width - 2 * padding;
        
        // 计算选择起点的时间
        const duration = this.audioBuffer.duration;
        const pixelsPerSecond = effectiveWidth * this.zoomLevel / duration;
        const viewStartTime = this.offset / pixelsPerSecond;
        
        // 计算相对于当前视图的时间位置
        const relativeTime = (mouseX / effectiveWidth) * (duration / this.zoomLevel);
        this.selection.startTime = viewStartTime + relativeTime;
        this.selection.endTime = this.selection.startTime;
        
        // 更新选择区域的像素位置
        this.selection.start = mouseX;
        this.selection.end = mouseX;
        
        // 重绘波形
        this.drawWaveform(this.audioBuffer.getChannelData(0));
    }

    // 更新选区
    updateSelection(e) {
        if (!this.selection.isSelecting || !this.audioBuffer) return;
        
        const rect = this.waveformCanvas.getBoundingClientRect();
        const padding = 40;
        const mouseX = Math.max(0, Math.min(e.clientX - rect.left - padding, rect.width - 2 * padding));
        const effectiveWidth = rect.width - 2 * padding;
        
        // 计算选择终点的时间
        const duration = this.audioBuffer.duration;
        const pixelsPerSecond = effectiveWidth * this.zoomLevel / duration;
        const viewStartTime = this.offset / pixelsPerSecond;
        
        // 计算相对于当前视图的时间位置
        const relativeTime = (mouseX / effectiveWidth) * (duration / this.zoomLevel);
        this.selection.endTime = viewStartTime + relativeTime;
        this.selection.end = mouseX;
        
        // 重绘波形
        this.drawWaveform(this.audioBuffer.getChannelData(0));
    }

    // 结束选区
    endSelection() {
        if (this.selection.isSelecting && this.hasValidSelection()) {
            // 如果有有效选区，直接放大
            this.zoomToSelection();
        }
        this.selection.isSelecting = false;
    }

    // 修改 resetView 方法
    resetView() {
        if (!this.audioBuffer) return;
        
        // 重置缩放和偏移
        this.zoomLevel = 1;
        this.offset = 0;
        
        // 清除选区
        this.clearSelection();
        
        // 重绘波形
        this.drawWaveform(this.audioBuffer.getChannelData(0));
        this.updateZoomDisplay();
        
        // 更新鼠标样式
        this.waveformCanvas.style.cursor = 'grab';
    }
}

// 初始化播放器
window.addEventListener('DOMContentLoaded', () => {
    new PCMPlayer();
}); 