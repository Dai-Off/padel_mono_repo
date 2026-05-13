import type { PuzzleContent, PuzzleCourtPosition } from '../../../../../types/learningContent';

interface Props {
  content: PuzzleContent;
  onChange: (next: PuzzleContent) => void;
}

const COURT_POSITIONS: { value: PuzzleCourtPosition; label: string }[] = [
  { value: 'left', label: 'Izquierda' },
  { value: 'right', label: 'Derecha' },
  { value: 'both', label: 'Ambos' },
];

export function MetaPanel({ content, onChange }: Props) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">Enunciado</label>
        <textarea
          value={content.statement}
          onChange={(e) => onChange({ ...content, statement: e.target.value })}
          rows={3}
          maxLength={280}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm resize-none"
          placeholder="Describe la situación táctica del puzzle"
        />
        <p className="text-[10px] text-gray-400 mt-0.5">{content.statement.length}/280</p>
      </div>

      <div>
        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">Lado de pista</label>
        <div className="flex gap-1.5">
          {COURT_POSITIONS.map((cp) => (
            <button
              key={cp.value}
              type="button"
              onClick={() => onChange({ ...content, court_position: cp.value })}
              className={`flex-1 px-2 py-1.5 rounded-xl text-[10px] font-bold transition-all ${
                (content.court_position ?? 'both') === cp.value
                  ? 'bg-[#1A1A1A] text-white'
                  : 'bg-gray-50 text-[#1A1A1A] hover:bg-gray-100'
              }`}
            >
              {cp.label}
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}
