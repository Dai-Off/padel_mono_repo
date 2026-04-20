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
import { QuestionsListView } from './components/Admin/OnboardingQuestions/QuestionsListView';
import { GrillaView } from './features/grilla';
import { PreciosView } from './components/Precios/PreciosView';
import { LearningContentView } from './components/Learning/LearningContentView';
import { AdminLearningPage } from './components/Admin/Learning/AdminLearningPage';
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
          path="/admin/questions"
          element={
            <ProtectedRoute>
              <QuestionsListView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/learning"
          element={
            <ProtectedRoute>
              <AdminLearningPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Navigate to="/grilla?menu=resumen" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pistas"
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
          path="/personal"
          element={
            <ProtectedRoute>
              <ClubDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/mi-perfil"
          element={
            <ProtectedRoute>
              <ClubDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/ligas"
          element={
            <ProtectedRoute>
              <Navigate to="/torneos?tab=ligas" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventario"
          element={
            <ProtectedRoute>
              <ClubDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/escuela"
          element={
            <ProtectedRoute>
              <ClubDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pagos"
          element={
            <ProtectedRoute>
              <ClubDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/crm"
          element={
            <ProtectedRoute>
              <ClubDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/torneos"
          element={
            <ProtectedRoute>
              <ClubDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/torneos/:id"
          element={
            <ProtectedRoute>
              <ClubDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/checkIn"
          element={
            <ProtectedRoute>
              <ClubDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cierreCaja"
          element={
            <ProtectedRoute>
              <ClubDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/resenas"
          element={
            <ProtectedRoute>
              <ClubDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/incidencias"
          element={
            <ProtectedRoute>
              <ClubDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/fechas-especiales"
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
        <Route
          path="/precios"
          element={
            <ProtectedRoute>
              <PreciosView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/contenido-aprendizaje"
          element={
            <ProtectedRoute>
              <LearningContentView />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
