import { useEffect, useState } from 'react';
import { fetchMatches, type MatchEnriched } from '../api/matches';
import { isMatchEnrichedActiveForDiscovery } from '../domain/matchLifecycle';
import { useAuth } from '../contexts/AuthContext';

type UseOpenMatchesResult = {
  matches: MatchEnriched[];
  loading: boolean;
};

export function useOpenMatches(): UseOpenMatchesResult {
  const { session } = useAuth();
  const [matches, setMatches] = useState<MatchEnriched[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    fetchMatches({ token: session?.access_token, activeOnly: true })
      .then((data) => {
        if (!mounted) return;
        const openMatches = (data ?? []).filter((m) => isMatchEnrichedActiveForDiscovery(m));
        setMatches(openMatches);
      })
      .catch(() => {
        if (!mounted) return;
        setMatches([]);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [session?.access_token]);

  return { matches, loading };
}

