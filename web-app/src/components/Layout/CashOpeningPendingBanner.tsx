import { AlertTriangle, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { authService } from '../../services/auth';
import { useCurrentClubId } from '../../hooks/useCurrentClubId';
import { useCashOpeningPending } from '../../hooks/useCashOpeningPending';
import { usePortalMenuPermissions } from '../../hooks/usePortalMenuPermissions';
import { portalMenuItemAllowed } from '../../lib/portalNavPermissions';

/**
 * Routes without a logged-in portal shell. The cash register screen is NOT excluded:
 * the opening can still be pending while standing on any of its other tabs.
 */
const HIDDEN_PATHS = new Set([
  '/login',
  '/email-confirmed',
  '/forgot-password',
  '/reset-password',
  '/app-recovery',
  '/registro',
  '/registro-club',
  '/invitacion-equipo',
  '/booking-response',
  '/onboarding',
]);
const HIDDEN_PREFIXES = ['/admin'];

function isHiddenRoute(pathname: string): boolean {
  if (HIDDEN_PATHS.has(pathname)) return true;
  return HIDDEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Persistent reminder shown across the portal while today's cash opening is pending.
 *
 * Rendered in the normal flow (never fixed/absolute): the grilla shell is `h-dvh` with
 * `overflow-hidden`, so an overlay or a global padding would push its footer out of the
 * viewport. Mounted right below the portal header in PortalTealHeader and, for the grilla,
 * as a flex child of its own shell.
 */
export function CashOpeningPendingBanner() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  const enabled = Boolean(authService.getSession()) && !isHiddenRoute(location.pathname);
  const { clubId } = useCurrentClubId(enabled);
  const scopedClubId = enabled ? clubId : null;
  const { permissionKeys, loading: permissionsLoading } = usePortalMenuPermissions(scopedClubId);
  const { loading, pending } = useCashOpeningPending(scopedClubId);

  const allowed = !permissionsLoading && portalMenuItemAllowed('cierreCaja', permissionKeys);
  const visible = Boolean(scopedClubId) && pending && !loading && allowed;

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full shrink-0 border-b border-amber-500/70 bg-amber-400"
    >
      <button
        type="button"
        onClick={() => navigate('/cierreCaja?section=apertura')}
        className="flex w-full items-center justify-center gap-2 px-4 py-1.5 text-[11px] md:text-xs font-bold text-amber-950 transition-colors hover:bg-amber-300"
      >
        <span className="relative flex h-2 w-2 flex-shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-900/60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-900" />
        </span>
        <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="truncate">{t('cash_opening_pending_title')}</span>
        <span className="hidden sm:inline font-medium text-amber-900/80">
          {t('cash_opening_pending_hint')}
        </span>
        <span className="flex flex-shrink-0 items-center gap-1 rounded-full bg-amber-950 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-amber-50">
          {t('cash_opening_pending_action')}
          <ArrowRight className="h-3 w-3" />
        </span>
      </button>
    </div>
  );
}
