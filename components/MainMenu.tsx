
import React from 'react';
import { CharacterType } from '../types';
import { Sound } from '../sound';

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

  return (
    <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center p-8 z-50">
      <div className="text-center mb-12">
          <h1 className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 mb-4">
            球之域
          </h1>
          <p className="text-2xl text-slate-300 font-light tracking-widest animate-pulse">
            选择你的球
          </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl w-full">
        {/* PYRO CARD */}
        <div 
          onClick={() => handleSelect(CharacterType.PYRO)}
          className="group relative bg-slate-800 rounded-2xl p-6 border-2 border-slate-700 hover:border-red-500 cursor-pointer transition-all hover:scale-105"
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
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-20 h-20 rounded-full bg-red-500 shadow-[0_0_30px_rgba(239,68,68,0.6)] flex items-center justify-center text-4xl">
            🔥
          </div>
          <div className="mt-10 text-center">
            <h2 className="text-3xl font-bold text-red-400 mb-2">火焰球</h2>
            <p className="text-sm text-slate-300 mb-4 italic">"燃尽一切。"</p>
            <div className="space-y-2 text-left bg-slate-900/50 p-4 rounded-lg text-sm">
              <div className="flex justify-between"><span>速度</span> <span className="text-green-400">高</span></div>
              <div className="flex justify-between"><span>防御</span> <span className="text-red-400">低</span></div>
              <div className="flex justify-between"><span>攻击</span> <span>火焰喷射 (持续伤害)</span></div>
              <div className="flex justify-between"><span>技能</span> <span>岩浆池 (治疗/伤害/减速)</span></div>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              机制：热能系统。注意热度过载。
            </p>
          </div>
        </div>

        {/* TANK CARD */}
        <div 
          onClick={() => handleSelect(CharacterType.TANK)}
          className="group relative bg-slate-800 rounded-2xl p-6 border-2 border-slate-700 hover:border-emerald-500 cursor-pointer transition-all hover:scale-105"
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
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-20 h-20 rounded-full bg-emerald-600 shadow-[0_0_30px_rgba(16,185,129,0.6)] flex items-center justify-center p-4">
             {/* Custom Tank Icon */}
             <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full text-white">
                <path d="M20,14V10h-2V7h-3V4h-2v3H9V4H7v3H4v3H2v6h20v-6H20z M11,4h2v3h-2V4z M17,14h-2v-2h2V14z M13,14h-2v-2h2V14z M9,14H7v-2h2V14z" />
                <path d="M2,18v2h20v-2H2z" />
             </svg>
          </div>
          <div className="mt-10 text-center">
            <h2 className="text-3xl font-bold text-emerald-400 mb-2">坦克球</h2>
            <p className="text-sm text-slate-300 mb-4 italic">"铜墙铁壁。"</p>
            <div className="space-y-2 text-left bg-slate-900/50 p-4 rounded-lg text-sm">
              <div className="flex justify-between"><span>速度</span> <span className="text-red-400">极低</span></div>
              <div className="flex justify-between"><span>防御</span> <span className="text-green-400">重装甲</span></div>
              <div className="flex justify-between"><span>攻击</span> <span>重炮 / 轻机枪</span></div>
              <div className="flex justify-between"><span>技能</span> <span>形态切换</span></div>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              机制：霸体 & 弹药系统。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MainMenu;
