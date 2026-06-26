import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Line, Circle, Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { PlayerAvatarCircle } from './PlayerAvatarCircle';
import type { LevelHistoryMatch, LevelHistoryLimit, LevelHistoryPlayer } from '../../api/profileStats';

interface LevelEvolutionCardProps {
  matches: LevelHistoryMatch[];
  currentElo: number;
  limit: LevelHistoryLimit;
  onChangeLimit: (limit: LevelHistoryLimit) => void;
  loading?: boolean;
  onOpenMatch?: (matchId: string) => void;
}

const FILTERS: { key: LevelHistoryLimit; label: string }[] = [
  { key: '5', label: '5 res.' },
  { key: '10', label: '10 res.' },
  { key: 'all', label: 'Todos' },
];

const CHART_HEIGHT = 150;
const PAD = { l: 10, r: 40, t: 20, b: 14 };

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function fmtNum(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

// ─── Avatares de equipo (solapados) ───
function TeamAvatars({ players }: { players: LevelHistoryPlayer[] }) {
  return (
    <View style={styles.teamAvatars}>
      {players.map((p, i) => (
        <View key={p.id ?? i} style={[styles.teamAvatarSlot, i > 0 && styles.teamAvatarOverlap]}>
          <PlayerAvatarCircle avatarUrl={p.avatarUrl} initials={p.initials} size={26} />
        </View>
      ))}
    </View>
  );
}

// ─── Tarjeta del partido seleccionado ───
function MatchCard({ match, onOpen }: { match: LevelHistoryMatch; onOpen?: () => void }) {
  const win = match.result === 'win';
  const myPlayers = match.myTeam === 'A' ? match.teamA : match.teamB;
  const oppPlayers = match.myTeam === 'A' ? match.teamB : match.teamA;
  const myScore = match.myTeam === 'A' ? match.scoreA : match.scoreB;
  const oppScore = match.myTeam === 'A' ? match.scoreB : match.scoreA;
  const up = match.ratingChange >= 0;

  return (
    <Pressable style={styles.matchCard} onPress={onOpen}>
      <View style={styles.matchHeader}>
        <Text style={styles.matchDate}>{fmtDate(match.playedAt)}</Text>
        <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.25)" />
      </View>

      {/* Mi equipo */}
      <View style={styles.matchRow}>
        <TeamAvatars players={myPlayers} />
        <View style={styles.scoreGroup}>
          {myScore.map((s, i) => (
            <Text key={i} style={styles.scoreTop}>{s}</Text>
          ))}
        </View>
        {match.result !== 'draw' ? (
          <Text style={[styles.resultLabel, { color: win ? '#34D399' : '#F87171' }]}>
            {win ? 'Victoria' : 'Derrota'}
          </Text>
        ) : (
          <Text style={[styles.resultLabel, { color: '#9CA3AF' }]}>Empate</Text>
        )}
      </View>

      {/* Rival */}
      <View style={styles.matchRow}>
        <TeamAvatars players={oppPlayers} />
        <View style={styles.scoreGroup}>
          {oppScore.map((s, i) => (
            <Text key={i} style={styles.scoreBottom}>{s}</Text>
          ))}
        </View>
        <View style={styles.deltaWrap}>
          <Ionicons
            name={up ? 'trending-up' : 'trending-down'}
            size={14}
            color={up ? '#34D399' : '#F87171'}
          />
          <Text style={[styles.deltaText, { color: up ? '#34D399' : '#F87171' }]}>
            {up ? '+' : ''}{fmtNum(match.ratingChange)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export const LevelEvolutionCard: React.FC<LevelEvolutionCardProps> = ({
  matches,
  currentElo,
  limit,
  onChangeLimit,
  loading,
  onOpenMatch,
}) => {
  const [chartWidth, setChartWidth] = useState(320);
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Al cambiar los datos, seleccionar el más reciente (último, orden ascendente)
  useEffect(() => {
    setSelectedIdx(matches.length > 0 ? matches.length - 1 : 0);
  }, [matches]);

  const geom = useMemo(() => {
    const n = matches.length;
    const innerW = chartWidth - PAD.l - PAD.r;
    const innerH = CHART_HEIGHT - PAD.t - PAD.b;
    const levels = matches.map((m) => m.eloAfter);
    const minL = levels.length ? Math.min(...levels) - 0.1 : 0;
    const maxL = levels.length ? Math.max(...levels) + 0.1 : 1;
    const range = maxL - minL || 0.5;
    const px = (i: number) => (n <= 1 ? PAD.l + innerW / 2 : PAD.l + (i / (n - 1)) * innerW);
    const py = (l: number) => PAD.t + innerH - ((l - minL) / range) * innerH;
    const pts = matches.map((m, i) => ({ x: px(i), y: py(m.eloAfter) }));
    return { pts, minL, maxL, innerH, py };
  }, [matches, chartWidth]);

  const linePath = geom.pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath =
    geom.pts.length > 0
      ? `${linePath} L ${geom.pts[geom.pts.length - 1].x.toFixed(1)} ${(PAD.t + geom.innerH).toFixed(1)} L ${geom.pts[0].x.toFixed(1)} ${(PAD.t + geom.innerH).toFixed(1)} Z`
      : '';
  const selPt = geom.pts[selectedIdx];
  const selMatch = matches[selectedIdx];

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Evolución del nivel</Text>
          <View style={styles.filters}>
            {FILTERS.map((f) => {
              const active = limit === f.key;
              return (
                <Pressable
                  key={f.key}
                  onPress={() => onChangeLimit(f.key)}
                  style={[styles.filterBtn, active && styles.filterBtnActive]}
                >
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color="#F18F34" />
          </View>
        ) : matches.length === 0 ? (
          <View style={styles.centered}>
            <Ionicons name="trending-up-outline" size={24} color="#6B7280" />
            <Text style={styles.emptyText}>Aún no tienes partidos de matchmaking para mostrar tu evolución.</Text>
          </View>
        ) : (
          <>
            {selMatch ? (
              <MatchCard match={selMatch} onOpen={selMatch ? () => onOpenMatch?.(selMatch.matchId) : undefined} />
            ) : null}

            <View
              style={styles.chartWrap}
              onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}
            >
              <Svg width={chartWidth} height={CHART_HEIGHT}>
                <Defs>
                  <LinearGradient id="evoLine" x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0" stopColor="#F18F34" />
                    <Stop offset="1" stopColor="#E95F32" />
                  </LinearGradient>
                  <LinearGradient id="evoArea" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#F18F34" stopOpacity={0.25} />
                    <Stop offset="1" stopColor="#F18F34" stopOpacity={0.02} />
                  </LinearGradient>
                </Defs>

                {/* Grid */}
                {[0.25, 0.5, 0.75].map((t) => (
                  <Line
                    key={t}
                    x1={PAD.l}
                    y1={PAD.t + geom.innerH * t}
                    x2={chartWidth - PAD.r}
                    y2={PAD.t + geom.innerH * t}
                    stroke="rgba(255,255,255,0.07)"
                    strokeWidth={0.8}
                  />
                ))}

                {/* Línea discontinua del punto seleccionado */}
                {selPt ? (
                  <Line
                    x1={selPt.x}
                    y1={PAD.t}
                    x2={selPt.x}
                    y2={PAD.t + geom.innerH}
                    stroke="rgba(241,143,52,0.5)"
                    strokeWidth={1.2}
                    strokeDasharray="4,3"
                  />
                ) : null}

                {areaPath ? <Path d={areaPath} fill="url(#evoArea)" /> : null}
                {linePath ? (
                  <Path d={linePath} fill="none" stroke="url(#evoLine)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
                ) : null}

                {/* Puntos no seleccionados (las zonas táctiles van en el overlay) */}
                {geom.pts.map((p, i) =>
                  i !== selectedIdx ? (
                    <Circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={4.5}
                      fill="#F18F34"
                      stroke="rgba(17,17,17,0.9)"
                      strokeWidth={1.5}
                    />
                  ) : null,
                )}

                {/* Punto seleccionado (amarillo con ELO) */}
                {selPt ? (
                  <>
                    <Circle cx={selPt.x} cy={selPt.y} r={22} fill="rgba(234,255,0,0.12)" />
                    <Circle cx={selPt.x} cy={selPt.y} r={18} fill="#EAFF00" stroke="rgba(17,17,17,0.4)" strokeWidth={1} />
                    <SvgText
                      x={selPt.x}
                      y={selPt.y + 4}
                      textAnchor="middle"
                      fontSize={10}
                      fontWeight="900"
                      fill="#1A1A1A"
                    >
                      {selMatch ? fmtNum(selMatch.eloAfter) : ''}
                    </SvgText>
                  </>
                ) : null}

                {/* Etiquetas min/max */}
                <SvgText x={chartWidth - 2} y={geom.py(geom.maxL) + 4} textAnchor="end" fontSize={9} fill="rgba(255,255,255,0.35)">
                  {fmtNum(geom.maxL)}
                </SvgText>
                <SvgText x={chartWidth - 2} y={geom.py(geom.minL) + 4} textAnchor="end" fontSize={9} fill="rgba(255,255,255,0.35)">
                  {fmtNum(geom.minL)}
                </SvgText>
              </Svg>

              {/* Zonas táctiles sobre cada punto (fiables en iOS/Android) */}
              {geom.pts.map((p, i) => (
                <Pressable
                  key={`hit-${i}`}
                  onPress={() => setSelectedIdx(i)}
                  style={[styles.pointHit, { left: p.x - 18, top: p.y - 18 }]}
                  hitSlop={4}
                  accessibilityRole="button"
                  accessibilityLabel={`Ver partido ${i + 1}`}
                />
              ))}
            </View>
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  card: {
    backgroundColor: '#1C1C1C',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  filters: {
    flexDirection: 'row',
    gap: 4,
  },
  filterBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  filterBtnActive: {
    backgroundColor: '#333',
  },
  filterText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.3)',
  },
  filterTextActive: {
    color: '#fff',
  },
  centered: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  emptyText: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  // Match card
  matchCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 12,
  },
  matchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  matchDate: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  teamAvatars: {
    flexDirection: 'row',
    width: 56,
  },
  teamAvatarSlot: {
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: 'rgba(17,17,17,0.8)',
  },
  teamAvatarOverlap: {
    marginLeft: -8,
  },
  scoreGroup: {
    flexDirection: 'row',
    gap: 12,
    flex: 1,
  },
  scoreTop: {
    fontSize: 16,
    fontWeight: '900',
    color: '#fff',
    width: 16,
    textAlign: 'center',
  },
  scoreBottom: {
    fontSize: 16,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.35)',
    width: 16,
    textAlign: 'center',
  },
  resultLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  deltaWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  deltaText: {
    fontSize: 12,
    fontWeight: '900',
  },
  chartWrap: {
    marginTop: 12,
    position: 'relative',
  },
  pointHit: {
    position: 'absolute',
    width: 36,
    height: 36,
  },
});
