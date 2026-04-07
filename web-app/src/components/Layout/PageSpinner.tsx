import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function PageSpinner() {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-gray-50 w-full min-h-dvh">
      <div className="flex flex-col items-center justify-center gap-6 px-6">
        <Loader2
          className="w-16 h-16 text-[#E31E24] animate-spin shrink-0"
          strokeWidth={2}
          aria-hidden
        />
        <p className="text-base font-medium text-gray-600">{t('loading')}</p>
      </div>
    </div>
  );
}
