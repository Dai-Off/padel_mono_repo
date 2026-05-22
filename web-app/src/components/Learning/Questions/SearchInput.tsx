import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';

interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  // Tiempo de espera antes de propagar el cambio al padre. Default 300ms para
  // evitar disparar una query al backend en cada tecla.
  debounceMs?: number;
}

/**
 * Input de búsqueda con debounce. Mantiene un estado local "vivo" que refleja
 * lo que el usuario escribe en cada tecla; al pasar el debounce sin cambios
 * propaga el valor al padre vía onChange.
 */
export function SearchInput({ value, onChange, placeholder = 'Buscar...', debounceMs = 300 }: Props) {
  const [local, setLocal] = useState(value);

  // Sincronizar el local cuando el padre cambia el valor externamente (ej.
  // un reset al cambiar de tab o limpiar filtros).
  useEffect(() => { setLocal(value); }, [value]);

  // Debounce: cuando el local cambia y deja de cambiar durante N ms, propagar.
  useEffect(() => {
    if (local === value) return;
    const t = setTimeout(() => { onChange(local); }, debounceMs);
    return () => clearTimeout(t);
  }, [local, value, onChange, debounceMs]);

  return (
    <div className="relative inline-flex items-center">
      <Search className="absolute left-2.5 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
      <input
        type="text"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        className="pl-8 pr-7 py-1.5 rounded-xl text-[11px] font-medium bg-gray-50 border border-transparent focus:border-gray-200 focus:bg-white outline-none transition-all w-44"
      />
      {local && (
        <button
          type="button"
          onClick={() => { setLocal(''); onChange(''); }}
          className="absolute right-1.5 p-0.5 rounded text-gray-400 hover:text-[#1A1A1A]"
          aria-label="Limpiar búsqueda"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
