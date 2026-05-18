import React from 'react';

interface LegendItem {
    color: string;
    borderColor?: string;
    textColor?: string;
    label: string;
    dashed?: boolean;
}

const STANDARD_ITEMS: LegendItem[] = [
    { color: '#005bc5', borderColor: '#004fa8', textColor: '#fff', label: 'Pista privada Reservado', dashed: true },
    { color: '#005bc5', borderColor: '#004fa8', textColor: '#fff', label: 'Pista privada Pagado' },
    { color: '#ea580c', borderColor: '#c2410c', textColor: '#fff', label: 'Americanas Reservado', dashed: true },
    { color: '#ea580c', borderColor: '#c2410c', textColor: '#fff', label: 'Americanas Pagado' },
    { color: '#7c3aed', borderColor: '#6d28d9', textColor: '#fff', label: 'Partido abierto Reservado', dashed: true },
    { color: '#7c3aed', borderColor: '#6d28d9', textColor: '#fff', label: 'Partido abierto Pagado' },
    { color: '#b45309', borderColor: '#92400e', textColor: '#fff', label: 'Torneo Reservado', dashed: true },
    { color: '#b45309', borderColor: '#92400e', textColor: '#fff', label: 'Torneo Pagado' },
    { color: '#166534', borderColor: '#14532d', textColor: '#fff', label: 'Turno fijo Reservado', dashed: true },
    { color: '#166534', borderColor: '#14532d', textColor: '#fff', label: 'Turno fijo Pagado' },
    { color: '#be185d', borderColor: '#9d174d', textColor: '#fff', label: 'Tarifa plana' },
    { color: '#fdf2f8', borderColor: '#f9a8d4', textColor: '#9d174d', label: 'Escuela' },
    { color: '#4b5563', borderColor: '#374151', textColor: '#fff', label: 'Bloqueado' },
];

const SLOT_ITEMS: LegendItem[] = [
    { color: '#ade88f', borderColor: '#93db72', textColor: '#555', label: 'Disponible' },
    { color: '#e0e0e0', borderColor: '#c0c0c0', textColor: '#919191', label: 'Tiempo pasado' },
];

interface Props {
    typeConfigs?: Record<string, { color: string | null; display_name: string; is_system: boolean }>;
    typeColorOverrides?: Record<string, string>;
}

const TYPE_LABELS: Record<string, string> = {
    standard: 'Pista privada',
    open_match: 'Partido abierto',
    pozo: 'Americanas',
    fixed_recurring: 'Turno fijo',
    school_course: 'Escuela',
    school_group: 'Escuela grupo',
    school_individual: 'Clase particular',
    flat_rate: 'Tarifa plana',
    tournament: 'Torneo',
    blocked: 'Bloqueado',
};

export const GrillaLegend: React.FC<Props> = ({ typeConfigs, typeColorOverrides }) => {
    const dynamicItems: LegendItem[] = [];

    if (typeConfigs) {
        const configsArray = Object.entries(typeConfigs).sort((a, b) => {
            if (a[1].is_system !== b[1].is_system) return a[1].is_system ? -1 : 1;
            return a[0].localeCompare(b[0]);
        });

        for (const [type, config] of configsArray) {
            const color = config.color ?? typeColorOverrides?.[type] ?? '#6b7280';
            const label = config.is_system ? TYPE_LABELS[type] ?? config.display_name : config.display_name;

            const doubleLegendTypes = ['standard', 'open_match', 'pozo', 'fixed_recurring', 'tournament'];
            if (doubleLegendTypes.includes(type)) {
                dynamicItems.push({
                    color,
                    borderColor: color,
                    textColor: '#fff',
                    label: `${label} Reservado`,
                    dashed: true,
                });
                dynamicItems.push({
                    color,
                    borderColor: color,
                    textColor: '#fff',
                    label: `${label} Pagado`,
                });
            } else {
                dynamicItems.push({
                    color,
                    borderColor: color,
                    textColor: '#fff',
                    label,
                });
            }
        }
    }

    const allItems = typeConfigs && dynamicItems.length > 0 ? [...dynamicItems, ...SLOT_ITEMS] : [...STANDARD_ITEMS, ...SLOT_ITEMS];

    return (
        <div className="shrink-0 border-t border-gray-200 bg-[#f8f8f8] px-3 py-1.5 overflow-x-auto">
            <div className="flex items-center gap-x-3 gap-y-1 flex-wrap min-w-0">
                {allItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-1 shrink-0">
                        <span
                            className="inline-block w-4 h-4 rounded-sm border shrink-0"
                            style={{
                                backgroundColor: item.color,
                                borderColor: item.borderColor ?? item.color,
                                borderStyle: item.dashed ? 'dashed' : 'solid',
                                borderWidth: '2px',
                             }}
                        />
                        <span className="text-[10px] text-gray-600 whitespace-nowrap leading-none">
                            {item.label}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

