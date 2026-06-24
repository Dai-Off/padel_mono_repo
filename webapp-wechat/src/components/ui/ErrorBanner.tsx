import { AlertCircle } from 'lucide-react';

type ErrorBannerProps = {
  message: string;
};

export function ErrorBanner({ message }: ErrorBannerProps) {
  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl bg-[rgba(227,30,36,0.1)] p-3">
      <AlertCircle className="mt-0.5 h-[18px] w-[18px] shrink-0 text-auth-error" />
      <p className="text-sm font-medium text-auth-error">{message}</p>
    </div>
  );
}
