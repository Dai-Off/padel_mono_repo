type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

// El backend de auth acompaña sus errores con un error_code estable y deja en
// `error` un texto en español como fallback. Aquí se mapean los códigos
// conocidos a claves i18n para que el mensaje salga en el idioma de la app.
const CODE_TO_KEY: Record<string, string> = {
  INVALID_CREDENTIALS: 'auth.invalidCredentials',
  LOGIN_FAILED: 'auth.loginFailed',
  EMAIL_NOT_CONFIRMED: 'auth.emailNotConfirmed',
  ACCOUNT_DELETED: 'auth.accountDeleted',
  EMAIL_RATE_LIMIT: 'auth.emailRateLimit',
  EMAIL_INVALID: 'auth.emailInvalid',
  EMAIL_ALREADY_REGISTERED: 'auth.emailTaken',
  USERNAME_TAKEN: 'auth.usernameTaken',
  USERNAME_INVALID: 'common.usernameFormat',
  PASSWORD_TOO_SHORT: 'common.passwordMin6',
};

export function authErrorMessage(
  t: TranslateFn,
  res: { error?: string; error_code?: string },
  fallbackKey: string,
): string {
  const key = res.error_code ? CODE_TO_KEY[res.error_code] : undefined;
  if (key) return t(key);
  return res.error ?? t(fallbackKey);
}
