

import React from 'react';
import { CharacterType } from '../types';
import { Sound } from '../sound';
import { CHARACTER_IMAGES } from '../images';

interface MainMenuProps {
  onSelectCharacter: (type: CharacterType) => void;
  onShowTutorial: (type: CharacterType) => void;
}

const MainMenu: React.FC<MainMenuProps> = ({ onSelectCharacter, onShowTutorial }) => {
  const handleSelect = (type: CharacterType) => {
      Sound.playUI('START');
      onSelectCharacter(type);
  };
  
  const handleTutorial = (e: React.MouseEvent, type: CharacterType) => {
      e.stopPropagation();
      Sound.playUI('CLICK');
      onShowTutorial(type);
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
    <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center p-8 z-50 overflow-hidden">
      <div className="text-center mb-8">
          <h1 className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 mb-4">
            球之域
          </h1>
          <p className="text-2xl text-slate-300 font-light tracking-widest animate-pulse">
            选择你的球
          </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl w-full px-4">
        {/* PYRO CARD */}
        <div 
          onClick={() => handleSelect(CharacterType.PYRO)}
          className="group relative bg-slate-800 rounded-2xl p-6 border-2 border-slate-700 hover:border-red-500 cursor-pointer transition-all hover:scale-105 mt-8"
        >
          <div className="absolute top-4 right-4 z-10">
              <button 
                  onClick={(e) => handleTutorial(e, CharacterType.PYRO)}
                  className="w-8 h-8 rounded-full bg-slate-700 hover:bg-red-500 text-white flex items-center justify-center font-bold text-lg border border-slate-600 transition-colors"
                  title="玩法介绍"
              >
              ?
              </button>
          </div>
          
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
            <p className="mt-2 text-[10px] text-slate-500">
              机制：热能过载。
            </p>
          </div>
        </div>

        {/* WUKONG CARD */}
        <div 
          onClick={() => handleSelect(CharacterType.WUKONG)}
          className="group relative bg-slate-800 rounded-2xl p-6 border-2 border-slate-700 hover:border-yellow-500 cursor-pointer transition-all hover:scale-105 mt-8"
        >
          <div className="absolute top-4 right-4 z-10">
              <button 
                  onClick={(e) => handleTutorial(e, CharacterType.WUKONG)}
                  className="w-8 h-8 rounded-full bg-slate-700 hover:bg-yellow-500 text-white flex items-center justify-center font-bold text-lg border border-slate-600 transition-colors"
                  title="玩法介绍"
              >
              ?
              </button>
          </div>

          {renderAvatar(
              CharacterType.WUKONG, 
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-20 h-20 rounded-full bg-yellow-500 shadow-[0_0_30px_rgba(234,179,8,0.6)] flex items-center justify-center text-4xl border-4 border-slate-800">
                🐵
              </div>,
              "border-yellow-500"
          )}

          <div className="mt-10 text-center">
            <h2 className="text-2xl font-bold text-yellow-400 mb-2">悟空球</h2>
            <p className="text-xs text-slate-300 mb-4 italic">齐天大圣</p>
            <div className="space-y-1 text-left bg-slate-900/50 p-3 rounded-lg text-xs">
              <div className="flex justify-between"><span>速度</span> <span className="text-green-400">极高</span></div>
              <div className="flex justify-between"><span>防御</span> <span className="text-yellow-400">中等</span></div>
              <div className="flex justify-between"><span>攻击</span> <span>金箍棒连招</span></div>
            </div>
            <p className="mt-2 text-[10px] text-slate-500">
              机制：连段/蓄力/水上漂。
            </p>
          </div>
        </div>

        {/* TANK CARD */}
        <div 
          onClick={() => handleSelect(CharacterType.TANK)}
          className="group relative bg-slate-800 rounded-2xl p-6 border-2 border-slate-700 hover:border-emerald-500 cursor-pointer transition-all hover:scale-105 mt-8"
        >
           <div className="absolute top-4 right-4 z-10">
              <button 
                  onClick={(e) => handleTutorial(e, CharacterType.TANK)}
                  className="w-8 h-8 rounded-full bg-slate-700 hover:bg-emerald-500 text-white flex items-center justify-center font-bold text-lg border border-slate-600 transition-colors"
                  title="玩法介绍"
              >
              ?
              </button>
          </div>

          {renderAvatar(
              CharacterType.TANK, 
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-20 h-20 rounded-full bg-emerald-600 shadow-[0_0_30px_rgba(16,185,129,0.6)] flex items-center justify-center p-4 border-4 border-slate-800">
                 <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full text-white">
                    <path d="M20,14V10h-2V7h-3V4h-2v3H9V4H7v3H4v3H2v6h20v-6H20z M11,4h2v3h-2V4z M17,14h-2v-2h2V14z M13,14h-2v-2h2V14z M9,14H7v-2h2V14z" />
                    <path d="M2,18v2h20v-2H2z" />
                 </svg>
              </div>,
              "border-emerald-500"
          )}

          <div className="mt-10 text-center">
            <h2 className="text-2xl font-bold text-emerald-400 mb-2">坦克球</h2>
            <p className="text-xs text-slate-300 mb-4 italic">铜墙铁壁</p>
            <div className="space-y-1 text-left bg-slate-900/50 p-3 rounded-lg text-xs">
              <div className="flex justify-between"><span>速度</span> <span className="text-red-400">极低</span></div>
              <div className="flex justify-between"><span>防御</span> <span className="text-green-400">重装甲</span></div>
              <div className="flex justify-between"><span>攻击</span> <span>重炮 / 轻机枪</span></div>
            </div>
            <p className="mt-2 text-[10px] text-slate-500">
              机制：霸体 & 弹药系统。
            </p>
          </div>
        </div>

        {/* CAT CARD */}
        <div 
          onClick={() => handleSelect(CharacterType.CAT)}
          className="group relative bg-slate-800 rounded-2xl p-6 border-2 border-slate-700 hover:border-amber-400 cursor-pointer transition-all hover:scale-105 mt-8"
        >
           <div className="absolute top-4 right-4 z-10">
              <button 
                  onClick={(e) => handleTutorial(e, CharacterType.CAT)}
                  className="w-8 h-8 rounded-full bg-slate-700 hover:bg-amber-400 text-white flex items-center justify-center font-bold text-lg border border-slate-600 transition-colors"
                  title="玩法介绍"
              >
              ?
              </button>
          </div>

          {renderAvatar(
              CharacterType.CAT, 
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-20 h-20 rounded-full bg-amber-200 shadow-[0_0_30px_rgba(251,191,36,0.6)] flex items-center justify-center text-4xl border-4 border-slate-800">
                 🐱
              </div>,
              "border-amber-400"
          )}

          <div className="mt-10 text-center">
            <h2 className="text-2xl font-bold text-amber-300 mb-2">猫猫球</h2>
            <p className="text-xs text-slate-300 mb-4 italic">萌即正义</p>
            <div className="space-y-1 text-left bg-slate-900/50 p-3 rounded-lg text-xs">
              <div className="flex justify-between"><span>速度</span> <span className="text-green-400">超音速</span></div>
              <div className="flex justify-between"><span>防御</span> <span className="text-red-500">纸糊</span></div>
              <div className="flex justify-between"><span>攻击</span> <span>猫爪/飞扑</span></div>
            </div>
            <p className="mt-2 text-[10px] text-slate-500">
              机制：九命猫猫 & 铲屎官之怒。
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default MainMenu;