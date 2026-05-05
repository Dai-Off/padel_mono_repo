import { useState } from 'react';
import { Magnet } from 'lucide-react';
import { PuzzleStage, type SelectedItem } from './PuzzleStage';
import { MetaPanel } from './panels/MetaPanel';
import { OptionsPanel } from './panels/OptionsPanel';
import type {
  PuzzleBall,
  PuzzleContent,
  PuzzlePlayer,
} from '../../../../types/learningContent';

interface Props {
  content: PuzzleContent;
  onChange: (next: PuzzleContent) => void;
}

// Editor visual de puzzles. Pista a la izquierda, paneles laterales a la derecha.
export function PuzzleEditor({ content, onChange }: Props) {
  const [selected, setSelected] = useState<SelectedItem>(null);
  const [snapToGrid, setSnapToGrid] = useState(true);

  const updatePlayer = (next: PuzzlePlayer) => {
    onChange({
      ...content,
      initial_frame: {
        ...content.initial_frame,
        players: content.initial_frame.players.map((p) => (p.id === next.id ? next : p)),
      },
    });
  };

  const updateBall = (next: PuzzleBall) => {
    onChange({
      ...content,
      initial_frame: { ...content.initial_frame, ball: next },
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4 h-[70vh] min-h-[600px]">
      {/* Canvas */}
      <div className="relative h-full">
        {/* Toolbar superior del canvas */}
        <div className="absolute top-2 left-2 right-2 z-10 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSnapToGrid((v) => !v)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all ${
              snapToGrid ? 'bg-[#1A1A1A] text-white' : 'bg-white text-[#1A1A1A] border border-gray-200'
            }`}
            title="Snap a grid de 0.25 m"
          >
            <Magnet className="w-3 h-3" />
            Snap {snapToGrid ? 'ON' : 'OFF'}
          </button>
          <div className="text-[10px] text-gray-500 ml-auto bg-white/80 backdrop-blur px-2 py-1 rounded-lg">
            Arrastra jugadores y pelota para colocarlos
          </div>
        </div>

        <PuzzleStage
          frame={content.initial_frame}
          selected={selected}
          onSelect={setSelected}
          onPlayerChange={updatePlayer}
          onBallChange={updateBall}
          snapToGrid={snapToGrid}
        />
      </div>

      {/* Paneles laterales */}
      <div className="space-y-4 overflow-y-auto pr-1">
        <MetaPanel content={content} onChange={onChange} />
        <div className="border-t border-gray-100" />
        <OptionsPanel content={content} onChange={onChange} />
      </div>
    </div>
  );
}
