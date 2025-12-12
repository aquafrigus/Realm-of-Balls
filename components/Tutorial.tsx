

import React from 'react';
import { CharacterType } from '../types';
import { Sound } from '../sound';
import { CHARACTER_IMAGES } from '../images';

interface TutorialProps {
  charType: CharacterType;
  onStart: (type: CharacterType) => void;
  onBack: () => void;
}

const Tutorial: React.FC<TutorialProps> = ({ charType, onStart, onBack }) => {
  const isPyro = charType === CharacterType.PYRO;
  const isWukong = charType === CharacterType.WUKONG;
  const isTank = charType === CharacterType.TANK;
  const isCat = charType === CharacterType.CAT;

  let colorClass = 'text-emerald-400';
  let borderClass = 'border-emerald-500';
  let bgClass = 'bg-emerald-900/20';
  let fallbackIcon = '🛡️';

  if (isPyro) {
      colorClass = 'text-red-400';
      borderClass = 'border-red-500';
      bgClass = 'bg-red-900/20';
      fallbackIcon = '🔥';
  } else if (isWukong) {
      colorClass = 'text-yellow-400';
      borderClass = 'border-yellow-500';
      bgClass = 'bg-yellow-900/20';
      fallbackIcon = '🐵';
  } else if (isCat) {
      colorClass = 'text-amber-300';
      borderClass = 'border-amber-400';
      bgClass = 'bg-amber-900/20';
      fallbackIcon = '🐱';
  }

  const handleStart = () => {
      Sound.playUI('START');
      onStart(charType);
  };
  
  const handleBack = () => {
      Sound.playUI('CLICK');
      onBack();
  };

  const getTitle = () => {
      if (isPyro) return '火焰球';
      if (isWukong) return '悟空球';
      if (isCat) return '猫猫球';
      return '坦克球';
  };

  const getSubTitle = () => {
      if (isPyro) return '"高机动 · 持续伤害"';
      if (isWukong) return '"近战连招 · 灵活位移"';
      if (isCat) return '"我有九条命 · 液体刺客"';
      return '"重装甲 · 远程轰炸"';
  };

  const getStats = () => {
     if (isPyro) return { hp: '40%', speed: '90%', mass: '10%' };
     if (isWukong) return { hp: '60%', speed: '85%', mass: '30%' };
     if (isCat) return { hp: '5%', speed: '100%', mass: '1%' };
     return { hp: '100%', speed: '30%', mass: '100%' };
  };

  const stats = getStats();
  
  // Custom Avatar Renderer
  const avatarSrc = CHARACTER_IMAGES[charType].avatar;
  const renderAvatar = () => {
      if (avatarSrc) {
          return <img src={avatarSrc} alt={charType} className="w-full h-full object-cover" />;
      }
      if (isTank) {
          return (
             <div className="w-full h-full p-6 text-white">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
                    <path d="M20,14V10h-2V7h-3V4h-2v3H9V4H7v3H4v3H2v6h20v-6H20z M11,4h2v3h-2V4z M17,14h-2v-2h2V14z M13,14h-2v-2h2V14z M9,14H7v-2h2V14z" />
                    <path d="M2,18v2h20v-2H2z" />
                </svg>
             </div>
          );
      }
      return <span className="text-6xl">{fallbackIcon}</span>;
  }

  return (
    <div className="w-full h-screen bg-slate-900 flex items-center justify-center p-8 overflow-hidden relative">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIiBzdHlsZT0iYmFja2dyb3VuZC1jb2xvcjogIzBmMTcyYTsgb3BhY2l0eTogMC4wNSI+PHBhdGggZD0iTTAgNDBMNDAgMEgwVjQweiIgZmlsbD0iI2ZmZiIvPjwvc3ZnPg==')] opacity-10 pointer-events-none"></div>

      <div className="max-w-6xl w-full h-[90vh] bg-slate-800 rounded-3xl border border-slate-700 shadow-2xl flex flex-col md:flex-row overflow-hidden relative z-10">
        
        {/* Left Panel: Stats & Overview */}
        <div className={`w-full md:w-1/3 p-8 border-r border-slate-700 flex flex-col ${bgClass}`}>
          <div className="mb-8 text-center">
             <div className={`w-32 h-32 mx-auto rounded-full bg-slate-900 shadow-lg flex items-center justify-center mb-4 border-4 border-slate-700 overflow-hidden`}>
                {renderAvatar()}
             </div>
             <h1 className={`text-4xl font-bold ${colorClass} mb-2`}>{getTitle()}</h1>
             <p className="text-slate-400 italic">{getSubTitle()}</p>
          </div>

          <div className="flex-1 space-y-6">
              <div className="bg-slate-900/60 p-4 rounded-xl">
                 <h3 className="text-white font-bold mb-3 uppercase text-xs tracking-wider border-b border-slate-700 pb-2">基础属性</h3>
                 <div className="space-y-3 text-sm">
                    <div className="flex justify-between items-center">
                        <span className="text-slate-400">生命值</span>
                        <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
                           <div style={{width: stats.hp}} className={`h-full ${isCat ? 'bg-red-500' : 'bg-green-500'}`}></div>
                        </div>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-slate-400">移动速度</span>
                        <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
                           <div style={{width: stats.speed}} className="h-full bg-blue-400"></div>
                        </div>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-slate-400">物理质量</span>
                        <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
                           <div style={{width: stats.mass}} className="h-full bg-yellow-400"></div>
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
                 <div className="w-24 h-24 shrink-0 bg-slate-900 rounded-xl flex items-center justify-center text-3xl">
                    ⚔️
                 </div>
                 <div>
                    <h3 className={`text-lg font-bold ${colorClass} mb-1`}>
                        普通攻击 (左键)
                    </h3>
                    <p className="text-slate-400 text-sm leading-relaxed mb-2">
                        {isPyro && "左键：向鼠标方向持续喷射高热火焰。火焰会对敌人造成持续伤害并叠加【易伤】状态。"}
                        {isTank && "左键：发射一枚重型炮弹(重炮模式)或高射速子弹(机枪模式)。重炮具有击退和减速效果。"}
                        {isWukong && "左键：三段连招【左挥 -> 右挥 -> 前劈】。第三段攻击造成高额伤害和击退。右键（按住）：蓄力【呔！】，根据蓄力时间增加攻击距离和伤害。"}
                        {isCat && "短按：猫猫拳，极快的近身抓挠。长按蓄力：【飞扑】，松开后高速冲向光标位置，造成冲撞伤害。"}
                    </p>
                 </div>
              </div>

              {/* SECONDARY / SKILL */}
              <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 flex gap-6 items-start hover:border-slate-600 transition-colors">
                 <div className="w-24 h-24 shrink-0 bg-slate-900 rounded-xl flex items-center justify-center text-3xl">
                    ✨
                 </div>
                 <div>
                    <h3 className={`text-lg font-bold ${colorClass} mb-1`}>
                        特殊技能 (Space / 右键)
                    </h3>
                    <p className="text-slate-400 text-sm leading-relaxed mb-2">
                        {isPyro && "抛射一团岩浆，在地面形成燃烧区域。敌人在区域内减速并受到伤害，自己在区域内可回复生命值并加速散热。"}
                        {isTank && "在【重炮模式】和【机枪模式】之间切换。机枪模式下移动速度大幅提升。"}
                        {isWukong && "【如意金箍棒】：按住蓄力，悟空踩在变长的金箍棒上（升空）。松开按键后朝鼠标方向砸下，造成大范围伤害和击晕。蓄力时获得霸体。"}
                        {isCat && "右键：【哈气】，发出一圈声波震开周围的敌人和子弹。Space：【铲屎官之怒】，召唤巨大的铲屎铲重击地面。"}
                    </p>
                 </div>
              </div>

              {/* UNIQUE MECHANIC */}
              <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 flex gap-6 items-start hover:border-slate-600 transition-colors">
                 <div className="w-24 h-24 shrink-0 bg-slate-900 rounded-xl flex items-center justify-center text-3xl">
                    🧩
                 </div>
                 <div>
                    <h3 className={`text-lg font-bold ${colorClass} mb-1`}>
                        核心机制
                    </h3>
                    <p className="text-slate-400 text-sm leading-relaxed mb-2">
                        {isPyro && "热能过载：持续攻击会积累热能。100%时进入过热状态无法攻击。"}
                        {isTank && "重装霸体：极高的物理抗性。拥有独立的弹药系统。"}
                        {isWukong && "修行之躯：免疫30%火焰伤害。凌波微步（在水面上移动不会减速，但停留会溺水）。蓄力状态下获得50%击退抗性。"}
                        {isCat && "【九命猫猫】：生命值极低，但拥有9条命。死亡时会化作烟雾在安全位置复活，并获得短暂无敌。"}
                    </p>
                 </div>
              </div>

           </div>
           
           <button 
             onClick={handleStart}
             className={`w-full mt-8 py-4 bg-slate-700 hover:bg-slate-600 text-white font-bold text-xl rounded-xl shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98] border-2 ${borderClass}`}
           >
             开始战斗
           </button>
        </div>

      </div>
    </div>
  );
};

export default Tutorial;