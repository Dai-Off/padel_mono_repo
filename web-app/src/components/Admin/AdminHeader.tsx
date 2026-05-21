import { useEffect, useState } from "react";
import { LogOut, ClipboardList, BookOpen } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { authService } from "../../services/auth";
import { adminLearningService } from "../../services/adminLearning";

export const AdminHeader = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [pendingCount, setPendingCount] = useState(0);

  const handleLogout = () => {
    authService.logout();
    navigate("/login");
  };

  const isQuestionsPage = location.pathname === "/admin/questions";
  const isLearningPage = location.pathname === "/admin/learning";
  const isSubPage = isQuestionsPage || isLearningPage;

  // Burbuja sobre el botón "Aprendizaje": muestra cursos pendientes de revisión.
  // Se refresca cada vez que el admin vuelve a /admin (para que tras aprobar/rechazar
  // un curso desde /admin/learning, el contador se actualice al volver al home).
  useEffect(() => {
    if (isSubPage) return;
    let cancelled = false;
    adminLearningService.getPendingCount()
      .then((count) => { if (!cancelled) setPendingCount(count); })
      .catch(() => { /* silencioso: no bloquear el header */ });
    return () => { cancelled = true; };
  }, [location.pathname, isSubPage]);

  return (
    <header className="sticky top-0 z-55 bg-background/95 backdrop-blur-md border-b border-border-subtle">
      <div className="px-5 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl overflow-hidden bg-primary border border-border-subtle flex items-center justify-center cursor-pointer shrink-0"
              onClick={() => navigate("/admin")}
            >
              <img
                src="/wematch-logo.png"
                alt="WeMatch"
                className="w-full h-full object-contain scale-[1.15]"
              />
            </div>
            <div className="flex flex-col">
              <h1 className="text-sm font-bold text-primary">
                {t("admin_panel")}
              </h1>
              {isQuestionsPage && (
                <span className="text-[10px] font-medium text-gray-400 capitalize -mt-0.5">
                  {t("admin_questions")}
                </span>
              )}
              {isLearningPage && (
                <span className="text-[10px] font-medium text-gray-400 capitalize -mt-0.5">
                  {t("admin_learning_title")}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isSubPage && (
              <>
                <button
                  type="button"
                  onClick={() => navigate("/admin/questions")}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-gray-800 transition-all border border-transparent shadow-sm"
                >
                  <ClipboardList className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t("admin_questions")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/admin/learning")}
                  className="relative flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-all border border-transparent shadow-sm"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t("admin_learning_title")}</span>
                  {pendingCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold min-w-[18px] text-center shadow">
                      {pendingCount}
                    </span>
                  )}
                </button>
              </>
            )}
            {isSubPage && (
              <button
                type="button"
                onClick={() => navigate("/admin")}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border-subtle text-gray-600 text-xs font-semibold hover:bg-gray-50 transition-all"
              >
                <span className="hidden sm:inline">{t("admin_back")}</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-all"
              title={t("logout")}
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t("logout")}</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
