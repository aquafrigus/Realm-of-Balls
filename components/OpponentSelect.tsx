import React from 'react';
import { CharacterType } from '../types';
import { Sound } from '../sound';
import { CHARACTER_IMAGES } from '../images';
import { CHAR_STATS } from '../constants';

interface OpponentSelectProps {
    onSelectOpponent: (type: CharacterType | 'RANDOM') => void;
    onBack: () => void;
}

const OpponentSelect: React.FC<OpponentSelectProps> = ({ onSelectOpponent, onBack }) => {

    const handleSelect = (type: CharacterType | 'RANDOM') => {
        Sound.playUI('START');
        onSelectOpponent(type);
    };

    // 渲染对手卡片辅助函数
    const renderCard = (label: string, type: CharacterType | 'RANDOM' | 'TRAINING', color: string, icon: React.ReactNode) => {
        const isTraining = type === 'TRAINING';
        const isRandom = type === 'RANDOM';

        // 如果是具体角色，获取头像
        let avatar = icon;
        if (type !== 'RANDOM' && type !== 'TRAINING') {
            const imgSrc = CHARACTER_IMAGES[type as CharacterType].avatar;
            if (imgSrc) {
                avatar = <img src={imgSrc} alt={label} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />;
            }
        }

        return (
            <button
                disabled={isTraining}
                onClick={() => !isTraining && handleSelect(type as CharacterType | 'RANDOM')}
                className={`group relative h-64 rounded-2xl border-2 transition-all duration-300 overflow-hidden flex flex-col items-center justify-end pb-6
                ${isTraining
                        ? 'border-slate-800 bg-slate-900/50 cursor-not-allowed opacity-50 grayscale'
                        : `border-slate-700 bg-slate-800 hover:border-${color}-500 hover:scale-105 hover:shadow-[0_0_20px_rgba(var(--color-${color}),0.3)]`
                    }
            `}
                //这行是为了给hover动态颜色做简单的内联处理，实际项目中推荐Tailwind safelist
                style={!isTraining && !isRandom ? { borderColor: undefined } : {}}
            >
                {/* 背景图/头像容器 */}
                <div className="absolute inset-0 bg-slate-900 flex items-center justify-center text-6xl">
                    {avatar}
                </div>

                {/* 底部渐变遮罩 */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-90"></div>

                {/* 文字标签 */}
                <div className="relative z-10 text-center">
                    <h3 className={`text-xl font-bold mb-1 ${isTraining ? 'text-slate-600' : 'text-white group-hover:text-' + color + '-400'}`}>
                        {label}
                    </h3>
                    {isRandom && <span className="text-xs text-slate-400">随机挑战</span>}
                    {isTraining && <span className="text-xs text-slate-600 border border-slate-700 px-2 py-0.5 rounded">开发中</span>}
                </div>

                {/* 选中高亮框 (Hover effect handled by CSS classes mostly) */}
                {!isTraining && (
                    <div className={`absolute inset-0 border-2 border-transparent group-hover:border-${color}-500/50 rounded-2xl transition-colors`}></div>
                )}
            </button>
        );
    };

    return (
        <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center p-8 z-50">

            <button
                onClick={() => { Sound.playUI('CLICK'); onBack(); }}
                className="absolute top-8 left-8 text-slate-400 hover:text-white flex items-center gap-2 uppercase tracking-widest text-sm font-bold transition-colors"
            >
                <span>← 重选角色</span>
            </button>

            <div className="text-center mb-12">
                <h1 className="text-4xl font-black text-white tracking-widest mb-2">
                    选择对手
                </h1>
                <p className="text-slate-500 font-mono text-sm uppercase">
                    CHOOSE YOUR OPPONENT
                </p>
            </div>

            <div className="grid grid-cols-3 gap-6 max-w-5xl w-full">
                {/* 1. 随机 (最醒目) */}
                <div className="col-span-1 row-span-2">
                    <button
                        onClick={() => handleSelect('RANDOM')}
                        className="w-full h-full min-h-[300px] bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl border-2 border-slate-600 hover:border-white hover:shadow-[0_0_30px_rgba(255,255,255,0.2)] transition-all group flex flex-col items-center justify-center gap-6 relative overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                        <span className="text-8xl transition-transform group-hover:scale-125 duration-500">🎲</span>
                        <div className="text-center z-10">
                            <h2 className="text-3xl font-black text-white italic">随机对手</h2>
                            <p className="text-slate-400 text-sm mt-2">RANDOM</p>
                        </div>
                    </button>
                </div>

                {/* 2. 具体角色列表 */}
                <div className="col-span-2 grid grid-cols-4 gap-4">
                    {renderCard("火焰球", CharacterType.PYRO, CHAR_STATS[CharacterType.PYRO].uiThemeColor, "🔥")}
                    {renderCard("坦克球", CharacterType.TANK, CHAR_STATS[CharacterType.TANK].uiThemeColor, "🛡️")}
                    {renderCard("悟空球", CharacterType.WUKONG, CHAR_STATS[CharacterType.WUKONG].uiThemeColor, "🐵")}
                    {renderCard("猫猫球", CharacterType.CAT, CHAR_STATS[CharacterType.CAT].uiThemeColor, "🐱")}
                    {renderCard("魔法球", CharacterType.MAGIC, CHAR_STATS[CharacterType.MAGIC].uiThemeColor, "🔮")}
                </div>

                {/* 3. 训练靶场 */}
                <div className="col-span-2">
                    <button
                        onClick={() => handleSelect(CharacterType.COACH)}
                        className="group w-full h-24 bg-slate-800 border-2 border-dashed border-slate-600 hover:border-white hover:bg-slate-700 rounded-xl flex items-center justify-center gap-4 text-slate-400 hover:text-white transition-all shadow-lg"
                    >
                        <span className="text-4xl group-hover:scale-110 transition-transform">🎯</span>
                        <div className="text-left">
                            <span className="block font-black tracking-widest text-lg">训练靶场</span>
                            <span className="text-xs font-mono opacity-60">TESTING RANGE</span>
                        </div>
                        <span className="ml-auto mr-8 text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded border border-emerald-500/50">
                            OPEN
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default OpponentSelect;