"use client";
import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase';
import { useLanguage } from '@/utils/LanguageContext';
import { calculatePoints, isSurpriseLoot } from '@/utils/points';
import { TEAM_RANKS } from '@/utils/TEAM_RANKS';

export default function StandingsTab({ leagueId }: { leagueId: string }) {
    const { language, t, isAr } = useLanguage();
    const [standings, setStandings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showRules, setShowRules] = useState(false);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    useEffect(() => {
        async function fetchStandings() {
            if (!leagueId) return;

            // Fetch the currently authenticated user's session
            const { data: { session } } = await supabase.auth.getSession();
            const loggedInUserId = session?.user?.id || null;
            setCurrentUserId(loggedInUserId);

            const { data: members } = await supabase
            .from('league_members')
            .select('user_id')
            .eq('league_id', leagueId);

            if (!members || members.length === 0) { setLoading(false); return; }

            const userIds = members.map(m => m.user_id);

            const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username')
            .in('id', userIds);

            // Paginated predictions fetch to bypass Supabase client-side max_rows limit of 1000
            let rawPredictions: any[] = [];
            let from = 0;
            let to = 999;
            let hasMore = true;

            while (hasMore) {
                const { data: chunk, error } = await supabase
                    .from('predictions')
                    .select('user_id, points_earned, match_id, predicted_home_score, predicted_away_score, is_joker')
                    .in('user_id', userIds)
                    .order('user_id', { ascending: true })
                    .order('match_id', { ascending: true })
                    .range(from, to);

                if (error) {
                    console.error('Error fetching paginated predictions:', error);
                    hasMore = false;
                } else if (!chunk || chunk.length === 0) {
                    hasMore = false;
                } else {
                    rawPredictions = [...rawPredictions, ...chunk];
                    if (chunk.length < 1000) {
                        hasMore = false;
                    } else {
                        from += 1000;
                        to += 1000;
                    }
                }
            }

            // Deduplicate fetched predictions to guarantee high-integrity unique records
            const seenPredKeys = new Set<string>();
            const predictions: any[] = [];
            for (const p of rawPredictions) {
                const key = `${p.user_id}_${p.match_id}`;
                if (!seenPredKeys.has(key)) {
                    seenPredKeys.add(key);
                    predictions.push(p);
                }
            }

            const { data: matches } = await supabase
            .from('matches')
            .select('match_id, home_team, away_team, is_giant_slayer, home_rank, away_rank, home_score_final, away_score_final, group_stage');

            const results = members.map(m => {
                const profile = (profiles || []).find(p => p.id === m.user_id);
                const userPreds = (predictions || []).filter(p => p.user_id === m.user_id);

                let totalPoints = 0;
                let slayerPoints = 0;
                let exactCount = 0;
                let outcomeCount = 0;

                const predMap = new Map((userPreds || []).map(p => [p.match_id, p]));

                (matches || []).forEach(match => {
                    if (match.match_id === '00000000-0000-0000-0000-000000000000') return;
                    if (match.group_stage?.includes('[HIDDEN]')) return;
                    const isFinished = match.home_score_final !== null && match.home_score_final !== undefined &&
                                       match.away_score_final !== null && match.away_score_final !== undefined;
                    
                    if (!isFinished) return;

                    const p = predMap.get(match.match_id);
                    const hasExplicitPrediction = p && p.predicted_home_score !== null && p.predicted_home_score !== undefined &&
                                                   p.predicted_away_score !== null && p.predicted_away_score !== undefined;

                    let pHome = hasExplicitPrediction ? p.predicted_home_score : 0;
                    const pAway = hasExplicitPrediction ? p.predicted_away_score : 0;
                    const isJoker = hasExplicitPrediction ? (p.is_joker ?? false) : false;

                    let isInsurance = false;
                    if (hasExplicitPrediction && pHome !== null && pHome !== undefined && pHome >= 100) {
                        isInsurance = true;
                        pHome = pHome - 100;
                    }

                    const homeRank = match.home_rank ?? TEAM_RANKS[match.home_team] ?? 60;
                    const awayRank = match.away_rank ?? TEAM_RANKS[match.away_team] ?? 60;
                    const isGiantSlayer = match.is_giant_slayer === true || 
                                           (homeRank != null && awayRank != null && Math.abs(homeRank - awayRank) >= 35 && (homeRank <= 20 || awayRank <= 20));

                    const isLoot = isSurpriseLoot(match.home_team, match.away_team, match.match_id, m.user_id, match.group_stage);

                    const hasDbPoints = hasExplicitPrediction && p.points_earned !== null && p.points_earned !== undefined;
                    const pts = hasDbPoints
                        ? p.points_earned
                        : calculatePoints(
                            pHome,
                            pAway,
                            match.home_score_final,
                            match.away_score_final,
                            isGiantSlayer,
                            homeRank ?? 60,
                            awayRank ?? 60,
                            isJoker,
                            isLoot ? "" : match.home_team,
                            isLoot ? "" : match.away_team,
                            match.match_id,
                            m.user_id,
                            isInsurance,
                            match.group_stage
                        );

                    totalPoints += pts;

                    let addedToSlayer = false;
                    if (isGiantSlayer) {
                        if (homeRank != null && awayRank != null) {
                            const predictedOutcome = Math.sign(pHome - pAway);
                            const isHomeWeaker = homeRank > awayRank;
                            let predictedUnderdogNotToLose = false;

                            if (isHomeWeaker) {
                                predictedUnderdogNotToLose = predictedOutcome >= 0;
                            } else if (awayRank > homeRank) {
                                predictedUnderdogNotToLose = predictedOutcome <= 0;
                            } else {
                                predictedUnderdogNotToLose = true;
                            }

                            if (predictedUnderdogNotToLose) {
                                slayerPoints += pts;
                                addedToSlayer = true;
                            }
                        }
                    }
                    if (!addedToSlayer && isInsurance && pts > 0) {
                        slayerPoints += 3;
                    }

                    const isPhysExact = (pHome === match.home_score_final) && (pAway === match.away_score_final);
                    const actualOutcome = Math.sign(match.home_score_final - match.away_score_final);
                    const predOutcome = Math.sign(pHome - pAway);
                    const isPhysOutcome = !isPhysExact && (actualOutcome === predOutcome);
                    if (isPhysExact) {
                        exactCount++;
                    } else if (isPhysOutcome) {
                        outcomeCount++;
                    }
                });

                return {
                    userId: m.user_id,
                    username: profile?.username || 'Unknown',
                    points: totalPoints,
                    slayerPoints,
                    exactCount,
                    outcomeCount
                };
            }).sort((a, b) => {
                // 1. Total points (descending)
                if (b.points !== a.points) {
                    return b.points - a.points;
                }
                // 2. Tiebreaker: Option C Underdog Specialist (slayer points, descending)
                if (b.slayerPoints !== a.slayerPoints) {
                    return b.slayerPoints - a.slayerPoints;
                }
                // 3. Tiebreaker: Exact Count (descending)
                if (b.exactCount !== a.exactCount) {
                    return b.exactCount - a.exactCount;
                }
                // 4. Tiebreaker: Outcome Count (descending)
                return b.outcomeCount - a.outcomeCount;
            });

            // Assign ranks handling tied positions for identically scoring players
            let currentRank = 1;
            const resultsWithRanks = results.map((s, idx) => {
                if (idx > 0) {
                    const prev = results[idx - 1];
                    const isTied = s.points === prev.points &&
                                   s.slayerPoints === prev.slayerPoints &&
                                   s.exactCount === prev.exactCount &&
                                   s.outcomeCount === prev.outcomeCount;
                    if (!isTied) {
                        currentRank = idx + 1;
                    }
                } else {
                    currentRank = 1;
                }
                return {
                    ...s,
                    rank: currentRank
                };
            });

            setStandings(resultsWithRanks);
            setLoading(false);
        }
        fetchStandings();
    }, [leagueId]);

    const medalColor = (rank: number) => {
        if (rank === 1) return '#FFD700';
        if (rank === 2) return '#C0C0C0';
        if (rank === 3) return '#CD7F32';
        return 'var(--grey)';
    };

    if (loading) return <div className="standings-loading" style={{ fontFamily: isAr ? 'Cairo, system-ui' : undefined }}>{isAr ? "جاري تحميل جدول الترتيب..." : "Loading standings..."}</div>;

    if (standings.length === 0) return (
        <div className="empty-state" style={{ direction: isAr ? 'rtl' : 'ltr' }}>
        <span className="empty-icon">🏟️</span>
        <p>{isAr ? "لا توجد لوحة ترتيب حالياً." : "No standings available yet."}</p>
        </div>
    );

    return (
        <div className="standings-wrap" style={{ direction: isAr ? 'rtl' : 'ltr' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', flexDirection: isAr ? 'row-reverse' : 'row' }}>
            <h2 className="section-title" style={{ fontFamily: isAr ? 'Cairo, system-ui' : undefined }}>{isAr ? "جدول ترتيب الدوري" : "League Standings"}</h2>
            <button 
                onClick={() => setShowRules(p => !p)} 
                style={{
                    backgroundColor: 'rgba(192,132,252,0.1)',
                    border: '1px solid #c084fc',
                    color: '#c084fc',
                    fontFamily: isAr ? 'Cairo, system-ui' : 'Bebas Neue',
                    letterSpacing: isAr ? 'normal' : '0.05em',
                    fontSize: '0.85rem',
                    padding: '0.35rem 0.85rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    flexDirection: isAr ? 'row-reverse' : 'row'
                }}
            >
                {showRules ? (isAr ? "إخفاء شروط كسر التعادل ✕" : "Hide Tiebreaker Info ✕") : (isAr ? "ℹ️ كيف يتم كسر التعادل؟" : "ℹ️ How does Tiebreaker work?")}
            </button>
        </div>

        {showRules && (
            <div style={{
                backgroundColor: 'rgba(124, 58, 237, 0.06)',
                border: '1px solid rgba(139, 92, 246, 0.25)',
                borderRadius: 'var(--radius)',
                padding: '1rem',
                fontSize: '0.85rem',
                lineHeight: '1.4',
                color: 'var(--white)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                animation: 'fadeUp 0.2s ease',
                textAlign: isAr ? 'right' : 'left'
            }}>
                <span>{isAr ? "للحفاظ على الحماس والمغامرة، يتم ترتيب اللاعبين المتعادلين بناءً على هذه الشروط بالتوالي:" : "To keep things extremely exciting and rewarding for risk-takers, tying players are ranked strictly using these criteria:"}</span>
                <ol style={{ paddingLeft: isAr ? 0 : '1.2rem', paddingRight: isAr ? '1.2rem' : 0, display: 'flex', flexDirection: 'column', gap: '0.25rem', color: 'var(--grey)' }}>
                    <li>
                        <strong style={{ color: 'var(--white)' }}>{isAr ? "١. ⚡ نقاط قاهر العمالقة" : "1. ⚡ Slayer Points"}</strong>: {isAr ? "مجموع النقاط التي ربحتها في مباريات قاهري العمالقة." : "The sum of all your points earned on Giant Slayer matches."}
                    </li>
                    <li>
                        <strong style={{ color: 'var(--white)' }}>{isAr ? "٢. 🎯 توقعات النتائج الدقيقة" : "2. 🎯 Exact Predictions Count"}</strong>: {isAr ? "إجمالي التوقعات التي أصبت فيها النتيجة الدقيقة للمباراة." : "Total number of predictions where you guessed the exact final score correctly."}
                    </li>
                    <li>
                        <strong style={{ color: 'var(--white)' }}>{isAr ? "٣. ⚽ توقع فائز صحيح" : "3. ⚽ Correct Outcome Count"}</strong>: {isAr ? "إجمالي المباريات التي أصبت فيها الفائز أو التعادل فقط دون النتيجة الدقيقة." : "Total number of matches where you guessed the outcome correctly (but not exact score)."}
                    </li>
                </ol>
            </div>
        )}

        {/* Podium — only show if 3+ players */}
        {standings.length >= 3 && (
            <div className={`podium ${isAr ? 'rtl-active' : ''}`}>
            {[standings[1], standings[0], standings[2]].map((s, i) => {
                const pos = [2, 1, 3][i];
                return (
                    <div key={s.username} className={`podium-item podium-${pos}`}>
                    <div className="podium-avatar" style={{ borderColor: medalColor(s.rank || pos) }}>
                    {s.username?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <p className="podium-name">{s.username}</p>
                    <p className="podium-pts">{s.points} pts</p>
                    <div className="podium-block" style={{ background: medalColor(s.rank || pos) }}>
                    #{s.rank || pos}
                    </div>
                    </div>
                );
            })}
            </div>
        )}

        {/* Full table */}
        <div style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }}>
            <div className="standings-table" style={{ minWidth: '450px' }}>
            <div className="standings-header" style={{ display: 'grid', gridTemplateColumns: '40px 1fr 100px 75px 75px', gap: '0.5rem', width: '100%' }}>
            <span>#</span>
            <span>{isAr ? "اللاعب" : "Player"}</span>
            <span className="standings-col-slayer" style={{ textAlign: 'center' }}>{isAr ? "⚡ نقاط قاهر العمالقة" : "⚡ Slayer Pts"}</span>
            <span className="standings-col-exact" style={{ textAlign: 'center' }}>{isAr ? "🎯 توقعات دقيقة" : "🎯 Exacts"}</span>
            <span style={{ textAlign: 'center' }}>{isAr ? "النقاط" : "Points"}</span>
            </div>
            {standings.map((s, i) => {
                const isCurrentUser = s.userId === currentUserId;
                return (
                    <div key={i}>
                        <div 
                            className={`standings-row ${i === 0 ? 'standings-row--first' : ''} ${isCurrentUser ? 'standings-row--current' : ''}`} 
                            style={{ display: 'grid', gridTemplateColumns: '40px 1fr 100px 75px 75px', gap: '0.5rem', width: '100%', cursor: 'pointer' }}
                            onClick={() => setExpandedRows(prev => {
                                const next = new Set(prev);
                                if (next.has(s.username)) {
                                    next.delete(s.username);
                                } else {
                                    next.add(s.username);
                                }
                                return next;
                            })}
                        >
                            <span className="standings-rank" style={{ color: medalColor(s.rank) }}>
                                {s.rank <= 3 ? ['🥇', '🥈', '🥉'][s.rank - 1] : s.rank}
                            </span>
                            <span className="standings-name" style={{ 
                                textAlign: 'start', 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '0.4rem',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden'
                            }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.username}</span>
                                {isCurrentUser && (
                                    <span style={{ 
                                        fontSize: '0.7rem', 
                                        color: '#a78bfa', 
                                        fontWeight: 'normal', 
                                        backgroundColor: 'rgba(167, 139, 250, 0.15)', 
                                        padding: '0.12rem 0.4rem', 
                                        borderRadius: '4px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        lineHeight: 1,
                                        fontFamily: isAr ? 'Cairo, system-ui' : 'inherit',
                                        flexShrink: 0
                                    }}>
                                        {isAr ? "أنت" : "You"}
                                    </span>
                                )}
                                <span className="expand-arrow" style={{
                                    fontSize: '0.65rem',
                                    color: 'var(--grey)',
                                    transition: 'transform 0.2s',
                                    transform: expandedRows.has(s.username) ? 'rotate(180deg)' : 'rotate(0deg)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    flexShrink: 0,
                                    marginInlineStart: '0.2rem'
                                }}>▼</span>
                            </span>
                            <span className="standings-stat-slayer standings-col-slayer">{s.slayerPoints} {isAr ? 'نقاط' : 'pts'}</span>
                            <span className="standings-stat-exact standings-col-exact">{s.exactCount}</span>
                            <span className="standings-pts" style={{ textAlign: 'center' }}>{s.points}</span>
                        </div>

                        {/* Expanded detail row */}
                        {expandedRows.has(s.username) && (
                            <div style={{
                                padding: '0.75rem 1.25rem',
                                background: 'rgba(139,92,246,0.06)',
                                borderBottom: '1px solid var(--border-color)',
                                display: 'flex',
                                gap: '1.5rem',
                                fontSize: '0.8rem',
                                flexWrap: 'wrap'
                            }}>
                                <span>⚡ <strong style={{ color: '#c084fc' }}>{s.slayerPoints}</strong> {isAr ? 'نقاط قاهر العمالقة' : 'Slayer Pts'}</span>
                                <span>🎯 <strong style={{ color: '#38bdf8' }}>{s.exactCount}</strong> {isAr ? 'توقعات دقيقة' : 'Exact Predictions'}</span>
                            </div>
                        )}
                    </div>
                );
            })}
            </div>
        </div>

        <style>{styles}</style>
        </div>
    );
}

const styles = `
.standings-loading {
    color: var(--grey);
    padding: 2rem;
    text-align: center;
    font-family: 'Barlow', sans-serif;
}
.standings-wrap { display: flex; flex-direction: column; gap: 2rem; }
.section-title {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 1.6rem;
    letter-spacing: 0.08em;
    color: var(--white);
}
.podium {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: 1rem;
    padding: 2rem 1rem 0;
}
.podium-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    flex: 1;
    max-width: 140px;
}
.podium-avatar {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    border: 3px solid;
    background: var(--surface);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 1.4rem;
    color: var(--white);
}
.podium-1 .podium-avatar { width: 64px; height: 64px; font-size: 1.7rem; }
.podium-name {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--white);
    text-align: center;
    font-family: 'Barlow', sans-serif;
}
.podium-pts {
    font-size: 0.75rem;
    color: var(--grey);
    font-family: 'Barlow', sans-serif;
}
.podium-block {
    width: 100%;
    text-align: center;
    padding: 0.5rem 0;
    border-radius: 6px 6px 0 0;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 1.1rem;
    color: var(--navy);
    font-weight: bold;
    margin-top: 0.5rem;
}
.podium-1 .podium-block { padding: 1rem 0; }
.podium-3 .podium-block { padding: 0.3rem 0; }
.standings-table {
    background: var(--surface);
    border-radius: var(--radius);
    border: 1px solid var(--border-color);
    overflow: hidden;
}
.standings-header {
    display: grid;
    grid-template-columns: 50px 1fr 110px 90px 80px;
    padding: 0.75rem 1.25rem;
    background: rgba(0,0,0,0.05);
    font-family: 'Bebas Neue', sans-serif;
    font-size: 0.8rem;
    letter-spacing: 0.12em;
    color: var(--grey);
    border-bottom: 1px solid var(--border-color);
}
.standings-row {
    display: grid;
    grid-template-columns: 50px 1fr 110px 90px 80px;
    padding: 0.9rem 1.25rem;
    align-items: center;
    border-bottom: 1px solid var(--border-color);
    transition: background 0.15s;
}
.standings-row:last-child { border-bottom: none; }
.standings-row:hover { background: rgba(139,149,165,0.08); }
.standings-row--first {
    background: rgba(201,168,76,0.07);
    border-left: 3px solid var(--gold);
}
.standings-row--current {
    background: rgba(139, 92, 246, 0.12) !important;
    border-inline-start: 4px solid #a78bfa !important;
}
.standings-rank { font-size: 1rem; }
.standings-name {
    font-family: 'Barlow', sans-serif;
    font-weight: 600;
    font-size: 0.95rem;
    color: var(--white);
}
.standings-stat-slayer {
    font-family: 'Bebas Neue', sans-serif;
    color: #c084fc;
    font-size: 0.95rem;
    text-align: center;
}
.standings-stat-exact {
    font-family: 'Bebas Neue', sans-serif;
    color: #38bdf8;
    font-size: 1rem;
    text-align: center;
}
.standings-header span:last-child {
    text-align: center;
}

.standings-pts {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 1.1rem;
    color: var(--gold);
    text-align: center;
}
@media (max-width: 640px) {
    .standings-header {
        grid-template-columns: 36px 1fr 70px !important;
    }
    .standings-row {
        grid-template-columns: 36px 1fr 70px !important;
    }
    .standings-col-slayer,
    .standings-col-exact {
        display: none;
    }
}
@media (min-width: 641px) {
    .standings-row { cursor: default !important; }
    .expand-arrow { display: none !important; }
}
`;
