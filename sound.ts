
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

  private createNoise(duration: number, vol = 1, filterFreq?: number) {
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
     gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
     
     if (filterFreq) {
         const filter = this.ctx.createBiquadFilter();
         filter.type = 'lowpass';
         filter.frequency.value = filterFreq;
         noise.connect(filter);
         filter.connect(gain);
     } else {
         noise.connect(gain);
     }
     
     gain.connect(this.masterGain);
     noise.start();
  }

  playShot(type: 'PYRO' | 'ARTILLERY' | 'LMG') {
    this.init();
    if (!this.ctx) return;

    if (type === 'PYRO') {
        // Hissing noise, short overlap
        this.createNoise(0.15, 0.15, 800);
    } else if (type === 'ARTILLERY') {
        // Deep boom + impact
        this.createOsc('square', 100, 0.4, 0.5, 10); // Thump
        this.createNoise(0.5, 0.5, 600); // Blast
    } else if (type === 'LMG') {
        // Sharp pop
        this.createOsc('sawtooth', 300, 0.08, 0.1, 100);
        this.createNoise(0.05, 0.1, 2000);
    }
  }

  playExplosion() {
      this.init();
      if (!this.ctx) return;
      // Heavy rumble
      this.createOsc('sawtooth', 60, 0.6, 0.6, 10);
      this.createNoise(0.8, 0.6, 400);
  }

  playHit() {
      this.init();
      if (!this.ctx) return;
      // High pitch tick
      this.createOsc('triangle', 600, 0.05, 0.1);
  }
  
  playSkill(type: 'MAGMA' | 'SWITCH' | 'RELOAD') {
      this.init();
      if (!this.ctx) return;
      if (type === 'MAGMA') {
          // Swoosh
          this.createNoise(0.4, 0.3, 1200);
          this.createOsc('sine', 200, 0.4, 0.2, 50);
      } else if (type === 'SWITCH') {
          // Mechanical Clank
          this.createOsc('square', 500, 0.1, 0.15);
          this.createOsc('sawtooth', 200, 0.15, 0.15);
      } else if (type === 'RELOAD') {
          // Click
          this.createOsc('sine', 800, 0.1, 0.1);
      }
  }

  playOverheat() {
      this.init();
      if (!this.ctx) return;
      // Warning beep
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
         // Major Arpeggio
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
         // Minor descend
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
