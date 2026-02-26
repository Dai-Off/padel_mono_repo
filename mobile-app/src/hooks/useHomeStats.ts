import { useEffect, useState } from 'react';
import { fetchHomeStats, fetchZoneTrends, type HomeStats, type ZoneTrends } from '../api/home';
import { useAuth } from '../contexts/AuthContext';

export function useZoneTrends() {
  const { session } = useAuth();
  const [trends, setTrends] = useState<ZoneTrends | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    fetchZoneTrends(session?.access_token)
      .then((data) => {
        if (mounted) setTrends(data);
      })
      .catch(() => {
        if (mounted)
          setTrends({
            popularTimeSlot: null,
            topClub: null,
            activePlayersToday: null,
            nextTournament: null,
          });
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [session?.access_token]);

  return { trends, loading };
}

export function useHomeStats() {
  const { session } = useAuth();
  const [stats, setStats] = useState<HomeStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    fetchHomeStats(session?.access_token)
      .then((data) => {
        if (mounted) setStats(data);
      })
      .catch(() => {
        if (mounted) setStats({ courtsFree: 0, playersLooking: 0, classesToday: 0, tournaments: 0 });
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [session?.access_token]);

  return { stats, loading };
}
