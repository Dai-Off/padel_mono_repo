import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './components/Auth/Login';
import { ClubRegistration } from './components/Registration/ClubRegistration';
import { ClubDashboard } from './components/Dashboard/ClubDashboard';
import { ManagerOnboarding } from './components/Onboarding/ManagerOnboarding';
import { authService } from './services/auth';
import { Toaster } from 'sonner';

// Componente para proteger rutas
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const session = authService.getSession();

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" richColors />
      <Routes>
        {/* Rutas Públicas */}
        <Route path="/login" element={<Login />} />
        <Route path="/registro" element={<ClubRegistration />} />

        {/* Rutas Protegidas */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <ClubDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <ManagerOnboarding />
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
