import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Login } from './components/Auth/Login';
import { AdminLayout } from './components/Layout/AdminLayout';
import { DashboardPage } from './pages/DashboardPage';
import { UsuariosPage } from './pages/UsuariosPage';
import { ClubesPage } from './pages/ClubesPage';
import { TiendaPage } from './pages/TiendaPage';
import { ColeccionesPage } from './pages/ColeccionesPage';
import { VentasPage } from './pages/VentasPage';
import { CodigosPromocionalesPage } from './pages/CodigosPromocionalesPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { authService } from './services/auth';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const session = authService.getSession();
    if (!session) return <Navigate to="/login" replace />;
    return children;
}

export default function App() {
    return (
        <BrowserRouter>
            <Toaster position="top-right" richColors />
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route
                    path="/"
                    element={
                        <ProtectedRoute>
                            <AdminLayout />
                        </ProtectedRoute>
                    }
                >
                    <Route index element={<DashboardPage />} />
                    <Route path="usuarios" element={<UsuariosPage />} />
                    <Route path="clubes" element={<ClubesPage />} />
                    <Route path="tienda" element={<TiendaPage />} />
                    <Route path="tienda/colecciones" element={<ColeccionesPage />} />
                    <Route path="ventas" element={<VentasPage />} />
                    <Route
                        path="cursos"
                        element={
                            <PlaceholderPage
                                title="Cursos"
                                description="Gestioná cursos digitales y contenido de aprendizaje."
                            />
                        }
                    />
                    <Route path="codigo-promocional" element={<CodigosPromocionalesPage />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
}
