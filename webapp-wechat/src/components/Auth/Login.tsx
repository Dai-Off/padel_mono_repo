import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { authService } from '../../services/auth';
import { HttpError } from '../../services/api';
import { SESSION_EXPIRED_KEY } from '../../lib/session';
import { AuthBrand } from '../ui/AuthBrand';
import { AuthInput } from '../ui/AuthInput';
import { AuthButton } from '../ui/AuthButton';
import { ErrorBanner } from '../ui/ErrorBanner';
import { DEV_LOGIN_CREDENTIALS } from '../../config/devCredentials';

export function Login() {
    const navigate = useNavigate();
    const [email, setEmail] = useState<string>(DEV_LOGIN_CREDENTIALS.email);
    const [password, setPassword] = useState<string>(DEV_LOGIN_CREDENTIALS.password);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (sessionStorage.getItem(SESSION_EXPIRED_KEY)) {
            sessionStorage.removeItem(SESSION_EXPIRED_KEY);
            toast.error('Tu sesión expiró. Iniciá sesión de nuevo.');
        }
    }, []);

    const clearError = () => setError(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);
        try {
            const res = await authService.login(email.trim(), password);
            if (!res.ok || !res.session?.access_token) {
                setError(res.error || 'Correo o contraseña incorrectos');
                return;
            }
            authService.saveSession(res.session);
            const me = await authService.getMe();
            if (!me.ok || !me.roles?.mobile_admin_id) {
                authService.logout();
                setError('No tenés permisos para acceder a este panel.');
                return;
            }
            navigate('/', { replace: true });
        } catch (err) {
            if (err instanceof HttpError && err.status === 401) {
                setError('Correo o contraseña incorrectos');
            } else {
                setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const year = new Date().getFullYear();

    return (
        <div className="min-h-screen-safe grid bg-auth-bg lg:min-h-dvh lg:grid-cols-2">
            <aside className="relative hidden items-center justify-center border-r border-auth-border bg-[rgba(255,255,255,0.02)] px-8 py-12 lg:flex xl:px-16">
                <AuthBrand variant="hero" />
            </aside>

            <div className="flex min-h-screen-safe flex-col pt-safe lg:min-h-dvh">
                <div className="flex flex-1 flex-col justify-center px-[max(1rem,env(safe-area-inset-left))] py-6 pr-[max(1rem,env(safe-area-inset-right))] sm:px-8 sm:py-10 md:px-12 lg:px-10 xl:px-16 2xl:px-20">
                    <div className="mx-auto w-full max-w-lg lg:max-w-md xl:max-w-lg">
                        <div className="lg:hidden">
                            <AuthBrand />
                        </div>

                        <div className="lg:mb-2">
                            <h2 className="hidden text-xl font-bold text-auth-text lg:block xl:text-2xl">
                                Iniciar sesión
                            </h2>
                            <p className="mt-1 hidden text-sm text-auth-muted lg:block">
                                Ingresá con tu cuenta de administración
                            </p>
                        </div>

                        <form onSubmit={handleSubmit} className="mt-4 w-full lg:mt-8">
                            {error ? <ErrorBanner message={error} /> : null}

                            <AuthInput
                                label="Correo electrónico"
                                icon={Mail}
                                type="email"
                                required
                                autoComplete="email"
                                placeholder="nombre@ejemplo.com"
                                value={email}
                                onChange={(e) => { setEmail(e.target.value); clearError(); }}
                                disabled={isLoading}
                                error={!!error}
                            />

                            <AuthInput
                                label="Contraseña"
                                icon={Lock}
                                type="password"
                                required
                                autoComplete="current-password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => { setPassword(e.target.value); clearError(); }}
                                disabled={isLoading}
                                error={!!error}
                            />

                            <AuthButton type="submit" loading={isLoading}>
                                {isLoading ? 'Ingresando…' : 'Iniciar sesión'}
                            </AuthButton>
                        </form>

                        <p className="mt-2 text-center text-sm text-auth-muted">
                            ¿Tenés un club?{' '}
                            <Link to="/registrar-club" className="font-semibold text-auth-accent hover:opacity-90">
                                Registralo aquí
                            </Link>
                        </p>
                    </div>
                </div>

                <footer className="pb-safe text-center">
                    <p className="px-4 py-4 text-xs text-auth-secondary sm:text-sm">
                        © {year} WeMatch. Todos los derechos reservados.
                    </p>
                </footer>
            </div>
        </div>
    );
}
