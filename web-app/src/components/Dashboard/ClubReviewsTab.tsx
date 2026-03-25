import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { listClubReviews, type ClubReviewListItem, type ClubReviewSummary } from '../../services/clubReviews';
import { PageSpinner } from '../Layout/PageSpinner';

function AnimSection({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
            {children}
        </motion.div>
    );
}

function initialsFromPlayer(p: ClubReviewListItem['player']) {
    const a = (p.first_name || '').trim().charAt(0);
    const b = (p.last_name || '').trim().charAt(0);
    return (a + b).toUpperCase() || '?';
}

function displayName(p: ClubReviewListItem['player']) {
    const n = `${p.first_name || ''} ${p.last_name || ''}`.trim();
    return n || '—';
}

function RatingBar({ stars, count, total }: { stars: number; count: number; total: number }) {
    const percentage = total > 0 ? (count / total) * 100 : 0;
    return (
        <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 w-16">
                <span className="text-xs font-bold text-[#1A1A1A]">{stars}</span>
                <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
            </div>
            <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <motion.div
                    className="bg-yellow-400 h-1.5 rounded-full"
                    initial={{ width: 0 }}
                    whileInView={{ width: `${percentage}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                />
            </div>
            <span className="text-[10px] text-gray-400 w-10 text-right font-semibold">{count}</span>
        </div>
    );
}

function ReviewCard({ item }: { item: ClubReviewListItem }) {
    const dateStr = new Date(item.created_at).toLocaleDateString(undefined, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
    const initials = initialsFromPlayer(item.player);
    const name = displayName(item.player);
    return (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-[#1A1A1A] flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-xs font-bold">{initials}</span>
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-bold text-[#1A1A1A] truncate">{name}</p>
                        <p className="text-[10px] text-gray-400">{dateStr}</p>
                    </div>
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                    {Array.from({ length: item.rating }, (_, i) => (
                        <Star key={i} className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                    ))}
                </div>
            </div>
            {item.comment ? (
                <p className="text-xs text-gray-500 leading-relaxed">{item.comment}</p>
            ) : null}
        </div>
    );
}

export function ClubReviewsTab({
    clubId,
    clubResolved,
}: {
    clubId: string | null;
    clubResolved: boolean;
}) {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [summary, setSummary] = useState<ClubReviewSummary | null>(null);
    const [reviews, setReviews] = useState<ClubReviewListItem[]>([]);
    const seq = useRef(0);

    useEffect(() => {
        if (!clubResolved || !clubId) {
            setLoading(false);
            setSummary(null);
            setReviews([]);
            return;
        }
        const n = ++seq.current;
        setLoading(true);
        setError(null);
        listClubReviews(clubId)
            .then((res) => {
                if (seq.current !== n) return;
                setSummary(res.summary);
                setReviews(res.reviews);
            })
            .catch((e: Error) => {
                if (seq.current !== n) return;
                setError(e.message || t('club_reviews_error'));
            })
            .finally(() => {
                if (seq.current !== n) return;
                setLoading(false);
            });
    }, [clubId, clubResolved, t]);

    if (!clubResolved) {
        return <PageSpinner />;
    }

    if (!clubId) {
        return (
            <p className="text-sm text-gray-500 text-center py-12">{t('club_reviews_no_club')}</p>
        );
    }

    if (loading) {
        return <PageSpinner />;
    }

    if (error) {
        return (
            <p className="text-sm text-red-600 text-center py-12">{error}</p>
        );
    }

    const avg = summary?.average;
    const count = summary?.count ?? 0;
    const dist = summary?.distribution ?? {};
    const distN = (s: number) => dist[String(s)] ?? 0;
    const totalForBars = count > 0 ? count : 1;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-5"
        >
            <div
                className="relative overflow-hidden rounded-2xl"
                style={{ background: 'linear-gradient(160deg, #1A1A1A 0%, #2A2A2A 100%)' }}
            >
                <div className="relative z-10 p-5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] mb-1">
                            {t('club_reviews_avg_label')}
                        </p>
                        <h2 className="text-sm font-bold text-white">{t('club_reviews_title')}</h2>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <Star className="w-6 h-6 text-yellow-400 fill-yellow-400" />
                        <span className="text-3xl font-black text-white">
                            {avg != null ? avg.toFixed(1) : '—'}
                        </span>
                        <span className="text-[10px] text-white/30">({count})</span>
                    </div>
                </div>
            </div>

            <AnimSection>
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                    <h3 className="text-xs font-bold text-[#1A1A1A] mb-4">{t('club_reviews_distribution')}</h3>
                    <div className="space-y-2.5">
                        {[5, 4, 3, 2, 1].map((stars) => (
                            <RatingBar
                                key={stars}
                                stars={stars}
                                count={distN(stars)}
                                total={totalForBars}
                            />
                        ))}
                    </div>
                </div>
            </AnimSection>

            <p className="text-[10px] text-gray-400 px-1 leading-relaxed">{t('club_reviews_player_hint')}</p>

            <div className="space-y-3">
                {reviews.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-8">{t('club_reviews_empty')}</p>
                ) : (
                    reviews.map((item, i) => (
                        <AnimSection key={item.id} delay={i * 0.05}>
                            <ReviewCard item={item} />
                        </AnimSection>
                    ))
                )}
            </div>
        </motion.div>
    );
}
