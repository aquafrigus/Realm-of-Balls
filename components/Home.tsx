import React from 'react';
import { Sound } from '../sound';

interface HomeProps {
  onQuickStart: () => void;
  onOpenSettings: () => void;
  onCustomGame: () => void;
}

const Home: React.FC<HomeProps> = ({ onQuickStart, onOpenSettings, onCustomGame }) => {

  const handleStart = () => {
    Sound.playUI('CLICK');
    onQuickStart();
  };

  const handleSettings = () => {
    Sound.playUI('CLICK');
    onOpenSettings();
  };

  return (
    // 外层容器：使用 flex column 布局整个屏幕
    <div className="w-full h-screen bg-slate-950 relative overflow-hidden font-sans select-none flex flex-col">
      
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black opacity-80"></div>
      <div className="absolute inset-0 opacity-20 pointer-events-none" 
         style={{
             backgroundImage: `linear-gradient(#334155 1px, transparent 1px), linear-gradient(90deg, #334155 1px, transparent 1px)`,
             backgroundSize: '60px 60px',
             transform: 'perspective(1000px) rotateX(20deg) scale(1.2)',
         }}>
      </div>

      {/* --- Top Bar (HUD & Profile) --- */}
      <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-start z-30"> 
          
          {/* Profile Summary */}
          <div className="flex items-center gap-4 bg-slate-900/50 p-2 pr-6 rounded-full border border-slate-700 backdrop-blur-sm cursor-pointer hover:bg-slate-800/50 transition-colors group">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center text-xl shadow-lg group-hover:scale-105 transition-transform">
                 👤
              </div>
              <div className="flex flex-col">
                  <span className="text-slate-200 font-bold text-sm tracking-wider">Player_01</span>
                  <div className="w-24 h-1.5 bg-slate-800 rounded-full mt-1 overflow-hidden">
                      <div className="h-full bg-emerald-400 w-2/3"></div>
                  </div>
              </div>
          </div>

          {/* System Tray */}
          <div className="flex gap-3">
              <button className="w-10 h-10 rounded-full bg-slate-900/80 border border-slate-700 text-slate-400 flex items-center justify-center hover:text-white hover:border-slate-500 transition-all">
                  📢
              </button>
              <button 
                onClick={handleSettings}
                className="w-10 h-10 rounded-full bg-slate-900/80 border border-slate-700 text-slate-400 flex items-center justify-center hover:text-white hover:border-slate-500 transition-all"
              >
                  ⚙️
              </button>
          </div>
      </div>

      {/* --- Center Logo and Action Area --- */}
      {/* 使用 flex-1 和 justify-center 将内容推到垂直中心 */}
      <div className="relative flex-1 flex flex-col items-center justify-center z-10">
          
          {/* Main Title / Logo Area (屏幕中间偏上) */}
          <div className="text-center absolute top-[20%] left-1/2 transform -translate-x-1/2 z-10">
              <h1 className="text-7xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-blue-400 via-emerald-400 to-purple-500 drop-shadow-lg">
                  球之域
              </h1>
              <p className="text-lg text-slate-400 font-light tracking-[0.5em] uppercase mt-2">
                  REALM OF BALLS
              </p>
          </div>

          {/* Action Buttons (屏幕垂直中心) */}
          <div className="flex flex-col items-center gap-4 relative z-20">
              
              {/* Quick Start Button */}
              <button 
                  onClick={handleStart}
                  className="group relative px-16 py-5 bg-gradient-to-r from-emerald-500 to-blue-600 rounded-2xl shadow-[0_0_40px_rgba(16,185,129,0.3)] hover:shadow-[0_0_60px_rgba(16,185,129,0.5)] hover:scale-105 active:scale-95 transition-all duration-300 flex flex-col items-center justify-center gap-1 overflow-hidden"
              >
                  {/* Glossy Effect */}
                  <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none"></div>
                  <div className="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  
                  <span className="text-4xl font-black text-white italic tracking-widest uppercase flex items-center gap-4 drop-shadow-md">
                      <span>🚀</span> 快速开始
                  </span>
                  <span className="text-[10px] font-bold text-emerald-100 tracking-[0.4em] uppercase opacity-80">
                      Quick Match
                  </span>
              </button>

              {/* Game Modes Selector */}
              <div className="flex flex-col items-center gap-2">
                  <span className="text-[10px] text-slate-500 uppercase tracking-widest">切换模式</span>
                  <button 
                      onClick={() => { Sound.playUI('CLICK'); onCustomGame(); }}
                      className="group px-6 py-2.5 bg-slate-900/60 border border-slate-700 hover:border-blue-500/50 rounded-full text-slate-300 hover:text-white transition-all flex items-center gap-3 backdrop-blur-md"
                  >
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981] animate-pulse"></span>
                      <span className="text-sm font-bold uppercase tracking-wider">自定义 / 多人</span>
                      <span className="text-xs text-slate-600 group-hover:text-blue-400 ml-2">⇄</span>
                  </button>
              </div>
          </div>
      </div>

      {/* --- Bottom Nav --- */}
      <div className="absolute bottom-10 left-0 w-full flex justify-center gap-10 z-10">
          {[
              { icon: '📖', label: '百科', id: 'wiki' },
              { icon: '🏆', label: '排行', id: 'rank' },
              { icon: '📼', label: '回放', id: 'replay' },
              { icon: 'ℹ️', label: '关于', id: 'about' },
          ].map((item) => (
              <button 
                  key={item.id}
                  className="flex flex-col items-center gap-2 group text-slate-500 hover:text-blue-400 transition-colors"
                  onClick={() => Sound.playUI('CLICK')}
              >
                  <div className="w-14 h-14 rounded-2xl bg-slate-900/80 border border-slate-800 group-hover:border-blue-500/50 flex items-center justify-center text-2xl shadow-lg transition-all group-hover:-translate-y-2">
                      {item.icon}
                  </div>
                  <span className="text-[10px] font-bold tracking-widest opacity-60 group-hover:opacity-100 uppercase">{item.label}</span>
              </button>
          ))}
      </div>
      
      {/* Version */}
      <div className="absolute bottom-4 right-6 text-slate-800 text-[10px] font-mono font-bold">
          ALPHA v0.2.1
      </div>

    </div>
  );
};

export default Home;