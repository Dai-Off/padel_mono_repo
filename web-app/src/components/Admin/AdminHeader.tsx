import { LogOut, ClipboardList } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { authService } from "../../services/auth";

export const AdminHeader = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    authService.logout();
    navigate("/login");
  };

  const isQuestionsPage = location.pathname === "/admin/questions";

  return (
    <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border-subtle">
      <div className="px-5 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl overflow-hidden bg-white border border-border-subtle p-1 cursor-pointer"
              onClick={() => navigate("/admin")}
            >
              <img
                src="/logo.png"
                alt="Logo"
                className="w-full h-full object-contain"
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
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isQuestionsPage && (
              <button
                type="button"
                onClick={() => navigate("/admin/questions")}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-gray-800 transition-all border border-transparent shadow-sm"
              >
                <ClipboardList className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t("admin_questions")}</span>
              </button>
            )}
            {isQuestionsPage && (
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
