"use client";
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/utils/supabase';
import { useLanguage } from '@/utils/LanguageContext';
import { getFlagEmoji } from '@/utils/flags';
import { calculatePoints, isSurpriseLoot, getDeterministicUserMatchFactor } from '@/utils/points';
import { TEAM_RANKS } from '@/utils/TEAM_RANKS';
import { motion, AnimatePresence } from 'motion/react';

interface PredictionsTabProps {
    activeLeagueId?: string | null;
    joinedLeagues?: { league_id: string; league_name: string; created_by?: string | null }[];
}

export default function PredictionsTab({ activeLeagueId = null, joinedLeagues = [] }: PredictionsTabProps) {
    const { language, t, isAr, tTeam } = useLanguage();
    const [matches, setMatches] = useState<any[]>([]);
    const [isRound1Collapsed, setIsRound1Collapsed] = useState(true);
    const [predictions, setPredictions] = useState<Record<string, { home: number | string; away: number | string; points_earned?: number | null; is_joker?: boolean; is_insurance?: boolean }>>({});
    const [doubleDownTokens, setDoubleDownTokens] = useState<number>(0);
    const [insuranceTokens, setInsuranceTokens] = useState<number>(0);
    const [saved, setSaved] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(false);
    const [showRules, setShowRules] = useState(false);
    const [userStats, setUserStats] = useState<{ totalPoints: number; slayerPoints: number; exactCount: number } | null>(null);
    const [lootChoices, setLootChoices] = useState<Record<string, 'flat_3' | 'double_down' | 'insurance'>>({});
    const [refreshStatsCount, setRefreshStatsCount] = useState(0);
    const [rollingMatchId, setRollingMatchId] = useState<string | null>(null);
    const [openedChests, setOpenedChests] = useState<Record<string, boolean>>({});
    const [openingChestId, setOpeningChestId] = useState<string | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const initialChangeableMatchIdsRef = useRef<Set<string> | null>(null);

    // Group predictions states
    const [expandedOtherPreds, setExpandedOtherPreds] = useState<Record<string, boolean>>({});
    const [otherPredictionsMap, setOtherPredictionsMap] = useState<Record<string, any[]>>({});
    const [loadingOtherPreds, setLoadingOtherPreds] = useState<Record<string, boolean>>({});
    const [selectedLeagueIdForMatch, setSelectedLeagueIdForMatch] = useState<Record<string, string>>({});

    const fetchOtherPredictions = async (matchId: string, leagueIdToFetch: string) => {
        if (!leagueIdToFetch) return;
        setLoadingOtherPreds(prev => ({ ...prev, [matchId]: true }));
        try {
            const { data: members, error: memErr } = await supabase
                .from('league_members')
                .select('user_id')
                .eq('league_id', leagueIdToFetch);

            if (memErr) throw memErr;
            if (!members || members.length === 0) {
                setOtherPredictionsMap(prev => ({ ...prev, [matchId]: [] }));
                return;
            }

            const userIds = members.map(mem => mem.user_id);

            const { data: profiles, error: profErr } = await supabase
                .from('profiles')
                .select('id, username')
                .in('id', userIds);

            if (profErr) throw profErr;

            const { data: preds, error: predErr } = await supabase
                .from('predictions')
                .select('*')
                .eq('match_id', matchId)
                .in('user_id', userIds);

            if (predErr) throw predErr;

            const mMatchObj = (matches || []).find(item => item.match_id === matchId);
            const mKickoff = mMatchObj ? new Date(mMatchObj.kickoff_time).getTime() : 0;
            const nowTime = Date.now();
            const isPermanentlyLocked = mMatchObj ? (mKickoff - nowTime < 3600000) : false;

            const homeR = mMatchObj ? (mMatchObj.home_rank ?? TEAM_RANKS[mMatchObj.home_team] ?? 60) : 60;
            const awayR = mMatchObj ? (mMatchObj.away_rank ?? TEAM_RANKS[mMatchObj.away_team] ?? 60) : 60;
            const isGiantSlayer = mMatchObj ? (mMatchObj.is_giant_slayer === true || 
                                                (Math.abs(homeR - awayR) >= 35 && (homeR <= 20 || awayR <= 20))) : false;

            const mappedList = members.map(mMember => {
                const profile = (profiles || []).find(p => p.id === mMember.user_id);
                const userPredObj = (preds || []).find(p => p.user_id === mMember.user_id);
                
                if (!userPredObj) {
                    const defaultedPts = (mMatchObj && mMatchObj.home_score_final !== null && mMatchObj.away_score_final !== null)
                        ? calculatePoints(
                            0,
                            0,
                            mMatchObj.home_score_final,
                            mMatchObj.away_score_final,
                            isGiantSlayer,
                            homeR,
                            awayR,
                            false,
                            isSurpriseLoot(mMatchObj.home_team, mMatchObj.away_team, mMatchObj.match_id, mMember.user_id, mMatchObj.group_stage) ? "" : mMatchObj.home_team,
                            isSurpriseLoot(mMatchObj.home_team, mMatchObj.away_team, mMatchObj.match_id, mMember.user_id, mMatchObj.group_stage) ? "" : mMatchObj.away_team,
                            mMatchObj.match_id,
                            mMember.user_id,
                            false,
                            mMatchObj.group_stage
                        )
                        : null;

                    return {
                        user_id: mMember.user_id,
                        username: profile?.username || 'Unknown',
                        home: isPermanentlyLocked ? 0 : null,
                        away: isPermanentlyLocked ? 0 : null,
                        is_joker: false,
                        is_insurance: false,
                        points_earned: defaultedPts,
                        has_predicted: isPermanentlyLocked,
                        is_hidden: false,
                    };
                }

                let pHome = userPredObj.predicted_home_score;
                let pAway = userPredObj.predicted_away_score;
                let isIns = false;
                if (pHome !== null && pHome !== undefined && pHome >= 100) {
                    isIns = true;
                    pHome = pHome - 100;
                }

                const isLoot = mMatchObj ? isSurpriseLoot(mMatchObj.home_team, mMatchObj.away_team, mMatchObj.match_id, mMember.user_id, mMatchObj.group_stage) : false;

                const pts = userPredObj.points_earned !== null && userPredObj.points_earned !== undefined
                    ? userPredObj.points_earned
                    : (mMatchObj && mMatchObj.home_score_final !== null && mMatchObj.away_score_final !== null && pHome !== null && pAway !== null)
                        ? calculatePoints(
                            pHome,
                            pAway,
                            mMatchObj.home_score_final,
                            mMatchObj.away_score_final,
                            isGiantSlayer,
                            homeR,
                            awayR,
                            userPredObj.is_joker || false,
                            isLoot ? "" : mMatchObj.home_team,
                            isLoot ? "" : mMatchObj.away_team,
                            mMatchObj.match_id,
                            mMember.user_id,
                            isIns,
                            mMatchObj.group_stage
                        )
                        : null;

                const isSelfMember = mMember.user_id === userId;
                const hasPred = pHome !== null && pAway !== null;
                const isHidden = !isSelfMember && !isPermanentlyLocked && hasPred;

                return {
                    user_id: mMember.user_id,
                    username: profile?.username || 'Unknown',
                    home: isHidden ? null : pHome,
                    away: isHidden ? null : pAway,
                    is_joker: isHidden ? false : (userPredObj.is_joker || false),
                    is_insurance: isHidden ? false : isIns,
                    points_earned: isHidden ? null : pts,
                    has_predicted: hasPred,
                    is_hidden: isHidden,
                };
            });

            mappedList.sort((a, b) => {
                if (a.has_predicted && !b.has_predicted) return -1;
                if (!a.has_predicted && b.has_predicted) return 1;
                return a.username.localeCompare(b.username);
            });

            setOtherPredictionsMap(prev => ({ ...prev, [matchId]: mappedList }));
        } catch (err) {
            console.error("Error fetching other predictions:", err);
        } finally {
            setLoadingOtherPreds(prev => ({ ...prev, [matchId]: false }));
        }
    };

    const toggleOtherPreds = (matchId: string) => {
        const isExpanding = !expandedOtherPreds[matchId];
        setExpandedOtherPreds(prev => ({ ...prev, [matchId]: isExpanding }));
        
        if (isExpanding) {
            const targetLeagueId = selectedLeagueIdForMatch[matchId] || activeLeagueId || (joinedLeagues && joinedLeagues[0]?.league_id);
            if (targetLeagueId) {
                if (!selectedLeagueIdForMatch[matchId]) {
                    setSelectedLeagueIdForMatch(prev => ({ ...prev, [matchId]: targetLeagueId }));
                }
                fetchOtherPredictions(matchId, targetLeagueId);
            }
        }
    };

    const handleSwitchLeague = (matchId: string, newLeagueId: string) => {
        setSelectedLeagueIdForMatch(prev => ({ ...prev, [matchId]: newLeagueId }));
        fetchOtherPredictions(matchId, newLeagueId);
    };

    const [errorDialog, setErrorDialog] = useState<{
        isOpen: boolean;
        titleAr: string;
        titleEn: string;
        messageAr: string;
        messageEn: string;
        tokenType?: 'double_down' | 'underdog_specialist' | 'error' | 'info';
    }>({
        isOpen: false,
        titleAr: '',
        titleEn: '',
        messageAr: '',
        messageEn: '',
        tokenType: 'error'
    });

    const triggerDialog = (titleAr: string, titleEn: string, msgAr: string, msgEn: string, type: 'double_down' | 'underdog_specialist' | 'error' | 'info' = 'error') => {
        setErrorDialog({
            isOpen: true,
            titleAr,
            titleEn,
            messageAr: msgAr,
            messageEn: msgEn,
            tokenType: type
        });
    };

    const withScrollStabilization = async (matchId: string, buttonId: string, actionFn: () => Promise<any> | any) => {
        await actionFn();
        requestAnimationFrame(() => {
            document.getElementById(buttonId)?.focus();
        });
    };
    useEffect(() => {
        let scrollTimer: ReturnType<typeof setTimeout>;
        
        const handleScroll = () => {
            const lootCards = document.querySelectorAll('.prediction-card--loot');
            lootCards.forEach((card: any) => {
                card.style.animationPlayState = 'paused';
            });
            
            clearTimeout(scrollTimer);
            scrollTimer = setTimeout(() => {
                lootCards.forEach((card: any) => {
                    card.style.animationPlayState = 'running';
                });
            }, 150);
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        const timer = setInterval(() => {
            if (!initialChangeableMatchIdsRef.current) return;
            const nowMs = Date.now();
            let triggerReload = false;
            
            matches.forEach(m => {
                if (initialChangeableMatchIdsRef.current?.has(m.match_id)) {
                    const kickoffTime = new Date(m.kickoff_time).getTime();
                    // If kickoff is now less than 1 hour away, it's now locked
                    if (kickoffTime - nowMs < 3600000) {
                        triggerReload = true;
                    }
                }
            });

            if (triggerReload) {
                console.log("Forcing page refresh because an active match kickoff has passed the 1-hour-pre-kickoff lock threshold.");
                window.location.reload();
            }
        }, 10000); // Check every 10 seconds

        return () => clearInterval(timer);
    }, [matches]);

    useEffect(() => {
        const fetchData = async () => {
            // 1. Fetch Matches
            const round1End = '2026-06-18T18:59:59Z';
            const round2End = '2026-06-24T21:59:59Z';
            const round3End = '2026-06-28T21:59:59Z';
            const now = new Date().toISOString();

            const twoDaysInMs = 2 * 24 * 60 * 60 * 1000;
            const round1UnlockTime = new Date(round1End).getTime() - twoDaysInMs;
            const round2UnlockTime = new Date('2026-06-22T19:00:00Z').getTime(); // 10:00 PM AST on June 22nd
            const nowMs = Date.now();

            const visibleUntil = nowMs < round1UnlockTime ? round1End
                : nowMs < round2UnlockTime ? round2End
                : round3End;

            const { data: matchesData } = await supabase
                .from('matches')
                .select('*')
                .lte('kickoff_time', visibleUntil)
                .order('kickoff_time', { ascending: true });
            if (matchesData) {
                // Client-side safeguard to ensure duplicates in active matches never render
                const seen = new Set<string>();
                const uniqueFiltered: any[] = [];
                matchesData.forEach(match => {
                    if (match.match_id === '00000000-0000-0000-0000-000000000000') return;
                    if (match.group_stage?.includes('[HIDDEN]')) return;
                    const key = `${match.home_team.trim().toLowerCase()} vs ${match.away_team.trim().toLowerCase()}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        uniqueFiltered.push(match);
                    }
                });

                setMatches(prev => {
                    if (prev && prev.length > 0 && prev.length === uniqueFiltered.length) {
                        const prevKeys = prev.map(p => `${p.match_id}_${p.home_score_final}_${p.away_score_final}`).join(',');
                        const newKeys = uniqueFiltered.map(p => `${p.match_id}_${p.home_score_final}_${p.away_score_final}`).join(',');
                        if (prevKeys === newKeys) {
                            return prev;
                        }
                    }
                    return uniqueFiltered;
                });

                if (!initialChangeableMatchIdsRef.current && uniqueFiltered.length > 0) {
                    const changeable = new Set<string>();
                    const nowMs = Date.now();
                    uniqueFiltered.forEach(m => {
                        const kickoffTime = new Date(m.kickoff_time).getTime();
                        if (kickoffTime - nowMs >= 3600000) {
                            changeable.add(m.match_id);
                        }
                    });
                    initialChangeableMatchIdsRef.current = changeable;
                }
            }

            // 2. Fetch User Predictions
            const { data: { session } } = await supabase.auth.getSession();
            const user = session?.user;
            if (user) {
                setUserId(user.id);
                // Fetch User Double Down & Insurance Tokens count
                let userTokens = 0;
                let insTokens = 0;
                let baselineFromDb = false;
                try {
                    const { data: tokenRow } = await supabase
                        .from('predictions')
                        .select('predicted_home_score, predicted_away_score')
                        .eq('user_id', user.id)
                        .eq('match_id', '00000000-0000-0000-0000-000000000000')
                        .maybeSingle();

                    if (tokenRow) {
                        userTokens = Number(tokenRow.predicted_home_score || 0);
                        insTokens = Number(tokenRow.predicted_away_score || 0);
                        baselineFromDb = true;
                    } else {
                        const localTokensVal = localStorage.getItem(`DD_tokens_${user.id}`);
                        if (localTokensVal !== null) {
                            userTokens = parseInt(localTokensVal);
                        }
                        const localInsVal = localStorage.getItem(`INS_tokens_${user.id}`);
                        if (localInsVal !== null) {
                            insTokens = parseInt(localInsVal);
                        }
                    }
                } catch (tErr) {
                    console.error("Error reading token baseline counts:", tErr);
                }

                const { data: predictionsData } = await supabase
                    .from('predictions')
                    .select('*')
                    .eq('user_id', user.id);

                if (predictionsData) {
                    const predsMap: Record<string, { home: number | string; away: number | string; points_earned?: number | null; is_joker?: boolean; is_insurance?: boolean }> = {};
                    const savedMap: Record<string, boolean> = {};
                    const lootMap: Record<string, 'flat_3' | 'double_down' | 'insurance'> = {};
                    const openMap: Record<string, boolean> = {};

                    const matchMap = new Map<string, any>((matchesData || []).map(m => [m.match_id, m]));

                    // Self-healing / Recalculate deterministic correct token balances based on finalized chest games
                    let E_D = 0; // earned/claimed DD tokens
                    let E_I = 0; // earned/claimed Insurance tokens
                    let A_D = 0; // applied active DD tokens (jokers)
                    let A_I = 0; // applied active Insurance tokens

                    predictionsData.forEach(pred => {
                        if (pred.match_id === '00000000-0000-0000-0000-000000000000') return;

                        if (pred.is_joker) {
                            A_D++;
                        }
                        if (pred.predicted_home_score !== null && pred.predicted_home_score >= 100) {
                            A_I++;
                        }

                        const m = matchMap.get(pred.match_id);
                        if (m) {
                            const isLive = m.group_stage?.includes('[LIVE]');
                            const isFinished = m.home_score_final !== null && m.home_score_final !== undefined &&
                                               m.away_score_final !== null && m.away_score_final !== undefined &&
                                               !isLive;
                            if (isFinished) {
                                const hasHome = pred.predicted_home_score !== null && pred.predicted_home_score !== undefined;
                                const hasAway = pred.predicted_away_score !== null && pred.predicted_away_score !== undefined;
                                if (hasHome && hasAway) {
                                    let pHome = pred.predicted_home_score;
                                    if (pHome >= 100) pHome -= 100;
                                    
                                    const isExact = (pHome === m.home_score_final) && (pred.predicted_away_score === m.away_score_final);
                                    const isLoot = isSurpriseLoot(m.home_team, m.away_team, m.match_id, user.id, m.group_stage);
                                    const isChestClaimed = pred.points_earned !== null && pred.points_earned !== undefined;

                                    if (isLoot && isExact && isChestClaimed) {
                                        const factor = getDeterministicUserMatchFactor(user.id, m.match_id, m.group_stage);
                                        if (factor < 0.35) {
                                            E_D++;
                                        } else if (factor < 0.70) {
                                            E_I++;
                                        }
                                    }
                                }
                            }
                        }
                    });

                    // If active spent exceeds earned (due to a match reverting), clean them up in database
                    if (A_D > E_D) {
                        const activeJokerPreds = predictionsData.filter(pred => {
                            if (pred.match_id === '00000000-0000-0000-0000-000000000000') return false;
                            if (!pred.is_joker) return false;
                            const m = matchMap.get(pred.match_id);
                            if (!m) return false;
                            const isLive = m.group_stage?.includes('[LIVE]');
                            const isFinished = m.home_score_final !== null && m.home_score_final !== undefined &&
                                               m.away_score_final !== null && m.away_score_final !== undefined &&
                                               !isLive;
                            return !isFinished;
                        });

                        for (const pred of activeJokerPreds) {
                            if (A_D <= E_D) break;
                            try {
                                await supabase
                                    .from('predictions')
                                    .update({ is_joker: false })
                                    .eq('user_id', user.id)
                                    .eq('match_id', pred.match_id);
                                pred.is_joker = false;
                                A_D--;
                            } catch (e) {
                                console.error("Error healing active joker:", e);
                            }
                        }
                    }

                    if (A_I > E_I) {
                        const activeInsPreds = predictionsData.filter(pred => {
                            if (pred.match_id === '00000000-0000-0000-0000-000000000000') return false;
                            if (pred.predicted_home_score === null || pred.predicted_home_score < 100) return false;
                            const m = matchMap.get(pred.match_id);
                            if (!m) return false;
                            const isLive = m.group_stage?.includes('[LIVE]');
                            const isFinished = m.home_score_final !== null && m.home_score_final !== undefined &&
                                               m.away_score_final !== null && m.away_score_final !== undefined &&
                                               !isLive;
                            return !isFinished;
                        });

                        for (const pred of activeInsPreds) {
                            if (A_I <= E_I) break;
                            const newHome = pred.predicted_home_score - 100;
                            try {
                                await supabase
                                    .from('predictions')
                                    .update({ predicted_home_score: newHome })
                                    .eq('user_id', user.id)
                                    .eq('match_id', pred.match_id);
                                pred.predicted_home_score = newHome;
                                A_I--;
                            } catch (e) {
                                console.error("Error healing active insurance:", e);
                            }
                        }
                    }

                    const correctD = Math.max(0, E_D - A_D);
                    const correctI = Math.max(0, E_I - A_I);

                    if (userTokens !== correctD || insTokens !== correctI || !baselineFromDb) {
                        userTokens = correctD;
                        insTokens = correctI;
                        try {
                            await supabase.from('predictions').upsert({
                                match_id: '00000000-0000-0000-0000-000000000000',
                                user_id: user.id,
                                predicted_home_score: userTokens,
                                predicted_away_score: insTokens,
                            }, { onConflict: 'user_id,match_id' });
                        } catch (tErr) {
                            console.error("Error syncing correct tokens to database:", tErr);
                        }
                    }

                    localStorage.setItem(`DD_tokens_${user.id}`, userTokens.toString());
                    localStorage.setItem(`INS_tokens_${user.id}`, insTokens.toString());

                    setDoubleDownTokens(userTokens);
                    setInsuranceTokens(insTokens);

                    predictionsData.forEach(pred => {
                        if (pred.match_id === '00000000-0000-0000-0000-000000000000') return;

                        const hasHome = pred.predicted_home_score !== null && pred.predicted_home_score !== undefined;
                        const hasAway = pred.predicted_away_score !== null && pred.predicted_away_score !== undefined;
                        
                        let isInsurance = false;
                        let hScore = hasHome ? pred.predicted_home_score : '';
                        let aScore = hasAway ? pred.predicted_away_score : '';
                        if (typeof hScore === 'number' && hScore >= 100) {
                            isInsurance = true;
                            hScore = hScore - 100;
                        }

                        predsMap[pred.match_id] = {
                            home: hScore,
                            away: aScore,
                            points_earned: pred.points_earned,
                            is_joker: pred.is_joker ?? false,
                            is_insurance: isInsurance
                        };
                        savedMap[pred.match_id] = hasHome && hasAway;
                        lootMap[pred.match_id] = pred.is_joker ? 'double_down' : (isInsurance ? 'insurance' : 'flat_3');

                        const m = matchMap.get(pred.match_id);
                        const isLive = m && m.group_stage?.includes('[LIVE]');
                        const isFinished = m && m.home_score_final !== null && m.home_score_final !== undefined &&
                                           m.away_score_final !== null && m.away_score_final !== undefined &&
                                           !isLive;
                        
                        if (!isFinished) {
                            localStorage.removeItem(`open_chest_${pred.match_id}`);
                            openMap[pred.match_id] = false;
                        } else {
                            let activeSalt = 'true';
                            if (m && m.group_stage) {
                                const saltMatch = m.group_stage.match(/\[SALT:([^\]]+)\]/);
                                if (saltMatch) {
                                    activeSalt = saltMatch[1];
                                }
                            }
                            const isChestClaimed = pred.points_earned !== null && pred.points_earned !== undefined;
                            const storedChestKey = localStorage.getItem(`open_chest_${pred.match_id}`);
                            if (!isChestClaimed && storedChestKey && storedChestKey !== activeSalt) {
                                localStorage.removeItem(`open_chest_${pred.match_id}`);
                                localStorage.removeItem(`loot_result_${pred.match_id}`);
                            }
                            openMap[pred.match_id] = isChestClaimed || localStorage.getItem(`open_chest_${pred.match_id}`) !== null;
                        }
                    });

                    setPredictions(prev => {
                        const keys1 = Object.keys(prev || {}).sort().map(k => `${k}_${prev[k].home}_${prev[k].away}_${prev[k].is_joker}_${prev[k].is_insurance}`).join(',');
                        const keys2 = Object.keys(predsMap).sort().map(k => `${k}_${predsMap[k].home}_${predsMap[k].away}_${predsMap[k].is_joker}_${predsMap[k].is_insurance}`).join(',');
                        if (keys1 === keys2) {
                            return prev;
                        }
                        return predsMap;
                    });
                    setSaved(prev => {
                        const keys1 = Object.keys(prev || {}).sort().map(k => `${k}_${prev[k]}`).join(',');
                        const keys2 = Object.keys(savedMap).sort().map(k => `${k}_${savedMap[k]}`).join(',');
                        if (keys1 === keys2) {
                            return prev;
                        }
                        return savedMap;
                    });
                    setLootChoices(prev => {
                        const keys1 = Object.keys(prev || {}).sort().map(k => `${k}_${prev[k]}`).join(',');
                        const keys2 = Object.keys(lootMap).sort().map(k => `${k}_${lootMap[k]}`).join(',');
                        if (keys1 === keys2) {
                            return prev;
                        }
                        return lootMap;
                    });
                    setOpenedChests(prev => {
                        const keys1 = Object.keys(prev || {}).sort().map(k => `${k}_${prev[k]}`).join(',');
                        const keys2 = Object.keys(openMap).sort().map(k => `${k}_${openMap[k]}`).join(',');
                        if (keys1 === keys2) {
                            return prev;
                        }
                        return openMap;
                    });

                    // Fetch ALL matches to calculate overall statistics
                    const { data: allMatchesData } = await supabase
                        .from('matches')
                        .select('*');

                    if (allMatchesData) {
                        let totalPoints = 0;
                        let slayerPoints = 0;
                        let exactCount = 0;

                        const predMap = new Map<string, any>((predictionsData || []).map(p => [p.match_id, p]));

                        allMatchesData.forEach(match => {
                            if (match.match_id === '00000000-0000-0000-0000-000000000000') return;
                            if (match.group_stage?.includes('[HIDDEN]')) return;
                            const isLive = match.group_stage?.includes('[LIVE]');
                            const isFinished = match.home_score_final !== null && match.home_score_final !== undefined &&
                                               match.away_score_final !== null && match.away_score_final !== undefined;
                            
                            if (!isFinished) return;

                            const rawP = predMap.get(match.match_id);
                            const p = rawP && rawP.predicted_home_score !== null && rawP.predicted_home_score !== undefined && rawP.predicted_away_score !== null && rawP.predicted_away_score !== undefined
                                  ? rawP
                                  : { predicted_home_score: 0, predicted_away_score: 0, is_joker: false, points_earned: null };

                            const isLoot = isSurpriseLoot(match.home_team, match.away_team, match.match_id, user.id, match.group_stage);
                            let pHome = p.predicted_home_score;
                            const pAway = p.predicted_away_score;
                            
                            let isInsurance = false;
                            if (pHome !== null && pHome !== undefined && pHome >= 100) {
                                isInsurance = true;
                                pHome = pHome - 100;
                            }

                            const isExact = pHome === match.home_score_final && pAway === match.away_score_final;
                            const earnedLootChest = isLoot && isExact && !isLive;
                            // Only skip if chest not opened AND points not yet saved to DB
                            const chestOpened = !earnedLootChest || localStorage.getItem(`open_chest_${match.match_id}`) === 'true';
                            const hasDbPoints = p.points_earned !== null && p.points_earned !== undefined;
                            if (!chestOpened && !hasDbPoints) return;

                            const homeRank = match.home_rank ?? TEAM_RANKS[match.home_team] ?? 60;
                            const awayRank = match.away_rank ?? TEAM_RANKS[match.away_team] ?? 60;
                            const isGS = match.is_giant_slayer === true || 
                                         (Math.abs(homeRank - awayRank) >= 35 && (homeRank <= 20 || awayRank <= 20));

                            const pts = p.points_earned !== null && p.points_earned !== undefined
                                ? p.points_earned
                                : calculatePoints(
                                    pHome,
                                    pAway,
                                    match.home_score_final,
                                    match.away_score_final,
                                    isGS,
                                    homeRank ?? 60,
                                    awayRank ?? 60,
                                    p.is_joker ?? false,
                                    match.home_team,
                                    match.away_team,
                                    match.match_id,
                                    user.id,
                                    isInsurance,
                                    match.group_stage
                                );

                            totalPoints += pts;

                            let addedToSlayer = false;
                            if (isGS) {
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

                            if (isExact) {
                                exactCount++;
                            }
                        });

                        setUserStats(prev => {
                            if (prev && prev.totalPoints === totalPoints && prev.slayerPoints === slayerPoints && prev.exactCount === exactCount) {
                                return prev;
                            }
                            return { totalPoints, slayerPoints, exactCount };
                        });
                    }
                }
            }
        };
        fetchData();
    }, [refreshStatsCount]);

    const getFormattedDate = (dateString: string) => {
        return new Date(dateString).toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
        });
    };

    const getFormattedTime = (dateString: string) => {
        return new Date(dateString).toLocaleString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const handleScoreChange = (matchId: string, type: 'home' | 'away', value: string) => {
        const match = matches.find(m => m.match_id === matchId);
        if (match) {
            const kickoffTime = new Date(match.kickoff_time).getTime();
            const now = Date.now();
            if (kickoffTime - now < 3600000) {
                return; // Prevent score edits if less than 1 hour before kickoff
            }
        }

        if (value === '') {
            setPredictions(prev => ({
                ...prev,
                [matchId]: { ...(prev[matchId] || { home: '', away: '' }), [type]: '' }
            }));
            setSaved(prev => ({ ...prev, [matchId]: false }));
            return;
        }

        const val = parseInt(value);
        if (!isNaN(val) && val >= 0) {
            setPredictions(prev => ({
                ...prev,
                [matchId]: { ...(prev[matchId] || { home: '', away: '' }), [type]: val }
            }));
            // Mark as unsaved if they edit live score
            setSaved(prev => ({ ...prev, [matchId]: false }));
        }
    };

    const savePrediction = async (matchId: string) => {
        const match = matches.find(m => m.match_id === matchId);
        if (match) {
            const hasActualScore = match.home_score_final !== null && match.away_score_final !== null;
            if (hasActualScore) {
                triggerDialog(
                    "مباراة مكتملة",
                    "Finalized Match",
                    "هذه المباراة مكتملة ولا يمكن تعديل التوقعات!",
                    "This match is finalized and predictions can no longer be modified.",
                    "error"
                );
                return;
            }
            const kickoffTime = new Date(match.kickoff_time).getTime();
            const now = Date.now();
            if (kickoffTime - now < 3600000) {
                triggerDialog(
                    "مباراة مغلقة",
                    "Match Locked",
                    "عذراً، تم إغلاق التعديل قبل ساعة من بداية المباراة!",
                    "This match is locked and predictions can no longer be saved.",
                    "error"
                );
                return;
            }
        }

        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) {
            triggerDialog(
                "تسجيل الدخول مطلوب",
                "Login Required",
                "الرجاء تسجيل الدخول أولاً لتعديل وحفظ التوقعات!",
                "Please log in first to make or save predictions!",
                "error"
            );
            setLoading(false);
            return;
        }

        const pred = predictions[matchId];
        const homeVal = pred ? pred.home : '';
        const awayVal = pred ? pred.away : '';

        if (homeVal === '' || awayVal === '') {
            triggerDialog(
                "توقع غير مكتمل",
                "Incomplete Prediction",
                "الرجاء إدخال توقع صحيح لكلا الفريقين أولاً!",
                "Please enter a valid prediction for both teams first!",
                "error"
            );
            setLoading(false);
            return;
        }

        const currentIsJoker = pred?.is_joker ?? false;
        let currentIsInsurance = pred?.is_insurance ?? false;
        let refundTokens = insuranceTokens;

        if (currentIsInsurance && match) {
            const hScore = Number(homeVal);
            const aScore = Number(awayVal);
            const homeR = match.home_rank ?? TEAM_RANKS[match.home_team] ?? 60;
            const awayR = match.away_rank ?? TEAM_RANKS[match.away_team] ?? 60;

            const isHomeUnderdog = homeR > awayR;
            const isAwayUnderdog = awayR > homeR;

            const stillUnderdogWin = (
                (isHomeUnderdog && hScore > aScore) ||
                (isAwayUnderdog && aScore > hScore)
            );

            if (!stillUnderdogWin) {
                currentIsInsurance = false;
                refundTokens += 1;
                setInsuranceTokens(refundTokens);
                localStorage.setItem(`INS_tokens_${user.id}`, refundTokens.toString());

                await supabase.from('predictions').upsert({
                    match_id: '00000000-0000-0000-0000-000000000000',
                    user_id: user.id,
                    predicted_home_score: doubleDownTokens,
                    predicted_away_score: refundTokens
                }, { onConflict: 'user_id,match_id' });

                triggerDialog(
                    "إلغاء خبير المستضعفين",
                    "Underdog Specialist Refunded",
                    "بسبب تعديل النتيجة وعدم ترشيح الفريق الأضعف للفوز، تم إلغاء طاقة خبير المستضعفين واسترداد البطاقة!",
                    "Since your new score does not predict the underdog to win, your Underdog Specialist token was deactivated and refunded!",
                    "underdog_specialist"
                );
            }
        }

        let dbHomeVal = typeof homeVal === 'string' ? parseInt(homeVal) : homeVal;
        if (currentIsInsurance) {
            dbHomeVal += 100;
        }

        const { error } = await supabase.from('predictions').upsert({
            match_id: matchId,
            user_id: user.id,
            predicted_home_score: dbHomeVal,
            predicted_away_score: typeof awayVal === 'string' ? parseInt(awayVal) : awayVal,
            is_joker: currentIsJoker,
        }, { onConflict: 'user_id,match_id' });

        if (!error) {
            setSaved(prev => ({ ...prev, [matchId]: true }));
            setPredictions(prev => ({
                ...prev,
                [matchId]: { ...(prev[matchId] || { home: homeVal, away: awayVal }), is_joker: currentIsJoker, is_insurance: currentIsInsurance }
            }));
            setRefreshStatsCount(prev => prev + 1);
        } else {
            console.error("Error saving prediction:", error);
            triggerDialog(
                "خطأ في الحفظ",
                "Save Error",
                "حدث خطأ أثناء حفظ التوقعات! الرجاء المحاولة مجدداً.",
                "Error saving prediction! Please try again.",
                "error"
            );
        }
        setLoading(false);
    };

    return (
        <div className="predictions-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.5rem' }}>
            <h2 className="section-title" style={{ fontFamily: isAr ? 'Cairo, system-ui' : undefined }}>{t('myPredictionsTitle')}</h2>
            <button 
                onClick={() => setShowRules(p => !p)} 
                style={{
                    backgroundColor: 'rgba(201,168,76,0.1)',
                    border: '1px solid var(--gold)',
                    color: 'var(--gold)',
                    fontFamily: isAr ? 'Cairo, system-ui' : 'Bebas Neue',
                    letterSpacing: isAr ? 'normal' : '0.05em',
                    fontSize: '0.9rem',
                    padding: '0.4rem 1rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                }}
            >
                {showRules ? t('hideRules') : t('viewRules')}
            </button>
        </div>

        {showRules && (
            <div className="rules-panel-container" style={{
                backgroundColor: 'var(--surface)',
                border: '1px dashed var(--gold)',
                borderRadius: 'var(--radius)',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                marginBottom: '1rem',
                animation: 'fadeUp 0.3s ease'
            }}>
                <h3 className="rules-main-title" style={{ fontFamily: isAr ? 'Cairo, system-ui' : 'Bebas Neue', color: 'var(--gold)', fontSize: '1.25rem', letterSpacing: isAr ? 'normal' : '0.05em', margin: 0, textAlign: isAr ? 'right' : 'left' }}>
                    {t('rulesHeader')}
                </h3>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', textAlign: isAr ? 'right' : 'left' }}>
                    <div className="rules-box rules-box-standard">
                        <h4 className="rules-sub-title" style={{ fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '0.3rem' }}>{t('rulesStandardTitle')}</h4>
                        <ul className="rules-list" style={{ fontSize: '0.8rem', paddingLeft: isAr ? 0 : '1.1rem', paddingRight: isAr ? '1.1rem' : 0, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <li><strong className="rules-highlight-blue">{isAr ? '٥ نقاط' : '5 Points'}</strong>: {t('rulesStandard1')}</li>
                            <li><strong className="rules-highlight-blue">{isAr ? 'نقطتان' : '2 Points'}</strong>: {t('rulesStandard2')}</li>
                            <li><strong className="rules-highlight-red">{isAr ? '٠ نقاط' : '0 Points'}</strong>: {t('rulesStandard3')}</li>
                            <li><strong className="rules-highlight-green">{t('rulesStandard4')} </ strong></li>
                        </ul>
                    </div>

                    <div className="rules-box rules-box-slayer">
                        <h4 className="rules-sub-title" style={{ fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.25rem', justifyContent: isAr ? 'flex-start' : 'unset' }}>{t('rulesSlayerTitle')}</h4>
                        <p className="rules-desc" style={{ fontSize: '0.78rem', lineHeight: '1.4' }}>
                            {t('rulesSlayerDesc')}
                        </p>
                        <ul className="rules-list" style={{ fontSize: '0.78rem', paddingLeft: isAr ? 0 : '1.1rem', paddingRight: isAr ? '1.1rem' : 0, marginTop: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            <li>{t('rulesSlayer1')}</li>
                            <li>{t('rulesSlayer2')}</li>
                            <li className="rules-warning-item" style={{ listStyleType: 'none', marginLeft: isAr ? 0 : '-1.1rem', marginRight: isAr ? '-1.1rem' : 0 }}>{t('rulesSlayerWarn')}</li>
                        </ul>
                    </div>

                    <div className="rules-box rules-box-underdog">
                        <h4 className="rules-sub-title" style={{ fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '0.3rem' }}>{t('rulesUnderdogHeader')}</h4>
                        <p className="rules-desc" style={{ fontSize: '0.78rem', marginBottom: '0.25rem' }}>
                            {t('rulesUnderdogDesc')}
                        </p>
                    </div>

                    <div className="rules-box rules-box-loot">
                        <h4 className="rules-sub-title" style={{ fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.25rem', justifyContent: isAr ? 'flex-start' : 'unset' }}>
                            🎁 {isAr ? "دليل صناديق الغنائم المفاجئة" : "Surprise Loot Guide"}
                        </h4>
                        <p className="rules-desc" style={{ fontSize: '0.78rem', marginBottom: '0.25rem', lineHeight: '1.4' }}>
                            {isAr 
                                ? "بعض المباريات المميزة تمنحك فرصة ربح غنائم عشوائية هائلة، ولكن فقط إذا نجحت في توقع النتيجة الدقيقة للمباراة بشكل صحيح!" 
                                : "Special matches offer a thrilling chance to claim a random surprise bonus, but ONLY if you successfully predict the exact final score!"}
                        </p>
                        <ul className="rules-list" style={{ fontSize: '0.76rem', paddingLeft: isAr ? 0 : '1.1rem', paddingRight: isAr ? '1.1rem' : 0, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                            <li>
                                <strong>{isAr ? "١. ابحث عن الشعار:" : "1. Spot the Badge:"}</strong>{" "}
                                {isAr ? "ابحث عن لقاء يحمل شعار صندوق الغنائم 🎁 والتوهج الذهبي." : "Look for matches marked with the 🎁 SURPRISE LOOT badge & golden glow."}
                            </li>
                            <li>
                                <strong>{isAr ? "٢. توقع النتيجة بدقة:" : "2. Get the Exact Score:"}</strong>{" "}
                                {isAr ? "سجّل توقعك لنتيجة المباراة وأمّنه قبل بدء اللقاء. يجب أن تُصيب النتيجة الصحيحة تماماً للتأهل لكسب الصندوق!" : "Submit & lock in your score prediction. You must get the score perfectly right to earn the chest!"}
                            </li>
                        </ul>
                    </div>

                    <div className="rules-box rules-box-knockout" style={{
                        border: '1px solid #10b981',
                        borderRadius: '6px',
                        padding: '0.75rem',
                        backgroundColor: 'rgba(16, 185, 129, 0.05)',
                        gridColumn: 'span 1'
                    }}>
                        <h4 className="rules-sub-title" style={{
                            fontWeight: 'bold',
                            fontSize: '0.85rem',
                            marginBottom: '0.3rem',
                            color: '#34d399',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            justifyContent: isAr ? 'flex-start' : 'unset'
                        }}>
                            🏆 {isAr ? "مضاعف دور خروج المغلوب" : "Knockout Stage Double Points"}
                        </h4>
                        <p className="rules-desc" style={{ fontSize: '0.78rem', marginBottom: '0.25rem', lineHeight: '1.4', color: '#a7f3d0' }}>
                            {isAr 
                                ? "في جميع مباريات الأدوار الإقصائية (خروج المغلوب)، يتم مضاعفة النقاط الأساسية تلقائياً!" 
                                : "For all knockout stage matches (Round of 16, Quarter-finals, Semi-finals, and Final), all base points are automatically doubled!"}
                        </p>
                        <ul className="rules-list" style={{ fontSize: '0.76rem', paddingLeft: isAr ? 0 : '1.1rem', paddingRight: isAr ? '1.1rem' : 0, display: 'flex', flexDirection: 'column', gap: '0.2rem', color: '#a7f3d0' }}>
                            <li>
                                <strong style={{ color: '#34d399' }}>{isAr ? "١٠ نقاط" : "10 Points"}</strong>: {isAr ? "للتوقع الصحيح للنتيجة الدقيقة (بدلاً من ٥ نقاط)." : "For guessing the exact score (instead of 5 pts)."}
                            </li>
                            <li>
                                <strong style={{ color: '#34d399' }}>{isAr ? "٤ نقاط" : "4 Points"}</strong>: {isAr ? "لتوقع فائز صحيح أو تعادل ولكن بنتيجة خاطئة (بدلاً من نقطتين)." : "For guessing correct outcome but incorrect score (instead of 2 pts)."}
                            </li>
                            <li style={{ listStyleType: 'none', marginLeft: isAr ? 0 : '-1.1rem', marginRight: isAr ? '-1.1rem' : 0, fontSize: '0.72rem', opacity: 0.85, marginTop: '0.25rem' }}>
                                💡 {isAr ? "ملاحظة: تُحسب مضاعفات قاهر العمالقة والـ Double Down بشكل تراكمي فوق هذه النقاط الإقصائية!" : "Note: Giant Slayer and Double Down multipliers apply cumulatively on top of these doubled knockout points!"}
                            </li>
                        </ul>
                    </div>

                    <div className="rules-box rules-box-tokens" style={{ 
                        border: '1px solid var(--gold)', 
                        borderRadius: '6px', 
                        padding: '0.75rem', 
                        backgroundColor: 'rgba(201, 168, 76, 0.05)',
                        gridColumn: 'span 1'
                    }}>
                        <h4 className="rules-sub-title" style={{ 
                            fontWeight: 'bold', 
                            fontSize: '0.85rem', 
                            marginBottom: '0.35rem', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.3rem', 
                            color: 'var(--gold)', 
                            justifyContent: isAr ? 'flex-start' : 'unset' 
                        }}>
                            🤠 {isAr ? "طاقات اللعب والبطاقات الفعّالة" : "Power-Up Tokens Guide"}
                        </h4>
                        <p className="rules-desc" style={{ fontSize: '0.78rem', marginBottom: '0.4rem', lineHeight: '1.4' }}>
                            {isAr 
                                ? "لقد ربحت أو يمكنك ربح بطاقات قوة مميزة بنجاحك في فتح صناديق الغنائم المفاجئة 🎁! إليك كيفية استخدام طاقاتها وتأثيرها:" 
                                : "You can earn or apply active tokens when you crack open Surprise Loot boxes 🎁! Here is how to unleash their specific bonuses:"}
                        </p>
                        <ul className="rules-list" style={{ fontSize: '0.76rem', paddingLeft: isAr ? 0 : '1.1rem', paddingRight: isAr ? '1.1rem' : 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <li style={{ listStyleType: 'none', marginLeft: isAr ? 0 : '-1.1rem', marginRight: isAr ? '-1.1rem' : 0, borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '0.4rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 'bold', color: '#38bdf8', fontSize: '0.8rem', marginBottom: '0.15rem' }}>
                                    <span>🤠</span> 
                                    <span>{isAr ? "خبير المستضعفين (المتوفر لديك: " + insuranceTokens + ")" : "Underdog Specialist (Available: " + insuranceTokens + ")"}</span>
                                </div>
                                <span style={{ opacity: 0.9, lineHeight: '1.4' }}>
                                    {isAr 
                                        ? "تُطبق على أي مباراة عادية أو مواجهة قاهر العمالقة ⚡ (لا تُطبق على مباريات الغنائم 🎁) بشرط أن تتوقع فوز الفريق الأضعف تقيماً بالنقاط. عند صحة توقع فوزهم أو نتيجتهم الدقيقة، تكسب +3 نقاط إضافية! هذه النقاط تُضاف مباشرة لنقاطك الإجمالية ونقاط قاهر العمالقة (Slayer Points) حتى لو لم تكن المباراة مصنفة كـقاهر العمالقة (Giant Slayer)!" 
                                        : "Apply to any standard or Giant Slayer game ⚡ (not applicable to Surprise Loot games 🎁), provided you predict the Underdog to win. If correct (either correct winning outcome or exact score), you get a flat +3 points added instantly! These points count for overall standings AND slayer points ranking."}
                                </span>
                            </li>
                            <li style={{ listStyleType: 'none', marginLeft: isAr ? 0 : '-1.1rem', marginRight: isAr ? '-1.1rem' : 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 'bold', color: '#f59e0b', fontSize: '0.8rem', marginBottom: '0.15rem' }}>
                                    <span>🔋</span> 
                                    <span>{isAr ? "مضاعفة النقاط (المتوفر لديك: " + doubleDownTokens + ")" : "Double Down (Available: " + doubleDownTokens + ")"}</span>
                                </div>
                                <span style={{ opacity: 0.9, lineHeight: '1.4' }}>
                                    {isAr 
                                        ? "تُطبق على أي مباراة عادية أو مواجهة قاهر العمالقة ⚡ (لا تُطبق على مباريات الغنائم 🎁) لتضاعف إجمالي مساهمتك ونقاطك المكتسبة من تلك المباراة بنسبة x2 بالكامل (مثال: توقع صحيح بدقة ٥ يصبح ١٠ نقاط، وتوقع فائز صحيح ٢ يصبح ٤ نقاط)!" 
                                        : "Apply to any standard or Giant Slayer game ⚡ (not applicable to Surprise Loot games 🎁). It doubles (x2) your entire earned points for that match (e.g. 5 pts exact becomes 10 pts, or 2 pts outcome becomes 4 pts)!"}
                                </span>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        )}

        {userStats && (
            <div style={{
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 'var(--radius)',
                padding: '1.25rem',
                marginBottom: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                boxShadow: 'inset 0 0 12px rgba(255, 255, 255, 0.01)',
                direction: isAr ? 'rtl' : 'ltr'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{
                        margin: 0,
                        fontSize: '1rem',
                        fontWeight: 'semibold',
                        fontFamily: isAr ? 'Cairo, system-ui' : 'Bebas Neue',
                        letterSpacing: isAr ? 'normal' : '0.05em',
                        color: 'var(--gold)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem'
                    }}>
                        👤 {isAr ? "إحصائيات توقعاتك العامة" : "Your Prediction Performance"}
                    </h3>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem' }}>
                    {/* Standard Points Box */}
                    <div style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        borderRadius: '8px',
                        padding: '0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem'
                    }}>
                        <div style={{
                            backgroundColor: 'rgba(201,168,76,0.1)',
                            border: '1px solid var(--gold)',
                            borderRadius: '6px',
                            minWidth: '36px',
                            height: '36px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.1rem'
                        }}>
                            🏆
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--grey)', fontWeight: 'medium' }}>
                                {isAr ? "النقاط الإجمالية" : "Total Points"}
                            </span>
                            <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--white)', fontFamily: 'JetBrains Mono', lineHeight: 1.2 }}>
                                {userStats.totalPoints}
                            </span>
                        </div>
                    </div>

                    {/* Slayer Points Box */}
                    <div style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        borderRadius: '8px',
                        padding: '0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem'
                    }}>
                        <div style={{
                            backgroundColor: 'rgba(168, 85, 247, 0.1)',
                            border: '1px solid #c084fc',
                            borderRadius: '6px',
                            minWidth: '36px',
                            height: '36px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.1rem'
                        }}>
                            ⚡
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--grey)', fontWeight: 'medium' }}>
                                {isAr ? "نقاط قاهر العمالقة" : "Slayer Points"}
                            </span>
                            <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#c084fc', fontFamily: 'JetBrains Mono', lineHeight: 1.2 }}>
                                {userStats.slayerPoints}
                            </span>
                        </div>
                    </div>

                    {/* Exact Solutions Box */}
                    <div style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        borderRadius: '8px',
                        padding: '0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem'
                    }}>
                        <div style={{
                            backgroundColor: 'rgba(14, 165, 233, 0.1)',
                            border: '1px solid #38bdf8',
                            borderRadius: '6px',
                            minWidth: '36px',
                            height: '36px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.1rem'
                        }}>
                            🎯
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--grey)', fontWeight: 'medium' }}>
                                {isAr ? "توقعات دقيقة" : "Exact Forecasts"}
                            </span>
                            <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#38bdf8', fontFamily: 'JetBrains Mono', lineHeight: 1.2 }}>
                                {userStats.exactCount}
                            </span>
                        </div>
                    </div>

                    {/* Double Down Tokens Box */}
                    {doubleDownTokens > 0 && (
                        <div style={{
                            backgroundColor: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid rgba(255, 255, 255, 0.05)',
                            borderRadius: '8px',
                            padding: '0.85rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem'
                        }}>
                            <div style={{
                                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                                border: '1px solid #f59e0b',
                                borderRadius: '6px',
                                minWidth: '36px',
                                height: '36px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '1.1rem'
                            }}>
                                🔋
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: '0.72rem', color: 'var(--grey)', fontWeight: 'medium' }}>
                                    {isAr ? "مضاعفة النقاط" : "Double Down"}
                                </span>
                                <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#f59e0b', fontFamily: 'JetBrains Mono', lineHeight: 1.2 }}>
                                    {doubleDownTokens}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Underdog Specialist Tokens Box */}
                    {insuranceTokens > 0 && (
                        <div style={{
                            backgroundColor: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid rgba(255, 255, 255, 0.05)',
                            borderRadius: '8px',
                            padding: '0.85rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem'
                        }}>
                            <div style={{
                                backgroundColor: 'rgba(56, 189, 248, 0.1)',
                                border: '1px solid #38bdf8',
                                borderRadius: '6px',
                                minWidth: '36px',
                                height: '36px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '1.1rem'
                            }}>
                                🤠
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: '0.72rem', color: 'var(--grey)', fontWeight: 'medium' }}>
                                    {isAr ? "خبير المستضعفين" : "Underdog Specialist"}
                                </span>
                                <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#38bdf8', fontFamily: 'JetBrains Mono', lineHeight: 1.2 }}>
                                    {insuranceTokens}
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}

        {matches.length === 0 ? (
            <div className="empty-state">
            <span className="empty-icon">⚽</span>
            <p>{t('notPredicted')}</p>
            </div>
        ) : (() => {
            const upcomingMatches = matches.filter(m => {
                const isLive = m.group_stage?.includes('[LIVE]');
                return m.home_score_final === null || m.away_score_final === null || isLive;
            });
            const finishedMatches = matches.filter(m => {
                const isLive = m.group_stage?.includes('[LIVE]');
                return m.home_score_final !== null && m.away_score_final !== null && !isLive;
            });

            // Sort upcoming matches chronologically ascending (first upcoming game shown first)
            upcomingMatches.sort((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime());

            // Sort finished matches chronologically descending (most recently finished on top/first in the finished section)
            finishedMatches.sort((a, b) => new Date(b.kickoff_time).getTime() - new Date(a.kickoff_time).getTime());

            const sortedMatches = [...upcomingMatches, ...finishedMatches];

            return (
                <div className="predictions-list">
                    {/* Notice informing users that finished games are at the bottom */}
                    {finishedMatches.length > 0 && (
                        <div 
                            className="finished-games-notice"
                            style={{
                                direction: isAr ? 'rtl' : 'ltr',
                                justifyContent: 'flex-start'
                            }}
                        >
                            <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>💡</span>
                            <span style={{ textAlign: isAr ? 'right' : 'left' }}>
                                {isAr 
                                    ? "ملاحظة: يمكنك العثور على المباريات المنتهية وتوقعاتك السابقة في أسفل الصفحة."
                                    : "Note: Finished games and your past predictions are located at the bottom of the page."
                                }
                            </span>
                        </div>
                    )}
                {sortedMatches.map((m, index) => {
                    const mIsLive = m.group_stage?.includes('[LIVE]');
                    const mIsFinished = m.home_score_final !== null && m.away_score_final !== null && !mIsLive;
                    const isFirstFinishedMatch = mIsFinished && (index === 0 || !(() => {
                        const prev = sortedMatches[index - 1];
                        const prevIsFinished = prev && prev.home_score_final !== null && prev.away_score_final !== null && !prev.group_stage?.includes('[LIVE]');
                        return prevIsFinished;
                    })());
                    const shouldHideFinishedCard = mIsFinished && isRound1Collapsed;
                    const renderActiveUpcomingHeader = index === 0 && !mIsFinished && finishedMatches.length > 0;

                    if (shouldHideFinishedCard) {
                        return (
                            <React.Fragment key={m.match_id}>
                                {isFirstFinishedMatch && (
                                    <div 
                                        onClick={() => setIsRound1Collapsed(false)}
                                        className="collapsible-finished-header"
                                        style={{ direction: isAr ? 'rtl' : 'ltr' }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <span style={{ fontSize: '1.5rem' }}>🏁</span>
                                            <div style={{ textAlign: isAr ? 'right' : 'left' }}>
                                                <h4 className="header-title">
                                                    {isAr ? "المباريات المنتهية" : "Finished Matches"}
                                                </h4>
                                                <p className="header-subtitle">
                                                    {isAr ? `${finishedMatches.length} مباراة - انقر للتوسيع وعرض التوقعات الماضية` : `${finishedMatches.length} matches - Click to expand and view past predictions`}
                                                </p>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span className="header-action-text">
                                                {isAr ? "عرض" : "Show"}
                                            </span>
                                            <span className="header-arrow" style={{ transform: 'rotate(0deg)', transition: 'transform 0.2s' }}>
                                                ▼
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </React.Fragment>
                        );
                    }

                    const rawPred = predictions[m.match_id];
                const homeR = m.home_rank ?? TEAM_RANKS[m.home_team] ?? 60;
                const awayR = m.away_rank ?? TEAM_RANKS[m.away_team] ?? 60;
                const isGiantSlayer = m.is_giant_slayer === true || 
                                      (Math.abs(homeR - awayR) >= 35 && (homeR <= 20 || awayR <= 20));

                const kickoffTime = new Date(m.kickoff_time).getTime();
                const now = Date.now();
                const canChangeIfLocked = kickoffTime - now >= 3600000;
                const isPermanentlyLocked = !canChangeIfLocked;

                const hasRawPred = !!(rawPred && rawPred.home !== '' && rawPred.away !== '' && saved[m.match_id]);
                const isDefaulted00 = isPermanentlyLocked && !hasRawPred;

                const pred = isDefaulted00 ? {
                    home: 0,
                    away: 0,
                    is_joker: false, 
                    is_insurance: false,
                    points_earned: m.home_score_final !== null && m.away_score_final !== null ? calculatePoints(
                        0,
                        0,
                        m.home_score_final,
                        m.away_score_final,
                        isGiantSlayer,
                        homeR,
                        awayR,
                        false,
                        m.home_team,
                        m.away_team,
                        m.match_id,
                        userId,
                        false,
                        m.group_stage
                    ) : null
                } : (rawPred || { home: '', away: '' });

                const isSaved = hasRawPred || isDefaulted00;
                const isLive = m.group_stage?.includes('[LIVE]');
                const hasActualScore = m.home_score_final !== null && m.away_score_final !== null;
                const isDisabled = isPermanentlyLocked || hasActualScore;
                const isInputsDisabled = isDisabled || isSaved;

                // Underdogs are the team with the higher rank value
                const isHomeUnderdog = homeR > awayR;
                const isAwayUnderdog = awayR > homeR;

                const hasSurpriseLoot = isSurpriseLoot(m.home_team, m.away_team, m.match_id, userId, m.group_stage);

                const livePoints = isLive && isSaved ? calculatePoints(
                    Number(pred.home),
                    Number(pred.away),
                    m.home_score_final,
                    m.away_score_final,
                    isGiantSlayer,
                    homeR,
                    awayR,
                    pred.is_joker ?? false,
                    m.home_team,
                    m.away_team,
                    m.match_id,
                    userId,
                    pred.is_insurance,
                    m.group_stage
                ) : 0;

                const isExact = isLive && isSaved && (Number(pred.home) === m.home_score_final) && (Number(pred.away) === m.away_score_final);

                const basePointsIfExact = isExact && hasSurpriseLoot ? calculatePoints(
                    Number(pred.home),
                    Number(pred.away),
                    m.home_score_final,
                    m.away_score_final,
                    isGiantSlayer,
                    homeR,
                    awayR,
                    pred.is_joker ?? false,
                    "",
                    "",
                    m.match_id,
                    userId,
                    pred.is_insurance,
                    m.group_stage
                ) : livePoints;

                const showDD = !hasSurpriseLoot;
                const showIns = !hasSurpriseLoot && (isHomeUnderdog || isAwayUnderdog);

                return (
                    <React.Fragment key={m.match_id}>
                        {isFirstFinishedMatch && (
                            <div 
                                onClick={() => setIsRound1Collapsed(true)}
                                className="expanded-finished-header"
                                style={{ direction: isAr ? 'rtl' : 'ltr' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <span style={{ fontSize: '1.5rem' }}>🏁</span>
                                    <div style={{ textAlign: isAr ? 'right' : 'left' }}>
                                        <h4 className="header-title">
                                            {isAr ? "المباريات المنتهية" : "Finished Matches"}
                                        </h4>
                                        <p className="header-subtitle">
                                            {isAr ? `${finishedMatches.length} مباراة - انقر للإخفاء` : `${finishedMatches.length} matches - Click to collapse`}
                                        </p>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span className="header-action-text">
                                        {isAr ? "إخفاء" : "Collapse"}
                                    </span>
                                    <span className="header-arrow" style={{ transform: 'rotate(180deg)', transition: 'transform 0.2s' }}>
                                        ▼
                                    </span>
                                </div>
                            </div>
                        )}

                        {renderActiveUpcomingHeader && (
                            <div style={{
                                margin: '0.5rem 0 1.25rem 0',
                                textAlign: isAr ? 'right' : 'left',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                borderBottom: '1px solid rgba(255,255,255,0.08)',
                                paddingBottom: '0.6rem',
                                width: '100%',
                            }}>
                                <span style={{ fontSize: '1.25rem' }}>📅</span>
                                <h3 style={{
                                    margin: 0,
                                    fontSize: '1.15rem',
                                    fontWeight: 'bold',
                                    color: 'var(--gold)',
                                    fontFamily: isAr ? 'Cairo, system-ui' : 'inherit'
                                }}>
                                    {isAr ? "المباريات النشطة والمقبلة" : "Active & Upcoming Matches"}
                                </h3>
                            </div>
                        )}

                        <div
                        id={`match-card-${m.match_id}`}
                        className={`prediction-card ${isSaved ? 'prediction-card--saved' : ''} ${isGiantSlayer ? 'prediction-card--giant' : ''} ${hasSurpriseLoot ? 'prediction-card--loot' : ''} ${isDisabled ? 'prediction-card--locked' : ''}`}
                        style={{ 
                            flexDirection: 'column', 
                            alignItems: 'stretch', 
                            gap: '1rem',
                            paddingTop: (isGiantSlayer || hasSurpriseLoot) ? '2rem' : '1.2rem'
                        }}
                        >
                       {/* Header showing Kickoff Time and Locked Status */}
                    <div className="prediction-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <span className="flex flex-col sm:flex-row sm:items-baseline gap-y-0.5 sm:gap-x-1.5">
                            <span>🏟️ {m.kickoff_time ? getFormattedDate(m.kickoff_time) : (isAr ? 'لم يحدد الوقت' : 'Time TBD')}</span>
                            {m.kickoff_time && (
                                <span className="ps-6 sm:ps-0 text-zinc-400 sm:text-inherit">
                                    {getFormattedTime(m.kickoff_time)}
                                </span>
                            )}
                            {m.location && (
                                <span className="ps-6 sm:ps-0 text-zinc-500">
                                    {` • ${m.location}`}
                                </span>
                            )}
                        </span>
                        {isLive ? (
                            <span style={{ color: '#F59E0B', display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 'bold', marginLeft: isAr ? 'unset' : 'auto', marginRight: isAr ? 'auto' : 'unset', textAlign: isAr ? 'left' : 'right', justifyContent: isAr ? 'flex-start' : 'flex-end', animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} className="animate-pulse">
                                🔴 {isAr ? "مباشر حالياً" : "LIVE (IN PROGRESS)"}
                            </span>
                        ) : hasActualScore ? (
                            <span style={{ color: '#10B981', display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 'bold', marginLeft: isAr ? 'unset' : 'auto', marginRight: isAr ? 'auto' : 'unset', textAlign: isAr ? 'left' : 'right', justifyContent: isAr ? 'flex-start' : 'flex-end' }}>
                                🏁 {isAr ? "انتهت المباراة" : "MATCH FINISHED"}
                            </span>
                        ) : isPermanentlyLocked ? (
                            <span style={{ color: isDefaulted00 ? '#94a3b8' : '#EF4444', display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 'bold', marginLeft: isAr ? 'unset' : 'auto', marginRight: isAr ? 'auto' : 'unset', textAlign: isAr ? 'left' : 'right', justifyContent: isAr ? 'flex-start' : 'flex-end' }}>
                                🔒 {isDefaulted00 ? (isAr ? "تلقائي (0-0)" : "DEFAULTED (0-0)") : (isAr ? "مغلق (مؤمن)" : "LOCKED (CLOSED)")}
                            </span>
                        ) : isSaved ? (
                            <span className="pred-status-locked-in" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: '600', marginLeft: isAr ? 'unset' : 'auto', marginRight: isAr ? 'auto' : 'unset', textAlign: isAr ? 'left' : 'right', justifyContent: isAr ? 'flex-start' : 'flex-end' }}>
                                {isAr ? "تم تأكيد التوقع (يُغلق باب التعديلات قبل ساعة واحدة من انطلاق المباراة)" : "✓ Prediction Locked In (Edits close 1h before kickoff)"}
                            </span>
                        ) : (
                            <span className="pred-status-open" style={{ marginLeft: isAr ? 'unset' : 'auto', marginRight: isAr ? 'auto' : 'unset', textAlign: isAr ? 'left' : 'right', justifyContent: isAr ? 'flex-start' : 'flex-end' }}>
                                {isAr ? "🟢 التوقعات مفتوحة حالياً" : "🟢 Open for predictions"}
                            </span>
                        )}
                    </div>

                    <div className="pred-content-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.5rem', flexWrap: 'wrap' }}>
                        {isGiantSlayer && (
                            <div className="giant-badge" style={{ top: '-11px', right: isAr ? 'unset' : '15px', left: isAr ? '15px' : 'unset' }}>
                            <span className="giant-badge-icon">⚡</span>
                            <span>{isAr ? "قاهر العمالقة" : "GIANT SLAYER"}</span>
                            </div>
                        )}

                        {hasSurpriseLoot && (
                            <div className="loot-badge" style={{ top: '-11px', right: isAr ? 'unset' : '15px', left: isAr ? '15px' : 'unset' }}>
                                <span className="loot-badge-emoji">🎁</span>
                                <span>{isAr ? "غنائم مفاجئة" : "SURPRISE LOOT"}</span>
                                <span className="loot-badge-emoji">🎁</span>
                            </div>
                        )}

                        <div className="pred-inputs" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {/* Row 1: Team Info Headers (aligned horizontally and centered over their respective inputs) */}
                            <div style={{ display: 'flex', width: '100%', alignItems: 'flex-end' }}>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                                    <span className="animated-flag" style={{ fontSize: '1.6rem', marginBottom: '0.1rem' }}>
                                        {getFlagEmoji(m.home_team)}
                                    </span>
                                    <label className="pred-label">
                                        {tTeam(m.home_team)}
                                        {homeR != null && (
                                            <span style={{ fontSize: '0.75rem', color: 'var(--gold, #C9A84C)', marginLeft: isAr ? 0 : '0.25rem', marginRight: isAr ? '0.25rem' : 0, fontWeight: 'normal' }}>
                                                ({homeR})
                                            </span>
                                        )}
                                        {isHomeUnderdog && (isGiantSlayer || !hasSurpriseLoot || !!predictions[m.match_id]?.is_insurance) && (
                                            <span style={{ display: 'block', fontSize: '0.65rem', color: '#c084fc', marginTop: '0.15rem', fontWeight: 'bold', letterSpacing: '0.05em' }}>
                                                🛡️ {isAr ? "الأضعف تقييمًا" : "UNDERDOG"}
                                            </span>
                                        )}
                                    </label>
                                </div>

                                {/* Dash Placeholder to align columns perfectly */}
                                <span style={{ visibility: 'hidden', padding: '0 0.5rem', fontSize: '1.2rem', userSelect: 'none' }}>—</span>

                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                                    <span className="animated-flag" style={{ fontSize: '1.6rem', marginBottom: '0.1rem' }}>
                                        {getFlagEmoji(m.away_team)}
                                    </span>
                                    <label className="pred-label">
                                        {tTeam(m.away_team)}
                                        {awayR != null && (
                                            <span style={{ fontSize: '0.75rem', color: 'var(--gold, #C9A84C)', marginLeft: isAr ? 0 : '0.25rem', marginRight: isAr ? '0.25rem' : 0, fontWeight: 'normal' }}>
                                                ({awayR})
                                            </span>
                                        )}
                                        {isAwayUnderdog && (isGiantSlayer || !hasSurpriseLoot || !!predictions[m.match_id]?.is_insurance) && (
                                            <span style={{ display: 'block', fontSize: '0.65rem', color: '#c084fc', marginTop: '0.15rem', fontWeight: 'bold', letterSpacing: '0.05em' }}>
                                                🛡️ {isAr ? "الأضعف تقييمًا" : "UNDERDOG"}
                                            </span>
                                        )}
                                    </label>
                                </div>
                            </div>

                            {/* Row 2: Score Inputs and Dash (perfectly aligned horizontally) */}
                            <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: '0.75rem', justifyContent: 'center' }}>
                                <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                                    <input
                                        className="pred-input"
                                        type="number"
                                        min="0"
                                        placeholder="-"
                                        value={pred.home ?? ''}
                                        onChange={(e) => handleScoreChange(m.match_id, 'home', e.target.value)}
                                        disabled={isInputsDisabled}
                                    />
                                </div>

                                <span className="pred-dash">—</span>

                                <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                                    <input
                                        className="pred-input"
                                        type="number"
                                        min="0"
                                        placeholder="-"
                                        value={pred.away ?? ''}
                                        onChange={(e) => handleScoreChange(m.match_id, 'away', e.target.value)}
                                        disabled={isInputsDisabled}
                                    />
                                </div>
                            </div>
                        </div>

                        <button
                        className={`pred-btn ${isSaved ? 'pred-btn--saved' : ''} ${isGiantSlayer ? 'pred-btn--giant' : ''}`}
                        onClick={() => {
                            if (isSaved && canChangeIfLocked) {
                                setSaved(prev => ({ ...prev, [m.match_id]: false }));
                            } else {
                                savePrediction(m.match_id);
                            }
                        }}
                        disabled={loading || isDisabled}
                        >
                        {hasActualScore ? (isAr ? 'مكتملة' : 'Completed') : isSaved ? (canChangeIfLocked ? t('editPredictionBtn') : (isAr ? '🔒 مؤمن' : '🔒 Locked In')) : (isAr ? 'حفظ 💾' : 'Lock In')}
                        </button>
                    </div>

                    {isSaved && !hasActualScore && canChangeIfLocked && (showDD || showIns) && (
                        <div style={{
                            marginTop: '0.6rem',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '0.5rem',
                            width: '100%',
                            transition: 'all 0.3s ease',
                            display: 'flex',
                        }}>
                            {/* Double Down Button */}
                            {showDD && (
                            <button
                                id={`btn-double-down-${m.match_id}`}
                                type="button"
                                onClick={async () => {
                                    await withScrollStabilization(m.match_id, `btn-double-down-${m.match_id}`, async () => {
                                        const currentMatch = matches.find(matchObj => matchObj.match_id === m.match_id) || m;
                                        const isFinalized = currentMatch.home_score_final !== null && currentMatch.away_score_final !== null;
                                        const kickoffTime = new Date(currentMatch.kickoff_time).getTime();
                                        const now = Date.now();
                                        const canToggle = (kickoffTime - now >= 3600000) && !isFinalized;

                                        if (!canToggle) {
                                            triggerDialog(
                                                "المضاعف مغلق",
                                                "Multiplier Locked",
                                                "عذراً، هذه المباراة مغلقة أو مكتملة ولا يمكن تعديل بطاقة المضاعفة الخاصة بها!",
                                                "Sorry, this match is locked or finalized and its multiplier token cannot be modified!",
                                                "error"
                                            );
                                            return;
                                        }

                                        const { data: { session } } = await supabase.auth.getSession();
                                        const user = session?.user;
                                        if (!user) return;

                                        const isCurrentlyJoker = predictions[m.match_id]?.is_joker ?? false;

                                        if (isCurrentlyJoker) {
                                            // Refund token
                                            let homeVal = predictions[m.match_id]?.home ?? '';
                                            let awayVal = predictions[m.match_id]?.away ?? '';
                                            const newTokens = doubleDownTokens + 1;

                                            // Optimistic UI updates
                                            setDoubleDownTokens(newTokens);
                                            localStorage.setItem(`DD_tokens_${user.id}`, newTokens.toString());
                                            setPredictions(prev => ({
                                                ...prev,
                                                [m.match_id]: { ...(prev[m.match_id] || { home: homeVal, away: awayVal }), is_joker: false }
                                            }));
                                            setSaved(prev => ({ ...prev, [m.match_id]: true }));

                                            await supabase.from('predictions').upsert({
                                                match_id: '00000000-0000-0000-0000-000000000000',
                                                user_id: user.id,
                                                predicted_home_score: newTokens,
                                                predicted_away_score: insuranceTokens
                                             }, { onConflict: 'user_id,match_id' });

                                            await supabase.from('predictions').upsert({
                                                match_id: m.match_id,
                                                user_id: user.id,
                                                predicted_home_score: typeof homeVal === 'string' ? (homeVal !== '' ? parseInt(homeVal) : null) : homeVal,
                                                predicted_away_score: typeof awayVal === 'string' ? (awayVal !== '' ? parseInt(awayVal) : null) : awayVal,
                                                is_joker: false
                                            }, { onConflict: 'user_id,match_id' });

                                            setRefreshStatsCount(prev => prev + 1);
                                        } else {
                                            // Deduct token
                                            if (doubleDownTokens > 0) {
                                                const newTokens = doubleDownTokens - 1;

                                                // If Insurance is active, refund it!
                                                const isCurrentlyInsured = predictions[m.match_id]?.is_insurance ?? false;
                                                let refundInsCount = insuranceTokens;
                                                if (isCurrentlyInsured) {
                                                    refundInsCount += 1;
                                                }

                                                let homeVal = predictions[m.match_id]?.home ?? '';
                                                let awayVal = predictions[m.match_id]?.away ?? '';

                                                // Optimistic UI updates
                                                setDoubleDownTokens(newTokens);
                                                localStorage.setItem(`DD_tokens_${user.id}`, newTokens.toString());
                                                if (isCurrentlyInsured) {
                                                    setInsuranceTokens(refundInsCount);
                                                    localStorage.setItem(`INS_tokens_${user.id}`, refundInsCount.toString());
                                                }
                                                setPredictions(prev => ({
                                                    ...prev,
                                                    [m.match_id]: { ...(prev[m.match_id] || { home: homeVal, away: awayVal }), is_joker: true, is_insurance: false }
                                                }));
                                                setSaved(prev => ({ ...prev, [m.match_id]: true }));

                                                await supabase.from('predictions').upsert({
                                                    match_id: m.match_id,
                                                    user_id: user.id,
                                                    predicted_home_score: typeof homeVal === 'string' ? parseInt(homeVal) : homeVal,
                                                    predicted_away_score: typeof awayVal === 'string' ? parseInt(awayVal) : awayVal,
                                                    is_joker: true
                                                }, { onConflict: 'user_id,match_id' });

                                                await supabase.from('predictions').upsert({
                                                    match_id: '00000000-0000-0000-0000-000000000000',
                                                    user_id: user.id,
                                                    predicted_home_score: newTokens,
                                                    predicted_away_score: refundInsCount
                                                }, { onConflict: 'user_id,match_id' });

                                                setRefreshStatsCount(prev => prev + 1);
                                            } else {
                                                triggerDialog(
                                                    "بطاقات غير كافية",
                                                    "Insufficient Tokens",
                                                    "ليس لديك بطاقات مضاعفة كافية! شارك في مباريات الغنائم المفاجئة وافتح الصناديق لتكسب المزيد.",
                                                    "You don't have enough Double Down tokens! Participate in Surprise Loot matches & open chests to earn more.",
                                                    "double_down"
                                                );
                                            }
                                        }
                                    });
                                }}
                                style={{
                                    backgroundColor: (predictions[m.match_id]?.is_joker) ? 'rgba(168, 85, 247, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                                    border: (predictions[m.match_id]?.is_joker) ? '1px solid #c084fc' : '1px dashed rgba(255, 255, 255, 0.15)',
                                    color: (predictions[m.match_id]?.is_joker) ? '#c084fc' : 'var(--grey)',
                                    height: '36px',
                                    padding: '0 1rem',
                                    borderRadius: '6px',
                                    fontSize: '0.78rem',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.4rem',
                                    transition: 'all 0.2s',
                                    outline: 'none',
                                    width: '100%',
                                    opacity: (doubleDownTokens > 0 || predictions[m.match_id]?.is_joker) ? 1 : 0.55
                                }}
                                className="hover:scale-[1.02] active:scale-95"
                            >
                                {(predictions[m.match_id]?.is_joker) ? (
                                    <>
                                        <span>🔋</span>
                                        <strong>{isAr ? "مضاعف نشط (x2)" : "Double Down Active (x2)"}</strong>
                                        <span style={{ fontSize: '0.65rem', marginLeft: '0.2rem', color: 'rgba(239, 68, 68, 0.8)', fontWeight: 'normal' }}>
                                            {isAr ? "(استرداد)" : "(Refund)"}
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <span>🔋</span>
                                        <span>
                                            {isAr 
                                                ? `تفعيل المضاعفة (المتاح: ${doubleDownTokens})` 
                                                : `Apply Double Down (Tokens: ${doubleDownTokens})`
                                            }
                                        </span>
                                    </>
                                )}
                            </button>
                            )}

                            {/* Underdog Specialist Button */}
                            {showIns && (
                            <button
                                id={`btn-underdog-${m.match_id}`}
                                type="button"
                                onClick={async () => {
                                    await withScrollStabilization(m.match_id, `btn-underdog-${m.match_id}`, async () => {
                                        const currentMatch = matches.find(matchObj => matchObj.match_id === m.match_id) || m;
                                        const isFinalized = currentMatch.home_score_final !== null && currentMatch.away_score_final !== null;
                                        const kickoffTime = new Date(currentMatch.kickoff_time).getTime();
                                        const now = Date.now();
                                        const canToggle = (kickoffTime - now >= 3600000) && !isFinalized;

                                        if (!canToggle) {
                                            triggerDialog(
                                                "المستضعف مغلق",
                                                "Underdog Locked",
                                                "عذراً، هذه المباراة مغلقة أو مكتملة ولا يمكن تعديل طاقة خبير المستضعفين الخاصة بها!",
                                                "Sorry, this match is locked or finalized and its Underdog Specialist token cannot be modified!",
                                                "error"
                                            );
                                            return;
                                        }

                                        const { data: { session } } = await supabase.auth.getSession();
                                        const user = session?.user;
                                        if (!user) return;

                                        const isCurrentlyInsured = predictions[m.match_id]?.is_insurance ?? false;

                                        if (!isCurrentlyInsured) {
                                            // User wants to activate. Checking eligibility:
                                            const homeVal = predictions[m.match_id]?.home ?? '';
                                            const awayVal = predictions[m.match_id]?.away ?? '';

                                            const hScoreNum = homeVal !== '' ? Number(homeVal) : null;
                                            const aScoreNum = awayVal !== '' ? Number(awayVal) : null;

                                            const homeR = m.home_rank ?? TEAM_RANKS[m.home_team] ?? 60;
                                            const awayR = m.away_rank ?? TEAM_RANKS[m.away_team] ?? 60;

                                            const isHomeUnderdog = homeR > awayR;
                                            const isAwayUnderdog = awayR > homeR;

                                            const hasPredictedUnderdogToWin = (hScoreNum !== null && aScoreNum !== null) && (
                                                (isHomeUnderdog && hScoreNum > aScoreNum) ||
                                                (isAwayUnderdog && aScoreNum > hScoreNum)
                                            );

                                            if (!isHomeUnderdog && !isAwayUnderdog) {
                                                triggerDialog(
                                                    "لا يوجد فريق أضعف",
                                                    "No Clear Underdog",
                                                    "لا تحتوي هذه المباراة على فئة مستضعفة واضحة بناءً على رتب الفرق المتوفرة!",
                                                    "This match does not have a clear underdog based on team ranks!",
                                                    "info"
                                                );
                                                return;
                                            }

                                            if (!hasPredictedUnderdogToWin) {
                                                const underdogTeamName = isHomeUnderdog ? m.home_team : m.away_team;
                                                triggerDialog(
                                                    "تنبيه خبير المستضعفين",
                                                    "Underdog Specialist Requirement",
                                                    `يمكنك تفعيل طاقة خبير المستضعفين فقط عند ترشيح فوز الفريق الأضعف (${tTeam(underdogTeamName)})! يرجى إدخال توقع صحيح بفوزهم أولاً.`,
                                                    `You can only apply the Underdog Specialist token if you predict the underdog (${tTeam(underdogTeamName)}) to win! Please update your scores prediction first.`,
                                                    "underdog_specialist"
                                                );
                                                return;
                                            }
                                        }

                                        if (isCurrentlyInsured) {
                                            // Refund token
                                            const newInsTokens = insuranceTokens + 1;
                                            let homeVal = predictions[m.match_id]?.home ?? '';
                                            let awayVal = predictions[m.match_id]?.away ?? '';

                                            // Optimistic UI updates
                                            setInsuranceTokens(newInsTokens);
                                            localStorage.setItem(`INS_tokens_${user.id}`, newInsTokens.toString());
                                            setPredictions(prev => ({
                                                ...prev,
                                                [m.match_id]: { ...(prev[m.match_id] || { home: homeVal, away: awayVal }), is_insurance: false }
                                            }));
                                            setSaved(prev => ({ ...prev, [m.match_id]: true }));

                                            await supabase.from('predictions').upsert({
                                                match_id: '00000000-0000-0000-0000-000000000000',
                                                user_id: user.id,
                                                predicted_home_score: doubleDownTokens,
                                                predicted_away_score: newInsTokens
                                            }, { onConflict: 'user_id,match_id' });

                                            await supabase.from('predictions').upsert({
                                                match_id: m.match_id,
                                                user_id: user.id,
                                                predicted_home_score: typeof homeVal === 'string' ? parseInt(homeVal) : homeVal,
                                                predicted_away_score: typeof awayVal === 'string' ? parseInt(awayVal) : awayVal,
                                                is_joker: predictions[m.match_id]?.is_joker ?? false
                                            }, { onConflict: 'user_id,match_id' });

                                            setRefreshStatsCount(prev => prev + 1);
                                        } else {
                                            // Deduct token
                                            if (insuranceTokens > 0) {
                                                const newInsTokens = insuranceTokens - 1;

                                                // If Double Down is active, refund it!
                                                const isCurrentlyJoker = predictions[m.match_id]?.is_joker ?? false;
                                                let refundDDTokens = doubleDownTokens;
                                                if (isCurrentlyJoker) {
                                                    refundDDTokens += 1;
                                                }

                                                let homeVal = predictions[m.match_id]?.home ?? '';
                                                let awayVal = predictions[m.match_id]?.away ?? '';
                                                let dbHomeVal = (typeof homeVal === 'string' ? parseInt(homeVal) : homeVal) + 100;

                                                // Optimistic UI updates
                                                setInsuranceTokens(newInsTokens);
                                                localStorage.setItem(`INS_tokens_${user.id}`, newInsTokens.toString());
                                                if (isCurrentlyJoker) {
                                                    setDoubleDownTokens(refundDDTokens);
                                                    localStorage.setItem(`DD_tokens_${user.id}`, refundDDTokens.toString());
                                                }
                                                setPredictions(prev => ({
                                                    ...prev,
                                                    [m.match_id]: { ...(prev[m.match_id] || { home: homeVal, away: awayVal }), is_insurance: true, is_joker: false }
                                                }));
                                                setSaved(prev => ({ ...prev, [m.match_id]: true }));

                                                await supabase.from('predictions').upsert({
                                                    match_id: m.match_id,
                                                    user_id: user.id,
                                                    predicted_home_score: dbHomeVal,
                                                    predicted_away_score: typeof awayVal === 'string' ? parseInt(awayVal) : awayVal,
                                                    is_joker: false
                                                }, { onConflict: 'user_id,match_id' });

                                                await supabase.from('predictions').upsert({
                                                    match_id: '00000000-0000-0000-0000-000000000000',
                                                    user_id: user.id,
                                                    predicted_home_score: refundDDTokens,
                                                    predicted_away_score: newInsTokens
                                                }, { onConflict: 'user_id,match_id' });

                                                setRefreshStatsCount(prev => prev + 1);
                                            } else {
                                                triggerDialog(
                                                    "بطاقات غير كافية",
                                                    "Insufficient Tokens",
                                                    "ليس لديك بطاقات خبير المستضعفين كافية! افتح صناديق الغنائم المفاجئة لكسب المزيد.",
                                                    "You don't have enough Underdog Specialist tokens! Open Surprise Loot chests to earn them.",
                                                    "underdog_specialist"
                                                );
                                            }
                                        }
                                    });
                                }}
                                style={{
                                    backgroundColor: (predictions[m.match_id]?.is_insurance) ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                                    border: (predictions[m.match_id]?.is_insurance) ? '1px solid #38bdf8' : '1px dashed rgba(255, 255, 255, 0.15)',
                                    color: (predictions[m.match_id]?.is_insurance) ? '#38bdf8' : 'var(--grey)',
                                    height: '36px',
                                    padding: '0 1rem',
                                    borderRadius: '6px',
                                    fontSize: '0.78rem',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.4rem',
                                    transition: 'all 0.2s',
                                    outline: 'none',
                                    width: '100%',
                                    opacity: (insuranceTokens > 0 || predictions[m.match_id]?.is_insurance) ? 1 : 0.55
                                }}
                                className="hover:scale-[1.02] active:scale-95"
                            >
                                {(predictions[m.match_id]?.is_insurance) ? (
                                    <>
                                         <span>🤠</span>
                                         <strong>{isAr ? "خبير المستضعفين نشط" : "Underdog Specialist Active"}</strong>
                                         <span style={{ fontSize: '0.65rem', marginLeft: '0.2rem', color: 'rgba(239, 68, 68, 0.8)', fontWeight: 'normal' }}>
                                             {isAr ? "(استرداد)" : "(Refund)"}
                                         </span>
                                    </>
                                ) : (
                                    <>
                                         <span>🤠</span>
                                         <span>
                                             {isAr 
                                                 ? `تفعيل خبير المستضعفين (المتاح: ${insuranceTokens})` 
                                                 : `Apply Underdog Specialist (Tokens: ${insuranceTokens})`
                                             }
                                         </span>
                                    </>
                                )}
                            </button>
                            )}
                        </div>
                    )}

                    {isSaved && !hasActualScore && !canChangeIfLocked && (predictions[m.match_id]?.is_joker) && (
                        <div style={{
                            marginTop: '0.6rem',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            width: '100%'
                        }}>
                            <div style={{
                                backgroundColor: 'rgba(168, 85, 247, 0.08)',
                                border: '1px solid rgba(168, 85, 247, 0.4)',
                                color: '#c084fc',
                                padding: '0.4rem 1rem',
                                borderRadius: '6px',
                                fontSize: '0.78rem',
                                fontWeight: 'bold',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem'
                            }}>
                                🔒 <span>🔋</span>
                                <span>{isAr ? "تم تأمين مضاعف النقاط x2 للمباراة!" : "Double Down Multiplier Locked In (x2)!"}</span>
                            </div>
                        </div>
                    )}

                    {isSaved && !hasActualScore && !canChangeIfLocked && (predictions[m.match_id]?.is_insurance) && (
                        <div style={{
                            marginTop: '0.6rem',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            width: '100%'
                        }}>
                            <div style={{
                                backgroundColor: 'rgba(56, 189, 248, 0.08)',
                                border: '1px solid rgba(56, 189, 248, 0.4)',
                                color: '#38bdf8',
                                padding: '0.4rem 1rem',
                                borderRadius: '6px',
                                fontSize: '0.78rem',
                                fontWeight: 'bold',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem'
                            }}>
                                🔒 <span>🤠</span>
                                <span>{isAr ? "تم تأمين طاقة خبير المستضعفين للمباراة!" : "Underdog Specialist Locked In!"}</span>
                            </div>
                        </div>
                    )}

                    {hasSurpriseLoot && !hasActualScore && (
                        <div className="loot-selection-container" style={{
                            marginTop: '0.4rem',
                            padding: '1rem',
                            backgroundColor: 'rgba(245, 158, 11, 0.04)',
                            border: '1px solid rgba(245, 158, 11, 0.18)',
                            borderRadius: '8px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.4rem',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textAlign: 'center',
                            direction: isAr ? 'rtl' : 'ltr',
                            position: 'relative'
                        }}>
                            {isSaved ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
                                    <div style={{ 
                                        fontSize: '1.6rem', 
                                        display: 'inline-block'
                                    }}>🎁🔒</div>
                                    <span style={{ fontSize: '0.78rem', fontWeight: 'bold', color: '#f59e0b' }}>
                                        {isAr ? "تم تأمين صندوق الغنائم الغامض! 🎁" : "Surprise Mystery Chest Secured! 🎁"}
                                    </span>
                                    <span style={{ fontSize: '0.67rem', color: 'var(--grey)', opacity: 0.85, maxWidth: '340px', lineHeight: '1.4' }}>
                                        {isAr 
                                            ? "لقد تم تحديد جائزتك العشوائية سراً خلف الكواليس. إذا كنت قد توقعت النتيجة الدقيقة للمباراة بشكل صحيح، فستتمكن من فتح الصندوق فور انتهاء اللقاء وكشف غنائمك المتوافرة!" 
                                            : "Your random surprise reward has been assigned. If you successfully guess the exact score of this match, you will unlock this chest once the game ends to reveal your bonus!"
                                        }
                                    </span>
                                </div>
                            ) : rollingMatchId === m.match_id ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', padding: '0.4rem' }}>
                                    <div className="loot-spinning-cube" style={{
                                        fontSize: '1.6rem',
                                        display: 'inline-block'
                                    }}>
                                        🎁
                                    </div>
                                    <span style={{ fontSize: '0.82rem', fontWeight: 'bold', color: 'var(--gold)', letterSpacing: '0.05em' }}>
                                        🎰 {isAr ? "جاري سحب جائزتك العشوائية..." : "ROLLING YOUR SURPRISE LOOT..."}
                                    </span>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                                    <div style={{ 
                                        fontSize: '1.6rem', 
                                        display: 'inline-block'
                                    }}>🎁</div>
                                    <span style={{ fontSize: '0.78rem', fontWeight: 'bold', color: '#f59e0b' }}>
                                        {isAr ? "صندوق هدايا عشوائي نشط لهذه المباراة!" : "Surprise Loot Active!"}
                                    </span>
                                    <p style={{ fontSize: '0.67rem', color: 'var(--grey)', margin: '0 0 0.2rem 0', maxWidth: '340px', lineHeight: '1.3' }}>
                                        {isAr ? "قم بتأمين توقعك الدقيق. إذا أصبت النتيجة الصحيحة تماماً للمباراة، فستربح الصندوق وتكشف جائزته العشوائية عند صافرة النهاية!" : "Lock in your prediction. If your exact score guess is correct, you'll earn this chest to unlock your surprise reward after the final whistle!"}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Dynamic Real-time Underdog eligibility checker (under prediction card) */}
                    {isGiantSlayer && !hasActualScore && (
                        <div className="eligibility-banner">
                            <span>
                                ⚡ <strong>{isAr ? "حالة مضاعفات النقاط" : "Double Point Status"}</strong>: {
                                    pred.home === '' || pred.away === '' ? (
                                        <span className="eligibility-text-none">
                                            {isAr ? "أدخل توقعًا لتحديد أهلية مضاعف النقاط x2." : "Enter a prediction to evaluate x2 multiplier eligibility."}
                                        </span>
                                    ) : (isHomeUnderdog && Number(pred.home) >= Number(pred.away)) || (isAwayUnderdog && Number(pred.away) >= Number(pred.home)) ? (
                                        <span className="eligibility-text-eligible" style={{ fontWeight: 'bold' }}>
                                            {isAr ? "مؤهل لربح طاقة نقاط مضاعفة! (لقد توقعت تعادل أو فوز الفريق الأضعف)" : "Eligible for DOUBLE points! (You predicted the Underdog to Win or Draw)"}
                                        </span>
                                    ) : (
                                        <span className="eligibility-text-standard" style={{ fontWeight: 'bold' }}>
                                            {isAr ? "نقاط أساسية عادية فقط. (لقد توقعت فوز الفريق الأقوى المفضل. لتفعيل طاقة مضاعف x2 عليك ترشيح تعادل أو فوز الفريق الأضعف)" : "Standard Points only. (You predicted the Favorite to win. Select Underdog Draw or Underdog Win to qualify for x2 points multiplier!)"}
                                        </span>
                                    )
                                }
                            </span>
                        </div>
                    )}

                    {/* Show actual final scores & calculated points feedback */}
                    {hasActualScore && (
                        hasSurpriseLoot && isSaved && !isLive && (Number(pred.home) === m.home_score_final && Number(pred.away) === m.away_score_final) && !openedChests[m.match_id] ? (
                            <div className="loot-selection-container unopened-chest-card" style={{
                                marginTop: '0.5rem',
                                padding: '1.25rem',
                                backgroundColor: 'rgba(245, 158, 11, 0.04)',
                                border: '2px solid rgba(245, 158, 11, 0.35)',
                                borderRadius: '8px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}>
                                {openingChestId === m.match_id ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', padding: '0.5rem' }}>
                                        <div style={{ 
                                            fontSize: '3.5rem', 
                                            display: 'inline-block',
                                            animation: 'chestShake 0.15s ease-in-out infinite'
                                        }}>
                                            🎁
                                        </div>
                                        <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--gold)', letterSpacing: '0.05em' }}>
                                            🔓 {isAr ? "جاري فتح صندوق الغنائم..." : "UNLOCKING SURPRISE CHEST..."}
                                        </span>
                                        <p style={{ fontSize: '0.7rem', color: 'var(--grey)' }}>
                                            {isAr ? "جاري احتساب النقاط والكشف عن الجائزة العشوائية!" : "Unsealing your gift box & matching results..."}
                                        </p>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', width: '100%' }}>
                                         <div style={{
                                             fontSize: '3.2rem',
                                             display: 'inline-block'
                                         }}>
                                             📦
                                         </div>
                                         <span style={{ fontSize: '0.86rem', fontWeight: 'bold', color: '#f59e0b', letterSpacing: '0.02em' }}>
                                             ✨ {isAr ? "لديك صندوق غنائم غير مفتوح!" : "You have an Unopened Chest!"}
                                         </span>
                                         <p style={{ fontSize: '0.72rem', color: 'var(--grey)', margin: '0 0 0.4rem 0', maxWidth: '350px', lineHeight: '1.4' }}>
                                             {isAr 
                                                 ? "لقد انتهى اللقاء! صُنعت هذه المباراة خصيصاً لتمنحك مفاجأة بالنقاط. اضغط أدناه لفتح الصندوق ومعرفة جائزتك واكتساب نقاطك فوراً!" 
                                                 : "The match is finalized! This exclusive game is packed with hidden goodies. Click below to open your chest and unlock your score!"
                                             }
                                         </p>
                                         <button
                                             type="button"
                                             onClick={async () => {
                                                 setOpeningChestId(m.match_id);
                                                 // Shake for 0.6 seconds to create a snappy interactive suspense
                                                 await new Promise(resolve => setTimeout(resolve, 600));

                                                 const activeUserId = userId;
                                                 if (activeUserId) {
                                                     const factor = getDeterministicUserMatchFactor(activeUserId, m.match_id, m.group_stage);
                                                     let newPoints = 0;
                                                     if (factor < 0.35) {
                                                         // Gained a Double Down token:
                                                         newPoints = calculatePoints(
                                                             Number(pred.home),
                                                             Number(pred.away),
                                                             m.home_score_final,
                                                             m.away_score_final,
                                                             m.is_giant_slayer === true,
                                                             m.home_rank ?? 60,
                                                             m.away_rank ?? 60,
                                                             false,
                                                             "",
                                                             ""
                                                         );

                                                         const newTokens = doubleDownTokens + 1;
                                                         setDoubleDownTokens(newTokens);
                                                         localStorage.setItem(`DD_tokens_${activeUserId}`, newTokens.toString());
                                                         localStorage.setItem(`loot_result_${m.match_id}`, 'double_down_token');

                                                         // Optimistically update local predictions state so points and reward text show up instantly
                                                         setPredictions(prev => ({
                                                             ...prev,
                                                             [m.match_id]: {
                                                                 ...prev[m.match_id],
                                                                 points_earned: newPoints
                                                             }
                                                         }));

                                                         // Background database writes
                                                         supabase.from('predictions').upsert({
                                                             match_id: '00000000-0000-0000-0000-000000000000',
                                                             user_id: activeUserId,
                                                             predicted_home_score: newTokens,
                                                             predicted_away_score: insuranceTokens
                                                         }, { onConflict: 'user_id,match_id' }).then(() => {});

                                                         supabase
                                                             .from('predictions')
                                                             .update({
                                                                 is_joker: false,
                                                                 points_earned: newPoints
                                                             })
                                                             .eq('user_id', activeUserId)
                                                             .eq('match_id', m.match_id)
                                                             .then(() => {
                                                                 setRefreshStatsCount(prev => prev + 1);
                                                             });
                                                     } else if (factor < 0.70) {
                                                         // Gained a Safeguard Insurance token:
                                                         newPoints = calculatePoints(
                                                             Number(pred.home),
                                                             Number(pred.away),
                                                             m.home_score_final,
                                                             m.away_score_final,
                                                             m.is_giant_slayer === true,
                                                             m.home_rank ?? 60,
                                                             m.away_rank ?? 60,
                                                             false,
                                                             "",
                                                             ""
                                                         );

                                                         const newInsTokens = insuranceTokens + 1;
                                                         setInsuranceTokens(newInsTokens);
                                                         localStorage.setItem(`INS_tokens_${activeUserId}`, newInsTokens.toString());
                                                         localStorage.setItem(`loot_result_${m.match_id}`, 'insurance_token');

                                                         // Optimistically update local predictions state so points and reward text show up instantly
                                                         setPredictions(prev => ({
                                                             ...prev,
                                                             [m.match_id]: {
                                                                 ...prev[m.match_id],
                                                                 points_earned: newPoints
                                                             }
                                                         }));

                                                         // Background database writes
                                                         supabase.from('predictions').upsert({
                                                             match_id: '00000000-0000-0000-0000-000000000000',
                                                             user_id: activeUserId,
                                                             predicted_home_score: doubleDownTokens,
                                                             predicted_away_score: newInsTokens
                                                         }, { onConflict: 'user_id,match_id' }).then(() => {});

                                                         supabase
                                                             .from('predictions')
                                                             .update({
                                                                 is_joker: false,
                                                                 points_earned: newPoints
                                                             })
                                                             .eq('user_id', activeUserId)
                                                             .eq('match_id', m.match_id)
                                                             .then(() => {
                                                                 setRefreshStatsCount(prev => prev + 1);
                                                             });
                                                     } else {
                                                         // Gained Flat +3 Points:
                                                         newPoints = calculatePoints(
                                                             Number(pred.home),
                                                             Number(pred.away),
                                                             m.home_score_final,
                                                             m.away_score_final,
                                                             m.is_giant_slayer === true,
                                                             m.home_rank ?? 60,
                                                             m.away_rank ?? 60,
                                                             false,
                                                             m.home_team,
                                                             m.away_team,
                                                             m.match_id,
                                                             activeUserId,
                                                             false,
                                                             m.group_stage
                                                         );
                                                         localStorage.setItem(`loot_result_${m.match_id}`, 'flat_3');

                                                         // Optimistically update local predictions state so points and reward text show up instantly
                                                         setPredictions(prev => ({
                                                             ...prev,
                                                             [m.match_id]: {
                                                                 ...prev[m.match_id],
                                                                 points_earned: newPoints
                                                             }
                                                         }));

                                                         // Background database writes
                                                         supabase
                                                             .from('predictions')
                                                             .update({
                                                                 is_joker: false,
                                                                 points_earned: newPoints
                                                             })
                                                             .eq('user_id', activeUserId)
                                                             .eq('match_id', m.match_id)
                                                             .then(() => {
                                                                 setRefreshStatsCount(prev => prev + 1);
                                                             });
                                                     }
                                                 }

                                                 let activeSalt = 'true';
                                                  if (m.group_stage) {
                                                      const saltMatch = m.group_stage.match(/\[SALT:([^\]]+)\]/);
                                                      if (saltMatch) {
                                                          activeSalt = saltMatch[1];
                                                      }
                                                  }
                                                  localStorage.setItem(`open_chest_${m.match_id}`, activeSalt);
                                                 setOpeningChestId(null);
                                                 setOpenedChests(prev => ({ ...prev, [m.match_id]: true }));
                                                 setRefreshStatsCount(prev => prev + 1);
                                             /*`
                                                            m.away_rank ?? 60,
                                                            false,
                                                            m.home_team,
                                                            m.away_team,
                                                            m.match_id,
                                                            user.id
                                                        );
                                                        localStorage.setItem(`loot_result_${m.match_id}`, 'flat_3');

                                                        await supabase
                                                            .from('predictions')
                                                            .update({
                                                                is_joker: false,
                                                                points_earned: newPoints
                                                            })
                                                            .eq('user_id', user.id)
                                                            .eq('match_id', m.match_id);
                                                    }
                                                }

                                                localStorage.setItem(`open_chest_${m.match_id}`, 'true');
                                                setOpeningChestId(null);
                                                setOpenedChests(prev => ({ ...prev, [m.match_id]: true }));
                                                setRefreshStatsCount(prev => prev + 1);
                                            */}}
                                            style={{
                                                backgroundColor: '#f59e0b',
                                                color: '#fff',
                                                fontFamily: isAr ? 'Cairo, system-ui' : 'Bebas Neue',
                                                letterSpacing: isAr ? 'normal' : '0.08em',
                                                fontSize: '0.92rem',
                                                fontWeight: 'bold',
                                                padding: '0.55rem 1.85rem',
                                                borderRadius: '25px',
                                                border: 'none',
                                                cursor: 'pointer',
                                                boxShadow: '0 5px 15px rgba(245, 158, 11, 0.4)',
                                                transition: 'all 0.2s',
                                            }}
                                            className="hover:scale-105 active:scale-95Fast"
                                        >
                                            {isAr ? "افتح الصندوق والتمس الربح 🎰" : "Open Chest & Reveal 🎰"}
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div 
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-y-2 gap-x-4"
                                style={{
                                    marginTop: '0.5rem',
                                    padding: '0.75rem',
                                    borderRadius: '6px',
                                    backgroundColor: isLive 
                                        ? 'rgba(217, 119, 6, 0.08)' 
                                        : pred.points_earned && pred.points_earned > 0 
                                            ? 'rgba(16, 185, 129, 0.1)' 
                                            : 'rgba(239, 68, 68, 0.05)',
                                    border: isLive
                                        ? '1px solid rgba(217, 119, 6, 0.25)'
                                        : pred.points_earned && pred.points_earned > 0 
                                            ? '1px solid rgba(16, 185, 129, 0.2)' 
                                            : '1px solid rgba(239, 68, 68, 0.1)',
                                }}
                            >
                                <span style={{ fontSize: '0.85rem', color: 'var(--grey)' }}>
                                    {isLive ? (
                                        <>{isAr ? "النتيجة المباشرة:" : "Live Score (In Progress):"} <strong style={{ color: 'var(--white)' }}>{m.home_score_final} - {m.away_score_final}</strong></>
                                    ) : (
                                        <>🏁 {isAr ? "النتيجة النهائية للمباراة:" : "Actual Match Score:"} <strong style={{ color: 'var(--white)' }}>{m.home_score_final} - {m.away_score_final}</strong></>
                                    )}
                                </span>
                                <span style={{
                                    fontSize: '0.9rem',
                                    fontWeight: 'bold',
                                    color: isLive 
                                        ? 'var(--gold)' 
                                        : pred.points_earned && pred.points_earned > 0 
                                            ? '#10B981' 
                                            : '#a1a1aa',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.25rem'
                                }}>
                                    {isLive ? (
                                        <>
                                            {isAr ? "النقاط المتوقعة في هذه اللحظة:" : "Current Live Points:"} {' '}
                                            {hasSurpriseLoot && isExact ? (
                                                <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>
                                                    {basePointsIfExact} + 🎁 {isAr ? "جائزة الصندوق المحتملة!" : "Potential Chest Reward!"}
                                                </span>
                                            ) : (
                                                <strong>{livePoints}</strong>
                                            )}
                                        </>
                                    ) : pred.points_earned && pred.points_earned > 0 ? (
                                        <>
                                            🎉 {pred.points_earned} {isAr ? "نقاط" : "Points"} {
                                                (hasSurpriseLoot && Number(pred.home) === m.home_score_final && Number(pred.away) === m.away_score_final) ? (() => {
                                                    const factorVal = getDeterministicUserMatchFactor(userId, m.match_id, m.group_stage);
                                                    if (factorVal < 0.35) {
                                                        return isAr ? '(🎁 غنائم مفاجئة: تم ربح بطاقة مضاعفة 🔋!)' : '(🎁 Surprise Loot: Earned 1x Double Down Token!)';
                                                    } else if (factorVal < 0.70) {
                                                        return isAr ? '(🎁 غنائم مفاجئة: تم ربح بطاقة خبير المستضعفين 🤠!)' : '(🎁 Surprise Loot: Earned 1x Underdog Specialist Token! 🤠)';
                                                    } else {
                                                        return isAr ? '(🎁 غنائم مفاجئة: تم إضافة +٣ نقاط مضمونة!)' : '(🎁 Surprise Loot: Flat +3 Points added!)';
                                                    }
                                                })() : pred.points_earned >= 10 ? (isAr ? '(نتيجة دقيقة لمباراة قاهر العمالقة ⚡ x2!)' : '(⚡ GIANT SLAYER DOUBLE EXACT!)') : 
                                                pred.points_earned === 5 ? (isAr ? '(نتيجة دقيقة)' : '(Exact Score)') : 
                                                pred.points_earned === 4 ? (isAr ? '(فوز الفريق الأضعف قاهر العمالقة ⚡ x2!)' : '(⚡ GIANT SLAYER DOUBLE OUTCOME!)') : 
                                                (isAr ? '(توقع عام صحيح)' : '(Outcome)')
                                            }
                                        </>
                                    ) : (
                                        isAr ? '٠ نقاط (التوقع غير صحيح)' : '0 Points (Incorrect)'
                                    )}
                                </span>
                            </div>
                        )
                    )}

                    {/* Collapsible Group Predictions Section */}
                    {isDisabled && (
                        <div style={{
                            marginTop: '0.75rem',
                            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                            paddingTop: '0.75rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem',
                            width: '100%',
                        }}>
                            {/* Toggle Button */}
                            <button
                                onClick={() => toggleOtherPreds(m.match_id)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem',
                                    width: '100%',
                                    padding: '0.5rem',
                                    borderRadius: '6px',
                                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                                    border: '1px solid var(--border-color)',
                                    color: 'var(--white)',
                                    fontSize: '0.813rem',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    outline: 'none',
                                }}
                                className="hover:bg-[rgba(255,255,255,0.05)] active:scale-[0.98]"
                            >
                                👥 {expandedOtherPreds[m.match_id] ? t('hideGroupPredictions') : t('seeGroupPredictions')}
                                <span style={{ 
                                    fontSize: '0.7rem', 
                                    transition: 'transform 0.2s',
                                    transform: expandedOtherPreds[m.match_id] ? 'rotate(180deg)' : 'rotate(0deg)'
                                }}>▼</span>
                            </button>

                            {/* Collapsible Drawer Container */}
                            <AnimatePresence>
                                {expandedOtherPreds[m.match_id] && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                                        style={{ overflow: 'hidden' }}
                                    >
                                        <div style={{
                                            padding: '1rem',
                                            borderRadius: '8px',
                                            backgroundColor: 'rgba(0, 0, 0, 0.2)',
                                            border: '1px solid rgba(255, 255, 255, 0.04)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.75rem',
                                            marginTop: '0.25rem',
                                        }}>
                                            {/* Header with League Filter Selector */}
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                flexWrap: 'wrap',
                                                gap: '0.5rem',
                                                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                                                paddingBottom: '0.5rem',
                                            }}>
                                                <span style={{
                                                    fontSize: '0.813rem',
                                                    fontWeight: '700',
                                                    color: 'var(--gold2)',
                                                }}>
                                                    🏆 {t('activeLeaguePredictions')}
                                                </span>

                                                {/* League Select Selector */}
                                                {joinedLeagues && joinedLeagues.length > 0 && (
                                                    <select
                                                        value={selectedLeagueIdForMatch[m.match_id] || ''}
                                                        onChange={(e) => handleSwitchLeague(m.match_id, e.target.value)}
                                                        style={{
                                                            fontSize: '0.75rem',
                                                            padding: '0.25rem 0.5rem',
                                                            borderRadius: '4px',
                                                            backgroundColor: 'var(--surface)',
                                                            color: 'var(--white)',
                                                            border: '1px solid var(--border-color)',
                                                            outline: 'none',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        {joinedLeagues.map(l => (
                                                            <option key={l.league_id} value={l.league_id}>
                                                                {l.league_name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                )}
                                            </div>

                                            {/* Content Area */}
                                            {loadingOtherPreds[m.match_id] ? (
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    padding: '1.5rem',
                                                    gap: '0.5rem',
                                                    color: 'var(--grey)',
                                                    fontSize: '0.813rem',
                                                }}>
                                                    <span className="animate-spin text-lg">⚽</span>
                                                    <span>{isAr ? 'جاري التحميل...' : 'Loading predictions...'}</span>
                                                </div>
                                            ) : !joinedLeagues || joinedLeagues.length === 0 ? (
                                                <div style={{
                                                    textAlign: 'center',
                                                    padding: '1rem',
                                                    color: 'var(--grey)',
                                                    fontSize: '0.75rem',
                                                }}>
                                                    {t('noLeaguePredictions')}
                                                </div>
                                            ) : !otherPredictionsMap[m.match_id] || otherPredictionsMap[m.match_id].length === 0 ? (
                                                <div style={{
                                                    textAlign: 'center',
                                                    padding: '1rem',
                                                    color: 'var(--grey)',
                                                    fontSize: '0.75rem',
                                                }}>
                                                    {t('noPredictionsYet')}
                                                </div>
                                            ) : (
                                                <div style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                                                    gap: '0.5rem',
                                                    marginTop: '0.25rem',
                                                }}>
                                                    {otherPredictionsMap[m.match_id].map(other => {
                                                        const isSelf = other.user_id === userId;
                                                        
                                                        return (
                                                            <div
                                                                key={other.user_id}
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'space-between',
                                                                    padding: '0.5rem 0.75rem',
                                                                    borderRadius: '6px',
                                                                    backgroundColor: isSelf ? 'rgba(201, 168, 76, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                                                                    border: isSelf 
                                                                        ? '1px solid rgba(201, 168, 76, 0.3)' 
                                                                        : '1px solid rgba(255, 255, 255, 0.04)',
                                                                }}
                                                            >
                                                                <div style={{ 
                                                                    display: 'flex', 
                                                                    flexDirection: 'column', 
                                                                    gap: '0.1rem',
                                                                    minWidth: 0,
                                                                    flex: 1,
                                                                }}>
                                                                    <span style={{
                                                                        fontSize: '0.813rem',
                                                                        fontWeight: '700',
                                                                        color: isSelf ? 'var(--gold2)' : 'var(--white)',
                                                                        overflow: 'hidden',
                                                                        textOverflow: 'ellipsis',
                                                                        whiteSpace: 'nowrap',
                                                                    }}>
                                                                        {other.username} {isSelf && (isAr ? "(أنت)" : "(You)")}
                                                                    </span>
                                                                    
                                                                    {/* Badges for double down and insurance */}
                                                                    <div style={{ display: 'flex', gap: '0.25rem', overflow: 'hidden', flexWrap: 'wrap' }}>
                                                                        {other.is_joker && (
                                                                            <span style={{
                                                                                fontSize: '0.625rem',
                                                                                backgroundColor: 'rgba(168, 85, 247, 0.15)',
                                                                                color: '#c084fc',
                                                                                padding: '1px 4px',
                                                                                borderRadius: '3px',
                                                                                fontWeight: 'bold'
                                                                            }}>
                                                                                🔋 x2
                                                                            </span>
                                                                        )}
                                                                        {other.is_insurance && (
                                                                            <span style={{
                                                                                fontSize: '0.625rem',
                                                                                backgroundColor: 'rgba(245, 158, 11, 0.15)',
                                                                                color: '#f59e0b',
                                                                                padding: '1px 4px',
                                                                                borderRadius: '3px',
                                                                                fontWeight: 'bold'
                                                                            }}>
                                                                                🤠 UND
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {/* Predictions & score info */}
                                                                <div style={{ 
                                                                    display: 'flex', 
                                                                    flexDirection: 'column', 
                                                                    alignItems: 'flex-end',
                                                                    gap: '0.1rem',
                                                                    flexShrink: 0,
                                                                }}>
                                                                    <span style={{
                                                                        fontSize: '0.813rem',
                                                                        fontWeight: '700',
                                                                        color: other.has_predicted ? 'var(--white)' : 'var(--grey)',
                                                                        fontFamily: other.is_hidden ? 'inherit' : 'monospace'
                                                                    }}>
                                                                        {other.is_hidden ? (
                                                                            isAr ? "🔒 مخفي" : "🔒 Hidden"
                                                                        ) : other.has_predicted ? (
                                                                            `${other.home} - ${other.away}`
                                                                        ) : (
                                                                            isAr ? "بلا توقع" : "No prediction"
                                                                        )}
                                                                    </span>
                                                                    {hasActualScore && other.has_predicted && (
                                                                        <span style={{
                                                                            fontSize: '0.688rem',
                                                                            color: other.points_earned !== null && other.points_earned !== undefined && other.points_earned > 0 ? '#10B981' : '#ef4444',
                                                                            fontWeight: 'bold'
                                                                        }}>
                                                                            {t('pointsLabel')} {other.points_earned ?? 0}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}
                    </div>
                    </React.Fragment>
                );
            })}
            </div>
            );
        })()}

            {/* Custom Dialog Modal */}
            <AnimatePresence>
                {errorDialog.isOpen && (
                    <div style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 9999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1rem',
                        direction: isAr ? 'rtl' : 'ltr'
                    }}>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setErrorDialog(prev => ({ ...prev, isOpen: false }))}
                            style={{
                                position: 'absolute',
                                inset: 0,
                                backgroundColor: 'rgba(9, 9, 11, 0.85)',
                                backdropFilter: 'blur(8px)',
                            }}
                        />

                        {/* Modal Content Card */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 15 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 15 }}
                            transition={{ type: 'spring', duration: 0.4 }}
                            style={{
                                position: 'relative',
                                width: '100%',
                                maxWidth: '420px',
                                backgroundColor: '#18181b', // dark gray-900 / slate card
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                borderRadius: '16px',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                                overflow: 'hidden',
                                fontFamily: isAr ? 'Cairo, system-ui' : 'inherit'
                            }}
                        >
                            {/* Accent Glow Top Border */}
                            <div style={{
                                height: '4px',
                                width: '100%',
                                background: errorDialog.tokenType === 'double_down' 
                                    ? 'linear-gradient(90deg, #a855f7, #c084fc)'
                                    : errorDialog.tokenType === 'underdog_specialist'
                                    ? 'linear-gradient(90deg, #0ea5e9, #38bdf8)'
                                    : errorDialog.tokenType === 'info'
                                    ? 'linear-gradient(90deg, #3b82f6, #60a5fa)'
                                    : 'linear-gradient(90deg, #ef4444, #f87171)'
                            }} />

                            <div style={{ padding: '1.75rem' }}>
                                {/* Icon Header */}
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '3.5rem',
                                    height: '3.5rem',
                                    borderRadius: '50%',
                                    margin: '0 auto 1.25rem auto',
                                    backgroundColor: errorDialog.tokenType === 'double_down'
                                        ? 'rgba(168, 85, 247, 0.1)'
                                        : errorDialog.tokenType === 'underdog_specialist'
                                        ? 'rgba(14, 165, 233, 0.1)'
                                        : errorDialog.tokenType === 'info'
                                        ? 'rgba(59, 130, 246, 0.1)'
                                        : 'rgba(239, 68, 68, 0.1)',
                                    fontSize: '1.75rem'
                                }}>
                                    {errorDialog.tokenType === 'double_down' && '🔋'}
                                    {errorDialog.tokenType === 'underdog_specialist' && '🤠'}
                                    {errorDialog.tokenType === 'info' && '🛡️'}
                                    {errorDialog.tokenType === 'error' && '⚠️'}
                                </div>

                                {/* Title */}
                                <h3 style={{
                                    fontSize: '1.25rem',
                                    fontWeight: 'bold',
                                    color: '#ffffff',
                                    textAlign: 'center',
                                    marginBottom: '0.75rem',
                                    lineHeight: '1.4'
                                }}>
                                    {isAr ? errorDialog.titleAr : errorDialog.titleEn}
                                </h3>

                                {/* Message */}
                                <p style={{
                                    fontSize: '0.9rem',
                                    color: '#a1a1aa', // zinc-400
                                    textAlign: 'center',
                                    lineHeight: '1.6',
                                    marginBottom: '1.5rem',
                                }}>
                                    {isAr ? errorDialog.messageAr : errorDialog.messageEn}
                                </p>

                                {/* Bottom Action Button */}
                                <button
                                    type="button"
                                    onClick={() => setErrorDialog(prev => ({ ...prev, isOpen: false }))}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        borderRadius: '8px',
                                        backgroundColor: errorDialog.tokenType === 'double_down'
                                            ? '#a855f7'
                                            : errorDialog.tokenType === 'underdog_specialist'
                                            ? '#0ea5e9'
                                            : errorDialog.tokenType === 'info'
                                            ? '#3b82f6'
                                            : '#ef4444',
                                        color: '#ffffff',
                                        fontWeight: 'bold',
                                        fontSize: '0.9rem',
                                        cursor: 'pointer',
                                        border: 'none',
                                        outline: 'none'
                                    }}
                                    className="hover:opacity-90 active:scale-[0.98]"
                                >
                                    {isAr ? "حسنًا، فهمت" : "Got it"}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

        <style>{styles}</style>
        </div>
    );
}

