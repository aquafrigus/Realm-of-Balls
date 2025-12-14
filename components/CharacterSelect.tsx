import React from 'react';
import { CharacterType } from '../types';
import { Sound } from '../sound';
import { CHARACTER_IMAGES } from '../images';

interface CharacterSelectProps {
  onSelectCharacter: (type: CharacterType) => void;
  onOpenWiki: () => void;
  onBack: () => void;
}

const CharacterSelect: React.FC<CharacterSelectProps> = ({ onSelectCharacter, onOpenWiki, onBack }) => {
  const handleSelect = (type: CharacterType) => {
      Sound.playUI('START');
      onSelectCharacter(type);
  };
  
  const renderAvatar = (type: CharacterType, defaultContent: React.ReactNode, borderColorClass: string) => {
      const imgSrc = CHARACTER_IMAGES[type].avatar;
      if (imgSrc) {
          return (
              <div className={`absolute -top-6 left-1/2 -translate-x-1/2 w-20 h-20 rounded-full shadow-[0_0_30px_rgba(0,0,0,0.5)] border-4 ${borderColorClass} overflow-hidden bg-slate-900`}>
                  <img src={imgSrc} alt={type} className="w-full h-full object-cover" />
              </div>
          );
      }
      return defaultContent;
  };

  return (
    <div className="h-screen w-full bg-slate-900 flex flex-col items-center justify-center gap-10 p-8 z-50 overflow-hidden relative">
      
      {/* 返回按钮 */}
      <button 
        onClick={() => { Sound.playUI('CLICK'); onBack(); }}
        className="absolute top-8 left-8 text-slate-400 hover:text-white flex items-center gap-2 uppercase tracking-widest text-sm font-bold transition-colors z-20"
      >
        <span>← 返回主页</span>
      </button>

      <div className="text-center">
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 mb-2">
            配置出战
          </h1>
          <p className="text-xl text-slate-300 font-light tracking-widest animate-pulse">
            选择你的球
          </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl w-full px-4">
        
        {/* PYRO CARD */}
        <div 
          onClick={() => handleSelect(CharacterType.PYRO)}
          className="group relative bg-slate-800 rounded-2xl p-6 border-2 border-slate-700 hover:border-red-500 cursor-pointer transition-all hover:scale-105 mt-8"
        >
          {renderAvatar(
              CharacterType.PYRO, 
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-20 h-20 rounded-full bg-red-500 shadow-[0_0_30px_rgba(239,68,68,0.6)] flex items-center justify-center text-4xl border-4 border-slate-800">
                🔥
              </div>,
              "border-red-500"
          )}
          <div className="mt-10 text-center">
            <h2 className="text-2xl font-bold text-red-400 mb-2">火焰球</h2>
            <p className="text-xs text-slate-300 mb-4 italic">燃尽一切</p>
            <div className="space-y-1 text-left bg-slate-900/50 p-3 rounded-lg text-xs">
              <div className="flex justify-between"><span>速度</span> <span className="text-green-400">高</span></div>
              <div className="flex justify-between"><span>防御</span> <span className="text-red-400">低</span></div>
              <div className="flex justify-between"><span>攻击</span> <span>火焰喷射</span></div>
            </div>
            {/* [更新] 机制描述 */}
            <p className="mt-2 text-[10px] text-slate-500 border-t border-slate-700/50 pt-2">
              机制：热能管理 / 持续叠伤 / 引爆全场
            </p>
          </div>
        </div>

        {/* WUKONG CARD */}
        <div 
          onClick={() => handleSelect(CharacterType.WUKONG)}
          className="group relative bg-slate-800 rounded-2xl p-6 border-2 border-slate-700 hover:border-yellow-500 cursor-pointer transition-all hover:scale-105 mt-8"
        >
           {renderAvatar(CharacterType.WUKONG, null, "border-yellow-500")}
          <div className="mt-10 text-center">
            <h2 className="text-2xl font-bold text-yellow-400 mb-2">悟空球</h2>
            <p className="text-xs text-slate-300 mb-4 italic">齐天大圣</p>
            <div className="space-y-1 text-left bg-slate-900/50 p-3 rounded-lg text-xs">
              <div className="flex justify-between"><span>速度</span> <span className="text-green-400">极高</span></div>
              <div className="flex justify-between"><span>防御</span> <span className="text-yellow-400">中等</span></div>
              <div className="flex justify-between"><span>攻击</span> <span>金箍棒连招</span></div>
            </div>
            {/* [更新] 机制描述 */}
            <p className="mt-2 text-[10px] text-slate-500 border-t border-slate-700/50 pt-2">
              机制：三段连招 / 蓄力攻击 / 水上漂
            </p>
          </div>
        </div>

        {/* TANK CARD */}
        <div 
          onClick={() => handleSelect(CharacterType.TANK)}
          className="group relative bg-slate-800 rounded-2xl p-6 border-2 border-slate-700 hover:border-emerald-500 cursor-pointer transition-all hover:scale-105 mt-8"
        >
           {renderAvatar(CharacterType.TANK, null, "border-emerald-500")}
          <div className="mt-10 text-center">
            <h2 className="text-2xl font-bold text-emerald-400 mb-2">坦克球</h2>
            <p className="text-xs text-slate-300 mb-4 italic">铜墙铁壁</p>
            <div className="space-y-1 text-left bg-slate-900/50 p-3 rounded-lg text-xs">
              <div className="flex justify-between"><span>速度</span> <span className="text-red-400">极低</span></div>
              <div className="flex justify-between"><span>防御</span> <span className="text-green-400">重装甲</span></div>
              <div className="flex justify-between"><span>攻击</span> <span>重炮 / 轻机枪</span></div>
            </div>
            {/* [更新] 机制描述 */}
            <p className="mt-2 text-[10px] text-slate-500 border-t border-slate-700/50 pt-2">
              机制：双形态切换 / 召唤无人机
            </p>
          </div>
        </div>

        {/* CAT CARD */}
        <div 
          onClick={() => handleSelect(CharacterType.CAT)}
          className="group relative bg-slate-800 rounded-2xl p-6 border-2 border-slate-700 hover:border-amber-400 cursor-pointer transition-all hover:scale-105 mt-8"
        >
           {renderAvatar(CharacterType.CAT, null, "border-amber-400")}
          <div className="mt-10 text-center">
            <h2 className="text-2xl font-bold text-amber-300 mb-2">猫猫球</h2>
            <p className="text-xs text-slate-300 mb-4 italic">萌即正义</p>
            <div className="space-y-1 text-left bg-slate-900/50 p-3 rounded-lg text-xs">
              <div className="flex justify-between"><span>速度</span> <span className="text-green-400">超音速</span></div>
              <div className="flex justify-between"><span>防御</span> <span className="text-red-500">纸糊</span></div>
              <div className="flex justify-between"><span>攻击</span> <span>猫爪/飞扑</span></div>
            </div>
            {/* [更新] 机制描述 */}
            <p className="mt-2 text-[10px] text-slate-500 border-t border-slate-700/50 pt-2">
              机制：九命复活 / 飞扑控制 / 铲屎官之怒
            </p>
          </div>
        </div>

      </div>

      {/* 底部醒目的游戏百科按钮 (保持在下方) */}
      <div className="z-20 w-full flex justify-center">
          <button 
             onClick={() => { Sound.playUI('CLICK'); onOpenWiki(); }}
             className="group relative flex items-center justify-center gap-4 px-10 py-4 bg-gradient-to-r from-blue-900/80 to-purple-900/80 hover:from-blue-600 hover:to-purple-600 border-2 border-blue-400/30 hover:border-white rounded-full shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:shadow-[0_0_40px_rgba(147,51,234,0.6)] transition-all duration-300 transform hover:-translate-y-1"
          >
             {/* 呼吸光效背景 */}
             <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-xl animate-pulse"></div>
             
             {/* 魔法书 SVG 图标 */}
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-blue-200 group-hover:text-white drop-shadow-md">
                 <path d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v14.25a.75.75 0 001 .707A8.237 8.237 0 016 18.75c1.995 0 3.823.707 5.25 1.886V4.533zM12.75 20.636A8.214 8.214 0 0118 18.75c.966 0 1.89.166 2.75.47a.75.75 0 001-.708V4.262a.75.75 0 00-.5-.707A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533v16.103z" />
             </svg>

             <div className="flex flex-col items-center relative z-10 text-center">
                 <span className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-100 to-purple-100 group-hover:text-white tracking-widest uppercase shadow-black drop-shadow-sm">
                    游戏百科
                 </span>
                 <span className="text-[10px] font-bold text-blue-300/80 group-hover:text-blue-100 tracking-[0.2em] uppercase">
                    机制 · 数据 · 图鉴
                 </span>
             </div>
             
             {/* 右侧小箭头 */}
             <span className="text-blue-400 group-hover:text-white text-xl group-hover:translate-x-1 transition-transform">→</span>
          </button>
      </div>

    </div>
  );
};

export default CharacterSelect;