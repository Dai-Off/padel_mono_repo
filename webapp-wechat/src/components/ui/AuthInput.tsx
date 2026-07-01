import { useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff, type LucideIcon } from 'lucide-react';

type AuthInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon: LucideIcon;
  error?: boolean;
};

export function AuthInput({
  label,
  icon: Icon,
  error,
  type,
  className,
  ...props
}: AuthInputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';

  return (
    <div className="mb-4">
      <label className="mb-2.5 block text-sm font-medium text-auth-muted">
        {label}
      </label>
      <div
        className={[
          'auth-input-focus flex min-h-11 items-center rounded-2xl border bg-auth-input px-4 py-3.5 transition-colors',
          error ? 'border-auth-error' : 'border-auth-border-input',
          className,
        ].filter(Boolean).join(' ')}
      >
        <Icon className="mr-3 h-5 w-5 shrink-0 text-auth-muted" aria-hidden />
        <input
          type={isPassword && showPassword ? 'text' : type}
          className="min-w-0 flex-1 bg-transparent text-base text-auth-text outline-none"
          {...props}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="ml-2 shrink-0 rounded p-1 text-auth-secondary transition hover:text-auth-muted"
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        ) : null}
      </div>
    </div>
  );
}
