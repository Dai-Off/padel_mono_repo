type AuthBrandProps = {
  variant?: 'logoOnly' | 'full' | 'hero';
};

export function AuthBrand({ variant = 'logoOnly' }: AuthBrandProps) {
  if (variant === 'full') {
    return (
      <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
        <img
          src="/wematch-logo.png"
          alt="WeMatch"
          className="h-9 w-9 shrink-0 object-contain sm:h-10 sm:w-10"
        />
        <p className="truncate text-sm font-bold sm:text-base">
          <span className="text-auth-text">We</span>
          <span className="text-auth-accent">Match</span>
          <span className="ml-1.5 text-xs font-medium text-auth-muted sm:text-sm">Administración</span>
        </p>
      </div>
    );
  }

  if (variant === 'hero') {
    return (
      <div className="flex w-full max-w-lg flex-col items-center text-center">
        <div className="logo-shadow h-36 w-36 shrink-0 xl:h-44 xl:w-44">
          <img
            src="/wematch-logo.png"
            alt="WeMatch"
            className="h-full w-full object-contain"
          />
        </div>
        <h1 className="mt-8 text-3xl font-bold text-auth-text xl:text-4xl">
          <span>We</span>
          <span className="text-auth-accent">Match</span>
        </h1>
        <div
          className="mt-3 h-[3px] w-56 max-w-full rounded-sm"
          style={{
            background: 'linear-gradient(90deg, transparent, #F18F34, transparent)',
            boxShadow: '0 0 8px rgba(241, 143, 52, 0.6)',
          }}
        />
        <p className="mt-4 text-base text-auth-muted xl:text-lg">Administración</p>
        <p className="mt-6 max-w-md text-sm leading-relaxed text-auth-secondary xl:text-base">
          Gestioná la aplicación móvil de WeMatch desde un solo lugar.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-5 flex flex-col items-center sm:mb-6 md:mb-8">
      <div className="logo-shadow h-24 w-24 shrink-0 sm:h-28 sm:w-28 md:h-32 md:w-32">
        <img
          src="/wematch-logo.png"
          alt="WeMatch"
          className="h-full w-full object-contain"
        />
      </div>
      <p className="mt-4 text-sm font-medium text-auth-muted sm:mt-5 sm:text-base">Administración</p>
    </div>
  );
}
