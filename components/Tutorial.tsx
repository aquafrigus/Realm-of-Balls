

import React from 'react';
import { CharacterType, TankMode } from '../types';
import { CHAR_STATS } from '../constants';
import { Sound } from '../sound';

interface TutorialProps {
  charType: CharacterType;
  onStart: (type: CharacterType) => void;
  onBack: () => void;
}

const Tutorial: React.FC<TutorialProps> = ({ charType, onStart, onBack }) => {
  const isPyro = charType === CharacterType.PYRO;
  const colorClass = isPyro ? 'text-red-400' : 'text-emerald-400';
  const borderClass = isPyro ? 'border-red-500' : 'border-emerald-500';
  const bgClass = isPyro ? 'bg-red-900/20' : 'bg-emerald-900/20';

  const handleStart = () => {
      Sound.playUI('START');
      onStart(charType);
  };
  
  const handleBack = () => {
      Sound.playUI('CLICK');
      onBack();
  };

  return (
    <div className="w-full h-screen bg-slate-900 flex items-center justify-center p-8 overflow-hidden relative">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIiBzdHlsZT0iYmFja2dyb3VuZC1jb2xvcjogIzBmMTcyYTsgb3BhY2l0eTogMC4wNSI+PHBhdGggZD0iTTAgNDBMNDAgMEgwVjQweiIgZmlsbD0iI2ZmZiIvPjwvc3ZnPg==')] opacity-10 pointer-events-none"></div>

      <div className="max-w-6xl w-full h-[90vh] bg-slate-800 rounded-3xl border border-slate-700 shadow-2xl flex flex-col md:flex-row overflow-hidden relative z-10">
        
        {/* Left Panel: Stats & Overview */}
        <div className={`w-full md:w-1/3 p-8 border-r border-slate-700 flex flex-col ${bgClass}`}>
          <div className="mb-8 text-center">
             <div className={`w-32 h-32 mx-auto rounded-full ${isPyro ? 'bg-red-500 shadow-red-500/50' : 'bg-emerald-600 shadow-emerald-500/50'} shadow-lg flex items-center justify-center mb-4 border-4 border-slate-800 p-6`}>
                {isPyro ? (
                    <span className="text-6xl">🔥</span>
                ) : (
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full text-white">
                        <path d="M20,14V10h-2V7h-3V4h-2v3H9V4H7v3H4v3H2v6h20v-6H20z M11,4h2v3h-2V4z M17,14h-2v-2h2V14z M13,14h-2v-2h2V14z M9,14H7v-2h2V14z" />
                        <path d="M2,18v2h20v-2H2z" />
                    </svg>
                )}
             </div>
             <h1 className={`text-4xl font-bold ${colorClass} mb-2`}>{isPyro ? '火焰球' : '坦克球'}</h1>
             <p className="text-slate-400 italic">{isPyro ? '"高机动 · 持续伤害"' : '"重装甲 · 远程轰炸"'}</p>
          </div>

          <div className="flex-1 space-y-6">
              <div className="bg-slate-900/60 p-4 rounded-xl">
                 <h3 className="text-white font-bold mb-3 uppercase text-xs tracking-wider border-b border-slate-700 pb-2">基础属性</h3>
                 <div className="space-y-3 text-sm">
                    <div className="flex justify-between items-center">
                        <span className="text-slate-400">生命值</span>
                        <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
                           <div style={{width: isPyro ? '40%' : '100%'}} className={`h-full ${isPyro ? 'bg-red-500' : 'bg-green-500'}`}></div>
                        </div>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-slate-400">移动速度</span>
                        <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
                           <div style={{width: isPyro ? '90%' : '30%'}} className="h-full bg-blue-400"></div>
                        </div>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-slate-400">物理质量</span>
                        <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
                           <div style={{width: isPyro ? '10%' : '100%'}} className="h-full bg-yellow-400"></div>
                        </div>
                    </div>
                 </div>
              </div>
          </div>
          
          <button 
             onClick={handleBack}
             className="mt-auto py-3 text-slate-400 hover:text-white font-bold text-sm uppercase tracking-widest flex items-center gap-2 group"
          >
             <span>← 返回主菜单</span>
          </button>
        </div>

        {/* Right Panel: Mechanics Breakdown */}
        <div className="w-full md:w-2/3 p-8 overflow-y-auto custom-scrollbar bg-slate-900">
           <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
              战斗手册 <span className="text-sm font-normal text-slate-500 bg-slate-800 px-2 py-1 rounded">职业机制</span>
           </h2>

           <div className="grid grid-cols-1 gap-6">
              
              {/* PRIMARY WEAPON */}
              <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 flex gap-6 items-start hover:border-slate-600 transition-colors">
                 <div className="w-24 h-24 shrink-0 bg-slate-900 rounded-xl flex items-center justify-center relative overflow-hidden">
                    {isPyro ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                           <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                           <div className="absolute left-1/2 top-1/2 w-20 h-10 -translate-y-1/2 bg-gradient-to-r from-red-500 to-transparent opacity-50 origin-left animate-pulse"></div>
                        </div>
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-8 h-8 bg-emerald-700 rounded relative">
                                <div className="absolute -right-6 top-1/2 -translate-y-1/2 w-8 h-2 bg-slate-400"></div>
                            </div>
                        </div>
                    )}
                 </div>
                 <div>
                    <h3 className={`text-lg font-bold ${colorClass} mb-1`}>
                        {isPyro ? '普通攻击：火焰喷射（左键）' : '普通攻击：重炮轰炸（左键）'}
                    </h3>
                    <p className="text-slate-400 text-sm leading-relaxed mb-2">
                        {isPyro 
                           ? "向鼠标方向持续喷射高热火焰。火焰会对敌人造成持续伤害并叠加【易伤】状态，持续灼烧时间越长，伤害越高。"
                           : "发射一枚重型炮弹，造成大范围AOE爆炸伤害。炮弹具有极强的【击退】和【减速】效果。"}
                    </p>
                    <div className="flex gap-2 text-xs">
                        <span className="bg-slate-700 text-slate-300 px-2 py-1 rounded">
                           {isPyro ? '持续施法' : '装填: 8秒/发'}
                        </span>
                        <span className="bg-slate-700 text-slate-300 px-2 py-1 rounded">
                           {isPyro ? '射程: 近/中' : '射程: 极远'}
                        </span>
                    </div>
                 </div>
              </div>

              {/* SECONDARY / SKILL */}
              <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 flex gap-6 items-start hover:border-slate-600 transition-colors">
                 <div className="w-24 h-24 shrink-0 bg-slate-900 rounded-xl flex items-center justify-center relative overflow-hidden">
                    {isPyro ? (
                        <div className="w-16 h-16 bg-red-900/50 rounded-full flex items-center justify-center border border-red-500/30 animate-pulse">
                            <div className="w-12 h-12 bg-red-600/20 rounded-full"></div>
                        </div>
                    ) : (
                        <div className="text-3xl">🔄</div>
                    )}
                 </div>
                 <div>
                    <h3 className={`text-lg font-bold ${colorClass} mb-1`}>
                        {isPyro ? '特殊技能：岩浆之池 (空格键)' : '特殊技能：切换形态 (空格键)'}
                    </h3>
                    <p className="text-slate-400 text-sm leading-relaxed mb-2">
                        {isPyro 
                           ? "抛射一团岩浆，在地面形成燃烧区域。敌人在区域内减速并受到伤害，自己在区域内可回复生命值并加速散热。"
                           : "在【重炮模式】和【机枪模式】之间切换。机枪模式下移动速度大幅提升，使用高射速轻机枪，但单发伤害和击退力降低。"}
                    </p>
                    <div className="flex gap-2 text-xs">
                         <span className="bg-slate-700 text-slate-300 px-2 py-1 rounded">
                           {isPyro ? '冷却: 6秒' : '冷却: 1秒'}
                        </span>
                    </div>
                 </div>
              </div>

              {/* UNIQUE MECHANIC */}
              <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 flex gap-6 items-start hover:border-slate-600 transition-colors">
                 <div className="w-24 h-24 shrink-0 bg-slate-900 rounded-xl flex items-center justify-center relative overflow-hidden">
                     <span className="text-4xl">{isPyro ? '🌡️' : '🛡️'}</span>
                 </div>
                 <div>
                    <h3 className={`text-lg font-bold ${colorClass} mb-1`}>
                        {isPyro ? '核心机制：热能过载' : '核心机制：重装霸体'}
                    </h3>
                    <p className="text-slate-400 text-sm leading-relaxed mb-2">
                        {isPyro 
                           ? "持续攻击会积累热能。热能达到100%时会进入【过热】状态，强制停止攻击直到冷却完毕。请合理控制攻击节奏。"
                           : "坦克球拥有极高的质量和物理抗性。受到撞击时几乎不会位移，且拥有独立的弹药系统（重炮需时间装填，机枪需更换弹链）。"}
                    </p>
                 </div>
              </div>

           </div>
           
           <button 
             onClick={handleStart}
             className={`w-full mt-8 py-4 ${isPyro ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-500'} text-white font-bold text-xl rounded-xl shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]`}
           >
             开始战斗
           </button>
        </div>

      </div>
    </div>
  );
};

export default Tutorial;
