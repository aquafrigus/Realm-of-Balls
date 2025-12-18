import React, { useState } from 'react';
import { WIKI_DATA } from '../data/wikiData';
import { Sound } from '../sound';
import { CHARACTER_IMAGES } from '../images';
import { CHAR_STATS } from '../constants';

interface WikiProps {
    onClose: () => void;
}

const Wiki: React.FC<WikiProps> = ({ onClose }) => {
    const [selectedId, setSelectedId] = useState<string>(WIKI_DATA[0].id);

    const activeEntry = WIKI_DATA.find(e => e.id === selectedId) || WIKI_DATA[0];

    const handleSelect = (id: string) => {
        Sound.playUI('CLICK');
        setSelectedId(id);
    };

    const renderKeyIcon = (key: string) => {
        const baseClass = "px-2 py-0.5 rounded text-xs font-bold border";
        switch (key) {
            case 'LMB': return <span className={`${baseClass} border-blue-500 bg-blue-500/20 text-blue-300`}>左键</span>;
            case 'RMB': return <span className={`${baseClass} border-amber-500 bg-amber-500/20 text-amber-300`}>右键</span>;
            case 'SPACE': return <span className={`${baseClass} border-purple-500 bg-purple-500/20 text-purple-300`}>SPACE</span>;
            case 'PASSIVE': return <span className={`${baseClass} border-slate-500 bg-slate-500/20 text-slate-300`}>被动</span>;
            default: return null;
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="w-full max-w-6xl h-[85vh] bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl flex overflow-hidden relative">

                {/* Close Button */}
                <button
                    onClick={() => { Sound.playUI('CLICK'); onClose(); }}
                    className="absolute top-4 right-4 w-10 h-10 bg-slate-800 hover:bg-red-500/20 hover:text-red-400 rounded-full flex items-center justify-center transition-colors z-20 text-slate-400 border border-slate-700"
                >
                    ✕
                </button>

                {/* Left Sidebar: Navigation */}
                <div className="w-1/4 bg-slate-950 border-r border-slate-800 flex flex-col">
                    <div className="p-6 border-b border-slate-800">
                        <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 italic">
                            游戏百科
                        </h2>
                        <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">Archive & Data</p>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
                        {/* General Section */}
                        <div>
                            <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-3 px-2">基础知识</h3>
                            <div className="space-y-1">
                                {WIKI_DATA.filter(e => e.type === 'GENERAL').map(entry => (
                                    <button
                                        key={entry.id}
                                        onClick={() => handleSelect(entry.id)}
                                        className={`w-full text-left px-4 py-3 rounded-xl transition-all flex items-center gap-3 ${selectedId === entry.id ? 'bg-slate-800 text-white shadow-lg border border-slate-700' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'}`}
                                    >
                                        <span className="text-lg">📚</span>
                                        <span className="font-bold text-sm">{entry.title}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Ball Section */}
                        <div>
                            <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-3 px-2">球体图鉴</h3>
                            <div className="space-y-1">
                                {WIKI_DATA.filter(e => e.type === 'BALL').map(entry => (
                                    <button
                                        key={entry.id}
                                        onClick={() => handleSelect(entry.id)}
                                        className={`w-full text-left px-4 py-3 rounded-xl transition-all flex items-center gap-3 ${selectedId === entry.id ? 'bg-slate-800 text-white shadow-lg border border-slate-700' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'}`}
                                    >
                                        {/* Mini Avatar */}
                                        <div className="w-8 h-8 rounded-full bg-slate-950 border border-slate-700 overflow-hidden flex-shrink-0">
                                            {entry.ballType && CHARACTER_IMAGES[entry.ballType].avatar && (
                                                <img src={CHARACTER_IMAGES[entry.ballType].avatar} className="w-full h-full object-cover" />
                                            )}
                                        </div>
                                        <span className="font-bold text-sm">{entry.title}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Content Area */}
                <div className="w-3/4 bg-slate-900 overflow-y-auto custom-scrollbar p-10 relative">

                    {/* Header */}
                    <div className="flex items-start gap-8 mb-10 pb-8 border-b border-slate-800">
                        {activeEntry.type === 'BALL' && activeEntry.ballType && (
                            <div className={`w-32 h-32 rounded-full bg-slate-950 border-4 border-slate-800 shadow-2xl overflow-hidden flex-shrink-0 relative group ${CHAR_STATS[activeEntry.ballType] ? `border-${CHAR_STATS[activeEntry.ballType].uiThemeColor}-500` : ''}`}>
                                {CHARACTER_IMAGES[activeEntry.ballType].avatar && (
                                    <img src={CHARACTER_IMAGES[activeEntry.ballType].avatar} className="w-full h-full object-cover" />
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
                            </div>
                        )}
                        <div>
                            <h1 className="text-4xl font-black text-white mb-4 flex items-center gap-4">
                                {activeEntry.title}
                                {activeEntry.type === 'BALL' && <span className="px-3 py-1 bg-blue-600/20 border border-blue-500/50 text-blue-400 text-xs rounded-full font-mono uppercase tracking-wider">Playable</span>}
                            </h1>
                            <p className="text-lg text-slate-400 leading-relaxed max-w-2xl">
                                {activeEntry.description}
                            </p>

                            {/* Stats Bars (Only for Balls) */}
                            {activeEntry.stats && (
                                <div className="flex gap-8 mt-6">
                                    <div className="space-y-1">
                                        <div className="text-xs text-slate-500 uppercase font-bold">HP</div>
                                        <div className="w-32 h-2 bg-slate-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-green-500" style={{ width: `${(activeEntry.stats.hp / 3000) * 100}%` }}></div>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-xs text-slate-500 uppercase font-bold">SPD</div>
                                        <div className="w-32 h-2 bg-slate-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-blue-500" style={{ width: `${(activeEntry.stats.speed / 40) * 100}%` }}></div>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-xs text-slate-500 uppercase font-bold">MASS</div>
                                        <div className="w-32 h-2 bg-slate-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-orange-500" style={{ width: `${(activeEntry.stats.mass / 5000) * 100}%` }}></div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Skills / Mechanics List */}
                    <div className="space-y-6">
                        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
                            <span className={`w-1 h-6 rounded-full ${activeEntry.type === 'BALL' && activeEntry.ballType ? `bg-${CHAR_STATS[activeEntry.ballType].uiThemeColor}-500` : 'bg-emerald-500'}`}></span>
                            {activeEntry.type === 'BALL' ? '技能与机制' : '详细规则'}
                        </h2>

                        <div className="grid grid-cols-1 gap-4">
                            {activeEntry.skills?.map((skill, idx) => (
                                <div key={idx} className="bg-slate-800/50 border border-slate-700/50 p-5 rounded-2xl hover:border-slate-600 transition-colors flex gap-5">
                                    <div className="flex-shrink-0 pt-1">
                                        {renderKeyIcon(skill.key)}
                                    </div>
                                    <div>
                                        <div className="flex justify-between items-center mb-2">
                                            <h3 className="text-lg font-bold text-slate-200">{skill.name}</h3>
                                            {skill.cooldown && <span className="text-xs font-mono text-slate-500 bg-slate-900 px-2 py-1 rounded">CD: {skill.cooldown}s</span>}
                                        </div>
                                        <p className="text-sm text-slate-400 leading-relaxed whitespace-pre-wrap">
                                            {skill.description}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default Wiki;