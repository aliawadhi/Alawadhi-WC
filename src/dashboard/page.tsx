"use client";
import React, { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase';
import { calculatePoints, isSurpriseLoot } from '@/utils/points';
import { 
    initNotifications, 
    areNotificationsEnabled, 
    setNotificationsEnabled, 
    triggerNotification, 
    getNotificationHistory, 
    markAsRead, 
    markAllAsRead, 
    clearNotificationsHistory, 
    AppNotification,
    playChime,
    subscribeToBackgroundPush,
    resetPushNotificationSync,
    resolveApiUrl
} from '@/utils/notificationService';
import PredictionsTab from '../components/PredictionsTab';
import FixturesTab from '../components/FixturesTab';
import StandingsTab from '../components/StandingsTab';
import RankingsTab from '../components/RankingsTab';
import { useLanguage } from '@/utils/LanguageContext';

export default function Dashboard() {
    const { language, setLanguage, t, isAr } = useLanguage();
    const [activeTab, setActiveTab] = useState('predictions');
    const [userId, setUserId] = useState<string | null>(null);
    const [username, setUsername] = useState<string | null>(null);
    const [joinedLeagues, setJoinedLeagues] = useState<{ league_id: string; league_name: string; created_by?: string | null }[]>([]);
    const [leagueId, setLeagueId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');
    const [showAdminBtn, setShowAdminBtn] = useState<boolean>(false);

    const tabs = [
        { id: 'predictions', label: t('predictionsTab'), icon: '⚽' },
        { id: 'fixtures', label: t('fixturesTab'), icon: '📅' },
        { id: 'standings', label: t('standingsTab'), icon: '🏆' },
        { id: 'rankings', label: t('rankingsTab'), icon: '🌍' },
    ];

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem('wc2026_theme') as 'dark' | 'light';
            if (stored) {
                setTheme(stored);
            }
        }
    }, []);

    useEffect(() => {
        if (theme === 'light') {
            document.body.classList.add('light-theme');
        } else {
            document.body.classList.remove('light-theme');
        }
        localStorage.setItem('wc2026_theme', theme);
    }, [theme]);

    useEffect(() => {
        // Trigger silent background notification verification on player load to bypass Cloud Run scale down
        fetch("/api/push/trigger-alerts", { method: "POST" })
            .then(res => res.json())
            .then(data => console.log("[Dashboard Load Alerts Verification]:", data))
            .catch(err => console.warn("[Alerts Verification warning]:", err));
    }, []);

    const handleLogout = async () => {
        try {
            await supabase.auth.signOut();
            window.location.hash = '/';
        } catch (err) {
            console.error('Error during sign out:', err);
        }
    };

    // Self-service League Creation / Joining states
    const [newLeagueName, setNewLeagueName] = useState('');
    const [joinLeagueId, setJoinLeagueId] = useState('');
    const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [copied, setCopied] = useState(false);
    const [showLeagueManager, setShowLeagueManager] = useState(false);
    const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
    const [showDropConfirm, setShowDropConfirm] = useState(false);

    // Push Notifications Integration States
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [showNotificationCenter, setShowNotificationCenter] = useState(false);
    const [pushEnabled, setPushEnabled] = useState(true);
    const [pushLang, setPushLang] = useState<string>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('wc_push_lang') || localStorage.getItem('wc_lang') || 'en';
        }
        return 'en';
    });
    const [toasts, setToasts] = useState<AppNotification[]>([]);
    const isNotifAr = pushLang === 'ar';

    useEffect(() => {
        setPushLang(isAr ? 'ar' : 'en');
    }, [isAr]);

    const fetchUserLeagues = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const user = session?.user;
            if (!user) {
                window.location.hash = '/';
                setLoading(false);
                return;
            }
            setUserId(user.id);

            // Register background push subscription if allowed
            if (areNotificationsEnabled()) {
                const activeLang = isAr ? 'ar' : 'en';
                subscribeToBackgroundPush(user.id, activeLang).catch(err => {
                    console.log('Background push registration skipped/uncaught:', err);
                });
            }

            // Auto-heal / synchronize the profiles table with the user's correct login username
            const rawUsername = user.user_metadata?.display_name || user.email?.split('@')[0] || '';
            const correctUsername = rawUsername.toLowerCase().trim();
            setUsername(rawUsername);

            if (correctUsername) {
                try {
                    const { data: existingProfile } = await supabase
                        .from('profiles')
                        .select('id, username')
                        .eq('id', user.id)
                        .maybeSingle();

                    if (!existingProfile) {
                        // Profile row missing entirely, insert it!
                        await supabase.from('profiles').insert({
                            id: user.id,
                            username: correctUsername
                        });
                    } else if (!existingProfile.username || existingProfile.username.toLowerCase().trim() !== correctUsername) {
                        // Profile row has wrong username, update it!
                        await supabase.from('profiles').update({
                            username: correctUsername
                        }).eq('id', user.id);
                    }
                } catch (syncErr) {
                    console.error("Failed to automatically synchronize profile:", syncErr);
                }
            }

            // Determine if the user has admin access
            const email = (user.email || '').toLowerCase().trim();
            const metaDisplayName = (user.user_metadata?.display_name || '').toLowerCase().trim();

            let profileUsername = '';
            try {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('username')
                    .eq('id', user.id)
                    .single();
                if (profile?.username) {
                    profileUsername = profile.username.toLowerCase().trim();
                    const finalDisplayName = user.user_metadata?.display_name || profile.username;
                    setUsername(finalDisplayName);
                }
            } catch (err) {
                console.error("Error fetching admin profile in dashboard:", err);
            }

            const isAuthorised = 
                email === 'aliawadhi@family.app' || 
                email === 'aliawadhi93@gmail.com' ||
                metaDisplayName === 'aliawadhi' ||
                profileUsername === 'aliawadhi';

            setShowAdminBtn(isAuthorised);

            // Fetch memberships
            const { data: memberships, error: memberErr } = await supabase
                .from('league_members')
                .select('league_id')
                .eq('user_id', user.id);

            if (memberErr) throw memberErr;

            if (memberships && memberships.length > 0) {
                const leagueIds = memberships.map(m => m.league_id);
                
                // Fetch details of those leagues
                const { data: leaguesData, error: leaguesErr } = await supabase
                    .from('leagues')
                    .select('league_id, league_name, created_by')
                    .in('league_id', leagueIds);

                if (leaguesErr) throw leaguesErr;

                if (leaguesData && leaguesData.length > 0) {
                    setJoinedLeagues(leaguesData);
                    // Set active league if not set, or if set league is not part of actual memberships anymore
                    setLeagueId(prev => {
                        if (prev && leaguesData.some(l => l.league_id === prev)) {
                            return prev;
                        }
                        return leaguesData[0].league_id;
                    });
                } else {
                    setJoinedLeagues([]);
                    setLeagueId(null);
                }
            } else {
                setJoinedLeagues([]);
                setLeagueId(null);
            }
        } catch (err) {
            console.error('Error loading user leagues:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUserLeagues();
        
        // Auto-enable standard push notifications and sync states
        initNotifications();
        setPushEnabled(areNotificationsEnabled());
        setNotifications(getNotificationHistory());

        // Event listener for in-app notification history modifications
        const handleHistoryChanged = () => {
            setNotifications(getNotificationHistory());
        };

        // Event listener to trigger real-time on-screen slide-in toast banners
        const handleToastEvent = (e: Event) => {
            const customEvent = e as CustomEvent<AppNotification>;
            const toast = customEvent.detail;
            
            setToasts(prev => [toast, ...prev]);
            
            // Auto dissolve toast after 6 seconds
            setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== toast.id));
            }, 6000);

            // Fetch update history
            setNotifications(getNotificationHistory());
        };

        window.addEventListener('wc2026_notification_history_changed', handleHistoryChanged);
        window.addEventListener('wc2026_notification_event', handleToastEvent);

        return () => {
            window.removeEventListener('wc2026_notification_history_changed', handleHistoryChanged);
            window.removeEventListener('wc2026_notification_event', handleToastEvent);
        };
    }, []);

    const triggerStandingsRecalculation = async () => {
        if (!userId || joinedLeagues.length === 0) return;

        for (const league of joinedLeagues) {
            try {
                // Fetch members
                const { data: members } = await supabase
                    .from('league_members')
                    .select('user_id')
                    .eq('league_id', league.league_id);

                if (!members || members.length === 0) continue;

                const uids = members.map(m => m.user_id);

                // Fetch predictions
                const { data: preds } = await supabase
                    .from('predictions')
                    .select('user_id, points_earned, match_id, predicted_home_score, predicted_away_score, is_joker')
                    .in('user_id', uids);

                // Fetch matches
                const { data: matches } = await supabase
                    .from('matches')
                    .select('match_id, home_team, away_team, is_giant_slayer, home_rank, away_rank, home_score_final, away_score_final, group_stage');

                if (!matches) continue;

                // Compute scores dynamically as done in StandingsTab.tsx
                const calculatedUsers = uids.map(uid => {
                    const userPreds = (preds || []).filter(p => p.user_id === uid);
                    let scoreSum = 0;

                    userPreds.forEach(pred => {
                        const matchObj = matches.find(mo => mo.match_id === pred.match_id);
                        if (!matchObj || matchObj.match_id === '00000000-0000-0000-0000-000000000000') return;

                        const isFinished = matchObj.home_score_final !== null && matchObj.home_score_final !== undefined &&
                                           matchObj.away_score_final !== null && matchObj.away_score_final !== undefined;
                        if (!isFinished) return;

                        const predHome = pred.predicted_home_score;
                        const predAway = pred.predicted_away_score;
                        const isJoker = pred.is_joker ?? false;
                        const isInsurance = predHome >= 100;
                        const finalPredHome = isInsurance ? (predHome - 100) : predHome;

                        const homeRank = matchObj.home_rank ?? 60;
                        const awayRank = matchObj.away_rank ?? 60;
                        const isGiantSlayer = matchObj.is_giant_slayer === true || 
                            (Math.abs(homeRank - awayRank) >= 35 && (homeRank <= 20 || awayRank <= 20));

                        const isLoot = isSurpriseLoot(matchObj.home_team, matchObj.away_team, matchObj.match_id, uid, matchObj.group_stage);

                        const scorePoints = pred.points_earned !== null && pred.points_earned !== undefined
                            ? pred.points_earned
                            : calculatePoints(
                                finalPredHome,
                                predAway,
                                matchObj.home_score_final!,
                                matchObj.away_score_final!,
                                isGiantSlayer,
                                homeRank,
                                awayRank,
                                isJoker,
                                isLoot ? "" : matchObj.home_team,
                                isLoot ? "" : matchObj.away_team,
                                matchObj.match_id,
                                uid,
                                isInsurance,
                                matchObj.group_stage
                            );

                        scoreSum += scorePoints;
                    });

                    return { userId: uid, scoreSum, rank: 1 };
                });

                // Sort descending by scoreSum
                calculatedUsers.sort((a, b) => b.scoreSum - a.scoreSum);

                // Assign ranks handling tied positions
                let currentRank = 1;
                for (let i = 0; i < calculatedUsers.length; i++) {
                    if (i > 0 && calculatedUsers[i].scoreSum === calculatedUsers[i - 1].scoreSum) {
                        calculatedUsers[i].rank = calculatedUsers[i - 1].rank;
                    } else {
                        calculatedUsers[i].rank = i + 1;
                    }
                }

                // Check current user position
                const userObj = calculatedUsers.find(cu => cu.userId === userId);
                if (userObj) {
                    const resolvedRank = userObj.rank;
                    const prevRankKey = `wc2026_prev_rank_${userId}_${league.league_id}`;
                    const prevRankStr = localStorage.getItem(prevRankKey);

                    if (prevRankStr !== null) {
                        const prevRankVal = parseInt(prevRankStr, 10);
                        if (prevRankVal !== resolvedRank) {
                            let title = isNotifAr ? '🏆 صعود وهبوط الترتيب!' : '🏆 Standings Shifter!';
                            let body = '';
                            if (resolvedRank < prevRankVal) {
                                body = isNotifAr
                                    ? `تهانينا! تقدمت في الترتيب من المركز #${prevRankVal} إلى المركز #${resolvedRank} في دوري "${league.league_name}"! 🚀`
                                    : `Congratulations! You climbed the standings from #${prevRankVal} to #${resolvedRank} in league "${league.league_name}"! 🚀`;
                            } else {
                                body = isNotifAr
                                    ? `تراجع مركزك في الترتيب من المركز #${prevRankVal} إلى المركز #${resolvedRank} في دوري "${league.league_name}". شدّ حيلك للتوقعات القادمة! ⚽`
                                    : `Your standing shifted from #${prevRankVal} to #${resolvedRank} in league "${league.league_name}". Keep picking to regain your lead! ⚽`;
                            }
                            
                            triggerNotification(title, body, 'standings');
                        }
                    }
                    localStorage.setItem(prevRankKey, String(resolvedRank));
                }
            } catch (e) {
                console.error("Error evaluating stand check:", e);
            }
        }
    };

    // 1. Core Background loop for "Lock-In Reminder" & "Standings Tracker"
    useEffect(() => {
        if (!userId) return;

        const checkLockIns = async () => {
            try {
                const { data: matches } = await supabase
                    .from('matches')
                    .select('*')
                    .order('kickoff_time', { ascending: true });

                const { data: preds } = await supabase
                    .from('predictions')
                    .select('match_id')
                    .eq('user_id', userId);

                if (!matches) return;

                const predIds = new Set((preds || []).map(p => p.match_id));

                matches.forEach(m => {
                    const isFinished = m.home_score_final !== null && m.home_score_final !== undefined;
                    if (isFinished) return;

                    const kickoffEpoch = new Date(m.kickoff_time).getTime();
                    const now = Date.now();
                    const deltaMs = kickoffEpoch - now;

                    const twoHours = 2 * 60 * 60 * 1000;

                    // Upcoming in less than 2 hours but still in future
                    if (deltaMs > 0 && deltaMs <= twoHours) {
                        if (!predIds.has(m.match_id)) {
                            const localNotifiedKey = `wc2026_notified_lockin_${m.match_id}`;
                            if (!localStorage.getItem(localNotifiedKey)) {
                                localStorage.setItem(localNotifiedKey, 'true');

                                const minsLeft = Math.round(deltaMs / 60000);
                                const title = isNotifAr ? '⏰ تذكير بإغلاق التوقعات' : '⏰ Lock-In Reminder';
                                const body = isNotifAr
                                    ? `مباراة التحدي: "${m.home_team} ضد ${m.away_team}" ستبدأ بعد غضون ${minsLeft} دقيقة ولم تقم بتسجيل توقعك بعد!`
                                    : `Match alert: "${m.home_team} vs ${m.away_team}" kicks off in ${minsLeft} minutes, and you haven't locked in your scores yet!`;

                                triggerNotification(title, body, 'lockin');
                            }
                        }
                    }
                });
            } catch (err) {
                console.error("Error doing background lock-in search:", err);
            }
        };

        // run initially
        checkLockIns();
        triggerStandingsRecalculation();

        // Check periodically every 2 minutes
        const interval = setInterval(() => {
            checkLockIns();
            triggerStandingsRecalculation();
        }, 120000);

        return () => clearInterval(interval);
    }, [userId, joinedLeagues, leagueId, isAr, pushLang]);

    // 2. Core Realtime listener for Final Whistle score postings
    useEffect(() => {
        if (!userId) return;

        const realtimeChannel = supabase.channel('dashboard_final_whistle_' + userId)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'matches' },
                async (payload) => {
                    const oldMatch = payload.old;
                    const newMatch = payload.new;

                    const isLive = !!(newMatch?.group_stage && /\[LIVE\]/i.test(newMatch.group_stage));
                    const isFinalizedNow = newMatch && newMatch.home_score_final !== null && newMatch.away_score_final !== null && !isLive;

                    if (isFinalizedNow) {
                        const notifiedKey = `wc2026_notified_final_${newMatch.match_id}`;
                        if (localStorage.getItem(notifiedKey)) return;

                        localStorage.setItem(notifiedKey, 'true');

                        // Fetch user's prediction for this match
                        const { data: pred } = await supabase
                            .from('predictions')
                            .select('*')
                            .eq('user_id', userId)
                            .eq('match_id', newMatch.match_id)
                            .maybeSingle();

                        const homeName = newMatch.home_team;
                        const awayName = newMatch.away_team;
                        const finalHome = newMatch.home_score_final;
                        const finalAway = newMatch.away_score_final;

                        if (pred) {
                            const predHome = pred.predicted_home_score;
                            const predAway = pred.predicted_away_score;
                            const isJoker = pred.is_joker ?? false;
                            const isInsurance = predHome >= 100;
                            const finalPredHome = isInsurance ? (predHome - 100) : predHome;

                            const homeRank = newMatch.home_rank ?? 60;
                            const awayRank = newMatch.away_rank ?? 60;
                            const isGiantSlayer = newMatch.is_giant_slayer === true || 
                                (Math.abs(homeRank - awayRank) >= 35 && (homeRank <= 20 || awayRank <= 20));

                            const isLoot = isSurpriseLoot(homeName, awayName, newMatch.match_id, userId, newMatch.group_stage);

                            const pointsEarned = calculatePoints(
                                finalPredHome,
                                predAway,
                                finalHome,
                                finalAway,
                                isGiantSlayer,
                                homeRank,
                                awayRank,
                                isJoker,
                                isLoot ? "" : homeName,
                                isLoot ? "" : awayName,
                                newMatch.match_id,
                                userId,
                                isInsurance,
                                newMatch.group_stage
                            );

                            const messageEn = `Final Whistle! 🏁 ${homeName} ${finalHome} - ${finalAway} ${awayName}. You predicted ${finalPredHome}-${predAway} and earned ${pointsEarned} Points!`;
                            const messageAr = `صافرة النهاية! 🏁 انتهت ${homeName} ${finalHome} - ${finalAway} ${awayName}. توقعك كان ${finalPredHome}-${predAway}، وحصلت على ${pointsEarned} نقطة!`;

                            triggerNotification(
                                isNotifAr ? '🏁 صافرة النهاية!' : '🏁 Final Whistle!',
                                isNotifAr ? messageAr : messageEn,
                                'whistle'
                            );
                        } else {
                            const messageEn = `Final Whistle! 🏁 ${homeName} ${finalHome} - ${finalAway} ${awayName}. You didn't submit a prediction for this game.`;
                            const messageAr = `صافرة النهاية! 🏁 انتهت مباراة ${homeName} ${finalHome} - ${finalAway} ${awayName} بدون توقع مسجل لك.`;

                            triggerNotification(
                                isNotifAr ? '🏁 صافرة النهاية!' : '🏁 Final Whistle!',
                                isNotifAr ? messageAr : messageEn,
                                'whistle'
                            );
                        }

                        // Standings shifts lookup
                        triggerStandingsRecalculation();
                        if (typeof window !== 'undefined') {
                            window.dispatchEvent(new CustomEvent('wc2026_match_score_updated'));
                        }
                    } else if (isLive && newMatch) {
                        // Dynamic live score changes trigger standings update check and play celebratory standing chimes
                        const liveScoreKey = `wc2026_notified_live_${newMatch.match_id}_${newMatch.home_score_final}_${newMatch.away_score_final}`;
                        if (localStorage.getItem(liveScoreKey)) return;

                        localStorage.setItem(liveScoreKey, 'true');

                        const homeName = newMatch.home_team;
                        const awayName = newMatch.away_team;
                        const currentHome = newMatch.home_score_final ?? 0;
                        const currentAway = newMatch.away_score_final ?? 0;

                        const messageEn = `Live score update: ${homeName} ${currentHome} - ${currentAway} ${awayName}. Standings shift checked in-app!`;
                        const messageAr = `تحديث حي للنتيجة: ${homeName} ${currentHome} - ${currentAway} ${awayName}. تم احتساب النسبة وتغير الترتيب حياً!`;

                        triggerNotification(
                            isNotifAr ? '📊 تحديث حي للمباراة!' : '📊 Live Match Update!',
                            isNotifAr ? messageAr : messageEn,
                            'standings'
                        );

                        // Trigger standings shift checking
                        triggerStandingsRecalculation();
                        if (typeof window !== 'undefined') {
                            window.dispatchEvent(new CustomEvent('wc2026_match_score_updated'));
                        }
                    }
                }
            )
            .subscribe();

        return () => {
            realtimeChannel.unsubscribe();
        };
    }, [userId, isAr, pushLang]);

    const [onlineCount, setOnlineCount] = useState<number>(1);

    useEffect(() => {
        // Track online users using Supabase Presence
        const channel = supabase.channel('online-ready-channel', {
            config: {
                presence: {
                    key: username || userId || 'anonymous',
                }
            }
        });

        const handleSync = () => {
            const state = channel.presenceState();
            let count = 0;
            Object.values(state).forEach((presences) => {
                count += Array.isArray(presences) ? presences.length : 1;
            });
            setOnlineCount(Math.max(1, count));
        };

        channel
            .on('presence', { event: 'sync' }, handleSync)
            .on('presence', { event: 'join' }, handleSync)
            .on('presence', { event: 'leave' }, handleSync)
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    try {
                        await channel.track({
                            online_at: new Date().toISOString(),
                            username: username || 'Anonymous'
                        });
                    } catch (trackErr) {
                        console.error('Error tracking presence:', trackErr);
                    }
                }
            });

        return () => {
            channel.unsubscribe();
        };
    }, [userId, username]);

    const handleCreateLeague = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newLeagueName.trim() || !userId) return;
        setSubmitting(true);
        setStatusMessage(null);

        try {
            // 1. Insert the new league
            const { data, error } = await supabase
                .from('leagues')
                .insert([{ league_name: newLeagueName.trim(), created_by: userId }])
                .select();

            if (error) throw error;
            if (!data || data.length === 0) throw new Error('Could not establish the new league.');

            const createdLeague = data[0];

            // 2. Add creator as a league member automatically
            const { error: memberError } = await supabase
                .from('league_members')
                .insert([{ league_id: createdLeague.league_id, user_id: userId }]);

            if (memberError) throw memberError;

            // Success feedback
            setNewLeagueName('');
            setLeagueId(createdLeague.league_id);
            setStatusMessage({ text: `Succesfully created "${createdLeague.league_name}"!`, isError: false });
            await fetchUserLeagues();
            setShowLeagueManager(false);
        } catch (err: any) {
            console.error(err);
            setStatusMessage({ text: err.message || 'An error occurred during league creation.', isError: true });
        } finally {
            setSubmitting(false);
        }
    };

    const handleJoinLeague = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!joinLeagueId.trim() || !userId) return;
        setSubmitting(true);
        setStatusMessage(null);

        const targetLeagueId = joinLeagueId.trim();

        try {
            // 1. Verify that the league exists
            const { data: league, error: findError } = await supabase
                .from('leagues')
                .select('league_id, league_name')
                .eq('league_id', targetLeagueId)
                .single();

            if (findError || !league) {
                throw new Error('League not found! Make sure you entered the correct code.');
            }

            // 2. Check if already a member
            const { data: existingMember } = await supabase
                .from('league_members')
                .select('*')
                .eq('league_id', targetLeagueId)
                .eq('user_id', userId)
                .single();

            if (existingMember) {
                setLeagueId(targetLeagueId);
                setJoinLeagueId('');
                setStatusMessage({ text: `You are already part of "${league.league_name}"!`, isError: false });
                await fetchUserLeagues();
                setShowLeagueManager(false);
                return;
            }

            // 3. Insert membership
            const { error: joinError } = await supabase
                .from('league_members')
                .insert([{ league_id: targetLeagueId, user_id: userId }]);

            if (joinError) throw joinError;

            setJoinLeagueId('');
            setLeagueId(targetLeagueId);
            setStatusMessage({ text: `Successfully joined "${league.league_name}"!`, isError: false });
            await fetchUserLeagues();
            setShowLeagueManager(false);
        } catch (err: any) {
            console.error(err);
            setStatusMessage({ text: err.message || 'Could not join league.', isError: true });
        } finally {
            setSubmitting(false);
        }
    };

    const handleLeaveLeague = async () => {
        if (!leagueId) return;
        setSubmitting(true);
        setStatusMessage(null);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const currentUserId = session?.user?.id;
            if (!currentUserId) {
                throw new Error("User session not found. Please log in again.");
            }

            const leavingLeagueName = selectedLeague?.league_name || 'the league';
            
            // Perform delete with .select() to verify if rows were actually deleted
            const { data: deletedRows, error: leaveError } = await supabase
                .from('league_members')
                .delete()
                .eq('league_id', leagueId)
                .eq('user_id', currentUserId)
                .select();

            if (leaveError) throw leaveError;

            // If no rows were deleted, check if the member row actually exists to diagnose RLS issues
            if (!deletedRows || deletedRows.length === 0) {
                const { data: exists } = await supabase
                    .from('league_members')
                    .select('*')
                    .eq('league_id', leagueId)
                    .eq('user_id', currentUserId)
                    .maybeSingle();

                if (exists) {
                    throw new Error("Database permission restriction (RLS) is blocking membership deletion. Please ask the league administrator to remove your record.");
                } else {
                    throw new Error("You are not registered as a member of this league.");
                }
            }

            setStatusMessage({ text: `You successfully left "${leavingLeagueName}".`, isError: false });
            setShowLeaveConfirm(false);
            
            setLeagueId(null);
            await fetchUserLeagues();
        } catch (err: any) {
            console.error('Error leaving league:', err);
            setStatusMessage({ text: err.message || 'Could not leave league.', isError: true });
        } finally {
            setSubmitting(false);
        }
    };

    const handleDropLeague = async () => {
        if (!leagueId) return;
        setSubmitting(true);
        setStatusMessage(null);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const currentUserId = session?.user?.id;
            if (!currentUserId) {
                throw new Error("User session not found. Please log in again.");
            }

            const droppingLeagueName = selectedLeague?.league_name || 'the league';

            // If the user has administrator privileges, we don't need to filter by created_by
            let query = supabase.from('leagues').delete().eq('league_id', leagueId);
            if (!showAdminBtn) {
                query = query.eq('created_by', currentUserId);
            }

            const { data: deletedRows, error: deleteError } = await query.select();

            if (deleteError) throw deleteError;

            if (!deletedRows || deletedRows.length === 0) {
                throw new Error("Failed to drop league. Verify that you have permissions to delete this league.");
            }

            setStatusMessage({ text: `League "${droppingLeagueName}" has been successfully deleted.`, isError: false });
            setShowDropConfirm(false);
            
            setLeagueId(null);
            await fetchUserLeagues();
        } catch (err: any) {
            console.error('Error dropping league:', err);
            setStatusMessage({ text: err.message || 'Could not drop league.', isError: true });
        } finally {
            setSubmitting(false);
        }
    };

    const copyLeagueId = () => {
        if (!leagueId) return;
        navigator.clipboard.writeText(leagueId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const selectedLeague = joinedLeagues.find(l => l.league_id === leagueId);

    if (loading) {
        return (
            <>
            <style>{globalStyles}</style>
            <div className="loading-screen">
            <div className="loading-ball">⚽</div>
            <p className="loading-text">{t('loadingDashboard')}</p>
            </div>
            </>
        );
    }

    return (
        <>
        <style>{globalStyles}</style>
        <div className={`dashboard ${isAr ? 'rtl-active' : ''}`}>

        {/* Header */}
        <header className="header">
        <div className="header-inner">
        <div className="header-left">
        <div className="trophy-icon">
          <img 
            src="https://i.imgur.com/2b1mFMB.png" 
            alt="FIFA World Cup Trophy" 
            className="trophy-image" 
            referrerPolicy="no-referrer" 
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
        <p className="header-eyebrow" style={{ margin: 0, padding: 0, fontFamily: isAr ? 'Cairo, system-ui' : undefined, lineHeight: 1.1 }}>
            {isAr ? t('appTitle') : "Alawadhi's WC prediction pool"}
        </p>
        <h1 className="header-title" style={{ marginTop: '0.6rem', marginBottom: '0.45rem', padding: 0, fontFamily: isAr ? 'Cairo, system-ui' : undefined, lineHeight: 1 }}>
            {t('worldCupTitle')} <span className="header-year">{t('year2026')}</span>
        </h1>
        <p style={{ color: 'var(--gold)', fontFamily: isAr ? 'Cairo, system-ui' : 'Bebas Neue', fontSize: isAr ? '0.85rem' : '1.05rem', letterSpacing: isAr ? 'normal' : '0.15em', margin: 0, padding: 0, opacity: 0.9, lineHeight: 1.1 }}>
            {t('countries')}
        </p>
        </div>
        </div>
        <div className="header-right" style={{ direction: 'ltr' }}>
        {showAdminBtn && (
            <button 
                onClick={() => window.location.hash = '/admin'} 
                className="theme-toggle-btn" 
                style={{ backgroundColor: '#7c3aed', color: '#fff', borderColor: '#6d28d9', fontWeight: 'bold' }}
                title="Open Stadium Control Panel"
            >
                ⚙️ {isAr ? 'لوحة التحكم' : 'Admin Panel'}
            </button>
        )}
        <button 
            onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')} 
            className="theme-toggle-btn" 
            style={{ fontWeight: 'bold' }}
        >
            {language === 'en' ? '🇸🇦 العربية' : '🇬🇧 English'}
        </button>
        <button 
            onClick={() => {
                setShowNotificationCenter(!showNotificationCenter);
                playChime('lockin');
            }} 
            className="theme-toggle-btn"
            style={{ 
                position: 'relative', 
                fontWeight: 'bold', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.25rem',
                border: showNotificationCenter ? '1px solid var(--gold)' : undefined, 
                backgroundColor: showNotificationCenter ? 'rgba(201,168,76,0.1)' : undefined
            }}
            title={isAr ? 'إعدادات الإشعارات والتنبيهات المباشرة' : 'Auto Push Alerts Configuration'}
        >
            🔔 {isAr ? 'التنبيهات' : 'Alerts'}
            {notifications.filter(n => !n.isRead).length > 0 && (
                <span style={{ 
                    position: 'absolute', 
                    top: '-6px', 
                    right: '-4px', 
                    backgroundColor: 'var(--red)', 
                    color: '#ffffff', 
                    fontSize: '0.625rem', 
                    fontWeight: 'bold', 
                    minWidth: '16px', 
                    height: '16px', 
                    borderRadius: '8px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    padding: '0 4px',
                    boxShadow: '0 0 6px rgba(200,16,46,0.8)'
                }}>
                    {notifications.filter(n => !n.isRead).length}
                </span>
            )}
        </button>
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="theme-toggle-btn" title="Toggle color theme">
            {theme === 'dark' ? t('themeLightBtn') : t('themeDarkBtn')}
        </button>
        <button onClick={handleLogout} className="logout-btn" title="Sign out of your profile">
            🚪 {t('signOut')}
        </button>
        </div>
        </div>
        <div className="header-stripe" />
        </header>

        {/* Floating Screen Toasts Container */}
        <div style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            pointerEvents: 'none',
            maxWidth: '360px',
            width: '100%'
        }}>
            {toasts.map(toast => (
                <div 
                    key={toast.id}
                    style={{
                        pointerEvents: 'auto',
                        backgroundColor: '#111d30',
                        border: '2px solid var(--gold)',
                        borderRadius: '10px',
                        padding: '1rem',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                        display: 'flex',
                        gap: '0.75rem',
                        alignItems: 'flex-start',
                        color: '#fff',
                        position: 'relative',
                        animation: 'slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                >
                    <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>
                        {toast.type === 'lockin' ? '⏰' : toast.type === 'whistle' ? '🏁' : '🏆'}
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', flex: 1 }}>
                        <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#fff', paddingRight: '1rem' }}>
                            {toast.title}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.85)', lineHeight: 1.3 }}>
                            {toast.body}
                        </span>
                    </div>
                    <button 
                        onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#8b95a5',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            position: 'absolute',
                            top: '8px',
                            right: '8px',
                            outline: 'none'
                        }}
                        className="hover:text-white"
                    >
                        ✕
                    </button>
                </div>
            ))}
        </div>

        {/* Notification Center Popover */}
        {showNotificationCenter && (
            <div style={{
                maxWidth: '600px',
                width: 'calc(100% - 2rem)',
                margin: '1rem auto 1.5rem',
                backgroundColor: 'var(--surface)',
                border: '2px solid var(--gold)',
                borderRadius: '12px',
                padding: '1.25rem',
                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                animation: 'slideUp 0.25s ease-out',
                position: 'relative',
                zIndex: 9999,
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1.25rem' }}>⚽</span>
                        <h3 style={{ fontFamily: isAr ? 'Cairo, system-ui' : 'Bebas Neue', letterSpacing: isAr ? 'normal' : '0.05em', fontSize: '1.3rem', color: 'var(--white)', margin: 0 }}>
                            {isAr ? 'مركز الإشعارات التفاعلية' : 'LIVE NOTIFICATIONS HUB'}
                        </h3>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', direction: isAr ? 'rtl' : 'ltr' }}>
                        <button 
                            onClick={() => {
                                markAllAsRead();
                                playChime('standings');
                            }}
                            className="action-btn action-btn--secondary" 
                            style={{ fontSize: '0.7rem', padding: '0.25rem 0.6rem', fontFamily: isAr ? 'Cairo, system-ui' : 'Bebas Neue', letterSpacing: '0.05em' }}
                        >
                            {isAr ? 'قراءة الكل' : 'Mark All Read'}
                        </button>
                        <button 
                            onClick={clearNotificationsHistory}
                            className="action-btn action-btn--secondary" 
                            style={{ fontSize: '0.7rem', padding: '0.25rem 0.6rem', color: '#f87171', fontFamily: isAr ? 'Cairo, system-ui' : 'Bebas Neue', letterSpacing: '0.05em' }}
                        >
                            {isAr ? 'مسح التاريخ' : 'Clear All'}
                        </button>
                        <button 
                            onClick={() => setShowNotificationCenter(false)} 
                            style={{ background: 'transparent', border: 'none', color: 'var(--grey)', fontSize: '1.2rem', cursor: 'pointer', padding: '0 0.25rem' }}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Settings panel inside drawer */}
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    backgroundColor: 'rgba(255,255,255,0.02)', 
                    padding: '0.75rem', 
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.06)' 
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', textAlign: isAr ? 'right' : 'left' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--gold)', fontFamily: isAr ? 'Cairo, system-ui' : 'Barlow, sans-serif' }}>
                            {isAr ? '⚡ الإشعارات مفعلة تلقائياً' : '⚡ Push Alerts Auto-Enabled'}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--grey)', fontFamily: isAr ? 'Cairo, system-ui' : 'Barlow, sans-serif', opacity: 0.9 }}>
                            {isAr ? 'يتلقى تذكيرات الإغلاق وتغيير المراكز في الخلفية تلقائياً' : 'Receives lock-in alarms, scores, and rank shifts in the background'}
                        </span>
                    </div>
                    <button 
                        onClick={async () => {
                            const val = !pushEnabled;
                            setPushEnabled(val);
                            setNotificationsEnabled(val);
                            if (val && userId) {
                                try {
                                    const result = await subscribeToBackgroundPush(userId, pushLang);
                                    if (result.success) {
                                        triggerNotification(
                                            isAr ? 'تم تفعيل التنبيهات بنجاح!' : 'Background Alerts Activated!',
                                            isAr ? 'جهازك مسجل الآن لتلقي تحديثات البطولة بالخلفية.' : 'Your device is registered for background trophy alerts.',
                                            'whistle'
                                        );
                                    } else {
                                        triggerNotification(
                                            isAr ? 'تنبيه للتسجيل' : 'Browser Alert Action Required',
                                            result.error || (isAr ? 'الرجاء تمكين إشعارات النظام وتجربتها.' : 'Please allow notification permissions in your browser bar.'),
                                            'lockin'
                                        );
                                    }
                                } catch (err: any) {
                                    console.warn('Background push toggle failed:', err);
                                }
                            }
                        }}
                        style={{
                            backgroundColor: pushEnabled ? '#10b981' : '#dc2626',
                            color: '#fff',
                            border: 'none',
                            padding: '0.35rem 0.75rem',
                            borderRadius: '4px',
                            fontWeight: 'bold',
                            fontFamily: 'Bebas Neue',
                            letterSpacing: '0.05em',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            minWidth: '70px',
                        }}
                    >
                        {pushEnabled ? (isAr ? 'نشط' : 'ACTIVE') : (isAr ? 'صامت' : 'MUTED')}
                    </button>
                </div>

                {/* Segmented Push language picker */}
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    backgroundColor: 'rgba(255,255,255,0.02)', 
                    padding: '0.75rem', 
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.06)',
                    marginTop: '0.5rem'
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', textAlign: isAr ? 'right' : 'left' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--gold)', fontFamily: isAr ? 'Cairo, system-ui' : 'Barlow, sans-serif' }}>
                            {isAr ? '🌐 لغة الإشعارات' : '🌐 Notification Language'}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--grey)', fontFamily: isAr ? 'Cairo, system-ui' : 'Barlow, sans-serif', opacity: 0.9 }}>
                            {isAr ? 'اختر لغة استقبال الإشعارات والرسائل' : 'Choose language for receiving notifications'}
                        </span>
                    </div>

                    <div style={{ display: 'flex', gap: '2px', backgroundColor: 'rgba(0,0,0,0.3)', padding: '2px', borderRadius: '6px' }}>
                        <button
                            onClick={async () => {
                                setPushLang('en');
                                localStorage.setItem('wc_push_lang', 'en');
                                if (userId) {
                                    try {
                                        const result = await subscribeToBackgroundPush(userId, 'en');
                                        if (result.success) {
                                            triggerNotification(
                                                'Language Set to English',
                                                'Background push alerts will now be dispatched in English.',
                                                'whistle'
                                            );
                                        }
                                    } catch (err) {
                                        console.warn('Push language selection error:', err);
                                    }
                                }
                            }}
                            style={{
                                backgroundColor: pushLang === 'en' ? 'var(--gold)' : 'transparent',
                                color: pushLang === 'en' ? '#000' : 'rgba(255,255,255,0.8)',
                                border: 'none',
                                padding: '0.25rem 0.6rem',
                                borderRadius: '4px',
                                fontWeight: 'bold',
                                fontSize: '0.75rem',
                                fontFamily: 'Barlow, sans-serif',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                outline: 'none'
                            }}
                        >
                            EN
                        </button>
                        <button
                            onClick={async () => {
                                setPushLang('ar');
                                localStorage.setItem('wc_push_lang', 'ar');
                                if (userId) {
                                    try {
                                        const result = await subscribeToBackgroundPush(userId, 'ar');
                                        if (result.success) {
                                            triggerNotification(
                                                'تم تعيين الإشعارات بالعربية',
                                                'سيتم إرسال تنبيهات الخلفية المباريات باللغة العربية.',
                                                'whistle'
                                            );
                                        }
                                    } catch (err) {
                                        console.warn('Push language selection error:', err);
                                    }
                                }
                            }}
                            style={{
                                backgroundColor: pushLang === 'ar' ? 'var(--gold)' : 'transparent',
                                color: pushLang === 'ar' ? '#000' : 'rgba(255,255,255,0.8)',
                                border: 'none',
                                padding: '0.25rem 0.6rem',
                                borderRadius: '4px',
                                fontWeight: 'bold',
                                fontSize: '0.75rem',
                                fontFamily: 'Cairo, system-ui',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                outline: 'none'
                            }}
                        >
                            العربية
                        </button>
                    </div>
                </div>

                {/* Standalone Window Tip for Native OS notifications */}
                <div style={{
                    backgroundColor: 'rgba(201, 168, 76, 0.05)',
                    border: '1px dashed var(--gold)',
                    borderRadius: '8px',
                    padding: '0.6rem 0.75rem',
                    fontSize: '0.725rem',
                    color: '#c9a84c',
                    lineHeight: '1.35',
                    textAlign: isAr ? 'right' : 'left',
                    fontFamily: isAr ? 'Cairo, system-ui' : 'Barlow, sans-serif'
                }}>
                    🔒 {isAr 
                        ? 'تنبيه مستخدمي الأجهزة: لتشغيل الإشعارات على iPhone/iPad، يرجى فتح الرابط في Safari وضغط زر المشاركة ثم "أضف إلى الشاشة الرئيسية" (Add to Home Screen). على الكمبيوتر أو الأندرويد، يرجى فتح الرابط في متصفح خارجي مستقل والموافقة على الصلاحية.' 
                        : 'Device Guidelines: iOS/iPhone players must open this app in Safari, tap "Share", and select "Add to Home Screen" to enable native notifications. Android and Desktop players just need to open the link in a standalone new browser window.'}
                </div>

                {/* History list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                    {notifications.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--grey)', fontSize: '0.8rem', fontStyle: 'italic', fontFamily: isAr ? 'Cairo, system-ui' : 'Barlow, sans-serif' }}>
                            {isAr ? 'بانتظار إشعارات المجموعات المباشرة... 🏟️' : 'Listening for live match updates and group shifts... 🏟️'}
                        </div>
                    ) : (
                        notifications.map(n => (
                            <div 
                                key={n.id} 
                                onClick={() => markAsRead(n.id)}
                                style={{
                                    display: 'flex',
                                    gap: '0.75rem',
                                    padding: '0.6rem 0.75rem',
                                    backgroundColor: n.isRead ? 'rgba(255,255,255,0.01)' : 'rgba(201,168,76,0.04)',
                                    border: n.isRead ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(201,168,76,0.15)',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    alignItems: 'center',
                                    transition: 'background-color 0.15s'
                                }}
                                className="hover:bg-white/[0.04]"
                            >
                                <span style={{ fontSize: '1.25rem' }}>
                                    {n.type === 'lockin' ? '⏰' : n.type === 'whistle' ? '🏁' : '🏆'}
                                </span>
                                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '0.1rem', textAlign: isAr ? 'right' : 'left' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <span style={{ fontWeight: 700, fontSize: '0.8rem', color: n.isRead ? 'var(--grey)' : 'var(--white)' }}>
                                            {n.title}
                                        </span>
                                        <span style={{ fontSize: '0.65rem', color: 'var(--grey)', fontFamily: 'monospace' }}>
                                            {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <span style={{ fontSize: '0.75rem', color: n.isRead ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.8)', lineHeight: 1.3 }}>
                                        {n.body}
                                    </span>
                                </div>
                                {!n.isRead && (
                                    <span style={{ width: '6px', height: '6px', borderRadius: '3px', backgroundColor: 'var(--gold)' }} />
                                )}
                            </div>
                        ))
                    )}
                </div>

                {/* Instant interactive demo triggers */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.75rem' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--grey)', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: isAr ? 'Cairo, system-ui' : 'Barlow, sans-serif' }}>
                        {isAr ? '🧪 اختبار سريع للتنبيهات (تفاعلي):' : '🧪 QUICK SIMULATION TEST (INTERACTIVE):'}
                    </span>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                        <button 
                            onClick={() => {
                                playChime('lockin');
                                triggerNotification(
                                    isNotifAr ? '⏰ تذكير بإغلاق التوقعات (تجربة)' : '⏰ Lock-In Reminder (Demo)',
                                    isNotifAr ? 'مباراة منتخب السعودية ضد المكسيك تبدأ بعد ساعتين! لا تفوت النقاط.' : 'Saudi Arabia vs Mexico kicks off in 2h! Finalize your forecast score now.',
                                    'lockin'
                                );
                            }}
                            className="action-btn action-btn--secondary"
                            style={{ fontSize: '0.65rem', padding: '0.45rem', borderRadius: '6px', whiteSpace: 'normal', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                            ⏱️ Remind Lock-In
                        </button>
                        <button 
                            onClick={() => {
                                playChime('whistle');
                                triggerNotification(
                                    isNotifAr ? '🏁 صافرة النهاية!' : '🏁 Final Whistle! (Demo)',
                                    isNotifAr ? 'البرازيل ٢ - ١ إنجلترا انتهت! توقعت ٢-١ وكسبت ٥ نقاط كاملة للتوقع الدقيق.' : 'Brazil 2 - 1 England finished! You picked 2-1 and won 5 flat Exact Points.',
                                    'whistle'
                                );
                            }}
                            className="action-btn action-btn--secondary"
                            style={{ fontSize: '0.65rem', padding: '0.45rem', borderRadius: '6px', whiteSpace: 'normal', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                            🏁 Referee Whistle
                        </button>
                        <button 
                            onClick={() => {
                                playChime('standings');
                                triggerNotification(
                                    isNotifAr ? '🏆 صعود وهبوط الترتيب!' : '🏆 Standing Shift (Demo)',
                                    isNotifAr ? 'صعدت من المركز الرابع إلى الثاني في الترتيب العام! 🎉' : 'You climbed from #4 to #2 in the overall standings! 🎉',
                                    'standings'
                                );
                            }}
                            className="action-btn action-btn--secondary"
                            style={{ fontSize: '0.65rem', padding: '0.45rem', borderRadius: '6px', whiteSpace: 'normal', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                            📈 Standings Shift
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Tab Bar */}
        <nav className="tab-bar">
        <div className="tab-bar-inner">
            <div className="tab-links-group" style={{ display: 'flex', gap: '1rem' }}>
                {tabs.map((tab) => (
                    <button
                    key={tab.id}
                    onClick={() => {
                        setActiveTab(tab.id);
                        setStatusMessage(null);
                    }}
                    className={`tab-btn ${activeTab === tab.id ? 'tab-btn--active' : ''}`}
                    >
                    <span className="tab-icon">{tab.icon}</span>
                    <span className="tab-label">{tab.label}</span>
                    {activeTab === tab.id && <span className="tab-underline" />}
                    </button>
                ))}
            </div>
        {username && (
            <p style={{ 
                marginLeft: isAr ? '16px' : 'auto', 
                marginRight: isAr ? 'auto' : '16px', 
                marginTop: 0, 
                marginBottom: 0, 
                alignSelf: 'center',
                display: 'flex',
                flexDirection: 'column',      /* 🟢 Stacks elements vertically */
                alignItems: isAr ? 'flex-start' : 'flex-end', /* 🟢 Aligns text neatly to the right edge (left for Arabic) */
                gap: '2px',                   /* Spacing between Hello and the name */
                flexShrink: 0,
                color: 'var(--white)', 
                fontFamily: isAr ? 'Cairo, system-ui' : 'Barlow, sans-serif', 
                fontSize: '0.8rem', 
                fontWeight: 600,
                opacity: 0.95,
                lineHeight: 1.1,
            }}>
                <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                    {isAr ? 'مرحباً،' : 'Hello,'}
                </span>
                <span style={{ 
                    color: 'var(--gold2)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis', /* 🔴 Safety net: adds '...' if the name is ridiculously long */
                    maxWidth: '100px'         /* 🔴 Caps width on mobile just in case */
                }}>
                    {username}
                </span>
            </p>
        )}
        </div>
        </nav>

        {/* Content */}
        <main className="content">
        <div className="content-inner">
            {activeTab === 'predictions' && (
                <PredictionsTab 
                    activeLeagueId={leagueId} 
                    joinedLeagues={joinedLeagues} 
                />
            )}
            {activeTab === 'fixtures' && <FixturesTab />}
            
            {activeTab === 'standings' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* Active League Controls */}
                    {joinedLeagues.length > 0 && (
                        <div className="league-bar">
                            <div className="league-bar-left">
                                <span className="league-label">{t('activeLeague')}</span>
                                <div style={{ position: 'relative', display: 'flex', flex: 1, minWidth: '200px' }} className="league-selector-wrapper">
                                    <select 
                                        className="league-selector"
                                        value={leagueId || ''} 
                                        onChange={(e) => setLeagueId(e.target.value)}
                                        style={{ width: '100%' }}
                                    >
                                        {joinedLeagues.map(l => (
                                            <option key={l.league_id} value={l.league_id}>
                                                {l.league_name}
                                            </option>
                                        ))}
                                    </select>
                                    <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                    </span>
                                </div>
                            </div>

                            <div className="league-bar-actions">
                                <button
                                    onClick={copyLeagueId}
                                    className="action-btn action-btn--secondary"
                                    title="Copy league code to invite members"
                                >
                                    {copied ? t('inviteCodeCopied') : t('inviteCodeCopy')}
                                </button>
                                <button
                                    onClick={() => setShowLeagueManager(prev => !prev)}
                                    className="action-btn action-btn--primary"
                                >
                                    ⚽ {t('createOrJoin')}
                                </button>
                                {selectedLeague?.created_by === userId || (showAdminBtn && !selectedLeague?.created_by) ? (
                                    <button
                                        onClick={() => setShowDropConfirm(prev => !prev)}
                                        className="action-btn"
                                        style={{
                                            backgroundColor: '#dc2626',
                                            color: '#ffffff',
                                            fontWeight: '600',
                                            cursor: 'pointer'
                                        }}
                                        title="Delete this league completely"
                                    >
                                        {t('dropLeague')}
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => setShowLeaveConfirm(prev => !prev)}
                                        className="action-btn"
                                        style={{
                                            backgroundColor: '#ef4444',
                                            color: '#ffffff',
                                            fontWeight: '600',
                                            cursor: 'pointer'
                                        }}
                                        title="Leave this league"
                                    >
                                        {t('leaveLeague')}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Drop League (Permanent Delete) Confirmation Panel */}
                    {showDropConfirm && joinedLeagues.length > 0 && (
                        <div className="status-banner status-banner--error" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.25rem', borderRadius: '12px', alignItems: 'stretch' }}>
                            <div style={{ fontWeight: '600', fontSize: '0.95rem' }}>
                                ⚠️ {t('confirmDropLeague')}
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', direction: 'ltr' }}>
                                <button
                                    onClick={() => setShowDropConfirm(false)}
                                    style={{
                                        padding: '0.4rem 1rem',
                                        borderRadius: '6px',
                                        fontSize: '0.813rem',
                                        fontWeight: '600',
                                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                        color: 'var(--white)',
                                        border: '1px solid var(--border-color)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {t('cancelBtn')}
                                </button>
                                <button
                                    onClick={handleDropLeague}
                                    style={{
                                        padding: '0.4rem 1rem',
                                        borderRadius: '6px',
                                        fontSize: '0.813rem',
                                        fontWeight: '700',
                                        backgroundColor: '#b91c1c',
                                        color: '#ffffff',
                                        border: 'none',
                                        cursor: 'pointer'
                                    }}
                                    disabled={submitting}
                                >
                                    {submitting ? '...' : t('dropBtn')}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Leave League Confirmation Inline Panel */}
                    {showLeaveConfirm && joinedLeagues.length > 0 && (
                        <div className="status-banner status-banner--error" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.25rem', borderRadius: '12px', alignItems: 'stretch' }}>
                            <div style={{ fontWeight: '600', fontSize: '0.95rem' }}>
                                ⚠️ {t('confirmLeaveLeague')}
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', direction: 'ltr' }}>
                                <button
                                    onClick={() => setShowLeaveConfirm(false)}
                                    style={{
                                        padding: '0.4rem 1rem',
                                        borderRadius: '6px',
                                        fontSize: '0.813rem',
                                        fontWeight: '600',
                                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                        color: 'var(--white)',
                                        border: '1px solid var(--border-color)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {t('cancelBtn')}
                                </button>
                                <button
                                    onClick={handleLeaveLeague}
                                    style={{
                                        padding: '0.4rem 1rem',
                                        borderRadius: '6px',
                                        fontSize: '0.813rem',
                                        fontWeight: '700',
                                        backgroundColor: '#dc2626',
                                        color: '#ffffff',
                                        border: 'none',
                                        cursor: 'pointer'
                                    }}
                                    disabled={submitting}
                                >
                                    {submitting ? '...' : t('leaveBtn')}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Feedback Messages */}
                    {statusMessage && (
                        <div className={`status-banner ${statusMessage.isError ? 'status-banner--error' : 'status-banner--success'}`}>
                            {statusMessage.text}
                            <button className="status-close" onClick={() => setStatusMessage(null)}>✕</button>
                        </div>
                    )}

                    {/* Self-service Creation & Joining Controls Drawer */}
                    {(joinedLeagues.length === 0 || showLeagueManager) && (
                        <div className="league-creation-panel">
                            <h3 className="panel-title">{t('createOrJoin')}</h3>
                            <p className="panel-desc">{t('leagueDesc')}</p>
                            
                            <div className="panel-grid">
                                {/* Create League */}
                                <form onSubmit={handleCreateLeague} className="panel-form">
                                    <h4 className="form-subheading">{t('createNewLeague')}</h4>
                                    <div className="form-group">
                                        <input
                                            type="text"
                                            className="league-input text-start"
                                            placeholder={t('placeholderLeagueName')}
                                            value={newLeagueName}
                                            onChange={(e) => setNewLeagueName(e.target.value)}
                                            required
                                            disabled={submitting}
                                        />
                                        <button type="submit" className="form-submit-btn hover-grow" disabled={submitting}>
                                            {submitting ? t('processing') : t('establishBtn')}
                                        </button>
                                    </div>
                                </form>

                                {/* Join League */}
                                <form onSubmit={handleJoinLeague} className="panel-form">
                                    <h4 className="form-subheading">{t('joinWithCode')}</h4>
                                    <div className="form-group">
                                        <input
                                            type="text"
                                            className="league-input text-start"
                                            placeholder={t('placeholderJoinCode')}
                                            value={joinLeagueId}
                                            onChange={(e) => setJoinLeagueId(e.target.value)}
                                            required
                                            disabled={submitting}
                                        />
                                        <button type="submit" className="form-submit-btn hover-grow" disabled={submitting}>
                                            {submitting ? t('processing') : t('joinBtn')}
                                        </button>
                                    </div>
                                </form>
                            </div>

                            {joinedLeagues.length > 0 && (
                                <button className="cancel-mgr-btn" onClick={() => setShowLeagueManager(false)}>
                                    {t('discardReturn')}
                                </button>
                            )}
                        </div>
                    )}

                    {/* Standard Standings Rendering */}
                    {leagueId ? (
                        <StandingsTab leagueId={leagueId} />
                    ) : (
                        joinedLeagues.length === 0 && (
                            <div className="empty-state">
                                <span className="empty-icon font-display">🏟️</span>
                                <h3 style={{ fontFamily: isAr ? 'Cairo, system-ui' : 'Bebas Neue', letterSpacing: '0.05em', fontSize: '1.4rem' }}>{t('enterArena')}</h3>
                                <p style={{ color: 'var(--grey)', fontSize: '0.9rem', maxWidth: '380px', margin: '0 auto' }}>
                                    {t('noLeagueEnrolled')}
                                </p>
                            </div>
                        )
                    )}
                </div>
            )}

            {activeTab === 'rankings' && <RankingsTab />}
        </div>
        </main>

        <footer className="footer-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ fontFamily: isAr ? 'Cairo, system-ui' : 'Barlow, sans-serif', color: 'var(--grey)' }}>
                ⚽ {isAr ? "توقعات كأس العالم ٢٠٢٦" : "World Cup 2026 Prediction Pool"}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: isAr ? 'Cairo, system-ui' : 'Barlow, sans-serif' }}>
                <span className="online-indicator-dot" style={{ 
                    display: 'inline-block', 
                    width: '8px', 
                    height: '8px', 
                    backgroundColor: '#10b981', 
                    borderRadius: '50%',
                    boxShadow: '0 0 8px #22c55e'
                }} />
                <span className="online-indicator-text" style={{ fontWeight: 600, color: 'var(--white)' }}>
                    {isAr ? `المتصلون الآن: ${onlineCount}` : `Online Users: ${onlineCount}`}
                </span>
            </div>
        </footer>

        </div>
        </>
    );
}

const globalStyles = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow:wght@400;500;600;700&display=swap');

:root {
    --navy:   #0A1628;
    --navy2:  #0D1F3C;
    --red:    #C8102E;
    --red2:   #A50D24;
    --gold:   #C9A84C;
    --gold2:  #E8C96A;
    --white:  #F8F8F8;
    --grey:   #8B95A5;
    --surface: #111D30;
    --radius: 12px;
    --border-color: rgba(255,255,255,0.06);
    --input-bg: var(--navy);
}

body.light-theme {
    --navy:     #EAECEF; /* slightly darker off-white background to ease ocular brightness */
    --navy2:    #F8F9FA; /* softer surface/header backgrounds instead of blinding pure white */
    --surface:  #DFE2E6; /* slightly deeper boundaries for distinct sectioning */
    --white:    #1A202C; /* softer dark charcoal for lower contrast stress */
    --grey:     #3E4A5B; /* darker, high-contrast steel grey for clear legibility */
    --border-color: rgba(17,24,39,0.16);
    --input-bg: #FFFFFF;
    --gold:     #8C6615;
    --gold2:    #B28827;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
    background: var(--navy);
    color: var(--white);
    font-family: 'Barlow', sans-serif;
    min-height: 100vh;
}

.loading-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: var(--navy);
    gap: 1rem;
}
.loading-ball {
    font-size: 3rem;
    animation: spin 1s linear infinite;
}
.loading-text {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 1.4rem;
    letter-spacing: 0.15em;
    color: var(--gold);
}
@keyframes spin { to { transform: rotate(360deg); } }

.dashboard {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background:
    radial-gradient(ellipse at 10% 0%, rgba(200,16,46,0.12) 0%, transparent 50%),
    radial-gradient(ellipse at 90% 100%, rgba(201,168,76,0.1) 0%, transparent 50%),
    var(--navy);
}

.header {
    position: relative;
    background: linear-gradient(135deg, var(--navy2) 0%, var(--surface) 100%);
    border-bottom: 3px solid var(--red);
    overflow: hidden;
}
.header-inner {
    max-width: 1100px;
    margin: 0 auto;
    padding: 1.5rem 2rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.header-left {
    display: flex;
    align-items: center;
    gap: 1rem;
}
.trophy-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    animation: glow 2.5s ease-in-out infinite alternate;
}
.trophy-image {
    width: 3.8rem;
    height: 3.8rem;
    object-fit: contain;
}
@keyframes glow {
    from { filter: drop-shadow(0 0 4px rgba(201,168,76,0.4)); }
    to   { filter: drop-shadow(0 0 14px rgba(201,168,76,0.9)); }
}
.header-eyebrow {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 0.75rem;
    letter-spacing: 0.25em;
    color: var(--gold);
    line-height: 1;
}
.header-title {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 2.2rem;
    letter-spacing: 0.06em;
    color: var(--white);
    line-height: 1;
}
.header-year { color: var(--gold); }
.header-badge {
    background: var(--red);
    color: #F8F8F8;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 0.85rem;
    letter-spacing: 0.2em;
    padding: 0.35rem 1rem;
    border-radius: 4px;
    border: 1px solid var(--red2);
}
.header-right {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}
.logout-btn {
    background: rgba(255, 255, 255, 0.05);
    color: var(--grey);
    border: 1px solid var(--border-color);
    font-family: 'Bebas Neue', sans-serif;
    font-size: 0.85rem;
    letter-spacing: 0.15em;
    padding: 0.35rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 0.4rem;
}
.logout-btn:hover {
    background: var(--red);
    color: #FFFFFF;
    border-color: var(--red2);
}
.theme-toggle-btn {
    background: rgba(255, 255, 255, 0.05);
    color: var(--grey);
    border: 1px solid var(--border-color);
    font-family: 'Bebas Neue', sans-serif;
    font-size: 0.85rem;
    letter-spacing: 0.15em;
    padding: 0.35rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
}
.theme-toggle-btn:hover {
    background: var(--gold);
    color: var(--navy);
    border-color: var(--gold2);
}
.header-stripe {
    position: absolute;
    right: -60px;
    top: 0;
    width: 160px;
    height: 100%;
    background: linear-gradient(135deg, transparent 40%, rgba(201,168,76,0.08) 40%);
    pointer-events: none;
}

.tab-bar {
    background: var(--surface);
    border-bottom: 1px solid rgba(255,255,255,0.06);
    position: sticky;
    top: 0;
    z-index: 10;
}
.tab-bar-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    white-space: nowrap; /* Keeps buttons from wrapping to a new line */
    gap: 1rem;
    padding: 0 0.5rem;
}
.tab-btn {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 1rem 1.25rem;
    border: none;
    background: transparent;
    color: var(--grey);
    font-family: 'Barlow', sans-serif;
    font-size: 0.9rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    cursor: pointer;
    transition: color 0.15s;
    white-space: nowrap;
}
.tab-btn:hover { color: var(--white); }
.tab-btn--active { color: var(--white); }
.tab-icon { font-size: 1rem; }
.tab-underline {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--red), var(--gold));
    border-radius: 3px 3px 0 0;
    animation: slideIn 0.2s ease;
}
@keyframes slideIn {
    from { transform: scaleX(0); opacity: 0; }
    to   { transform: scaleX(1); opacity: 1; }
}

.content {
    flex: 1;
    padding: 2.25rem 0;
}
.content-inner {
    max-width: 1100px;
    margin: 0 auto;
    padding: 0 2rem;
    animation: fadeUp 0.3s ease;
}
@keyframes fadeUp {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
}
@keyframes slideUp {
    from { opacity: 0; transform: translateY(30px) scale(0.92); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
}

/* League Management Styles */
.league-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--surface);
    border: 1px solid rgba(255,255,255,0.05);
    border-radius: var(--radius);
    padding: 1rem 1.25rem;
    gap: 1rem;
    flex-wrap: wrap;
}
.league-bar-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
}
.league-label {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 1.05rem;
    letter-spacing: 0.05em;
    color: var(--gold);
}
.league-selector {
    background: var(--navy);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 6px;
    padding: 0.5rem 2.25rem 0.5rem 1rem;
    color: var(--white);
    font-family: 'Barlow', sans-serif;
    font-size: 0.9rem;
    font-weight: 600;
    outline: none;
    cursor: pointer;
    min-width: 200px;
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
}
.rtl-active .league-selector {
    padding: 0.5rem 1rem 0.5rem 2.25rem;
}
.league-selector:focus {
    border-color: var(--gold);
}
.league-selector-wrapper span {
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    width: 2.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
}
.rtl-active .league-selector-wrapper span {
    right: auto;
    left: 0;
}
.league-bar-actions {
    display: flex;
    gap: 0.5rem;
}
.action-btn {
    font-family: 'Bebas Neue', sans-serif;
    letter-spacing: 0.06em;
    font-size: 0.85rem;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    transition: background 0.2s, transform 0.1s;
}
.action-btn:active {
    transform: scale(0.97);
}
.action-btn--primary {
    background: var(--red);
    color: #fff;
}
.action-btn--primary:hover {
    background: var(--red2);
}
.action-btn--secondary {
    background: rgba(255,255,255,0.06);
    color: var(--white);
    border: 1px solid rgba(255,255,255,0.1);
}
.action-btn--secondary:hover {
    background: rgba(255,255,255,0.12);
}
body.light-theme .action-btn--secondary {
    background: rgba(17,24,39,0.05);
    color: var(--white);
    border: 1px solid rgba(17,24,39,0.22);
}
body.light-theme .action-btn--secondary:hover {
    background: rgba(17,24,39,0.10);
}

.status-banner {
    position: relative;
    padding: 0.9rem 2.5rem 0.9rem 1.25rem;
    border-radius: var(--radius);
    font-weight: 500;
    font-size: 0.875rem;
    display: flex;
    align-items: center;
}
.status-banner--success {
    background: rgba(16,185,129,0.1);
    border: 1px solid rgba(16,185,129,0.3);
    color: #34d399;
}
.status-banner--error {
    background: rgba(239,68,68,0.1);
    border: 1px solid rgba(239,68,68,0.3);
    color: #f87171;
}
.status-close {
    position: absolute;
    right: 1rem;
    background: none;
    border: none;
    color: currentColor;
    cursor: pointer;
    font-size: 0.9rem;
}

.league-creation-panel {
    background: linear-gradient(135deg, var(--navy2) 0%, rgba(13,31,60,0.5) 100%);
    border: 1px dashed rgba(201,168,76,0.3);
    border-radius: var(--radius);
    padding: 1.75rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
}
.panel-title {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 1.6rem;
    letter-spacing: 0.05em;
    color: var(--white);
}
.panel-desc {
    color: var(--grey);
    font-size: 0.85rem;
    line-height: 1.4;
}
.panel-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
}
@media (max-width: 768px) {
    .panel-grid {
        grid-template-columns: 1fr;
        gap: 1.5rem;
    }
}
.panel-form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}
.form-subheading {
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--gold);
}
.form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}
.league-input {
    background: var(--navy);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 6px;
    padding: 0.7rem 0.9rem;
    color: var(--white);
    font-family: 'Barlow', sans-serif;
    font-size: 0.9rem;
    outline: none;
}
.league-input:focus {
    border-color: var(--gold);
}
.form-submit-btn {
    background: var(--navy);
    color: var(--white);
    border: 1px solid var(--gold);
    font-family: 'Bebas Neue', sans-serif;
    letter-spacing: 0.06em;
    padding: 0.7rem;
    border-radius: 6px;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s;
}
.form-submit-btn:hover {
    background: var(--gold);
    color: var(--navy);
}
.cancel-mgr-btn {
    align-self: flex-start;
    background: none;
    border: none;
    color: var(--grey);
    font-size: 0.8rem;
    text-decoration: underline;
    cursor: pointer;
    margin-top: 0.5rem;
}
.cancel-mgr-btn:hover {
    color: var(--white);
}

