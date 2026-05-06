import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { clubPortalService } from '../../services/clubPortal';
import { authService } from '../../services/auth';

export function ClubPortalInviteAccept() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get('token')?.trim() ?? '';

    const [loading, setLoading] = useState(true);
    const [meta, setMeta] = useState<{
        email: string;
        club_name: string;
        role_name: string;
        expires_at: string;
    } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [registering, setRegistering] = useState(false);
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [password2, setPassword2] = useState('');

    useEffect(() => {
        if (!token) {
            setError('Enlace inválido (falta token).');
            setLoading(false);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const res = await clubPortalService.validateInviteToken(token);
                if (cancelled) return;
                if (!res.ok) {
                    setError('Invitación no válida');
                    return;
                }
                setMeta({
                    email: res.email,
                    club_name: res.club_name,
                    role_name: res.role_name,
                    expires_at: res.expires_at,
                });
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudo validar la invitación');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [token]);

    const registerAndAccept = useCallback(async () => {
        if (!token || !meta) return;
        const p1 = password.trim();
        const p2 = password2.trim();
        if (p1.length < 6) {
            toast.error('La contraseña debe tener al menos 6 caracteres');
            return;
        }
        if (p1 !== p2) {
            toast.error('Las contraseñas no coinciden');
            return;
        }
        setRegistering(true);
        try {
            const res = await clubPortalService.registerFromInvite({
                token,
                password: p1,
                name: name.trim() || undefined,
            });
            if (!res.ok) {
                toast.error(res.error ?? 'No se pudo crear la cuenta');
                return;
            }
            if (res.session) {
                authService.saveSession(res.session);
            }
            authService.clearMeCache();
            toast.success('Cuenta creada y acceso habilitado al club');
            navigate('/grilla?menu=resumen');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo completar el registro');
        } finally {
            setRegistering(false);
        }
    }, [meta, name, navigate, password, password2, token]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white">
                <Loader2 className="w-8 h-8 animate-spin text-[#E31E24]" />
            </div>
        );
    }

    if (error || !meta) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0a] text-white px-6 text-center">
                <p className="text-sm text-gray-300 mb-6">{error ?? 'Invitación no disponible'}</p>
                <button
                    type="button"
                    onClick={() => navigate('/')}
                    className="text-[#E31E24] font-semibold underline"
                >
                    Volver
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0a] text-white px-6">
            <div className="max-w-md w-full rounded-2xl border border-white/10 bg-white/5 p-8 text-center space-y-4">
                <h1 className="text-lg font-bold">Invitación al panel</h1>
                <p className="text-sm text-gray-300">
                    <span className="text-white font-semibold">{meta.club_name}</span> te invita como{' '}
                    <span className="text-[#F18F34] font-semibold">{meta.role_name}</span>.
                </p>
                <p className="text-xs text-gray-400">Email: {meta.email}</p>
                <p className="text-xs text-gray-500">Caduca: {new Date(meta.expires_at).toLocaleString()}</p>
                <div className="space-y-2 text-left bg-black/20 border border-white/10 rounded-xl p-3">
                    <p className="text-xs text-gray-300 font-semibold">Crea tu cuenta con este email invitado</p>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Nombre (opcional)"
                        className="w-full px-3 py-2 rounded-lg bg-[#111] border border-white/10 text-sm"
                    />
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Contraseña"
                        className="w-full px-3 py-2 rounded-lg bg-[#111] border border-white/10 text-sm"
                    />
                    <input
                        type="password"
                        value={password2}
                        onChange={(e) => setPassword2(e.target.value)}
                        placeholder="Repetir contraseña"
                        className="w-full px-3 py-2 rounded-lg bg-[#111] border border-white/10 text-sm"
                    />
                    <button
                        type="button"
                        onClick={() => void registerAndAccept()}
                        disabled={registering}
                        className="w-full py-2 rounded-lg bg-[#E31E24] text-white font-bold text-sm disabled:opacity-60"
                    >
                        {registering ? 'Creando cuenta…' : 'Crear cuenta y aceptar invitación'}
                    </button>
                </div>
            </div>
        </div>
    );
}
