
import React, { useEffect, useState } from 'react';

interface IntroScreenProps {
  onEnter: () => void;
}

const IntroScreen: React.FC<IntroScreenProps> = ({ onEnter }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Trigger animation after mount
    const timer = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div 
      onClick={onEnter}
      className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center cursor-pointer overflow-hidden z-[100]"
    >
       {/* Background Effects */}
       <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black pointer-events-none"></div>
       
       {/* Animated Grid Background */}
       <div className="absolute inset-0 opacity-10 pointer-events-none" 
            style={{
                backgroundImage: `linear-gradient(#334155 1px, transparent 1px), linear-gradient(90deg, #334155 1px, transparent 1px)`,
                backgroundSize: '40px 40px',
                transform: 'perspective(500px) rotateX(60deg) translateY(-100px) scale(2)',
                transformOrigin: 'top center'
            }}>
       </div>

       {/* Content */}
       <div className={`relative z-10 flex flex-col items-center transition-all duration-1000 ease-out transform ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'}`}>
          
          <div className="mb-8 relative group">
            <div className="absolute -inset-8 bg-gradient-to-r from-blue-500/20 via-emerald-500/20 to-purple-500/20 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
            <h1 className="relative text-8xl md:text-9xl font-black text-transparent bg-clip-text bg-gradient-to-br from-blue-400 via-emerald-400 to-purple-500 tracking-tighter drop-shadow-2xl">
              球之域
            </h1>
          </div>
          
          <div className={`h-px bg-gradient-to-r from-transparent via-slate-500 to-transparent transition-all duration-1000 delay-300 ${mounted ? 'w-64 opacity-100' : 'w-0 opacity-0'}`}></div>

          <p className={`mt-6 text-xl md:text-2xl text-slate-400 font-light tracking-[0.8em] uppercase transition-all duration-1000 delay-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
            Realm of Balls
          </p>
       </div>

       {/* Prompt */}
       <div className={`absolute bottom-24 transition-opacity duration-1000 delay-1000 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
           <span className="inline-flex items-center gap-3 px-8 py-3 rounded-full border border-slate-800 bg-slate-900/50 backdrop-blur text-slate-400 text-sm tracking-widest uppercase hover:bg-slate-800 hover:text-white transition-all hover:scale-105 hover:border-slate-600 shadow-lg animate-bounce">
              <span>点击开始</span>
              <span className="text-xs opacity-50">/</span>
              <span>Click to Start</span>
           </span>
       </div>
    </div>
  );
};

export default IntroScreen;