const styles = `
.predictions-wrap { display: flex; flex-direction: column; gap: 1.5rem; }

.section-title {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 1.6rem;
    letter-spacing: 0.08em;
    color: var(--white);
}

.predictions-list { display: flex; flex-direction: column; gap: 0.75rem; }

.prediction-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    font-size: 0.75rem;
    color: var(--grey);
    font-family: monospace;
    border-bottom: 1px solid var(--border-color);
    padding-bottom: 0.5rem;
}

.pred-status-open {
    color: #10B981;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-weight: 600;
}
.light-theme .pred-status-open {
    color: #059669;
}

.prediction-card {
    position: relative;
    background: var(--surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius);
    padding: 1.2rem 1.5rem;
    display: flex;
    transition: all 0.2s;
    contain: layout;
    min-height: 120px;
}
.prediction-card:hover { border-color: var(--gold); }
.prediction-card--saved { border-color: var(--gold); background: rgba(201,168,76,0.05); }
.prediction-card--locked { border-color: var(--border-color); background: rgba(0,0,0,0.05); opacity: 0.75; }
.prediction-card--giant {
    position: relative;
    border-color: rgba(139, 92, 246, 0.5);
    background: rgba(139, 92, 246, 0.06);
    animation: breatheGlowGiant 3s ease-in-out infinite alternate;
}
@keyframes breatheGlowGiant {
    0% { 
        box-shadow: 0 0 8px rgba(139, 92, 246, 0.2);
        border-color: rgba(139, 92, 246, 0.45);
    }
    100% { 
        box-shadow: 0 0 20px rgba(139, 92, 246, 0.8);
        border-color: rgba(139, 92, 246, 0.85);
    }
}

.prediction-card--loot {
    position: relative;
    border-color: rgba(245, 158, 11, 0.45);
    background: rgba(245, 158, 11, 0.04);
    animation: breatheGlowLoot 3s ease-in-out infinite alternate;
}
@keyframes breatheGlowLoot {
    0% { 
        box-shadow: 0 0 8px rgba(245, 158, 11, 0.2);
        border-color: rgba(245, 158, 11, 0.4);
    }
    100% { 
        box-shadow: 0 0 20px rgba(245, 158, 11, 0.7);
        border-color: rgba(245, 158, 11, 0.8);
    }
}

.giant-badge {
    position: absolute;
    top: -11px;
    left: 1.2rem;
    display: flex;
    align-items: center;
    gap: 0.3rem;
    background: linear-gradient(90deg, #7c3aed, #a855f7);
    color: #fff;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 0.7rem;
    letter-spacing: 0.14em;
    padding: 0.15rem 0.6rem;
    border-radius: 4px;
    box-shadow: 0 0 10px rgba(139,92,246,0.5);
    animation: giantBadgePulse 2s ease-in-out infinite alternate;
    will-change: transform, box-shadow;
    backface-visibility: hidden;
    transform: translate3d(0,0,0);
}
.giant-badge-icon {
    font-size: 0.75rem;
    display: inline-block;
    animation: lightningFlicker 1.5s ease-in-out infinite;
}
@keyframes giantBadgePulse {
    from { 
        transform: scale(1) translate3d(0,0,0);
        box-shadow: 0 0 6px rgba(139,92,246,0.4); 
    }
    to   { 
        transform: scale(1.04) translate3d(0,0,0);
        box-shadow: 0 0 15px rgba(139,92,246,0.95), 0 0 4px rgba(168,85,247,0.4); 
    }
}
@keyframes lightningFlicker {
    0%, 100% { transform: scale(1) rotate(0deg); }
    50% { transform: scale(1.25) rotate(15deg); }
}
@keyframes spinLoot {
    0% { transform: rotate(0deg) scale(1); }
    50% { transform: rotate(180deg) scale(1.2); }
    100% { transform: rotate(360deg) scale(1); }
}
@keyframes chestShake {
    0%, 100% { transform: rotate(0deg) scale(1); }
    15% { transform: rotate(-11deg) scale(1.25); }
    30% { transform: rotate(11deg) scale(1.25); }
    45% { transform: rotate(-8deg) scale(1.25); }
    60% { transform: rotate(8deg) scale(1.25); }
    75% { transform: rotate(-4deg) scale(1.15); }
    90% { transform: rotate(4deg) scale(1.15); }
}
@keyframes chestGlow {
    0% { box-shadow: 0 0 8px rgba(245, 158, 11, 0.2); border-color: rgba(245, 158, 11, 0.35); }
    100% { box-shadow: 0 0 25px rgba(245, 158, 11, 0.65); border-color: rgba(245, 158, 11, 0.9); }
}

.loot-badge {
    position: absolute;
    top: -11px;
    left: 1.2rem;
    display: flex;
    align-items: center;
    gap: 0.3rem;
    background: linear-gradient(90deg, #d97706, #f59e0b);
    color: #fff;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 0.7rem;
    letter-spacing: 0.14em;
    padding: 0.15rem 0.6rem;
    border-radius: 4px;
    box-shadow: 0 0 10px rgba(245,158,11,0.5);
}
.loot-badge-emoji {
    font-size: 0.75rem;
    display: inline-block;
}
@keyframes lootBadgePulse {
    from { 
        transform: scale(1) translate3d(0,0,0);
        box-shadow: 0 0 6px rgba(245,158,11,0.4); 
    }
    to   { 
        transform: scale(1.04) translate3d(0,0,0);
        box-shadow: 0 0 15px rgba(245,158,11,0.95), 0 0 4px rgba(245,158,11,0.4); 
    }
}
@keyframes bounceLoot {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-3px); }
}
@keyframes lootEmojiPulse {
    0% { transform: scale(1) translate3d(0,0,0); }
    100% { transform: scale(1.08) translate3d(0,0,0); }
}

.pred-inputs {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
}
.pred-score-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    flex: 1;
}
.pred-label {
    font-family: 'Barlow', sans-serif;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--white);
    letter-spacing: 0.03em;
    white-space: normal;
    overflow: visible;
    text-overflow: unset;
    max-width: 240px;
    text-align: center;
}
.pred-input {
    width: 64px;
    height: 44px;
    text-align: center;
    background: var(--input-bg);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    color: var(--white);
    font-family: 'Bebas Neue', sans-serif;
    font-size: 1.3rem;
    outline: none;
    transition: border-color 0.2s;
}
.pred-input:focus { border-color: var(--gold); }
.pred-input:disabled {
    opacity: 0.5;
    background: var(--navy);
    border-color: var(--border-color);
    color: var(--grey);
    cursor: not-allowed;
}
.pred-input::-webkit-inner-spin-button,
.pred-input::-webkit-outer-spin-button { -webkit-appearance: none; }

.pred-dash {
    font-size: 1.2rem;
    color: var(--grey);
    flex-shrink: 0;
    padding-bottom: 0.1rem;
}

.pred-btn {
    flex-shrink: 0;
    padding: 0.55rem 1.2rem;
    background: var(--red);
    color: #fff;
    border: none;
    border-radius: 6px;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 0.95rem;
    letter-spacing: 0.08em;
    cursor: pointer;
    transition: background 0.2s, transform 0.1s;
}
.pred-btn:not(:disabled):not(.pred-btn--saved):hover { background: var(--red2); }
.pred-btn:not(:disabled):active { transform: scale(0.97); }
.pred-btn--saved {
    background: transparent;
    border: 1px solid var(--gold);
    color: var(--gold);
    cursor: default;
}
.pred-btn--saved:not(:disabled) {
    cursor: pointer;
}
.pred-btn--saved:not(:disabled):hover {
    background: rgba(201, 168, 76, 0.12);
    color: var(--gold2);
    border-color: var(--gold2);
}
.light-theme .pred-btn--saved {
    background: #fef3c7;
    border: 1px solid #d97706;
    color: #92400e;
    font-weight: bold;
}
.light-theme .pred-btn--saved:not(:disabled):hover {
    background: #fef08a;
    color: #854d0e;
    border-color: #ca8a04;
}
.pred-status-locked-in {
    color: var(--gold);
}
.light-theme .pred-status-locked-in {
    color: #b45309; /* Highly visible golden-amber in light mode */
}
.pred-btn--giant {
    background: linear-gradient(90deg, #7c3aed, #a855f7);
}
.pred-btn--giant:not(:disabled):not(.pred-btn--saved):hover { background: linear-gradient(90deg, #6d28d9, #9333ea); }
.pred-btn:disabled { opacity: 0.6; cursor: not-allowed; }

/* Rules Panel Styling */
.rules-box {
    padding: 0.85rem;
    border-radius: 8px;
    transition: all 0.2s;
}
.rules-box-standard, .rules-box-underdog {
    background: rgba(0, 0, 0, 0.15);
    border: 1px solid rgba(255, 255, 255, 0.04);
}
.rules-box-slayer {
    background: rgba(124, 58, 237, 0.08);
    border: 1px solid rgba(139, 92, 246, 0.25);
}
.rules-box-loot {
    background: rgba(245, 158, 11, 0.06);
    border: 1px solid rgba(245, 158, 11, 0.35);
}

.rules-box-standard .rules-sub-title, .rules-box-underdog .rules-sub-title {
    color: var(--white);
}
.rules-box-slayer .rules-sub-title {
    color: #c084fc;
}
.rules-box-loot .rules-sub-title {
    color: #f59e0b;
}

.rules-box .rules-list, .rules-box .rules-desc {
    color: var(--grey);
}

.rules-highlight-blue {
    color: #38bdf8;
}
.rules-highlight-red {
    color: #f87171;
}
.rules-warning-item {
    color: #fca5a5;
}

/* Light Theme Overrides for Rules Panel */
.light-theme .rules-box-standard, .light-theme .rules-box-underdog {
    background: rgba(0, 0, 0, 0.04);
    border: 1px solid rgba(0, 0, 0, 0.08);
}
.light-theme .rules-box-slayer {
    background: rgba(124, 58, 237, 0.05);
    border: 1px solid rgba(124, 58, 237, 0.15);
}
.light-theme .rules-box-loot {
    background: rgba(245, 158, 11, 0.04);
    border: 1px solid rgba(245, 158, 11, 0.18);
}

.light-theme .rules-box-slayer .rules-sub-title {
    color: #7c3aed;  /* highly visible purple */
}
.light-theme .rules-box-loot .rules-sub-title {
    color: #b45309;  /* highly visible bold amber-gold */
}
.light-theme .rules-box-standard .rules-sub-title, .light-theme .rules-box-underdog .rules-sub-title {
    color: var(--white); /* #1A202C */
}
.light-theme .rules-box .rules-list, .light-theme .rules-box .rules-desc {
    color: var(--grey); /* strong dark steel */
}
.light-theme .rules-highlight-blue {
    color: #0284c7;  /* dark readable blue */
}
.light-theme .rules-highlight-red {
    color: #dc2626;  /* dark readable red */
}
.light-theme .rules-warning-item {
    color: #b91c1c;  /* dark readable red warning */
}

/* Eligibility Banner styles for both themes */
.eligibility-banner {
    font-size: 0.75rem;
    color: #e9d5ff; /* beautiful readable purple-pink-white under dark mode */
    background-color: rgba(124, 58, 237, 0.12);
    border: 1px solid rgba(139, 92, 246, 0.25);
    border-radius: 6px;
    padding: 0.45rem 0.75rem;
    margin-top: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem;
}
.eligibility-text-none {
    color: #94a3b8;
}
.eligibility-text-eligible {
    color: #34d399; /* vibrant emerald green for dark theme */
}
.eligibility-text-standard {
    color: #fca5a5; /* bright soft red for dark theme */
}

/* Light Theme Overrides for Eligibility Banner */
.light-theme .eligibility-banner {
    color: #5b21b6; /* deep violet for outstanding readability in light mode */
    background-color: rgba(124, 58, 237, 0.08);
    border: 1px solid rgba(124, 58, 237, 0.22);
}
.light-theme .eligibility-text-none {
    color: #475569; /* slate gray readable */
}
.light-theme .eligibility-text-eligible {
    color: #166534; /* deep green readable */
}
.light-theme .eligibility-text-standard {
    color: #b91c1c; /* dark warning red readable */
}

/* Notice Banner styles for both themes */
.finished-games-notice {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    background-color: rgba(56, 189, 248, 0.06);
    border: 1px solid rgba(56, 189, 248, 0.15);
    border-radius: 10px;
    padding: 0.75rem 1rem;
    margin-bottom: 1.25rem;
    font-size: 0.82rem;
    color: #e0f2fe; /* Light blue/white text for dark theme */
    line-height: 1.4;
    width: 100%;
}

.light-theme .finished-games-notice {
    color: #0369a1; /* Deep ocean blue for perfect readability in light mode */
    background-color: rgba(14, 165, 233, 0.08);
    border: 1px solid rgba(14, 165, 233, 0.22);
}

/* Collapsed header (Finished Matches) */
.collapsible-finished-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background-color: rgba(255, 255, 255, 0.03);
    border: 1px dashed rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    padding: 1.2rem 1.5rem;
    cursor: pointer;
    user-select: none;
    transition: all 0.2s ease;
    margin-bottom: 1rem;
    width: 100%;
}
.collapsible-finished-header:hover {
    background-color: rgba(255, 255, 255, 0.06);
    border-style: solid;
    border-color: rgba(255, 255, 255, 0.3);
}
.collapsible-finished-header .header-title {
    margin: 0;
    font-weight: bold;
    font-size: 0.95rem;
    color: #ffffff;
}
.collapsible-finished-header .header-subtitle {
    margin: 0;
    font-size: 0.75rem;
    color: #a1a1aa;
    margin-top: 0.15rem;
}
.collapsible-finished-header .header-action-text {
    font-size: 0.75rem;
    color: #a1a1aa;
}
.collapsible-finished-header .header-arrow {
    font-size: 0.85rem;
    color: #a1a1aa;
}

/* Expanded header (Finished Matches) */
.expanded-finished-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background-color: rgba(56, 189, 248, 0.05);
    border: 1px solid rgba(56, 189, 248, 0.25);
    border-radius: 12px;
    padding: 1.2rem 1.5rem;
    cursor: pointer;
    user-select: none;
    transition: all 0.2s ease;
    margin-bottom: 1rem;
    width: 100%;
}
.expanded-finished-header:hover {
    background-color: rgba(56, 189, 248, 0.08);
}
.expanded-finished-header .header-title {
    margin: 0;
    font-weight: bold;
    font-size: 0.95rem;
    color: #38bdf8;
}
.expanded-finished-header .header-subtitle {
    margin: 0;
    font-size: 0.75rem;
    color: #a1a1aa;
    margin-top: 0.15rem;
}
.expanded-finished-header .header-action-text {
    font-size: 0.75rem;
    color: #38bdf8;
}
.expanded-finished-header .header-arrow {
    font-size: 0.85rem;
    color: #38bdf8;
}

/* Light mode overrides */
.light-theme .collapsible-finished-header {
    background-color: #f4f4f5; /* Zinc 100 */
    border: 1px dashed #d4d4d8; /* Zinc 300 */
}
.light-theme .collapsible-finished-header:hover {
    background-color: #e4e4e7; /* Zinc 200 */
    border-color: #a1a1aa; /* Zinc 400 */
}
.light-theme .collapsible-finished-header .header-title {
    color: #18181b; /* Zinc 900 */
}
.light-theme .collapsible-finished-header .header-subtitle {
    color: #71717a; /* Zinc 500 */
}
.light-theme .collapsible-finished-header .header-action-text,
.light-theme .collapsible-finished-header .header-arrow {
    color: #71717a;
}

.light-theme .expanded-finished-header {
    background-color: #f0f9ff; /* Sky 50 */
    border: 1px solid #bae6fd; /* Sky 200 */
}
.light-theme .expanded-finished-header:hover {
    background-color: #e0f2fe; /* Sky 100 */
}
.light-theme .expanded-finished-header .header-title {
    color: #0369a1; /* Sky 700 */
}
.light-theme .expanded-finished-header .header-subtitle {
    color: #4b5563; /* Gray 600 */
}
.light-theme .expanded-finished-header .header-action-text,
.light-theme .expanded-finished-header .header-arrow {
    color: #0369a1;
}

@media (max-width: 640px) {
    .pred-content-row { flex-direction: column; align-items: stretch !important; min-height: 120px; box-sizing: border-box; overflow: hidden;}
    .pred-inputs { justify-content: center; }
    .pred-btn { width: 100%; text-align: center; padding: 0.7rem; }
}
`;
