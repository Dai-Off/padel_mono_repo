import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './components/Auth/Login';
import { ForgotPassword } from './components/Auth/ForgotPassword';
import { ResetPassword } from './components/Auth/ResetPassword';
import { EmailConfirmed } from './components/Auth/EmailConfirmed';
import { ClubRegistration } from './components/Registration/ClubRegistration';
import { RegistroClubInvite } from './components/Registration/RegistroClubInvite';
import { ClubDashboard } from './components/Dashboard/ClubDashboard';
import { ManagerOnboarding } from './components/Onboarding/ManagerOnboarding';
import { AdminPanel } from './components/Admin/AdminPanel';
import { GrillaView } from './features/grilla';
import { authService } from './services/auth';
import { Toaster } from 'sonner';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const session = authService.getSession();
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" richColors />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/email-confirmed" element={<EmailConfirmed />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/registro" element={<ClubRegistration />} />
        <Route path="/registro-club" element={<RegistroClubInvite />} />

        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminPanel />
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <ClubDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/jugadores"
          element={
            <ProtectedRoute>
              <ClubDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/configuracion"
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
        <Route
          path="/grilla"
          element={
            <ProtectedRoute>
              <GrillaView />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
