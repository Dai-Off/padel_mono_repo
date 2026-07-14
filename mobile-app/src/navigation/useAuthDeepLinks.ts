import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StackActions } from '@react-navigation/native';
import {
  isRecoveryDeepLink,
  parseSupabaseRecoveryFromUrl,
} from '../lib/parseAuthRecoveryUrl';
import { parseTournamentInviteUrl } from '../lib/parseTournamentInviteUrl';
import { parseMatchDeepLink } from '../lib/parseMatchDeepLink';
import { navigationRef } from './navigationRef';
import { dispatchWhenReady } from './nav';

const PENDING_TOURNAMENT_INVITE_KEY = 'pending_tournament_invite';
const PENDING_MATCH_DEEPLINK_KEY = 'pending_match_deeplink';

async function stashTournamentInviteFromUrl(url: string) {
  const parsed = parseTournamentInviteUrl(url);
  if (parsed) {
    await AsyncStorage.setItem(PENDING_TOURNAMENT_INVITE_KEY, JSON.stringify(parsed));
  }
}

async function stashMatchDeepLinkFromUrl(url: string) {
  const parsed = parseMatchDeepLink(url);
  if (parsed) {
    await AsyncStorage.setItem(PENDING_MATCH_DEEPLINK_KEY, JSON.stringify(parsed));
  }
}

function popToLogin() {
  dispatchWhenReady(() => {
    if (navigationRef.getCurrentRoute()?.name !== 'Login') {
      navigationRef.dispatch(StackActions.popTo('Login'));
    }
  });
}

/**
 * Deep links del flujo sin sesion (antes en AuthFlowWrapper de App.tsx):
 * - invitaciones de torneo/partido se guardan en AsyncStorage para que
 *   MainApp las consuma tras el login
 * - email-confirmed vuelve a Login
 * - links de recovery de Supabase abren ResetPassword
 */
export function useAuthDeepLinks(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    let alive = true;

    const consumeDeepLink = (url: string | null) => {
      if (!url) return;
      void stashTournamentInviteFromUrl(url);
      void stashMatchDeepLinkFromUrl(url);

      if (url.includes('email-confirmed')) {
        popToLogin();
        return;
      }

      if (!isRecoveryDeepLink(url)) return;
      const parsed = parseSupabaseRecoveryFromUrl(url);
      dispatchWhenReady(() => {
        navigationRef.navigate('ResetPassword', {
          recovery: {
            access_token: parsed.access_token,
            refresh_token: parsed.refresh_token,
            token_hash: parsed.token_hash,
          },
        });
      });
    };

    void (async () => {
      const initial = await Linking.getInitialURL();
      if (alive && initial) consumeDeepLink(initial);
    })();
    const sub = Linking.addEventListener('url', ({ url }) => {
      consumeDeepLink(url);
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, [enabled]);
}
