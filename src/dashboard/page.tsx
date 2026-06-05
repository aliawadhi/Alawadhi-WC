"use client";
import React, { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase';
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
    }, []);

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
                                <select 
                                    className="league-selector"
                                    value={leagueId || ''} 
                                    onChange={(e) => setLeagueId(e.target.value)}
                                >
                                    {joinedLeagues.map(l => (
                                        <option key={l.league_id} value={l.league_id}>
                                            {l.league_name}
                                        </option>
                                    ))}
                                </select>
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
    padding: 0.5rem 1rem;
    color: var(--white);
    font-family: 'Barlow', sans-serif;
    font-size: 0.9rem;
    font-weight: 600;
    outline: none;
    cursor: pointer;
    min-width: 200px;
}
.league-selector:focus {
    border-color: var(--gold);
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
