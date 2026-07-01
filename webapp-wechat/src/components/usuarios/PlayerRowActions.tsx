import { Ban, Pencil, Trash2, UserCheck } from 'lucide-react';
import { RowActionsMenu } from '../ui/RowActionsMenu';
import type { RowAction } from '../ui/RowActionsMenu';
import type { Player } from '../../types/api';

function playerActions(player: Player): RowAction[] {
    const base: RowAction[] = [
        { id: 'edit', label: 'Editar', icon: Pencil },
    ];

    if (player.status === 'blocked') {
        base.push({ id: 'unblock', label: 'Reactivar', icon: UserCheck });
    } else if (player.status !== 'deleted') {
        base.push({ id: 'block', label: 'Bloquear', icon: Ban });
    }

    if (player.status !== 'deleted') {
        base.push({ id: 'delete', label: 'Dar de baja', icon: Trash2, tone: 'danger' as const });
    }

    return base;
}

type PlayerRowActionsProps = {
    player: Player;
};

export function PlayerRowActions({ player }: PlayerRowActionsProps) {
    return (
        <RowActionsMenu
            ariaLabel={`Acciones para ${player.first_name} ${player.last_name}`.trim()}
            actions={playerActions(player)}
        />
    );
}
