
import React, { useState } from 'react';
import MainMenu from './components/MainMenu';
import Game from './components/Game';
import Tutorial from './components/Tutorial';
import IntroScreen from './components/IntroScreen';
import { CharacterType } from './types';
import { Sound } from './sound';

type ViewState = 'INTRO' | 'MENU' | 'TUTORIAL' | 'GAME';

function App() {
  const [view, setView] = useState<ViewState>('INTRO');
  const [selectedChar, setSelectedChar] = useState<CharacterType>(CharacterType.PYRO);

  const handleEnterGame = () => {
    Sound.init(); // Initialize Audio Context on first interaction
    Sound.playUI('CLICK');
    setView('MENU');
  };

  const startGame = (char: CharacterType) => {
    setSelectedChar(char);
    setView('GAME');
  };

  const showTutorial = (char: CharacterType) => {
    setSelectedChar(char);
    setView('TUTORIAL');
  };

  const exitToMenu = () => {
    setView('MENU');
  };

  return (
    <div className="w-full h-screen bg-slate-950 text-white font-sans antialiased">
      {view === 'INTRO' && (
        <IntroScreen onEnter={handleEnterGame} />
      )}
      {view === 'MENU' && (
        <MainMenu onSelectCharacter={startGame} onShowTutorial={showTutorial} />
      )}
      {view === 'TUTORIAL' && (
        <Tutorial charType={selectedChar} onStart={startGame} onBack={exitToMenu} />
      )}
      {view === 'GAME' && (
        <Game playerType={selectedChar} onExit={exitToMenu} />
      )}
    </div>
  );
}

export default App;
