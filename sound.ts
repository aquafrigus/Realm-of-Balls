

class SoundManager {
    private ctx: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private initialized = false;

    init() {
        if (this.initialized && this.ctx?.state === 'running') return;

        try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioContextClass) {
                this.ctx = new AudioContextClass();
                this.masterGain = this.ctx.createGain();
                this.masterGain.gain.value = 0.25; // Master volume
                this.masterGain.connect(this.ctx.destination);
                this.initialized = true;

                // Resume if suspended (browser policy)
                if (this.ctx.state === 'suspended') {
                    this.ctx.resume();
                }
            }
        } catch (e) {
            console.warn("AudioContext init failed", e);
        }
    }

    private createOsc(type: OscillatorType, freq: number, duration: number, vol = 1, slideTo?: number) {
        if (!this.ctx || !this.masterGain) return;
        const t = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        if (slideTo) {
            osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
        }

        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start();
        osc.stop(t + duration);
    }

    private createNoise(duration: number, vol = 1, filterFreq?: number, filterType: BiquadFilterType = 'lowpass') {
        if (!this.ctx || !this.masterGain) return;
        const t = this.ctx.currentTime;

        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(vol, t);
        gain.gain.linearRampToValueAtTime(0, t + duration);

        if (filterFreq) {
            const filter = this.ctx.createBiquadFilter();
            filter.type = filterType;
            filter.frequency.value = filterFreq;
            noise.connect(filter);
            filter.connect(gain);
        } else {
            noise.connect(gain);
        }

        gain.connect(this.masterGain);
        noise.start();
    }

    playShot(type: 'PYRO' | 'ARTILLERY' | 'LMG' | 'SWING' | 'SCRATCH' | 'MAGIC') {
        this.init();
        if (!this.ctx) return;

        if (type === 'PYRO') {
            this.createNoise(0.4, 0.015, 1000, 'highpass');
            this.createOsc('sine', 400, 0.1, 0.05, 300);
        } else if (type === 'ARTILLERY') {
            this.createOsc('square', 100, 0.4, 0.5, 10);
            this.createNoise(0.5, 0.5, 600);
        } else if (type === 'LMG') {
            this.createOsc('sawtooth', 300, 0.08, 0.1, 100);
            this.createNoise(0.05, 0.1, 2000);
        } else if (type === 'SWING') {
            this.createNoise(0.1, 0.2, 1000);
            this.createOsc('sine', 300, 0.1, 0.2, 100);
        } else if (type === 'SCRATCH') {
            this.createNoise(0.08, 0.3, 1500);
            this.createOsc('sawtooth', 600, 0.08, 0.15, 200);
        } else if (type === 'MAGIC') {
            // [Updated] "咻～" 魔法飞弹音效
            // 1. "Whistle" - 正弦波快速下滑，模拟物体高速划破空气
            this.createOsc('sine', 1000, 0.15, 0.15, 100);

            // 2. "Air" - 高通噪音，增加“风声”质感
            this.createNoise(0.15, 0.1, 2000, 'highpass');
        }
    }

    playExplosion() {
        this.init();
        if (!this.ctx) return;
        this.createOsc('sawtooth', 60, 0.6, 0.6, 10);
        this.createNoise(0.8, 0.6, 400);
    }

    // [Updated] 增加 type 参数以支持不同命中音效
    playHit(type?: 'MAGIC' | 'DEFAULT') {
        this.init();
        if (!this.ctx) return;

        if (type === 'MAGIC') {
            // [Updated] 魔法命中音效：哈利波特式的“噼里啪啦”电流感

            // 1. "Crack" - 极短、高音量的锯齿波，从极高频瞬间掉落
            // 这模拟了闪电劈中或鞭子抽打的声音
            this.createOsc('sawtooth', 2000, 0.08, 0.3, 100);

            // 2. "Fizz" - 高通噪音，模拟电火花炸裂
            // 使用 highpass 过滤掉低频，只保留“嘶嘶”声
            this.createNoise(0.1, 0.25, 3000, 'highpass');

            // 3. "Snap" - 补充一个极短的方波冲击
            this.createOsc('square', 500, 0.05, 0.2, 50);
        } else {
            // 默认物理撞击音效 (保留原样或微调)
            this.createOsc('triangle', 600, 0.05, 0.1, 100); // 稍微加点滑音让撞击更自然
        }
    }

    playSkill(type: 'MAGMA_THROW' | 'MAGMA_LAND' | 'MAGMA_EXPLODE' | 'SWITCH' | 'RELOAD' | 'CHARGE_START' | 'SMASH_HIT' | 'THRUST' | 'SCOOPER_WARNING' | 'SHIELD_ACTIVATE' | 'SHIELD_CRACK' | 'SHIELD_SHATTER' | 'BLINK') {
        this.init();
        if (!this.ctx) return;
        if (type === 'MAGMA_THROW') {
            // Stronger launch, deeper tone
            this.createNoise(0.3, 0.4, 800, 'lowpass');
            this.createOsc('sawtooth', 150, 0.3, 0.25, 50);
            this.createOsc('sine', 200, 0.2, 0.2, 400);
        } else if (type === 'MAGMA_LAND') {
            // Splash/Hiss sound
            this.createNoise(0.5, 0.4, 800, 'lowpass');
            this.createOsc('sine', 150, 0.3, 0.2, 50);
        } else if (type === 'MAGMA_EXPLODE') {
            // Heavy burst
            this.createOsc('sawtooth', 50, 0.7, 0.8, 10);
            this.createNoise(1.0, 0.8, 300);
        } else if (type === 'SWITCH') {
            this.createOsc('square', 500, 0.1, 0.15);
            this.createOsc('sawtooth', 200, 0.15, 0.15);
        } else if (type === 'RELOAD') {
            this.createOsc('sine', 800, 0.1, 0.1);
        } else if (type === 'CHARGE_START') {
            // Rising pitch
            this.createOsc('triangle', 200, 1.0, 0.1, 600);
        } else if (type === 'SMASH_HIT') {
            // Heavy impact
            this.createOsc('square', 80, 0.3, 0.5, 10);
            this.createNoise(0.3, 0.5, 500);
        } else if (type === 'THRUST') {
            // Sharp pierce
            this.createOsc('sawtooth', 400, 0.2, 0.2, 100);
        } else if (type === 'SCOOPER_WARNING') {
            this.createOsc('square', 600, 0.3, 0.1, 1200);
        } else if (type === 'SHIELD_ACTIVATE') {
            // "Bo" (啵) - Quick bubbly pop/upward sweep
            this.createOsc('sine', 400, 0.1, 0.4, 1200);
            this.createNoise(0.05, 0.1, 2000, 'highpass');
        } else if (type === 'SHIELD_CRACK') {
            // "Ka" (咔) - Sharp crystalline snap
            this.createOsc('sawtooth', 1600, 0.04, 0.3, 400);
            this.createNoise(0.04, 0.2, 3000, 'highpass');
        } else if (type === 'SHIELD_SHATTER') {
            // "Peng" (砰) - Heavy explosive thud
            this.createOsc('sine', 120, 0.4, 0.7, 10);
            this.createNoise(0.5, 0.6, 400, 'lowpass');
        } else if (type === 'BLINK') {
            // "Pew/Whoosh" - Rapid movement
            this.createOsc('sine', 800, 0.15, 0.3, 200); // Frequency drop = Doppler-ish
            this.createNoise(0.15, 0.2, 3000, 'highpass');
        }
    }

    playBurnout() {
        this.init();
        if (!this.ctx) return;
        this.createOsc('square', 800, 0.2, 0.1, 400);
    }

    playUI(type: 'CLICK' | 'START' | 'VICTORY' | 'DEFEAT' | 'ERROR' | 'HOVER') {
        this.init();
        if (!this.ctx) return;

        if (type === 'CLICK') {
            this.createOsc('sine', 600, 0.05, 0.1);
        } else if (type === 'START') {
            this.createOsc('triangle', 400, 0.3, 0.2, 800);
        } else if (type === 'VICTORY') {
            const t = this.ctx.currentTime;
            [440, 554, 659, 880].forEach((freq, i) => {
                const osc = this.ctx!.createOscillator();
                const gain = this.ctx!.createGain();
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.2, t + i * 0.1);
                gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.5);
                osc.connect(gain);
                gain.connect(this.masterGain!);
                osc.start(t + i * 0.1);
                osc.stop(t + i * 0.1 + 0.5);
            });
        } else if (type === 'DEFEAT') {
            const t = this.ctx.currentTime;
            [440, 415, 370, 311].forEach((freq, i) => {
                const osc = this.ctx!.createOscillator();
                const gain = this.ctx!.createGain();
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.2, t + i * 0.2);
                gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.2 + 0.6);
                osc.connect(gain);
                gain.connect(this.masterGain!);
                osc.start(t + i * 0.2);
                osc.stop(t + i * 0.2 + 0.6);
            });
        } else if (type === 'ERROR') {
            // 短促的错误提示音：两个降调的音符
            this.createOsc('square', 300, 0.1, 0.15, 200);
            setTimeout(() => this.createOsc('square', 200, 0.15, 0.15, 100), 100);
        } else if (type === 'HOVER') {
            // 轻微的悬停音效
            this.createOsc('sine', 800, 0.03, 0.05);
        }
    }
}

export const Sound = new SoundManager();