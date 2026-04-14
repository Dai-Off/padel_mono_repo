import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { AdminHeader } from "../AdminHeader";
import { QuestionCard } from "./QuestionCard";
import { QuestionModal } from "./QuestionModal";
import { onboardingQuestionsService } from "../../../services/onboardingQuestions";
import type { OnboardingQuestion } from "../../../services/onboardingQuestions";
import { authService } from "../../../services/auth";
import { HttpError } from "../../../services/api";
import { TabSwitcher } from "../../Common/TabSwitcher";
import { PageSpinner } from "../../Layout/PageSpinner";
import { Plus } from "lucide-react";

const PHASE_TAB_ALL = "all";

export const QuestionsListView = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<OnboardingQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [phaseFilter, setPhaseFilter] = useState<string>(PHASE_TAB_ALL);
  const [selectedQuestion, setSelectedQuestion] =
    useState<OnboardingQuestion | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const token = authService.getSession()?.access_token;
      if (!token) {
        navigate("/login");
        return;
      }
      const me = await authService.getMe();
      if (!me.ok || !me.roles?.admin_id) {
        navigate("/");
        return;
      }
      const phase =
        phaseFilter === PHASE_TAB_ALL ? undefined : parseInt(phaseFilter);
      const data = await onboardingQuestionsService.list({ phase });
      setQuestions(data);
    } catch (e) {
      if (e instanceof HttpError) {
        if (e.status === 401) {
          authService.logout();
          navigate("/login");
          return;
        }
        if (e.status === 403) {
          navigate("/");
          return;
        }
      }
      toast.error(t("fetch_error"));
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }, [phaseFilter, navigate, t]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  if (loading && questions.length === 0) {
    return <PageSpinner />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <AdminHeader />

      <main className="px-4 sm:px-5 py-5 pb-20">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-col">
              <h2 className="text-sm font-bold text-[#1A1A1A]">
                {t("admin_questions")}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {t("admin_questions_desc")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <TabSwitcher
                tabs={[
                  { id: PHASE_TAB_ALL, label: t("all") },
                  { id: "1", label: t("admin_question_phase") + " 1" },
                  { id: "2", label: t("admin_question_phase") + " 2" },
                ]}
                activeTab={phaseFilter}
                onTabChange={setPhaseFilter}
              />
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-gray-800 transition-all shadow-sm"
              >
                <Plus className="w-4 h-4" />
                {t("admin_add_question")}
              </button>
            </div>
          </div>

          {loading ? (
            <PageSpinner />
          ) : questions.length === 0 ? (
            <div className="py-16 text-center border-2 border-dashed border-gray-100 rounded-3xl">
              <p className="text-sm text-gray-500">{t("admin_no_questions")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {questions.map((q) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  onClick={() => setSelectedQuestion(q)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <QuestionModal
        question={selectedQuestion}
        isOpen={!!selectedQuestion || isCreateModalOpen}
        onClose={() => {
          setSelectedQuestion(null);
          setIsCreateModalOpen(false);
          fetchQuestions();
        }}
      />
    </div>
  );
};
