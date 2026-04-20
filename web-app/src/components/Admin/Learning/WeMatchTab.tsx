import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { WEMATCH_CLUB_ID } from '../../../services/adminLearning';
import { QuestionsTab } from '../../Learning/Questions/QuestionsTab';
import { CoursesTab } from '../../Learning/Courses/CoursesTab';

type SubTab = 'questions' | 'courses';

export function WeMatchTab() {
  const { t } = useTranslation();
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('questions');

  const subTabs: { key: SubTab; label: string }[] = [
    { key: 'questions', label: t('learning_tab_questions') },
    { key: 'courses', label: t('learning_tab_courses') },
  ];

  return (
    <div className="space-y-5">
      {/* Sub-tabs */}
      <div className="flex gap-1.5">
        {subTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveSubTab(tab.key)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === tab.key
                ? 'bg-[#1A1A1A] text-white'
                : 'bg-gray-50 text-[#1A1A1A] hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      <motion.div
        key={activeSubTab}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
      >
        {activeSubTab === 'questions' && <QuestionsTab clubId={WEMATCH_CLUB_ID} />}
        {activeSubTab === 'courses' && <CoursesTab clubId={WEMATCH_CLUB_ID} />}
      </motion.div>
    </div>
  );
}
