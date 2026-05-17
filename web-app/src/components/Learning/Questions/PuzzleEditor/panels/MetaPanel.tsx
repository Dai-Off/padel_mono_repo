import type { PuzzleContent } from '../../../../../types/learningContent';

interface Props {
  content: PuzzleContent;
  onChange: (next: PuzzleContent) => void;
}

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
    </div>
  );
}
