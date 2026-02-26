import { useEffect, useState } from 'react';
import { fetchMatches, type Match } from '../api/matches';
import { useAuth } from '../contexts/AuthContext';

type UseOpenMatchesResult = {
  matches: Match[];
  loading: boolean;
};

export function useOpenMatches(): UseOpenMatchesResult {
  const { session } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    fetchMatches({ token: session?.access_token })
      .then((data) => {
        if (!mounted) return;
        const openMatches = (data ?? []).filter((m) =>
          ['open', 'pending', 'scheduled'].includes(m.status)
        );
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

