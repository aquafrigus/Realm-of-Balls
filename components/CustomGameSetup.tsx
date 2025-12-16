import React, { useState } from 'react';
import { CharacterType } from '../types';
import { Sound } from '../sound';
import { CHARACTER_IMAGES } from '../images';

export interface GameConfig {
  mode: 'FFA' | 'TEAM_2V2' | 'TEAM_3V3';
  players: {
    type: CharacterType;
    teamId: number;
    isBot: boolean;
    isPlayer: boolean;
  }[];
}

interface Props {
  onStart: (config: GameConfig) => void;
  onBack: () => void;
}

const CustomGameSetup: React.FC<Props> = ({ onStart, onBack }) => {
  const [mode, setMode] = useState<'FFA' | 'TEAM_2V2' | 'TEAM_3V3'>('FFA');
  
  // 默认配置
  const [slots, setSlots] = useState<{[key: number]: CharacterType}>({
      0: CharacterType.PYRO, // Player
      1: CharacterType.TANK, // Enemy / Ally
      2: CharacterType.WUKONG,
      3: CharacterType.CAT,
      4: CharacterType.PYRO,
      5: CharacterType.TANK,
  });

  const availableChars = [
      CharacterType.PYRO, CharacterType.TANK, CharacterType.WUKONG, CharacterType.CAT
  ];

  const handleCharChange = (index: number, type: CharacterType) => {
      Sound.playUI('CLICK');
      setSlots(prev => ({ ...prev, [index]: type }));
  };

  const getSlotConfig = () => {
      if (mode === 'FFA') return [0, 1, 2, 3]; // 4 player FFA (Max unique chars)
      if (mode === 'TEAM_2V2') return [0, 1, 2, 3]; // 0,1 vs 2,3
      if (mode === 'TEAM_3V3') return [0, 1, 2, 3, 4, 5]; // 0,1,2 vs 3,4,5
      return [];
  };

  const currentSlots = getSlotConfig();

  // 验证 FFA 是否重复
  const validateFFA = () => {
      if (mode !== 'FFA') return true;
      const types = currentSlots.map(i => slots[i]);
      const unique = new Set(types);
      return unique.size === types.length;
  };

  const isValid = validateFFA();

  const handleStartGame = () => {
      if (!isValid) return;
      Sound.playUI('START');

      const playerConfigs = currentSlots.map(idx => {
          let teamId = 0;
          let isBot = idx !== 0;
          
          if (mode === 'FFA') {
              teamId = idx; // 每个人独立队伍
          } else if (mode === 'TEAM_2V2') {
              teamId = idx < 2 ? 0 : 1;
          } else if (mode === 'TEAM_3V3') {
              teamId = idx < 3 ? 0 : 1;
          }

          return {
              type: slots[idx],
              teamId: teamId,
              isBot: isBot,
              isPlayer: idx === 0
          };
      });

      onStart({
          mode,
          players: playerConfigs
      });
  };

  const renderSlot = (index: number) => {
      const isPlayer = index === 0;
      let label = isPlayer ? "玩家" : "电脑";
      let borderColor = "border-slate-600";
      
      if (mode !== 'FFA') {
          const isAlly = (mode === 'TEAM_2V2' && index < 2) || (mode === 'TEAM_3V3' && index < 3);
          label = isPlayer ? "玩家 (我方)" : (isAlly ? "电脑 (队友)" : "电脑 (敌方)");
          borderColor = isAlly ? "border-blue-500" : "border-red-500";
      }

      const charType = slots[index];

      return (
          <div key={index} className={`relative bg-slate-800 rounded-xl p-3 border-2 ${borderColor} flex flex-col items-center gap-2`}>
              <span className={`text-xs font-bold uppercase ${index === 0 ? 'text-yellow-400' : 'text-slate-400'}`}>
                  {label}
              </span>
              
              <div className="grid grid-cols-2 gap-1">
                  {availableChars.map(c => (
                      <button
                          key={c}
                          onClick={() => handleCharChange(index, c)}
                          className={`w-10 h-10 rounded-lg border-2 overflow-hidden transition-all ${charType === c ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-50 hover:opacity-100'}`}
                      >
                          <img src={CHARACTER_IMAGES[c].avatar} alt={c} className="w-full h-full object-cover" />
                      </button>
                  ))}
              </div>
              
              <div className="mt-1 text-xs text-white font-mono">
                  {charType}
              </div>
          </div>
      );
  };

  return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center z-50 p-8">
       {/* Back Button */}
       <button 
        onClick={() => { Sound.playUI('CLICK'); onBack(); }}
        className="absolute top-8 left-8 text-slate-400 hover:text-white flex items-center gap-2 uppercase tracking-widest text-sm font-bold transition-colors"
      >
        <span>← 返回主页</span>
      </button>

      <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 mb-2">
          自定义对局
      </h1>
      <p className="text-slate-500 text-sm uppercase tracking-widest mb-8">Custom Match Setup</p>

      {/* Mode Selection */}
      <div className="flex gap-4 mb-10">
          {[
              { id: 'FFA', label: '四人大乱斗', sub: '各自为战' },
              { id: 'TEAM_2V2', label: '2 vs 2', sub: '双人组队' },
              { id: 'TEAM_3V3', label: '3 vs 3', sub: '三人团战' }
          ].map((m) => (
              <button
                  key={m.id}
                  onClick={() => { Sound.playUI('CLICK'); setMode(m.id as any); }}
                  className={`px-6 py-4 rounded-xl border-2 transition-all flex flex-col items-center min-w-[140px]
                      ${mode === m.id 
                          ? 'bg-slate-800 border-blue-500 text-white shadow-lg scale-105' 
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
                      }`}
              >
                  <span className="font-bold text-lg">{m.label}</span>
                  <span className="text-xs opacity-60 mt-1">{m.sub}</span>
              </button>
          ))}
      </div>

      {/* Slots Config */}
      <div className="flex gap-4 flex-wrap justify-center max-w-4xl bg-slate-900/50 p-8 rounded-3xl border border-slate-800 mb-8">
          {mode === 'FFA' && (
              <>
                  {renderSlot(0)}
                  {renderSlot(1)}
                  {renderSlot(2)}
                  {renderSlot(3)}
              </>
          )}
          {mode === 'TEAM_2V2' && (
              <>
                  <div className="flex gap-2 p-2 bg-blue-900/20 rounded-xl border border-blue-900/50">
                      {renderSlot(0)}
                      {renderSlot(1)}
                  </div>
                  <div className="flex items-center text-slate-500 font-black italic text-2xl">VS</div>
                  <div className="flex gap-2 p-2 bg-red-900/20 rounded-xl border border-red-900/50">
                      {renderSlot(2)}
                      {renderSlot(3)}
                  </div>
              </>
          )}
          {mode === 'TEAM_3V3' && (
              <>
                  <div className="flex gap-2 p-2 bg-blue-900/20 rounded-xl border border-blue-900/50">
                      {renderSlot(0)}
                      {renderSlot(1)}
                      {renderSlot(2)}
                  </div>
                  <div className="flex items-center text-slate-500 font-black italic text-2xl">VS</div>
                  <div className="flex gap-2 p-2 bg-red-900/20 rounded-xl border border-red-900/50">
                      {renderSlot(3)}
                      {renderSlot(4)}
                      {renderSlot(5)}
                  </div>
              </>
          )}
      </div>

      {/* Error Message */}
      {!isValid && (
          <div className="text-red-400 font-bold animate-bounce mb-4">
              ⚠ 大乱斗模式下不能选择重复的球体！
          </div>
      )}

      {/* Start Button */}
      <button
          onClick={handleStartGame}
          disabled={!isValid}
          className={`px-12 py-4 rounded-full font-black text-xl tracking-widest uppercase transition-all
              ${isValid 
                  ? 'bg-gradient-to-r from-emerald-500 to-blue-500 text-white hover:scale-105 shadow-lg cursor-pointer' 
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
      >
          开始游戏
      </button>

    </div>
  );
};

export default CustomGameSetup;
}