import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { AdminHeader } from './AdminHeader';
import { ApplicationCard } from './ApplicationCard';
import { ApplicationDetailModal } from './ApplicationDetailModal';
import { adminApplicationsService, type ClubApplication, type ApplicationStatus } from '../../services/adminApplications';
import { authService } from '../../services/auth';
import { HttpError } from '../../services/api';
import { TabSwitcher } from '../Common/TabSwitcher';
import { PageSpinner } from '../Layout/PageSpinner';

const STATUS_TAB_ALL = 'all';

export const AdminPanel = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [applications, setApplications] = useState<ClubApplication[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>(STATUS_TAB_ALL);
    const [selectedApplication, setSelectedApplication] = useState<ClubApplication | null>(null);

    const fetchApplications = useCallback(
        async (opts?: { silent?: boolean }) => {
            const silent = opts?.silent === true;
            if (!silent) setLoading(true);
            try {
                const token = authService.getSession()?.access_token;
                if (!token) {
                    navigate('/login');
                    return;
                }
                const me = await authService.getMe();
                if (!me.ok || !me.roles?.admin_id) {
                    navigate('/');
                    return;
                }
                const status = statusFilter === STATUS_TAB_ALL ? undefined : (statusFilter as ApplicationStatus);
                const data = await adminApplicationsService.list(status);
                setApplications(data);
            } catch (e) {
                if (e instanceof HttpError) {
                    if (e.status === 401) {
                        authService.logout();
                        navigate('/login');
                        return;
                    }
                    if (e.status === 403) {
                        navigate('/');
                        return;
                    }
                }
                toast.error(t('fetch_error'));
                setApplications([]);
            } finally {
                if (!silent) setLoading(false);
            }
        },
        [statusFilter, navigate, t]
    );

    useEffect(() => {
        void fetchApplications();
    }, [fetchApplications]);

    useEffect(() => {
        if (!selectedApplication) return;
        const fresh = applications.find((a) => a.id === selectedApplication.id);
        if (fresh && fresh !== selectedApplication) {
            setSelectedApplication(fresh);
        }
    }, [applications, selectedApplication]);

    const handleApprove = async (id: string) => {
        return adminApplicationsService.approve(id);
    };

    const handleReject = async (id: string, reason?: string) => {
        await adminApplicationsService.reject(id, reason);
        toast.error(t('admin_reject_done'));
    };

    if (loading && applications.length === 0) {
        return (
            <div className="min-h-screen bg-background text-foreground font-sans">
                <AdminHeader />
                <PageSpinner />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground font-sans">
            <AdminHeader />

            <main className="px-4 sm:px-5 py-5 pb-20">
                <div className="max-w-7xl mx-auto space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <h2 className="text-sm font-bold text-[#1A1A1A]">{t('admin_applications')}</h2>
                        <TabSwitcher
                            tabs={[
                                { id: STATUS_TAB_ALL, label: t('admin_status_all') },
                                { id: 'pending', label: t('admin_status_pending') },
                                { id: 'contacted', label: t('admin_status_contacted') },
                                { id: 'approved', label: t('admin_status_approved') },
                                { id: 'rejected', label: t('admin_status_rejected') },
                            ]}
                            activeTab={statusFilter}
                            onTabChange={setStatusFilter}
                        />
                    </div>

                    {loading ? (
                        <PageSpinner />
                    ) : applications.length === 0 ? (
                        <div className="py-16 text-center">
                            <p className="text-sm text-gray-500">{t('admin_no_applications')}</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {applications.map((app) => (
                                <ApplicationCard
                                    key={app.id}
                                    application={app}
                                    onClick={() => setSelectedApplication(app)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </main>

            <ApplicationDetailModal
                application={selectedApplication}
                onClose={() => {
                    setSelectedApplication(null);
                    void fetchApplications({ silent: true });
                }}
                onSilentRefresh={() => void fetchApplications({ silent: true })}
                onApprove={handleApprove}
                onReject={handleReject}
            />
        </div>
    );
};
