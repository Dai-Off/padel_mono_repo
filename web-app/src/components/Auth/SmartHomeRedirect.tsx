import { Navigate } from 'react-router-dom';

export function SmartHomeRedirect() {
  return <Navigate to="/grilla?menu=resumen" replace />;
}