.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 5rem 2rem;
    background: var(--surface);
    border-radius: var(--radius);
    border: 1px solid rgba(255,255,255,0.06);
    color: var(--grey);
    font-size: 1rem;
    text-align: center;
}
.empty-icon { font-size: 2.5rem; }

.footer-bar {
    display: flex;
    justify-content: space-between;
    padding: 0.75rem 2rem;
    background: var(--navy2);
    border-top: 1px solid rgba(255,255,255,0.05);
    font-size: 0.75rem;
    color: var(--grey);
    letter-spacing: 0.05em;
    font-family: 'Bebas Neue', sans-serif;
}

@media (max-width: 640px) {
    .league-bar {
        flex-direction: column;
        align-items: stretch;
        gap: 0.75rem;
        padding: 0.75rem 1rem;
    }
    .league-bar-left {
        width: 100%;
        justify-content: space-between;
    }
    .league-selector-wrapper {
        min-width: 0 !important;
        flex: 1;
        width: 100%;
    }
    .league-selector {
        min-width: 0;
        flex: 1;
        width: 100%;
    }
    .league-bar-actions {
        width: 100%;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.5rem;
    }
    .league-bar-actions button {
        width: 100%;
        font-size: 0.75rem;
        padding: 0.4rem 0.5rem;
    }
    .header-inner {
        flex-direction: column;
        align-items: flex-start;
        gap: 1rem;
        padding: 1rem;
    }
    .header-right {
        width: 100%;
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 0.5rem;
    }
    .theme-toggle-btn {
        width: 100%;
        min-width: 0;
        font-size: 0.75rem;
        padding: 0.4rem 0.5rem;
        justify-content: center;
    }
    .logout-btn {
        width: 100%;
        min-width: 0;
        font-size: 0.75rem;
        padding: 0.4rem 0.5rem;
        justify-content: center;
    }
    .header-right .logout-btn:nth-child(3) {
        grid-column: span 2;
    }
    .header-title { font-size: 1.4rem; }
    .header-eyebrow { font-size: 0.65rem; }
    .trophy-icon { font-size: 1.8rem; }
    .trophy-image { width: 3rem; height: 3rem; }
    .header-badge { display: none; }
    .tab-btn { padding: 0.85rem 0.75rem; font-size: 0.8rem; }
    .tab-label { display: none; }
    .tab-icon { font-size: 1.2rem; }
    .tab-bar-inner { padding: 0 0.5rem; }
    .content-inner { padding: 0 0.5rem; }
    .footer-bar { padding: 0.75rem 1rem; }
}
`;
