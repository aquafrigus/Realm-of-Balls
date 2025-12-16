import React, { useState } from 'react';
import Home from './components/Home';
import CharacterSelect from './components/CharacterSelect';
import OpponentSelect from './components/OpponentSelect';
import Game from './components/Game';
import IntroScreen from './components/IntroScreen';
import Wiki from './components/Wiki';
import CustomGameSetup, { GameConfig } from './components/CustomGameSetup';
import { CharacterType } from './types';
import { Sound } from './sound';

type ViewState = 'INTRO' | 'HOME' | 'CHAR_SELECT' | 'OPP_SELECT' | 'CUSTOM_SETUP' | 'GAME';

function App() {
  const [view, setView] = useState<ViewState>('INTRO');
  const [selectedChar, setSelectedChar] = useState<CharacterType>(CharacterType.PYRO);
  const [selectedEnemy, setSelectedEnemy] = useState<CharacterType | 'RANDOM'>('RANDOM');

  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);
  
  const [showWiki, setShowWiki] = useState(false);

  const handleCustomGame = () => {
    Sound.playUI('CLICK');
    setView('CUSTOM_SETUP');
  };

  const handleStartCustomGame = (config: GameConfig) => {
    setGameConfig(config);
    if (config.players && config.players[0]) {
        setSelectedChar(config.players[0].type);
    }
    setView('GAME');
  };

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
      setGameConfig(null);
      setSelectedEnemy(enemy);
      setView('GAME');
  };

  const backToHome = () => {
    setView('HOME');
  };

  const backToCharSelect = () => {
    setView('CHAR_SELECT');
  };

  const toggleWiki = () => {
      setShowWiki(!showWiki);
  };

  return (
    <div className="w-full h-screen bg-slate-950 text-white font-sans antialiased relative">
      
      {showWiki && <Wiki onClose={() => setShowWiki(false)} />}

      {view === 'INTRO' && (
        <IntroScreen onEnter={handleEnterGame} />
      )}

      {view === 'HOME' && (
        <Home 
          onQuickStart={handleQuickStart} 
          onOpenSettings={handleOpenSettings} 
          onCustomGame={handleCustomGame}
        />
      )}

      {view === 'CHAR_SELECT' && (
        <CharacterSelect 
            onSelectCharacter={handleCharSelected} 
            onOpenWiki={toggleWiki}
            onBack={backToHome} 
        />
      )}

      {view === 'OPP_SELECT' && (
        <OpponentSelect 
            onSelectOpponent={startGame}
            onBack={backToCharSelect}
        />
      )}
      
      {view === 'CUSTOM_SETUP' && (
          <CustomGameSetup 
              onStart={handleStartCustomGame}
              onBack={backToHome}
          />
      )}

      {view === 'GAME' && (
        <Game 
          playerType={selectedChar} 
          enemyType={selectedEnemy}
          customConfig={gameConfig}
          onExit={backToHome} 
        />
      )}
    </div>
  );
}

export default App;