import type { ReactNode } from 'react';
import { useAuth } from '../../contexts/AuthContext';

type RequireAuthProps = {
  children: ReactNode;
};

/**
 * Contenido solo accesible con sesión. Usar como envoltorio de la app principal
 * para que, si la sesión deja de existir, no quede montada la UI interna.
 */
export function RequireAuth({ children }: RequireAuthProps) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return null;
  }
  return <>{children}</>;
}
