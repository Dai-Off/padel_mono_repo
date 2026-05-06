import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Mail, Trash2, UserMinus, Shield, Plus, ChevronDown, ChevronUp, UserCheck, KeyRound } from 'lucide-react';
import {
    clubPortalService,
    type PortalInviteRow,
    type PortalMemberRow,
    type PortalPermissionKey,
    type PortalRoleRow,
} from '../../services/clubPortal';

type Props = { clubId: string };

export function ClubPortalRolesTab({ clubId }: Props) {
    const [loading, setLoading] = useState(true);
    const [catalog, setCatalog] = useState<{ key: string; label: string }[]>([]);
    const [roles, setRoles] = useState<PortalRoleRow[]>([]);
    const [members, setMembers] = useState<PortalMemberRow[]>([]);
    const [invites, setInvites] = useState<PortalInviteRow[]>([]);
    const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);
    const [draftPerms, setDraftPerms] = useState<Record<string, PortalPermissionKey[]>>({});
    const [draftName, setDraftName] = useState<Record<string, string>>({});
    const [newRoleName, setNewRoleName] = useState('');
    const [newRolePerms, setNewRolePerms] = useState<PortalPermissionKey[]>([]);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRoleId, setInviteRoleId] = useState('');
    const [busy, setBusy] = useState<string | null>(null);
    const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

    const rolePermissionCount = (roleId: string) => (draftPerms[roleId] ?? []).length;

    const reload = useCallback(async () => {
        const [cat, r, m, inv] = await Promise.all([
            clubPortalService.permissionCatalog(),
            clubPortalService.listRoles(clubId),
            clubPortalService.listMembers(clubId),
            clubPortalService.listInvites(clubId),
        ]);
        setCatalog(cat);
        setRoles(r);
        setMembers(m);
        setInvites(inv);
        const perms: Record<string, PortalPermissionKey[]> = {};
        const names: Record<string, string> = {};
        for (const row of r) {
            perms[row.id] = (row.permission_keys ?? []) as PortalPermissionKey[];
            names[row.id] = row.name;
        }
        setDraftPerms(perms);
        setDraftName(names);
    }, [clubId]);

    useEffect(() => {
        if (!roles.length) return;
        setInviteRoleId((prev) => (prev && roles.some((x) => x.id === prev) ? prev : roles[0].id));
    }, [roles]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                await reload();
            } catch (e) {
                if (!cancelled) toast.error(e instanceof Error ? e.message : 'Error al cargar roles');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [clubId, reload]);

    const pendingInvites = invites.filter((i) => !i.accepted_at && !i.revoked_at);

    const togglePerm = (roleId: string, key: PortalPermissionKey) => {
        setDraftPerms((prev) => {
            const cur = prev[roleId] ?? [];
            const has = cur.includes(key);
            const next = has ? cur.filter((k) => k !== key) : [...cur, key];
            return { ...prev, [roleId]: next };
        });
    };

    const toggleNewPerm = (key: PortalPermissionKey) => {
        setNewRolePerms((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
    };

    const saveRole = async (roleId: string) => {
        const keys = draftPerms[roleId] ?? [];
        if (!keys.length) {
            toast.error('El rol debe tener al menos un permiso');
            return;
        }
        setBusy(`save-${roleId}`);
        try {
            const nm = (draftName[roleId] ?? '').trim();
            const updated = await clubPortalService.updateRole(roleId, {
                ...(nm ? { name: nm } : {}),
                permission_keys: keys,
            });
            setRoles((prev) => prev.map((x) => (x.id === roleId ? updated : x)));
            toast.success('Rol actualizado');
            setExpandedRoleId(null);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error al guardar');
        } finally {
            setBusy(null);
        }
    };

    const createRole = async () => {
        const name = newRoleName.trim();
        if (!name) {
            toast.error('Indica un nombre para el rol');
            return;
        }
        if (!newRolePerms.length) {
            toast.error('Selecciona al menos un permiso');
            return;
        }
        setBusy('create');
        try {
            const row = await clubPortalService.createRole({
                club_id: clubId,
                name,
                permission_keys: newRolePerms,
            });
            setRoles((prev) => [...prev, row]);
            setNewRoleName('');
            setNewRolePerms([]);
            toast.success('Rol creado');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error al crear rol');
        } finally {
            setBusy(null);
        }
    };

    const deleteRole = async (role: PortalRoleRow) => {
        if (role.is_system) return;
        if (!window.confirm(`¿Eliminar el rol «${role.name}»? Los miembros con este rol deben reasignarse antes.`)) return;
        setBusy(`del-${role.id}`);
        try {
            await clubPortalService.deleteRole(role.id);
            setRoles((prev) => prev.filter((x) => x.id !== role.id));
            toast.success('Rol eliminado');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo eliminar');
        } finally {
            setBusy(null);
        }
    };

    const sendInvite = async () => {
        const em = inviteEmail.trim().toLowerCase();
        if (!em || !inviteRoleId) {
            toast.error('Email y rol son obligatorios');
            return;
        }
        setBusy('invite');
        try {
            const res = await clubPortalService.createInvite({
                club_id: clubId,
                email: em,
                club_portal_role_id: inviteRoleId,
            });
            setLastInviteUrl(res.invite_url ?? null);
            if (res.email_sent === false && res.invite_url) {
                await navigator.clipboard.writeText(res.invite_url);
                toast.message('Email no enviado; enlace copiado al portapapeles');
            } else {
                toast.success(res.email_sent ? 'Invitación enviada' : 'Invitación creada');
            }
            setInviteEmail('');
            await reload();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error al invitar');
        } finally {
            setBusy(null);
        }
    };

    const revokeInvite = async (id: string) => {
        setBusy(`rev-${id}`);
        try {
            await clubPortalService.revokeInvite(id);
            await reload();
            toast.success('Invitación revocada');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error');
        } finally {
            setBusy(null);
        }
    };

    const removeMember = async (id: string) => {
        if (!window.confirm('¿Quitar a esta persona del panel del club?')) return;
        setBusy(`mem-${id}`);
        try {
            await clubPortalService.removeMember(id);
            setMembers((prev) => prev.filter((m) => m.id !== id));
            toast.success('Miembro eliminado');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error');
        } finally {
            setBusy(null);
        }
    };

    const changeMemberRole = async (memberId: string, nextRoleId: string) => {
        setBusy(`mrole-${memberId}`);
        try {
            const updated = await clubPortalService.updateMemberRole(memberId, nextRoleId);
            setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, ...updated } : m)));
            toast.success('Rol del miembro actualizado');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo actualizar el rol');
        } finally {
            setBusy(null);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-[#E31E24]" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <section className="rounded-2xl border border-gray-100 bg-gradient-to-b from-white to-gray-50/40 p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3 mb-4">
                    <h3 className="text-sm font-bold text-[#1A1A1A] flex items-center gap-2">
                        <Shield className="w-4 h-4 text-[#E31E24]" />
                        Roles del panel
                    </h3>
                    <span className="text-xs text-gray-500">{roles.length} roles</span>
                </div>

                <div className="space-y-2.5">
                    {roles.map((role) => {
                        const open = expandedRoleId === role.id;
                        const keys = draftPerms[role.id] ?? [];
                        return (
                            <div key={role.id} className="rounded-xl border border-gray-200 bg-white">
                                <div className="flex items-center gap-2 p-3">
                                    <button
                                        type="button"
                                        onClick={() => setExpandedRoleId(open ? null : role.id)}
                                        className="flex-1 min-w-0 text-left"
                                    >
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-semibold text-sm text-[#1A1A1A]">{role.name}</span>
                                            {role.is_system && (
                                                <span className="rounded-full bg-gray-100 text-gray-600 px-2 py-0.5 text-[10px] font-bold uppercase">
                                                    Sistema
                                                </span>
                                            )}
                                            <span className="rounded-full bg-[#E31E24]/10 text-[#E31E24] px-2 py-0.5 text-[10px] font-semibold">
                                                {rolePermissionCount(role.id)} permisos
                                            </span>
                                        </div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setExpandedRoleId(open ? null : role.id)}
                                        className="p-1 text-gray-400 hover:text-gray-600"
                                        aria-label={open ? 'Contraer rol' : 'Expandir rol'}
                                    >
                                        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    </button>
                                    {!role.is_system && (
                                        <button
                                            type="button"
                                            onClick={() => void deleteRole(role)}
                                            className="text-gray-400 hover:text-red-600 p-1"
                                            aria-label="Eliminar rol"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                                {open && (
                                    <div className="border-t border-gray-100 p-3 space-y-4">
                                        <div>
                                            <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Nombre del rol</label>
                                            <input
                                                value={draftName[role.id] ?? ''}
                                                onChange={(e) => setDraftName((d) => ({ ...d, [role.id]: e.target.value }))}
                                                className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                                            />
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {catalog.map((p) => (
                                                <label
                                                    key={p.key}
                                                    className={`flex items-start gap-2.5 rounded-lg border px-2.5 py-2 text-xs cursor-pointer transition-colors ${
                                                        keys.includes(p.key as PortalPermissionKey)
                                                            ? 'border-[#E31E24]/40 bg-[#E31E24]/5'
                                                            : 'border-gray-200 bg-white hover:bg-gray-50'
                                                    }`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={keys.includes(p.key as PortalPermissionKey)}
                                                        onChange={() => togglePerm(role.id, p.key as PortalPermissionKey)}
                                                        className="mt-0.5 rounded border-gray-300"
                                                    />
                                                    <span>
                                                        <span className="font-mono text-[10px] text-gray-400">{p.key}</span>
                                                        <br />
                                                        <span className="text-gray-700">{p.label}</span>
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                        <button
                                            type="button"
                                            disabled={busy === `save-${role.id}`}
                                            onClick={() => void saveRole(role.id)}
                                            className="px-4 py-2 rounded-xl bg-[#1A1A1A] text-white text-xs font-bold disabled:opacity-50"
                                        >
                                            {busy === `save-${role.id}` ? 'Guardando...' : 'Guardar cambios'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-white p-4 space-y-3">
                    <p className="text-xs font-bold text-[#1A1A1A] flex items-center gap-2">
                        <Plus className="w-4 h-4" />
                        Nuevo rol personalizado
                    </p>
                    <input
                        value={newRoleName}
                        onChange={(e) => setNewRoleName(e.target.value)}
                        placeholder="Nombre del rol"
                        className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                        {catalog.map((p) => (
                            <label
                                key={p.key}
                                className={`flex items-start gap-2.5 rounded-lg border px-2.5 py-2 text-xs cursor-pointer transition-colors ${
                                    newRolePerms.includes(p.key as PortalPermissionKey)
                                        ? 'border-[#E31E24]/40 bg-[#E31E24]/5'
                                        : 'border-gray-200 bg-white hover:bg-gray-50'
                                }`}
                            >
                                <input
                                    type="checkbox"
                                    checked={newRolePerms.includes(p.key as PortalPermissionKey)}
                                    onChange={() => toggleNewPerm(p.key as PortalPermissionKey)}
                                    className="mt-0.5 rounded border-gray-300"
                                />
                                <span>{p.label}</span>
                            </label>
                        ))}
                    </div>
                    <button
                        type="button"
                        disabled={busy === 'create'}
                        onClick={() => void createRole()}
                        className="px-4 py-2 rounded-xl bg-[#E31E24] text-white text-xs font-bold disabled:opacity-50"
                    >
                        {busy === 'create' ? 'Creando...' : 'Crear rol'}
                    </button>
                </div>
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5">
                <h3 className="text-sm font-bold text-[#1A1A1A] mb-3 flex items-center gap-2">
                    <Mail className="w-4 h-4 text-[#5B8DEE]" />
                    Invitaciones
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px_auto] gap-2">
                    <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="correo@ejemplo.com"
                        className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm"
                    />
                    <select
                        value={inviteRoleId}
                        onChange={(e) => setInviteRoleId(e.target.value)}
                        className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm"
                    >
                        {roles.map((r) => (
                            <option key={r.id} value={r.id}>
                                {r.name}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        disabled={busy === 'invite'}
                        onClick={() => void sendInvite()}
                        className="px-4 py-2 rounded-xl bg-[#1A1A1A] text-white text-xs font-bold whitespace-nowrap disabled:opacity-50"
                    >
                        {busy === 'invite' ? 'Enviando...' : 'Enviar invitación'}
                    </button>
                </div>
                {lastInviteUrl && (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                        <p className="text-xs text-amber-900 mb-2">
                            Enlace directo de invitación (útil si el correo no llega):
                        </p>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <input
                                value={lastInviteUrl}
                                readOnly
                                className="flex-1 px-2.5 py-2 rounded-lg border border-amber-200 bg-white text-[11px] text-gray-700"
                            />
                            <button
                                type="button"
                                onClick={async () => {
                                    await navigator.clipboard.writeText(lastInviteUrl);
                                    toast.success('Enlace copiado');
                                }}
                                className="px-3 py-2 rounded-lg bg-amber-600 text-white text-xs font-semibold"
                            >
                                Copiar enlace
                            </button>
                        </div>
                    </div>
                )}
                {pendingInvites.length > 0 ? (
                    <ul className="mt-4 space-y-2 text-sm">
                        {pendingInvites.map((i) => (
                            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 px-3 py-2">
                                <span className="text-gray-700">
                                    {i.email} <span className="text-gray-400">-&gt;</span> <strong>{i.role_name ?? 'Rol'}</strong>
                                    <span className="text-gray-400 text-xs ml-2">
                                        vence {new Date(i.expires_at).toLocaleDateString()}
                                    </span>
                                </span>
                                <button
                                    type="button"
                                    onClick={() => void revokeInvite(i.id)}
                                    disabled={busy === `rev-${i.id}`}
                                    className="text-xs text-red-600 font-semibold disabled:opacity-50"
                                >
                                    Revocar
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="mt-3 text-xs text-gray-500">No hay invitaciones pendientes.</p>
                )}
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5">
                <h3 className="text-sm font-bold text-[#1A1A1A] mb-3 flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-[#10B981]" />
                    Miembros con acceso
                </h3>
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                    {members.length === 0 ? (
                        <p className="p-4 text-sm text-gray-500">Nadie vinculado aún (además del dueño).</p>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-left text-[10px] uppercase text-gray-500">
                                <tr>
                                    <th className="px-3 py-2">Email</th>
                                    <th className="px-3 py-2">Rol</th>
                                    <th className="px-3 py-2">Permisos</th>
                                    <th className="px-3 py-2 w-10" />
                                </tr>
                            </thead>
                            <tbody>
                                {members.map((m) => (
                                    <tr key={m.id} className="border-t border-gray-100">
                                        <td className="px-3 py-2">{m.email ?? '—'}</td>
                                        <td className="px-3 py-2">
                                            <select
                                                value={m.club_portal_role_id}
                                                onChange={(e) => void changeMemberRole(m.id, e.target.value)}
                                                disabled={busy === `mrole-${m.id}`}
                                                className="px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-xs min-w-[150px]"
                                            >
                                                {roles.map((r) => (
                                                    <option key={r.id} value={r.id}>
                                                        {r.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="px-3 py-2">
                                            <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                                                <KeyRound className="w-3 h-3" />
                                                {roles.find((r) => r.id === m.club_portal_role_id)?.permission_keys?.length ?? 0}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2">
                                            <button
                                                type="button"
                                                onClick={() => void removeMember(m.id)}
                                                disabled={busy === `mem-${m.id}`}
                                                className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-50"
                                                aria-label="Quitar miembro"
                                            >
                                                <UserMinus className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </section>
        </div>
    );
}
