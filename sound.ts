

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

  playShot(type: 'PYRO' | 'ARTILLERY' | 'LMG' | 'SWING' | 'SCRATCH') {
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
        // Whoosh sound for Wukong
        this.createNoise(0.1, 0.2, 1000);
        this.createOsc('sine', 300, 0.1, 0.2, 100);
    } else if (type === 'SCRATCH') {
        // Short scratch sound: Highpass noise + fast pitch drop
        this.createNoise(0.08, 0.3, 1500);
        this.createOsc('sawtooth', 600, 0.08, 0.15, 200);
    }
  }

  playExplosion() {
      this.init();
      if (!this.ctx) return;
      this.createOsc('sawtooth', 60, 0.6, 0.6, 10);
      this.createNoise(0.8, 0.6, 400);
  }

  playHit() {
      this.init();
      if (!this.ctx) return;
      this.createOsc('triangle', 600, 0.05, 0.1);
  }
  
  playSkill(type: 'MAGMA' | 'SWITCH' | 'RELOAD' | 'CHARGE_START' | 'SMASH_HIT' | 'THRUST') {
      this.init();
      if (!this.ctx) return;
      if (type === 'MAGMA') {
          this.createNoise(0.4, 0.4, 1200);
          this.createOsc('sine', 200, 0.4, 0.2, 50);
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
      }
  }

  playOverheat() {
      this.init();
      if (!this.ctx) return;
      this.createOsc('square', 800, 0.2, 0.1, 400);
  }
  
  playUI(type: 'CLICK' | 'START' | 'VICTORY' | 'DEFEAT') {
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
             gain.gain.setValueAtTime(0.2, t + i*0.1);
             gain.gain.exponentialRampToValueAtTime(0.001, t + i*0.1 + 0.5);
             osc.connect(gain);
             gain.connect(this.masterGain!);
             osc.start(t + i*0.1);
             osc.stop(t + i*0.1 + 0.5);
         });
     } else if (type === 'DEFEAT') {
         const t = this.ctx.currentTime;
         [440, 415, 370, 311].forEach((freq, i) => {
             const osc = this.ctx!.createOscillator();
             const gain = this.ctx!.createGain();
             osc.frequency.value = freq;
             gain.gain.setValueAtTime(0.2, t + i*0.2);
             gain.gain.exponentialRampToValueAtTime(0.001, t + i*0.2 + 0.6);
             osc.connect(gain);
             gain.connect(this.masterGain!);
             osc.start(t + i*0.2);
             osc.stop(t + i*0.2 + 0.6);
         });
     }
  }
}

export const Sound = new SoundManager();