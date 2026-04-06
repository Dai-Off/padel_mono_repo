import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { PageSpinner } from '../Layout/PageSpinner';
import { leaguesService, type LeagueSeason } from '../../services/leagues';

type Props = {
  clubId: string | null;
  clubResolved: boolean;
};

export function ClubLeaguesTab({ clubId, clubResolved }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [seasons, setSeasons] = useState<LeagueSeason[]>([]);
  const [name, setName] = useState('');
  const [teamByDivision, setTeamByDivision] = useState<Record<string, string>>({});

  const refresh = async () => {
    if (!clubId) {
      setSeasons([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setSeasons(await leaguesService.listSeasons(clubId));
    } catch {
      toast.error(t('leagues_load_error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!clubResolved) return;
    void refresh();
  }, [clubId, clubResolved]);

  const activeSeason = useMemo(
    () => seasons.find((s) => !s.closed) ?? seasons[0] ?? null,
    [seasons]
  );

  if (!clubResolved || loading) return <PageSpinner />;
  if (!clubId) return <div className="text-sm text-gray-500">{t('leagues_need_club')}</div>;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-bold text-[#1A1A1A]">{t('leagues_title')}</h2>
        <p className="text-xs text-gray-500 mt-1">{t('leagues_intro')}</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-700">{t('leagues_new_season')}</p>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('leagues_name_ph')}
            className="flex-1 h-10 rounded-xl border border-gray-200 px-3 text-sm"
          />
          <button
            type="button"
            className="px-4 h-10 rounded-xl bg-[#E31E24] text-white text-xs font-bold"
            onClick={async () => {
              if (!name.trim()) {
                toast.error(t('leagues_name_required'));
                return;
              }
              try {
                await leaguesService.createSeason(clubId, name.trim());
                setName('');
                toast.success(t('leagues_created'));
                await refresh();
              } catch {
                toast.error(t('fetch_error'));
              }
            }}
          >
            {t('leagues_create')}
          </button>
        </div>
        <p className="text-[11px] text-gray-500">{t('leagues_default_divisions_hint')}</p>
      </div>

      {activeSeason ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-[#1A1A1A]">
              {activeSeason.name} {activeSeason.closed ? `(${t('leagues_closed')})` : ''}
            </p>
            {!activeSeason.closed && (
              <button
                type="button"
                className="px-3 py-2 rounded-xl bg-[#1A1A1A] text-white text-xs font-semibold"
                onClick={async () => {
                  if (!window.confirm(t('leagues_apply_confirm'))) return;
                  try {
                    const result = await leaguesService.closeAndPromote(activeSeason.id);
                    toast.success(t('leagues_apply_ok', { n: result.moved }));
                    await refresh();
                  } catch {
                    toast.error(t('fetch_error'));
                  }
                }}
              >
                {t('leagues_apply_btn')}
              </button>
            )}
          </div>

          {(activeSeason.league_divisions ?? [])
            .slice()
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((div) => (
              <div key={div.id} className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-[#1A1A1A]">{div.name}</p>
                  <p className="text-[10px] text-gray-500">
                    ↑{div.promote_count} / ↓{div.relegate_count}
                  </p>
                </div>

                <div className="space-y-1">
                  {(div.league_teams ?? []).length ? (
                    div.league_teams!
                      .slice()
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((team) => (
                        <div key={team.id} className="text-xs text-gray-700">
                          {team.sort_order}. {team.name}
                        </div>
                      ))
                  ) : (
                    <p className="text-xs text-gray-400">{t('leagues_no_teams')}</p>
                  )}
                </div>

                {!activeSeason.closed && (
                  <div className="flex gap-2">
                    <input
                      value={teamByDivision[div.id] ?? ''}
                      onChange={(e) => setTeamByDivision((s) => ({ ...s, [div.id]: e.target.value }))}
                      placeholder={t('leagues_team_ph')}
                      className="flex-1 h-9 rounded-xl border border-gray-200 px-3 text-sm"
                    />
                    <button
                      type="button"
                      className="px-3 h-9 rounded-xl bg-gray-100 text-xs font-semibold text-[#1A1A1A]"
                      onClick={async () => {
                        const teamName = (teamByDivision[div.id] ?? '').trim();
                        if (!teamName) {
                          toast.error(t('leagues_team_required'));
                          return;
                        }
                        try {
                          await leaguesService.addTeam(activeSeason.id, div.id, teamName);
                          setTeamByDivision((s) => ({ ...s, [div.id]: '' }));
                          toast.success(t('leagues_team_added'));
                          await refresh();
                        } catch {
                          toast.error(t('fetch_error'));
                        }
                      }}
                    >
                      {t('leagues_add_team_btn')}
                    </button>
                  </div>
                )}
              </div>
            ))}
        </div>
      ) : (
        <div className="text-xs text-gray-500">{t('leagues_empty')}</div>
      )}
    </div>
  );
}
