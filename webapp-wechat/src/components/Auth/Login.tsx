import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Mail, Lock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { authService } from '../../services/auth';
import { HttpError } from '../../services/api';

export function Login() {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (sessionStorage.getItem('padel_session_expired')) {
            sessionStorage.removeItem('padel_session_expired');
            toast.error('Tu sesión expiró. Iniciá sesión de nuevo.');
        }
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);
        try {
            const res = await authService.login(email.trim(), password);
            if (!res.ok || !res.session?.access_token) {
                setError(res.error || 'Credenciales inválidas');
                return;
            }
            authService.saveSession(res.session);
            const me = await authService.getMe();
            if (!me.ok || !me.roles?.admin_id) {
                authService.logout();
                setError('Solo usuarios admin pueden acceder a este panel.');
                return;
            }
            navigate('/', { replace: true });
        } catch (err) {
            if (err instanceof HttpError && err.status === 401) {
                setError('Email o contraseña incorrectos');
            } else {
                setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
            <div className="w-full max-w-md rounded-xl border border-border-subtle bg-card p-8 shadow-sm">
                <div className="mb-8 text-center">
                    <h1 className="text-2xl font-semibold text-foreground">
                        {import.meta.env.VITE_APP_NAME || 'WeMatch Admin Mobile'}
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Panel de administración para la app móvil
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-error">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div>
                        <label htmlFor="email" className="mb-1 block text-sm font-medium">
                            Email
                        </label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                id="email"
                                type="email"
                                required
                                autoComplete="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full rounded-lg border border-border-subtle py-2.5 pl-10 pr-3 text-sm outline-none focus:border-portal-header focus:ring-1 focus:ring-portal-header"
                                placeholder="admin@wematch.com"
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="password" className="mb-1 block text-sm font-medium">
                            Contraseña
                        </label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                id="password"
                                type="password"
                                required
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full rounded-lg border border-border-subtle py-2.5 pl-10 pr-3 text-sm outline-none focus:border-portal-header focus:ring-1 focus:ring-portal-header"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-portal-header px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                    >
                        <LogIn className="h-4 w-4" />
                        {isLoading ? 'Ingresando…' : 'Ingresar'}
                    </button>
                </form>
            </div>
        </div>
    );
}
