import React, { useState, useEffect } from 'react';
import { CharacterType } from '../types';
import { Sound } from '../sound';
import { CHARACTER_IMAGES } from '../images';

// Localization Map
const ROLE_NAMES: Record<CharacterType, string> = {
    [CharacterType.PYRO]: '火焰球',
    [CharacterType.WUKONG]: '悟空球',
    [CharacterType.CAT]: '猫猫球',
    [CharacterType.TANK]: '坦克球',
    [CharacterType.COACH]: '教练球',
    [CharacterType.MAGIC]: '魔法球',
};

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
    const [slots, setSlots] = useState<{ [key: number]: CharacterType }>({
        0: CharacterType.PYRO, // Player
        1: CharacterType.TANK, // Enemy / Ally
        2: CharacterType.WUKONG,
        3: CharacterType.CAT,
        4: CharacterType.PYRO,
        5: CharacterType.TANK,
    });

    const availableChars = [
        CharacterType.PYRO, CharacterType.TANK, CharacterType.WUKONG, CharacterType.CAT, CharacterType.MAGIC
    ];

    // Smart Randomization Logic
    const handleRandomize = () => {
        const slotConfig = getSlotConfig();
        const newSlots: { [key: number]: CharacterType } = {};

        // Shuffle available characters for variety
        const shuffledChars = [...availableChars].sort(() => Math.random() - 0.5);

        slotConfig.forEach((slotIdx, i) => {
            // Try to pick unique until we run out, then random
            if (i < shuffledChars.length) {
                newSlots[slotIdx] = shuffledChars[i];
            } else {
                newSlots[slotIdx] = availableChars[Math.floor(Math.random() * availableChars.length)];
            }
        });

        setSlots(prev => ({ ...prev, ...newSlots }));
    };

    // Auto-randomize on mode change
    useEffect(() => {
        handleRandomize();
    }, [mode]);

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

    // Removed duplicate validation for FFA
    const isValid = true;

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
        const isTeamMode = mode !== 'FFA';

        if (isTeamMode) {
            const isAlly = (mode === 'TEAM_2V2' && index < 2) || (mode === 'TEAM_3V3' && index < 3);
            label = isPlayer ? "玩家 (我方)" : (isAlly ? "电脑 (队友)" : "电脑 (敌方)");
            borderColor = isAlly ? "border-blue-500" : "border-red-500";
        }

        const charType = slots[index];
        // 团队模式下背景色调亮一点，方便看清深色头像
        const bgClass = isTeamMode ? 'bg-slate-700' : 'bg-slate-800';

        return (
            <div key={index} className={`relative ${bgClass} rounded-xl p-3 border-2 ${borderColor} flex flex-col items-center gap-2 ${isTeamMode ? 'w-44 h-full' : ''}`}>
                <span className={`text-xs font-bold uppercase ${index === 0 ? 'text-yellow-400' : 'text-slate-400'}`}>
                    {label}
                </span>

                <div className={isTeamMode
                    ? "grid grid-cols-2 gap-2 w-full overflow-y-auto scrollbar-hide [&::-webkit-scrollbar]:hidden flex-1 content-start px-1"
                    : "grid grid-cols-2 gap-1"
                }>
                    {availableChars.map(c => (
                        <button
                            key={c}
                            onClick={() => handleCharChange(index, c)}
                            className={`w-10 h-10 rounded-lg border-2 overflow-hidden transition-all flex-shrink-0 ${charType === c ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-50 hover:opacity-100'}`}
                        >
                            <img src={CHARACTER_IMAGES[c].avatar} alt={c} className="w-full h-full object-cover" />
                        </button>
                    ))}
                </div>

                <div className="mt-1 text-xs text-white font-mono font-bold whitespace-nowrap overflow-hidden text-ellipsis w-full text-center">
                    {ROLE_NAMES[charType] || charType}
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

            {/* Main Layout Grid */}
            <div className="grid grid-cols-3 gap-8 max-w-6xl w-full mb-8">

                {/* Left Column: Random Button */}
                <div className="col-span-1">
                    <button
                        onClick={() => { Sound.playUI('CLICK'); handleRandomize(); }}
                        className="w-full h-full min-h-[300px] bg-gradient-to-br from-indigo-900 to-slate-900 rounded-3xl border-2 border-indigo-500/50 hover:border-indigo-400 hover:shadow-[0_0_40px_rgba(99,102,241,0.3)] transition-all group flex flex-col items-center justify-center gap-6 relative overflow-hidden"
                    >
                        {/* Background Deco */}
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-indigo-500/10 to-transparent"></div>

                        <span className="text-8xl transition-transform group-hover:scale-110 duration-500 drop-shadow-2xl">🎲</span>

                        <div className="text-center z-10">
                            <h2 className="text-3xl font-black text-white italic tracking-wider">随机分配</h2>
                            <p className="text-indigo-300 text-sm mt-2 font-mono">RANDOMIZE</p>
                        </div>
                    </button>
                </div>

                {/* Right Column: Slots Config */}
                <div className="col-span-2 bg-slate-900/50 p-6 rounded-3xl border border-slate-800 flex flex-col justify-center gap-4 h-[450px]">
                    {mode === 'FFA' && (
                        <div className="grid grid-cols-2 gap-4 h-full content-center">
                            {renderSlot(0)}
                            {renderSlot(1)}
                            {renderSlot(2)}
                            {renderSlot(3)}
                        </div>
                    )}
                    {(mode === 'TEAM_2V2' || mode === 'TEAM_3V3') && (
                        <div className="flex flex-col h-full justify-center gap-2">
                            {/* Blue Team Container */}
                            <div className="flex gap-4 p-2 bg-blue-900/20 rounded-2xl border border-blue-900/50 items-center justify-center h-[160px] w-full">
                                {renderSlot(0)}
                                {renderSlot(1)}
                                {mode === 'TEAM_3V3' && renderSlot(2)}
                            </div>

                            <div className="flex items-center justify-center text-slate-500 font-black italic text-xl h-[30px]">VS</div>

                            {/* Red Team Container */}
                            <div className="flex gap-4 p-2 bg-red-900/20 rounded-2xl border border-red-900/50 items-center justify-center h-[160px] w-full">
                                {mode === 'TEAM_2V2' ? renderSlot(2) : renderSlot(3)}
                                {mode === 'TEAM_2V2' ? renderSlot(3) : renderSlot(4)}
                                {mode === 'TEAM_3V3' && renderSlot(5)}
                            </div>
                        </div>
                    )}
                </div>
            </div>

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