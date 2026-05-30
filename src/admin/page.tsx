"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase';
import { calculatePoints, isSurpriseLoot } from '@/utils/points';

interface SavedMatch {
    match_id: string;
    home_team: string;
    away_team: string;
    home_rank: number;
    away_rank: number;
    kickoff_time: string;
    group_stage: string | null;
    is_giant_slayer: boolean;
    home_score_final: number | null;
    away_score_final: number | null;
}

export default function AdminPanel() {
    const [activeTab, setActiveTab] = useState<'matches' | 'leagues' | 'members'>('matches');
    const [memberUserId, setMemberUserId] = useState('');
    const [selectedLeagueForMember, setSelectedLeagueForMember] = useState('');

    // UI Feedback & Data States
    const [statusMessage, setStatusMessage] = useState({ text: '', isError: false });
    const [leagueMembers, setLeagueMembers] = useState<any[]>([]);

    // Match states
    const [homeTeam, setHomeTeam] = useState('');
    const [awayTeam, setAwayTeam] = useState('');
    const [homeRank, setHomeRank] = useState('10');
    const [awayRank, setAwayRank] = useState('15');
    const [kickoffTime, setKickoffTime] = useState('');
    const [groupStage, setGroupStage] = useState('Group Stage');

    // League states
    const [leagueName, setLeagueName] = useState('');
    const [leagues, setLeagues] = useState<{league_id: string, league_name: string}[]>([]);

    const [savedMatches, setSavedMatches] = useState<SavedMatch[]>([]);
    const [scoreInputs, setScoreInputs] = useState<Record<string, { home: string; away: string }>>({});
    const [revertingMatchId, setRevertingMatchId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState({ currentAverage: 0, dynamicThreshold: 0 });
    const [checkingAdmin, setCheckingAdmin] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        const checkAdminAccess = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const user = session?.user;
                if (!user) {
                    window.location.hash = '/login';
                    return;
                }

                const email = (user.email || '').toLowerCase().trim();
                const metaDisplayName = (user.user_metadata?.display_name || '').toLowerCase().trim();

                // Fetch username from the profiles table as a fallback or secondary check
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('username')
                    .eq('id', user.id)
                    .single();

                const profileUsername = (profile?.username || '').toLowerCase().trim();

                const isAuthorised = 
                    email === 'aliawadhi@family.app' || 
                    email === 'aliawadhi93@gmail.com' ||
                    metaDisplayName === 'aliawadhi' ||
                    profileUsername === 'aliawadhi';

                if (isAuthorised) {
                    setIsAdmin(true);
                    setCheckingAdmin(false);
                    fetchData();
                } else {
                    alert("Unauthorized: Only user 'aliawadhi' or email 'aliawadhi@family.app' has access to this Stadium Control Panel.");
                    window.location.hash = '/dashboard';
                }
            } catch (err) {
                console.error("Admin check failed", err);
                window.location.hash = '/dashboard';
            }
        };
        checkAdminAccess();
    }, []);

    // Refresh member list when the selected league changes
    useEffect(() => {
        if (selectedLeagueForMember) {
            fetchLeagueMembers(selectedLeagueForMember);
        } else {
            setLeagueMembers([]);
        }
    }, [selectedLeagueForMember]);

    const fetchData = async () => {
        fetchPublishedMatches();
        const { data } = await supabase.from('leagues').select('league_id, league_name');
        if (data) setLeagues(data);
    };

        const fetchLeagueMembers = async (leagueId: string) => {
            const { data, error } = await supabase
            .from('league_members')
            .select('id, profiles(username)')
            .eq('league_id', leagueId);

            if (data) setLeagueMembers(data);
        };

            const fetchPublishedMatches = async () => {
                const { data } = await supabase.from('matches').select('*').order('kickoff_time', { ascending: true });
                if (data) {
                    setSavedMatches(data as SavedMatch[]);
                    calculateGlobalMetrics(data as SavedMatch[]);

                    const inputs: Record<string, { home: string; away: string }> = {};
                    data.forEach((m: any) => {
                        inputs[m.match_id] = {
                            home: m.home_score_final !== null && m.home_score_final !== undefined ? String(m.home_score_final) : '',
                            away: m.away_score_final !== null && m.away_score_final !== undefined ? String(m.away_score_final) : ''
                        };
                    });
                    setScoreInputs(inputs);
                }
            };

            const handleSaveMatchScore = async (matchId: string, finalize: boolean) => {
                const inputs = scoreInputs[matchId];
                if (!inputs) return;

                const homeVal = parseInt(inputs.home);
                const awayVal = parseInt(inputs.away);

                if (isNaN(homeVal) || isNaN(awayVal)) {
                    setStatusMessage({ text: "Please enter valid numeric scores for both teams.", isError: true });
                    return;
                }

                setLoading(true);
                setStatusMessage({ text: "", isError: false });

                try {
                    // Fetch current match to construct the next group stage value
                    const currentMatch = savedMatches.find(m => m.match_id === matchId);
                    const originalGroup = currentMatch?.group_stage || "Group Stage";
                    
                    // Strip any existing '[LIVE]' part of string
                    const baseGroup = originalGroup.replace(/\[LIVE\]/g, '').trim();
                    const newGroup = finalize ? baseGroup : `${baseGroup} [LIVE]`;

                    // 1. Update the match score and group_stage status
                    const { error: matchError } = await supabase
                        .from('matches')
                        .update({
                            home_score_final: homeVal,
                            away_score_final: awayVal,
                            group_stage: newGroup
                        })
                        .eq('match_id', matchId);

                    if (matchError) throw matchError;

                    // Clear chest opened state from localStorage to allow re-animation on re-finalization
                    if (finalize) {
                        try {
                            localStorage.removeItem(`open_chest_${matchId}`);
                        } catch (e) {
                            console.error("Local storage access failed:", e);
                        }
                    }

                    // 2. Fetch the updated match to get giant slayer and other metrics
                    const { data: matchData, error: matchFetchError } = await supabase
                        .from('matches')
                        .select('*')
                        .eq('match_id', matchId)
                        .single();

                    if (matchFetchError || !matchData) throw new Error("Could not fetch updated match details for scoring calculations");

                    // 3. Fetch predictions for this match
                    const { data: predictions, error: predError } = await supabase
                        .from('predictions')
                        .select('*')
                        .eq('match_id', matchId);

                    if (predError) throw predError;

                    // 1. Recalculate points for each prediction and save
                    if (predictions && predictions.length > 0) {
                        for (const p of predictions) {
                            const isLoot = isSurpriseLoot(matchData.home_team, matchData.away_team, matchId, p.user_id);
                            
                            let pHome = p.predicted_home_score;
                            let isInsurance = false;
                            if (pHome !== null && pHome !== undefined && pHome >= 100) {
                                isInsurance = true;
                                pHome = pHome - 100;
                            }

                            const isExact = (pHome === homeVal) && (p.predicted_away_score === awayVal);

                            if (isLoot && isExact) {
                                // Keep points_earned null/unchanged for exact guesses on surprise loot matches
                                // so they can run opening animation and reveal their rewards!
                                continue;
                            }

                            const points = calculatePoints(
                                pHome,
                                p.predicted_away_score,
                                homeVal,
                                awayVal,
                                matchData.is_giant_slayer,
                                matchData.home_rank,
                                matchData.away_rank,
                                p.is_joker ?? false,
                                matchData.home_team,
                                matchData.away_team,
                                matchId,
                                p.user_id,
                                isInsurance
                            );

                            const { error: updateError } = await supabase
                                .from('predictions')
                                .update({ points_earned: points })
                                .eq('user_id', p.user_id)
                                .eq('match_id', matchId);

                            if (updateError) console.error(`Error updating points for prediction:`, updateError);
                        }
                    }

                    setStatusMessage({
                        text: finalize
                            ? `Successfully FINALIZED match score (${homeVal}-${awayVal}) and recalculated standings points!`
                            : `Successfully saved LIVE match score (${homeVal}-${awayVal}) in-progress and calculated potential points!`,
                        isError: false
                    });
                    await fetchPublishedMatches();
                } catch (err: any) {
                    setStatusMessage({ text: `Failed to save score: ${err.message}`, isError: true });
                } finally {
                    setLoading(false);
                }
            };

            const handleRevertMatchScore = async (matchId: string) => {
                setLoading(true);
                setStatusMessage({ text: "", isError: false });

                try {
                    const currentMatch = savedMatches.find(m => m.match_id === matchId);
                    const originalGroup = currentMatch?.group_stage || "Group Stage";
                    const cleanGroup = originalGroup.replace(/\[LIVE\]/g, '').trim();

                    // Update scores to null and clean the group stage string in matches table
                    const { error: matchError } = await supabase
                        .from('matches')
                        .update({
                            home_score_final: null,
                            away_score_final: null,
                            group_stage: cleanGroup
                        })
                        .eq('match_id', matchId);

                    if (matchError) throw matchError;

                    // Clear chest opened state from localStorage to allow re-animation on re-finalization
                    try {
                        localStorage.removeItem(`open_chest_${matchId}`);
                    } catch (e) {
                        console.error("Local storage access failed:", e);
                    }

                    // Set points_earned to null and reset is_joker for predictions on this match
                    const { error: predError } = await supabase
                        .from('predictions')
                        .update({ 
                            points_earned: null, 
                            is_joker: false 
                        })
                        .eq('match_id', matchId);

                    if (predError) {
                        console.warn("Bulk predictions update failed/restricted by RLS, attempting row-by-row fallback:", predError);
                        
                        const { data: predictions } = await supabase
                            .from('predictions')
                            .select('user_id')
                            .eq('match_id', matchId);

                        if (predictions && predictions.length > 0) {
                            for (const p of predictions) {
                                const { error: updateError } = await supabase
                                    .from('predictions')
                                    .update({ 
                                        points_earned: null,
                                        is_joker: false
                                    })
                                    .eq('user_id', p.user_id)
                                    .eq('match_id', matchId);
                                if (updateError) {
                                    console.error(`Error resetting points/is_joker for user ${p.user_id}:`, updateError);
                                }
                            }
                        }
                    }

                    setStatusMessage({
                        text: `Successfully reverted score and tags for this match!`,
                        isError: false
                    });
                    
                    await fetchPublishedMatches();
                } catch (err: any) {
                    setStatusMessage({ text: `Failed to revert score: ${err.message}`, isError: true });
                } finally {
                    setLoading(false);
                    setRevertingMatchId(null);
                }
            };

            const handleDeleteLeague = async (id: string) => {
                const { error } = await supabase.from('leagues').delete().eq('league_id', id);
                if (error) {
                    setStatusMessage({ text: `Delete failed: ${error.message}`, isError: true });
                } else {
                    fetchData();
                }
            };

            const handleAddMember = async (e: React.FormEvent) => {
                e.preventDefault();
                setLoading(true);
                setStatusMessage({ text: '', isError: false });

                try {
                    const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('username', memberUserId.trim().toLowerCase())
                    .single();

                    if (profileError || !profile) throw new Error('User not found. Check the username.');

                    const { error: insertError } = await supabase
                    .from('league_members')
                    .insert([{ league_id: selectedLeagueForMember, user_id: profile.id }]);

                    if (insertError) throw insertError;

                    setStatusMessage({ text: `Successfully added ${memberUserId}!`, isError: false });
                    setMemberUserId('');
                    fetchLeagueMembers(selectedLeagueForMember); // Trigger Refresh
                } catch (err: any) {
                    setStatusMessage({ text: err.message, isError: true });
                } finally {
                    setLoading(false);
                }
            };

            const calculateGlobalMetrics = (matches: SavedMatch[]) => {
                if (matches.length === 0) {
                    setStats({ currentAverage: 0, dynamicThreshold: 35 });
                    return;
                }
                const differences = matches.map(m => Math.abs(m.home_rank - m.away_rank));
                const avg = differences.reduce((sum, val) => sum + val, 0) / differences.length;
                const threshold = Math.max(avg + 15, 35);
                setStats({ currentAverage: parseFloat(avg.toFixed(1)), dynamicThreshold: parseFloat(threshold.toFixed(1)) });
            };

            const handleCreateMatch = async (e: React.FormEvent) => {
                e.preventDefault();
                setLoading(true);
                setStatusMessage({ text: "", isError: false });
                
                const hR = parseInt(homeRank) || 10;
                const aR = parseInt(awayRank) || 15;
                
                let isoKickoff = new Date().toISOString();
                if (kickoffTime) {
                    try {
                        isoKickoff = new Date(kickoffTime).toISOString();
                    } catch (dErr) {
                        console.error("Invalid kickoff date entered:", dErr);
                    }
                }

                const { error } = await supabase.from('matches').insert([{
                    home_team: homeTeam,
                    away_team: awayTeam,
                    home_rank: hR,
                    away_rank: aR,
                    kickoff_time: isoKickoff,
                    group_stage: groupStage || "Group Stage",
                    is_giant_slayer: Math.abs(hR - aR) >= stats.dynamicThreshold && (hR <= 20 || aR <= 20)
                }]);

                if (!error) {
                    setHomeTeam('');
                    setAwayTeam('');
                    setHomeRank('10');
                    setAwayRank('15');
                    setKickoffTime('');
                    setGroupStage('Group Stage');
                    fetchPublishedMatches();
                    setStatusMessage({ text: "Fixture successfully broadcasted!", isError: false });
                } else {
                    setStatusMessage({ text: `Failed to broadcast match: ${error.message}`, isError: true });
                }
                setLoading(false);
            };

            const handleCreateLeague = async (e: React.FormEvent) => {
                e.preventDefault();
                const { error } = await supabase.from('leagues').insert([{ league_name: leagueName }]);
                if (!error) { setLeagueName(''); fetchData(); }
            };

            if (checkingAdmin) {
                return (
                    <div style={{ ...styles.container, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '1rem' }} suppressHydrationWarning>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#a1a1aa' }}>Checking security clearance...</div>
                        <div style={{ width: '40px', height: '40px', border: '3px solid #27272a', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                        <style>{`
                            @keyframes spin {
                                0% { transform: rotate(0deg); }
                                100% { transform: rotate(360deg); }
                            }
                        `}</style>
                    </div>
                );
            }

            if (!isAdmin) {
                return null;
            }

            return (
                <div style={styles.container} suppressHydrationWarning>
                <header className="flex flex-col lg:flex-row gap-4 justify-between items-center p-4 sm:p-6 border-b border-[#27272a] bg-[#18181b]" suppressHydrationWarning>
                  <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto text-center sm:text-left justify-between sm:justify-start">
                    <button 
                      onClick={() => window.location.hash = '/dashboard'}
                      style={{
                        backgroundColor: 'transparent',
                        border: '1px solid #3f3f46',
                        color: '#e4e4e7',
                        padding: '0.45rem 0.9rem',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#27272a'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      ⬅ Back to Dashboard
                    </button>
                    <div className="flex items-center gap-2 mt-2 sm:mt-0">
                      <div className="bg-[#2563eb] text-white font-extrabold px-2 py-0.5 rounded text-[10px] select-none">DYN</div>
                      <h1 className="text-xs sm:text-sm md:text-base font-black tracking-wider m-0 uppercase" style={styles.headerTitle}>STADIUM CONTROL PANEL</h1>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap justify-center items-center gap-2 w-full lg:w-auto">
                    <button 
                      onClick={() => setActiveTab('matches')} 
                      style={{
                        ...styles.tabBtn,
                        backgroundColor: activeTab === 'matches' ? '#2563eb' : '#27272a',
                        fontWeight: activeTab === 'matches' ? 'bold' : 'normal',
                        border: activeTab === 'matches' ? '1px solid #3b82f6' : '1px solid transparent',
                        flex: '1 1 auto',
                        textAlign: 'center',
                        minWidth: '85px',
                        fontSize: '0.85rem',
                      }}
                    >
                      Matches
                    </button>
                    <button 
                      onClick={() => setActiveTab('leagues')} 
                      style={{
                        ...styles.tabBtn,
                        backgroundColor: activeTab === 'leagues' ? '#2563eb' : '#27272a',
                        fontWeight: activeTab === 'leagues' ? 'bold' : 'normal',
                        border: activeTab === 'leagues' ? '1px solid #3b82f6' : '1px solid transparent',
                        flex: '1 1 auto',
                        textAlign: 'center',
                        minWidth: '85px',
                        fontSize: '0.85rem',
                      }}
                    >
                      Leagues
                    </button>
                    <button 
                      onClick={() => setActiveTab('members')} 
                      style={{
                        ...styles.tabBtn,
                        backgroundColor: activeTab === 'members' ? '#2563eb' : '#27272a',
                        fontWeight: activeTab === 'members' ? 'bold' : 'normal',
                        border: activeTab === 'members' ? '1px solid #3b82f6' : '1px solid transparent',
                        flex: '1 1 auto',
                        textAlign: 'center',
                        minWidth: '85px',
                        fontSize: '0.85rem',
                      }}
                    >
                      Members
                    </button>
                  </div>

                  <div className="flex gap-2 justify-center w-full lg:w-auto mt-1 lg:mt-0">
                    <span style={styles.statMetric} className="text-xs sm:text-sm">Avg Gap: {stats.currentAverage}</span>
                    <span style={styles.slayerIndicator} className="text-xs sm:text-sm">⚡ Cutoff: ≥{stats.dynamicThreshold}</span>
                  </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-[1240px] mx-auto mt-6 px-4 sm:px-6">
                <div className="flex flex-col gap-4">
                <h2 style={styles.sidebarTitle}>
                {activeTab === 'matches' ? 'Publish New Fixture' : activeTab === 'leagues' ? 'Create League' : 'Add Member'}
                </h2>
                <section className="bg-[#18181b] rounded-xl border border-[#27272a] p-4 sm:p-6 lg:p-8 h-fit">
                {/* Status Message Display */}
                {statusMessage.text && (
                    <div style={{ padding: '12px', marginBottom: '20px', borderRadius: '8px', backgroundColor: statusMessage.isError ? '#fee2e2' : '#dcfce7', color: statusMessage.isError ? '#991b1b' : '#166534', textAlign: 'center', fontWeight: 'bold', fontSize: '0.9rem' }}>
                    {statusMessage.text}
                    </div>
                )}

                {activeTab === 'matches' && (
                    <form onSubmit={handleCreateMatch} className="flex flex-col gap-5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Home Team</label>
                          <input type="text" placeholder="e.g. Argentina 🇦🇷" value={homeTeam} onChange={e => setHomeTeam(e.target.value)} style={styles.input} required />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Away Team</label>
                          <input type="text" placeholder="e.g. France 🇫🇷" value={awayTeam} onChange={e => setAwayTeam(e.target.value)} style={styles.input} required />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Home FIFA Rank</label>
                          <input type="number" min="1" max="300" placeholder="e.g. 1" value={homeRank} onChange={e => setHomeRank(e.target.value)} style={styles.input} required />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Away FIFA Rank</label>
                          <input type="number" min="1" max="300" placeholder="e.g. 2" value={awayRank} onChange={e => setAwayRank(e.target.value)} style={styles.input} required />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Kickoff Time</label>
                          <input type="datetime-local" value={kickoffTime} onChange={e => setKickoffTime(e.target.value)} style={styles.input} required />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Stage / Format</label>
                          <input type="text" placeholder="e.g. Group Stage" value={groupStage} onChange={e => setGroupStage(e.target.value)} style={styles.input} required />
                        </div>
                      </div>

                      <button type="submit" disabled={loading} style={styles.submitBtn} className="w-full active:scale-95 transition-transform">
                        {loading ? 'BROADCASTING...' : 'BROADCAST MATCH'}
                      </button>
                    </form>
                )}

                {activeTab === 'leagues' && (
                    <form onSubmit={handleCreateLeague} className="flex flex-col gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-zinc-400 font-bold uppercase tracking-wider">League Name</label>
                        <input type="text" placeholder="e.g. Pro Suite Cup" value={leagueName} onChange={e => setLeagueName(e.target.value)} style={styles.input} required />
                      </div>
                      <button type="submit" disabled={loading} style={styles.submitBtn} className="w-full active:scale-95 transition-transform">
                        {loading ? 'ESTABLISHING...' : 'ESTABLISH LEAGUE'}
                      </button>
                    </form>
                )}

                {activeTab === 'members' && (
                    <form onSubmit={handleAddMember} className="flex flex-col gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Select League</label>
                        <select onChange={e => setSelectedLeagueForMember(e.target.value)} style={styles.input} required>
                          <option value="">Select a League</option>
                          {leagues.map(l => <option key={l.league_id} value={l.league_id}>{l.league_name}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Player Username</label>
                        <input type="text" placeholder="Enter exact username" value={memberUserId} onChange={e => setMemberUserId(e.target.value)} style={styles.input} required />
                      </div>
                      <button type="submit" disabled={loading} style={styles.submitBtn} className="w-full active:scale-95 transition-transform">
                        {loading ? 'ADDING...' : 'ADD TO LEAGUE'}
                      </button>
                    </form>
                )}
                </section>
                </div>

                <aside className="flex flex-col gap-4">
                <h2 style={styles.sidebarTitle}>{activeTab === 'matches' ? 'Live Matches' : activeTab === 'leagues' ? 'Manage Leagues' : 'Member Directory'}</h2>
                <div style={styles.listContainer} className="max-h-[500px] lg:max-h-[600px]">
                {activeTab === 'matches' && savedMatches.map(m => {
                    const inputs = scoreInputs[m.match_id] || { home: '', away: '' };
                    const isRecorded = m.home_score_final !== null && m.home_score_final !== undefined;
                    const isLive = m.group_stage?.includes('[LIVE]');
                    const isFinalized = isRecorded && !isLive;

                    return (
                        <div key={m.match_id} style={{ ...styles.miniMatchCard, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div style={{ fontWeight: 'bold', fontSize: '0.95rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.25rem' }}>
                                <span>{m.home_team} vs {m.away_team}</span>
                                <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                                    {isFinalized ? (
                                        <span style={{ color: '#10b981', fontSize: '0.75rem', fontWeight: 'bold' }}>✓ Finalized</span>
                                    ) : isLive ? (
                                        <span style={{ color: '#f59e0b', fontSize: '0.75rem', fontWeight: 'bold', animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} className="animate-pulse">🔴 Live (In-Progress)</span>
                                    ) : (
                                        <span style={{ color: '#71717a', fontSize: '0.75rem', fontWeight: '500' }}>Scheduled</span>
                                    )}
                                    {m.is_giant_slayer && <span style={{ color: '#c084fc', fontSize: '0.75rem', fontWeight: 'bold', backgroundColor: '#1e1b4b', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>⚡ SLAYER</span>}
                                </div>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-3 sm:gap-2 justify-between sm:items-center">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        min="0"
                                        placeholder="H"
                                        value={inputs.home}
                                        onChange={e => setScoreInputs(prev => ({
                                            ...prev,
                                            [m.match_id]: { ...prev[m.match_id], home: e.target.value }
                                        }))}
                                        style={{ width: '55px', padding: '0.4rem', backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '6px', color: '#fff', textAlign: 'center', fontFamily: 'monospace' }}
                                    />
                                    <span style={{ color: '#a1a1aa' }}>—</span>
                                    <input
                                        type="number"
                                        min="0"
                                        placeholder="A"
                                        value={inputs.away}
                                        onChange={e => setScoreInputs(prev => ({
                                            ...prev,
                                            [m.match_id]: { ...prev[m.match_id], away: e.target.value }
                                        }))}
                                        style={{ width: '55px', padding: '0.4rem', backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '6px', color: '#fff', textAlign: 'center', fontFamily: 'monospace' }}
                                    />
                                    {isRecorded && (
                                        <span className="text-[10px] text-zinc-400 font-mono ml-1">
                                            Current: ({m.home_score_final} - {m.away_score_final})
                                        </span>
                                    )}
                                </div>
                                <div className="flex gap-1.5 w-full sm:w-auto justify-end sm:ml-auto flex-wrap sm:flex-nowrap">
                                    {isRecorded && (
                                        revertingMatchId === m.match_id ? (
                                            <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', backgroundColor: 'rgba(127, 29, 29, 0.4)', padding: '0.25rem 0.5rem', border: '1px solid rgba(153, 27, 27, 0.6)', borderRadius: '6px' }}>
                                                <span style={{ fontSize: '0.7rem', color: '#fca5a5', fontWeight: 'bold' }}>Sure?</span>
                                                <button
                                                    onClick={() => handleRevertMatchScore(m.match_id)}
                                                    disabled={loading}
                                                    style={{
                                                        backgroundColor: '#ef4444',
                                                        color: '#fff',
                                                        border: 'none',
                                                        padding: '0.25rem 0.5rem',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer',
                                                        fontSize: '0.7rem',
                                                        fontWeight: 'bold',
                                                    }}
                                                >
                                                    {loading ? '...' : 'Yes, Revert'}
                                                </button>
                                                <button
                                                    onClick={() => setRevertingMatchId(null)}
                                                    disabled={loading}
                                                    style={{
                                                        backgroundColor: '#3f3f46',
                                                        color: '#fff',
                                                        border: 'none',
                                                        padding: '0.25rem 0.5rem',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer',
                                                        fontSize: '0.7rem',
                                                        fontWeight: 'bold',
                                                    }}
                                                >
                                                    No
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setRevertingMatchId(m.match_id)}
                                                disabled={loading}
                                                style={{
                                                    backgroundColor: '#ef4444',
                                                    color: '#fff',
                                                    border: 'none',
                                                    padding: '0.4rem 0.6rem',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 'bold',
                                                    transition: 'opacity 0.2s',
                                                    flex: 1,
                                                }}
                                                title="Revert/clear final score and points"
                                            >
                                                Revert
                                            </button>
                                        )
                                    )}
                                    <button
                                        onClick={() => handleSaveMatchScore(m.match_id, false)}
                                        disabled={loading}
                                        style={{
                                            backgroundColor: '#d97706',
                                            color: '#fff',
                                            border: 'none',
                                            padding: '0.4rem 0.6rem',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            fontSize: '0.75rem',
                                            fontWeight: 'bold',
                                            transition: 'opacity 0.2s',
                                            flex: 1,
                                        }}
                                        title="Save current score live (unfinalized)"
                                    >
                                        Live
                                    </button>
                                    <button
                                        onClick={() => handleSaveMatchScore(m.match_id, true)}
                                        disabled={loading}
                                        style={{
                                            backgroundColor: '#10b981',
                                            color: '#fff',
                                            border: 'none',
                                            padding: '0.4rem 0.6rem',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            fontSize: '0.75rem',
                                            fontWeight: 'bold',
                                            transition: 'opacity 0.2s',
                                            flex: 1,
                                        }}
                                        title="Finalize match and lock"
                                    >
                                        Finalize
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
                {activeTab === 'leagues' && leagues.map(l => (
                    <div key={l.league_id} style={{ ...styles.miniMatchCard, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{l.league_name}</span>
                    <button onClick={() => handleDeleteLeague(l.league_id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                    </div>
                ))}
                {activeTab === 'members' && leagueMembers.map((m: any) => (
                    <div key={m.id} style={styles.miniMatchCard}>{m.profiles?.username || 'Unknown'}</div>
                ))}
                </div>
                </aside>
                </div>
                </div>
            );
}

const styles: Record<string, React.CSSProperties> = {
    container: { minHeight: '100vh', backgroundColor: '#09090b', color: '#ffffff', fontFamily: 'system-ui, sans-serif', paddingBottom: '4rem' },
    adminHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem 2rem', borderBottom: '1px solid #27272a', backgroundColor: '#18181b' },
    headerLeft: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
    headerTitle: { margin: 0, fontSize: '1.25rem', fontWeight: '900', letterSpacing: '0.05em' },
    statBadgesContainer: { display: 'flex', gap: '0.75rem' },
    statMetric: { fontSize: '0.813rem', backgroundColor: '#27272a', padding: '0.4rem 0.8rem', borderRadius: '6px', fontWeight: '600', color: '#a1a1aa' },
    slayerIndicator: { fontSize: '0.813rem', backgroundColor: '#1e1b4b', border: '1px solid #4338ca', padding: '0.4rem 0.8rem', borderRadius: '6px', fontWeight: '700', color: '#c084fc' },
    layoutGrid: { display: 'grid', gridTemplateColumns: '1fr 380px', gap: '2rem', maxWidth: '1200px', margin: '2.5rem auto 0 auto', padding: '0 1.5rem' },
    card: { backgroundColor: '#18181b', borderRadius: '12px', border: '1px solid #27272a', padding: '2rem' },
    cardTitle: { margin: '0 0 1.5rem 0', fontSize: '1.5rem', fontWeight: '800', letterSpacing: '-0.02em' },
    tabBtn: { backgroundColor: '#27272a', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' },
    formContainer: { display: 'flex', flexDirection: 'column', gap: '1rem' },
        input: { backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '8px', padding: '0.875rem', fontSize: '1rem', color: '#ffffff' },
        submitBtn: { backgroundColor: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '1rem', fontSize: '1rem', fontWeight: '800', cursor: 'pointer' },
        sidebar: { display: 'flex', flexDirection: 'column', gap: '1.25rem' },
        sidebarTitle: { margin: 0, fontSize: '0.875rem', fontWeight: '800', letterSpacing: '0.07em', color: '#a1a1aa', textTransform: 'uppercase' },
        listContainer: { display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '600px', overflowY: 'auto' },
        miniMatchCard: { backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '10px', padding: '1rem' }
};
