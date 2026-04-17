import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Save,
  Trash2,
  Plus,
  GripVertical,
  CheckCircle2,
} from "lucide-react";
import {
  onboardingQuestionsService,
  type OnboardingQuestion,
  type QuestionType,
} from "../../../services/onboardingQuestions";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

interface QuestionModalProps {
  question: OnboardingQuestion | null;
  isOpen: boolean;
  onClose: () => void;
}

export const QuestionModal: React.FC<QuestionModalProps> = ({
  question,
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  // Form state
  const [formData, setFormData] = useState<Partial<OnboardingQuestion>>({
    question_key: "",
    text: "",
    type: "single",
    phase: 1,
    pool: "",
    display_order: 1,
    is_active: true,
    options: { options: [] },
  });

  useEffect(() => {
    if (question) {
      const normalizedOptions = Array.isArray(question.options)
        ? { options: question.options }
        : question.options;
        
      setFormData({
        ...question,
        options: normalizedOptions || { options: [] }
      });
    } else {
      setFormData({
        question_key: "",
        text: "",
        type: "single",
        phase: 2,
        pool: "beginner",
        display_order: 1,
        is_active: true,
        options: { options: [] },
      });
    }
  }, [question, isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setLoading(true);
    try {
      const dataToSave = { ...formData };
      if (!dataToSave.question_key) {
        const prefix =
          dataToSave.phase === 1 ? "p1" : `p2_${dataToSave.pool || "gen"}`;
        dataToSave.question_key = `${prefix}_${Date.now()}`;
      }

      // Phase 1 expects an array of options directly
      if (dataToSave.phase === 1 && dataToSave.options?.options) {
        dataToSave.options = dataToSave.options.options;
      }

      // Phase 2 "order" type expects a "steps" field with the correct sequence
      if (dataToSave.phase === 2 && dataToSave.type === "order" && dataToSave.options?.options) {
        dataToSave.options.steps = dataToSave.options.options;
      }

      if (question?.id) {
        await onboardingQuestionsService.update(question.id, dataToSave);
        toast.success(t("save_success"));
      } else {
        await onboardingQuestionsService.create(dataToSave);
        toast.success(t("save_success"));
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(null as any);
      setLoading(false);
    }
  };

  const addOption = () => {
    const newOptions = [...(formData.options?.options || [])];
    if (formData.phase === 1) {
      newOptions.push({ text: "", value: 0 });
    } else {
      newOptions.push("");
    }
    setFormData({
      ...formData,
      options: { ...formData.options, options: newOptions },
    });
  };

  const removeOption = (index: number) => {
    const newOptions = [...(formData.options?.options || [])];
    newOptions.splice(index, 1);
    setFormData({
      ...formData,
      options: { ...formData.options, options: newOptions },
    });
  };

  const updateOption = (index: number, value: any) => {
    const newOptions = [...(formData.options?.options || [])];
    newOptions[index] = value;
    setFormData({
      ...formData,
      options: { ...formData.options, options: newOptions },
    });
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex justify-end"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          className="relative w-full max-w-xl bg-white shadow-2xl flex flex-col h-full"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
        >
          <div className="flex-none bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
            <h2 className="text-lg font-bold text-[#1A1A1A]">
              {question ? t("admin_edit_question") : t("admin_add_question")}
            </h2>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-gray-100 text-gray-500"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Phase and Order */}
            <div className="grid grid-cols-2 gap-4">
              {/* Phase: Bloqueado para prevenir errores de cambio manual */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-tighter">
                  {t("admin_question_phase")}
                </label>
                <select
                  value={formData.phase}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      phase: parseInt(e.target.value),
                    })
                  }
                  disabled={true}
                  className="w-full px-4 py-2.5 rounded-xl border border-border-subtle bg-gray-100 text-gray-500 text-sm outline-none transition-all cursor-not-allowed opacity-80"
                >
                  <option value={1}>Fase 1 (Perfil)</option>
                  <option value={2}>Fase 2 (Técnica)</option>
                </select>
              </div>

              {/* Order: Solo visible en Fase 1, ya que en Fase 2 es aleatorio */}
              {formData.phase === 1 ? (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-tighter">
                    {t("admin_order")}
                  </label>
                  <input
                    type="number"
                    value={formData.display_order}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        display_order: parseInt(e.target.value),
                      })
                    }
                    className="w-full px-4 py-2.5 rounded-xl border border-border-subtle bg-gray-50/50 text-sm focus:bg-white focus:ring-2 focus:ring-primary/5 outline-none transition-all"
                  />
                </div>
              ) : (
                <div className="space-y-1.5 opacity-50">
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-tighter">
                    {t("admin_order")}
                  </label>
                  <div className="px-4 py-2.5 rounded-xl border border-dashed border-gray-200 bg-gray-50 text-[10px] text-gray-400 font-medium italic leading-6">
                    Aleatorio en Onboarding
                  </div>
                </div>
              )}
            </div>

            {/* Text */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-tighter">
                {t("admin_question_text")}
              </label>
              <textarea
                value={formData.text}
                onChange={(e) =>
                  setFormData({ ...formData, text: e.target.value })
                }
                rows={2}
                className="w-full px-4 py-2.5 rounded-xl border border-border-subtle bg-gray-50/50 text-sm focus:bg-white focus:ring-2 focus:ring-primary/5 outline-none transition-all resize-none"
              />
            </div>

            {/* Type and Pool */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-tighter">
                  {t("admin_question_type")}
                </label>
                <select
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      type: e.target.value as QuestionType,
                    })
                  }
                  className="w-full px-4 py-2.5 rounded-xl border border-border-subtle bg-gray-50/50 text-sm focus:bg-white focus:ring-2 focus:ring-primary/5 outline-none transition-all"
                >
                  <option value="single">{t("admin_single_choice")}</option>
                  <option value="multi">{t("admin_multi_choice")}</option>
                  <option value="order">{t("admin_order_choice")}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-tighter">
                  {t("admin_question_pool")}
                </label>
                <select
                  value={formData.pool || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, pool: e.target.value })
                  }
                  className="w-full px-4 py-2.5 rounded-xl border border-border-subtle bg-gray-50/50 text-sm focus:bg-white focus:ring-2 focus:ring-primary/5 outline-none transition-all disabled:opacity-50"
                  disabled={formData.phase === 1}
                >
                  <option value="beginner">{t("admin_pool_beginner")}</option>
                  <option value="intermediate">{t("admin_pool_intermediate")}</option>
                  <option value="advanced">{t("admin_pool_advanced")}</option>
                  <option value="competition">{t("admin_pool_competition")}</option>
                  <option value="professional">{t("admin_pool_professional")}</option>
                </select>
              </div>
            </div>

            {/* Options */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-tighter">
                  {t("admin_question_options")}
                </label>
                <button
                  onClick={addOption}
                  className="text-[10px] font-bold text-primary flex items-center gap-1 hover:underline"
                >
                  <Plus className="w-3 h-3" /> {t("admin_add_option")}
                </button>
              </div>

              <div className="space-y-3">
                {formData.options?.options?.map((opt: any, idx: number) => (
                  <div key={idx} className="flex gap-3 items-start group">
                    <div className="mt-2.5 text-gray-300">
                      <GripVertical className="w-4 h-4 cursor-grab" />
                    </div>
                    <div className="flex-1 space-y-2">
                      {formData.phase === 1 ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={opt.text || ""}
                            onChange={(e) =>
                              updateOption(idx, {
                                ...opt,
                                text: e.target.value,
                              })
                            }
                            placeholder={t("admin_option_text")}
                            className="w-full px-3 py-2 rounded-xl border border-border-subtle text-xs outline-none focus:border-primary/30 transition-all"
                          />
                          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-gray-400">Value</label>
                              <input
                                type="text"
                                value={opt.value ?? ""}
                                onChange={(e) => updateOption(idx, { ...opt, value: e.target.value })}
                                className="w-full px-2 py-1.5 rounded-lg border border-border-subtle text-[11px] outline-none"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-gray-400">Base ELO</label>
                              <input
                                type="number"
                                step="0.1"
                                value={opt.base_elo || 0}
                                onChange={(e) => updateOption(idx, { ...opt, base_elo: parseFloat(e.target.value) })}
                                className="w-full px-2 py-1.5 rounded-lg border border-border-subtle text-[11px] outline-none"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-gray-400">Ceiling</label>
                              <input
                                type="number"
                                step="0.1"
                                value={opt.ceiling || 0}
                                onChange={(e) => updateOption(idx, { ...opt, ceiling: parseFloat(e.target.value) })}
                                className="w-full px-2 py-1.5 rounded-lg border border-border-subtle text-[11px] outline-none"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-gray-400">Corrector</label>
                              <input
                                type="number"
                                step="0.1"
                                value={opt.corrector || 0}
                                onChange={(e) => updateOption(idx, { ...opt, corrector: parseFloat(e.target.value) })}
                                className="w-full px-2 py-1.5 rounded-lg border border-border-subtle text-[11px] outline-none"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-gray-400">ELO Reg</label>
                              <input
                                type="number"
                                step="0.1"
                                value={opt.elo_reg || 0}
                                onChange={(e) => updateOption(idx, { ...opt, elo_reg: parseFloat(e.target.value) })}
                                className="w-full px-2 py-1.5 rounded-lg border border-border-subtle text-[11px] outline-none"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-gray-400">ELO Adv</label>
                              <input
                                type="number"
                                step="0.1"
                                value={opt.elo_adv || 0}
                                onChange={(e) => updateOption(idx, { ...opt, elo_adv: parseFloat(e.target.value) })}
                                className="w-full px-2 py-1.5 rounded-lg border border-border-subtle text-[11px] outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => updateOption(idx, e.target.value)}
                            placeholder={t("admin_option_text")}
                            className="flex-1 px-3 py-2 rounded-xl border border-border-subtle text-xs outline-none"
                          />
                          {(formData.type === "single" || formData.type === "multi") && (
                            <button
                              onClick={() => {
                                if (formData.type === "single") {
                                  setFormData({
                                    ...formData,
                                    options: {
                                      ...formData.options,
                                      correct_index: idx,
                                    },
                                  });
                                } else {
                                  const current = formData.options.correct_indices || [];
                                  const updated = current.includes(idx)
                                    ? current.filter((i: number) => i !== idx)
                                    : [...current, idx];
                                  setFormData({
                                    ...formData,
                                    options: {
                                      ...formData.options,
                                      correct_indices: updated,
                                    },
                                  });
                                }
                              }}
                              className={`p-2 rounded-lg transition-colors ${
                                (formData.type === "single" && formData.options.correct_index === idx) ||
                                (formData.type === "multi" && formData.options.correct_indices?.includes(idx))
                                  ? "bg-green-100 text-green-600"
                                  : "bg-gray-50 text-gray-300 hover:bg-gray-100"
                              }`}
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => removeOption(idx)}
                      className="mt-2 text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Status Toggle */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-gray-50/50 border border-border-subtle">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-gray-700">
                  Estado Activo
                </span>
                <p className="text-[10px] text-gray-400">
                  Si se desactiva, no aparecerá en el cuestionario inicial.
                </p>
              </div>
              <button
                onClick={() =>
                  setFormData({ ...formData, is_active: !formData.is_active })
                }
                className={`w-12 h-6 rounded-full transition-all relative ${formData.is_active ? "bg-primary" : "bg-gray-200"}`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${formData.is_active ? "right-1" : "left-1"}`}
                />
              </button>
            </div>
          </div>

          <div className="flex-none p-6 bg-white border-t border-gray-100 flex gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-gray-800 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {t("admin_save_question")}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
