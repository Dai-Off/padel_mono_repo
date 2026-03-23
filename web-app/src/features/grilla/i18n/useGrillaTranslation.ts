import { useTranslation as useI18n } from 'react-i18next';
import { useCallback } from 'react';

export function useGrillaTranslation() {
  const { t: tRoot, i18n } = useI18n();

  const t = useCallback(
    (key: string, options?: Record<string, string | number>) =>
      tRoot(`grilla.${key}`, options as Record<string, unknown>),
    [tRoot]
  );

  const tData = useCallback(
    (value: string) => {
      if (!value) return value;
      return String(tRoot(`grilla.dataLabels.${value}`, { defaultValue: value }));
    },
    [tRoot]
  );

  return { t, tData, i18n };
}
