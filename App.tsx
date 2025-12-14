import React, { useState } from 'react';
import Home from './components/Home';
import CharacterSelect from './components/CharacterSelect';
import OpponentSelect from './components/OpponentSelect';
import Game from './components/Game';
import IntroScreen from './components/IntroScreen';
import Wiki from './components/Wiki'; // [新增] 引入 Wiki
import { CharacterType } from './types';
import { Sound } from './sound';

type ViewState = 'INTRO' | 'HOME' | 'CHAR_SELECT' | 'OPP_SELECT' | 'GAME';

function App() {
  const [view, setView] = useState<ViewState>('INTRO');
  const [selectedChar, setSelectedChar] = useState<CharacterType>(CharacterType.PYRO);
  const [selectedEnemy, setSelectedEnemy] = useState<CharacterType | 'RANDOM'>('RANDOM');
  
  // [新增] 独立的 Wiki 显示状态 (模态框)
  const [showWiki, setShowWiki] = useState(false);

  const handleEnterGame = () => {
    Sound.init(); 
    Sound.playUI('CLICK');
    setView('HOME');
  };

  const handleQuickStart = () => {
    setView('CHAR_SELECT');
  };

  const handleOpenSettings = () => {
    console.log("Open Settings");
  };

  const handleCharSelected = (char: CharacterType) => {
    setSelectedChar(char);
    setView('OPP_SELECT');
  };

  const startGame = (enemy: CharacterType | 'RANDOM') => {
      setSelectedEnemy(enemy);
      setView('GAME');
  };

  const backToHome = () => {
    setView('HOME');
  };

  const backToCharSelect = () => {
    setView('CHAR_SELECT');
  };

  // [新增] 开启/关闭百科
  const toggleWiki = () => {
      setShowWiki(!showWiki);
  };

  return (
    <div className="w-full h-screen bg-slate-950 text-white font-sans antialiased relative">
      
      {/* 全局 Wiki 模态框 */}
      {showWiki && <Wiki onClose={() => setShowWiki(false)} />}

      {view === 'INTRO' && (
        <IntroScreen onEnter={handleEnterGame} />
      )}

      {view === 'HOME' && (
        <Home 
          onQuickStart={handleQuickStart} 
          onOpenSettings={handleOpenSettings} 
        />
      )}

      {view === 'CHAR_SELECT' && (
        <CharacterSelect 
            onSelectCharacter={handleCharSelected} 
            onOpenWiki={toggleWiki} // 传入打开百科的方法
            onBack={backToHome} 
        />
      )}

      {view === 'OPP_SELECT' && (
        <OpponentSelect 
            onSelectOpponent={startGame}
            onBack={backToCharSelect}
        />
      )}
      
      {/* 移除了 Tutorial 视图，现在统一使用 Wiki */}

      {view === 'GAME' && (
        <Game 
          playerType={selectedChar} 
          enemyType={selectedEnemy}
          onExit={backToHome} 
        />
      )}
    </div>
  );
}

export default App;