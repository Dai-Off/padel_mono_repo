import { Pencil, Power, Trash2 } from 'lucide-react';
import { RowActionsMenu } from '../ui/RowActionsMenu';
import type { Club } from '../../types/api';

const CLUB_ACTIONS = [
    { id: 'edit', label: 'Editar', icon: Pencil },
    { id: 'deactivate', label: 'Desactivar', icon: Power },
    { id: 'delete', label: 'Eliminar', icon: Trash2, tone: 'danger' as const },
];

type ClubRowActionsProps = {
    club: Club;
};

export function ClubRowActions({ club }: ClubRowActionsProps) {
    return (
        <RowActionsMenu ariaLabel={`Acciones para ${club.name}`} actions={CLUB_ACTIONS} />
    );
}
