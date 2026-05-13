import { useCallback, useEffect, useState } from 'react';
import { clubChatsService } from '../services/clubChats';

const POLL_MS = 120_000;
const CHANGED = 'padel:club-chat-mentions-changed';

export function useClubChatMentionsCount(clubId: string | null | undefined): number {
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    if (!clubId?.trim()) {
      setCount(0);
      return;
    }
    try {
      const list = await clubChatsService.listMentions(clubId);
      setCount(list.length);
    } catch {
      setCount(0);
    }
  }, [clubId]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), POLL_MS);
    const onChanged = () => void load();
    window.addEventListener(CHANGED, onChanged);
    return () => {
      window.clearInterval(t);
      window.removeEventListener(CHANGED, onChanged);
    };
  }, [load]);

  return count;
}

export function notifyClubChatMentionsChanged(): void {
  window.dispatchEvent(new Event(CHANGED));
}
