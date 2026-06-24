import { ArrowRight, Loader2 } from 'lucide-react';

type AuthButtonProps = {
  children: string;
  loading?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit';
};

export function AuthButton({
  children,
  loading,
  disabled,
  type = 'button',
}: AuthButtonProps) {
  return (
    <button
      type={type}
      disabled={loading || disabled}
      className="auth-btn-shadow mt-6 mb-5 flex w-full min-h-11 items-center justify-center gap-3 rounded-2xl bg-auth-accent px-6 py-3.5 text-base font-bold text-white transition enabled:hover:opacity-90 disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <>
          <span>{children}</span>
          <ArrowRight className="h-5 w-5" />
        </>
      )}
    </button>
  );
}
