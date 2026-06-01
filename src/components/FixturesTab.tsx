"use client";
import React, { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase';
import { useLanguage } from '@/utils/LanguageContext';
import { getFlagEmoji } from '@/utils/flags';
import { TEAM_RANKS } from '@/utils/TEAM_RANKS';

const RAW_OFFICIAL_FIXTURES = [
  // Thursday 11 June 2026
  { home_team: 'Mexico', away_team: 'South Africa', kickoff_time: '2026-06-11T22:00:00Z', group_stage: 'Group A' },

  // Friday 12 June 2026
  { home_team: 'Korea Republic', away_team: 'Czechia', kickoff_time: '2026-06-12T05:00:00Z', group_stage: 'Group A' },
  { home_team: 'Canada', away_team: 'Bosnia and Herzegovina', kickoff_time: '2026-06-12T22:00:00Z', group_stage: 'Group B' },

  // Saturday 13 June 2026
  { home_team: 'USA', away_team: 'Paraguay', kickoff_time: '2026-06-13T04:00:00Z', group_stage: 'Group D' },
  { home_team: 'Qatar', away_team: 'Switzerland', kickoff_time: '2026-06-13T22:00:00Z', group_stage: 'Group B' },

  // Sunday 14 June 2026
  { home_team: 'Brazil', away_team: 'Morocco', kickoff_time: '2026-06-14T01:00:00Z', group_stage: 'Group C' },
  { home_team: 'Haiti', away_team: 'Scotland', kickoff_time: '2026-06-14T04:00:00Z', group_stage: 'Group C' },
  { home_team: 'Australia', away_team: 'Türkiye', kickoff_time: '2026-06-14T07:00:00Z', group_stage: 'Group D' },
  { home_team: 'Germany', away_team: 'Curaçao', kickoff_time: '2026-06-14T20:00:00Z', group_stage: 'Group E' },
  { home_team: 'Netherlands', away_team: 'Japan', kickoff_time: '2026-06-14T23:00:00Z', group_stage: 'Group F' },

  // Monday 15 June 2026
  { home_team: "Côte d'Ivoire", away_team: 'Ecuador', kickoff_time: '2026-06-15T02:00:00Z', group_stage: 'Group E' },
  { home_team: 'Sweden', away_team: 'Tunisia', kickoff_time: '2026-06-15T05:00:00Z', group_stage: 'Group F' },
  { home_team: 'Spain', away_team: 'Cabo Verde', kickoff_time: '2026-06-15T19:00:00Z', group_stage: 'Group H' },
  { home_team: 'Belgium', away_team: 'Egypt', kickoff_time: '2026-06-15T22:00:00Z', group_stage: 'Group G' },

  // Tuesday 16 June 2026
  { home_team: 'Saudi Arabia', away_team: 'Uruguay', kickoff_time: '2026-06-16T01:00:00Z', group_stage: 'Group H' },
  { home_team: 'IR Iran', away_team: 'New Zealand', kickoff_time: '2026-06-16T04:00:00Z', group_stage: 'Group G' },
  { home_team: 'France', away_team: 'Senegal', kickoff_time: '2026-06-16T22:00:00Z', group_stage: 'Group I' },

  // Wednesday 17 June 2026
  { home_team: 'Iraq', away_team: 'Norway', kickoff_time: '2026-06-17T01:00:00Z', group_stage: 'Group I' },
  { home_team: 'Argentina', away_team: 'Algeria', kickoff_time: '2026-06-17T04:00:00Z', group_stage: 'Group J' },
  { home_team: 'Austria', away_team: 'Jordan', kickoff_time: '2026-06-17T07:00:00Z', group_stage: 'Group J' },
  { home_team: 'Portugal', away_team: 'Congo DR', kickoff_time: '2026-06-17T20:00:00Z', group_stage: 'Group K' },
  { home_team: 'England', away_team: 'Croatia', kickoff_time: '2026-06-17T23:00:00Z', group_stage: 'Group L' },

  // Thursday 18 June 2026
  { home_team: 'Ghana', away_team: 'Panama', kickoff_time: '2026-06-18T02:00:00Z', group_stage: 'Group L' },
  { home_team: 'Uzbekistan', away_team: 'Colombia', kickoff_time: '2026-06-18T05:00:00Z', group_stage: 'Group K' },
  { home_team: 'Czechia', away_team: 'South Africa', kickoff_time: '2026-06-18T19:00:00Z', group_stage: 'Group A' },
  { home_team: 'Switzerland', away_team: 'Bosnia and Herzegovina', kickoff_time: '2026-06-18T22:00:00Z', group_stage: 'Group B' },

  // Friday 19 June 2026
  { home_team: 'Canada', away_team: 'Qatar', kickoff_time: '2026-06-19T01:00:00Z', group_stage: 'Group B' },
  { home_team: 'Mexico', away_team: 'Korea Republic', kickoff_time: '2026-06-19T04:00:00Z', group_stage: 'Group A' },
  { home_team: 'USA', away_team: 'Australia', kickoff_time: '2026-06-19T22:00:00Z', group_stage: 'Group D' },

  // Saturday 20 June 2026
  { home_team: 'Scotland', away_team: 'Morocco', kickoff_time: '2026-06-20T01:00:00Z', group_stage: 'Group C' },
  { home_team: 'Brazil', away_team: 'Haiti', kickoff_time: '2026-06-20T04:00:00Z', group_stage: 'Group C' },
  { home_team: 'Türkiye', away_team: 'Paraguay', kickoff_time: '2026-06-20T07:00:00Z', group_stage: 'Group D' },
  { home_team: 'Netherlands', away_team: 'Sweden', kickoff_time: '2026-06-20T20:00:00Z', group_stage: 'Group F' },
  { home_team: 'Germany', away_team: "Côte d'Ivoire", kickoff_time: '2026-06-20T23:00:00Z', group_stage: 'Group E' },

  // Sunday 21 June 2026
  { home_team: 'Ecuador', away_team: 'Curaçao', kickoff_time: '2026-06-21T03:00:00Z', group_stage: 'Group E' },
  { home_team: 'Tunisia', away_team: 'Japan', kickoff_time: '2026-06-21T07:00:00Z', group_stage: 'Group F' },
  { home_team: 'Spain', away_team: 'Saudi Arabia', kickoff_time: '2026-06-21T19:00:00Z', group_stage: 'Group H' },
  { home_team: 'Belgium', away_team: 'IR Iran', kickoff_time: '2026-06-21T22:00:00Z', group_stage: 'Group G' },

  // Monday 22 June 2026
  { home_team: 'Uruguay', away_team: 'Cabo Verde', kickoff_time: '2026-06-22T01:00:00Z', group_stage: 'Group H' },
  { home_team: 'New Zealand', away_team: 'Egypt', kickoff_time: '2026-06-22T04:00:00Z', group_stage: 'Group G' },
  { home_team: 'Argentina', away_team: 'Austria', kickoff_time: '2026-06-22T20:00:00Z', group_stage: 'Group J' },

  // Tuesday 23 June 2026
  { home_team: 'France', away_team: 'Iraq', kickoff_time: '2026-06-23T00:00:00Z', group_stage: 'Group I' },
  { home_team: 'Norway', away_team: 'Senegal', kickoff_time: '2026-06-23T03:00:00Z', group_stage: 'Group I' },
  { home_team: 'Jordan', away_team: 'Algeria', kickoff_time: '2026-06-23T06:00:00Z', group_stage: 'Group J' },
  { home_team: 'Portugal', away_team: 'Uzbekistan', kickoff_time: '2026-06-23T20:00:00Z', group_stage: 'Group K' },
  { home_team: 'England', away_team: 'Ghana', kickoff_time: '2026-06-23T23:00:00Z', group_stage: 'Group L' },

  // Wednesday 24 June 2026
  { home_team: 'Panama', away_team: 'Croatia', kickoff_time: '2026-06-24T02:00:00Z', group_stage: 'Group L' },
  { home_team: 'Colombia', away_team: 'Congo DR', kickoff_time: '2026-06-24T05:00:00Z', group_stage: 'Group K' },
  { home_team: 'Switzerland', away_team: 'Canada', kickoff_time: '2026-06-24T22:00:00Z', group_stage: 'Group B' },
  { home_team: 'Bosnia and Herzegovina', away_team: 'Qatar', kickoff_time: '2026-06-24T22:00:00Z', group_stage: 'Group B' },

  // Thursday 25 June 2026
  { home_team: 'Scotland', away_team: 'Brazil', kickoff_time: '2026-06-25T01:00:00Z', group_stage: 'Group C' },
  { home_team: 'Morocco', away_team: 'Haiti', kickoff_time: '2026-06-25T01:00:00Z', group_stage: 'Group C' },
  { home_team: 'Czechia', away_team: 'Mexico', kickoff_time: '2026-06-25T04:00:00Z', group_stage: 'Group A' },
  { home_team: 'South Africa', away_team: 'Korea Republic', kickoff_time: '2026-06-25T04:00:00Z', group_stage: 'Group A' },
  { home_team: 'Curaçao', away_team: "Côte d'Ivoire", kickoff_time: '2026-06-25T23:00:00Z', group_stage: 'Group E' },
  { home_team: 'Ecuador', away_team: 'Germany', kickoff_time: '2026-06-25T23:00:00Z', group_stage: 'Group E' },

  // Friday 26 June 2026
  { home_team: 'Japan', away_team: 'Sweden', kickoff_time: '2026-06-26T02:00:00Z', group_stage: 'Group F' },
  { home_team: 'Tunisia', away_team: 'Netherlands', kickoff_time: '2026-06-26T02:00:00Z', group_stage: 'Group F' },
  { home_team: 'Türkiye', away_team: 'USA', kickoff_time: '2026-06-26T05:00:00Z', group_stage: 'Group D' },
  { home_team: 'Paraguay', away_team: 'Australia', kickoff_time: '2026-06-26T05:00:00Z', group_stage: 'Group D' },
  { home_team: 'Norway', away_team: 'France', kickoff_time: '2026-06-26T22:00:00Z', group_stage: 'Group I' },
  { home_team: 'Senegal', away_team: 'Iraq', kickoff_time: '2026-06-26T22:00:00Z', group_stage: 'Group I' },

  // Saturday 27 June 2026
  { home_team: 'Cabo Verde', away_team: 'Saudi Arabia', kickoff_time: '2026-06-27T03:00:00Z', group_stage: 'Group H' },
  { home_team: 'Uruguay', away_team: 'Spain', kickoff_time: '2026-06-27T03:00:00Z', group_stage: 'Group H' },
  { home_team: 'Egypt', away_team: 'IR Iran', kickoff_time: '2026-06-27T06:00:00Z', group_stage: 'Group G' },
  { home_team: 'New Zealand', away_team: 'Belgium', kickoff_time: '2026-06-27T06:00:00Z', group_stage: 'Group G' },

  // Sunday 28 June 2026
  { home_team: 'Panama', away_team: 'England', kickoff_time: '2026-06-28T00:00:00Z', group_stage: 'Group L' },
  { home_team: 'Croatia', away_team: 'Ghana', kickoff_time: '2026-06-28T00:00:00Z', group_stage: 'Group L' },
  { home_team: 'Colombia', away_team: 'Portugal', kickoff_time: '2026-06-28T02:30:00Z', group_stage: 'Group K' },
  { home_team: 'Congo DR', away_team: 'Uzbekistan', kickoff_time: '2026-06-28T02:30:00Z', group_stage: 'Group K' },
  { home_team: 'Algeria', away_team: 'Austria', kickoff_time: '2026-06-28T05:00:00Z', group_stage: 'Group J' },
  { home_team: 'Jordan', away_team: 'Argentina', kickoff_time: '2026-06-28T05:00:00Z', group_stage: 'Group J' }
];

const OFFICIAL_FIXTURES: any[] = RAW_OFFICIAL_FIXTURES.map(fixture => {
    const homeRank = TEAM_RANKS[fixture.home_team] || 60;
    const awayRank = TEAM_RANKS[fixture.away_team] || 60;

    // Convert hardcoded kickoff_time from local UTC+3 (e.g., 22:00:00Z) to true UTC (19:00:00Z)
    const dateObj = new Date(fixture.kickoff_time);
    dateObj.setUTCHours(dateObj.getUTCHours() - 3);
    const correctedKickoffTime = dateObj.toISOString();

    return {
        home_team: fixture.home_team,
        away_team: fixture.away_team,
        home_rank: homeRank,
        away_rank: awayRank,
        kickoff_time: correctedKickoffTime,
        group_stage: fixture.group_stage,
        is_giant_slayer: Math.abs(homeRank - awayRank) >= 35 && (homeRank <= 20 || awayRank <= 20)
    };
});

export default function FixturesTab() {
    const { t, language, isAr, tTeam } = useLanguage();
    const [matches, setMatches] = useState<any[]>([]);
    const [seeding, setSeeding] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const fetchMatches = async () => {
        const round1End = '2026-06-18T18:59:59Z';
        const round2End = '2026-06-24T21:59:59Z';
        const round3End = '2026-06-28T21:59:59Z';
        const now = new Date().toISOString();

        const visibleUntil = now < round1End ? round1End
            : now < round2End ? round2End
            : now < round3End ? round3End
            : now;

        const { data } = await supabase
            .from('matches')
            .select('*')
            .lte('kickoff_time', visibleUntil)
            .order('kickoff_time', { ascending: true });
        if (data) {
            // Client-side safeguard to completely prevent duplicate matches from rendering
            const seen = new Set<string>();
            const uniqueFiltered: any[] = [];
            data.forEach(match => {
                const key = `${match.home_team.trim().toLowerCase()} vs ${match.away_team.trim().toLowerCase()}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    uniqueFiltered.push(match);
                }
            });

            setMatches(uniqueFiltered);
        }
    };

    useEffect(() => {
        fetchMatches();
    }, []);

    const handleSeedFixtures = async () => {
        setSeeding(true);
        setMessage(null);
        try {
            // Fetch any existing matches in the DB first
            const { data: existingMatches } = await supabase.from('matches').select('*');
            const existingMap = new Map<string, string>(); // key: "home vs away", value: match_id
            if (existingMatches) {
                existingMatches.forEach(m => {
                    const key = `${m.home_team.trim().toLowerCase()} vs ${m.away_team.trim().toLowerCase()}`;
                    if (!existingMap.has(key)) {
                        existingMap.set(key, m.match_id);
                    }
                });
            }

            if (OFFICIAL_FIXTURES.length > 0) {
                // For existing matches, we preserve their match_id to update them instead of inserting copies
                const sanitizedFixtures = OFFICIAL_FIXTURES.map(fixture => {
                    const key = `${fixture.home_team.trim().toLowerCase()} vs ${fixture.away_team.trim().toLowerCase()}`;
                    const existingMatchId = existingMap.get(key);
                    return {
                        ...(existingMatchId ? { match_id: existingMatchId } : {}),
                        home_team: fixture.home_team,
                        away_team: fixture.away_team,
                        home_rank: fixture.home_rank,
                        away_rank: fixture.away_rank,
                        kickoff_time: fixture.kickoff_time,
                        group_stage: fixture.group_stage,
                        is_giant_slayer: !!fixture.is_giant_slayer
                    };
                });

                const { error } = await supabase
                    .from('matches')
                    .upsert(sanitizedFixtures);

                if (error) throw error;

                setMessage(`Successfully seeded ${OFFICIAL_FIXTURES.length} official FIFA World Cup 2026 fixtures!`);
            } else {
                // If drop is allowed/valid, try standard delete
                await supabase.from('predictions').delete().neq('match_id', '00000000-0000-0000-0000-000000000000');
                await supabase.from('matches').delete().neq('match_id', '00000000-0000-0000-0000-000000000000');

                setMessage("All fixtures and database entries cleared successfully!");
            }
            await fetchMatches();
        } catch (err: any) {
            console.error('Error seeding fixtures:', err);
            setMessage(`Setup failed: ${err.message || 'Unknown error'}`);
        } finally {
            setSeeding(false);
        }
    };

    const formatTime = (dateString: string) => {
        return new Date(dateString).toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', color: 'var(--white)', direction: isAr ? 'rtl' : 'ltr' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <h2 style={{ fontFamily: isAr ? 'Cairo, system-ui' : 'Bebas Neue', fontSize: '1.75rem', letterSpacing: isAr ? 'normal' : '0.08em', margin: 0 }}>
                    {isAr ? "جدول مباريات كأس العالم" : "Upcoming Fixtures"}
                </h2>
            </div>

            {message && (
                <div style={{
                    padding: '1rem',
                    borderRadius: '8px',
                    backgroundColor: message.startsWith('Seeding failed') ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                    border: message.startsWith('Seeding failed') ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(16,185,129,0.3)',
                    color: message.startsWith('Seeding failed') ? '#f87171' : '#34d399',
                    fontSize: '0.9rem',
                    fontWeight: '500',
                    textAlign: isAr ? 'right' : 'left'
                }}>
                    {message}
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {matches.length > 0 ? (
                    matches.map((match, index) => {
                        const homeR = match.home_rank ?? TEAM_RANKS[match.home_team] ?? 60;
                        const awayR = match.away_rank ?? TEAM_RANKS[match.away_team] ?? 60;
                        const isGiantSlayer = match.is_giant_slayer === true || 
                                              (Math.abs(homeR - awayR) >= 35 && (homeR <= 20 || awayR <= 20));
                        return (
                            <div
                                key={match.id || match.match_id || `match-${index}`}
                                className={`fixture-card ${isGiantSlayer ? 'fixture-card--giant' : ''} flex flex-col sm:flex-row gap-3 sm:gap-4 justify-between items-start sm:items-center`}
                                style={{
                                    padding: '1.2rem 1.5rem',
                                    backgroundColor: 'var(--surface, #111D30)',
                                    borderRadius: 'var(--radius, 12px)',
                                    position: 'relative',
                                    overflow: 'hidden',
                                }}
                            >
                                {isGiantSlayer && (
                                    <div 
                                        className="giant-corner-ribbon"
                                        style={{
                                            position: 'absolute',
                                            right: isAr ? 'unset' : '0',
                                            left: isAr ? '0' : 'unset',
                                            top: '0',
                                            background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
                                            color: '#fff',
                                            fontSize: '0.65rem',
                                            fontFamily: isAr ? 'Cairo, system-ui' : 'Bebas Neue',
                                            letterSpacing: isAr ? 'normal' : '0.1em',
                                            padding: '0.2rem 0.6rem',
                                            borderBottomLeftRadius: isAr ? '0' : '6px',
                                            borderBottomRightRadius: isAr ? '6px' : '0'
                                        }}
                                    >
                                        <span className="giant-lightning">⚡</span> {isAr ? "قاهر العمالقة" : "GIANT SLAYER"}
                                    </div>
                                )}

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
                                    <div style={{ position: 'relative', display: 'flex', gap: '0.35rem', alignSelf: 'flex-start', alignItems: 'center' }}>
                                        <span style={{
                                            fontFamily: isAr ? 'Cairo, system-ui' : 'Bebas Neue',
                                            fontSize: '0.75rem',
                                            letterSpacing: isAr ? 'normal' : '0.05em',
                                            color: 'var(--gold, #C9A84C)',
                                            background: 'rgba(201,168,76,0.08)',
                                            padding: '0.15rem 0.5rem',
                                            borderRadius: '4px'
                                        }}>
                                            {isAr ? (match.group_stage ? match.group_stage.replace(/\[LIVE\]/g, '').replace('Group', 'المجموعة').trim() : 'دور المجموعات') : (match.group_stage ? match.group_stage.replace(/\[LIVE\]/g, '').trim() : 'Group Stage')}
                                        </span>
                                        {match.group_stage?.includes('[LIVE]') && (
                                            <span style={{
                                                fontSize: '0.65rem',
                                                fontFamily: isAr ? 'Cairo, system-ui' : 'Bebas Neue',
                                                backgroundColor: 'rgba(220, 38, 38, 0.15)',
                                                border: '1px solid rgba(220, 38, 38, 0.4)',
                                                color: '#EF4444',
                                                padding: '0.1rem 0.45rem',
                                                borderRadius: '4px',
                                                fontWeight: 'bold',
                                                animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                                            }} className="animate-pulse">
                                                🔴 {isAr ? "مباشر" : "LIVE"}
                                            </span>
                                        )}
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem', flexDirection: 'row' }}>
                                        <span className="animated-flag" style={{ fontSize: '1.5rem' }}>{getFlagEmoji(match.home_team)}</span>
                                        <span style={{ fontWeight: '700', fontSize: '1.1rem', letterSpacing: '0.01em' }}>
                                            {tTeam(match.home_team)}
                                            {match.home_rank != null && (
                                                <span style={{ fontSize: '0.85rem', color: 'var(--gold, #C9A84C)', marginLeft: isAr ? 0 : '0.25rem', marginRight: isAr ? '0.25rem' : 0, fontWeight: 'normal' }}>
                                                    ({match.home_rank})
                                                </span>
                                            )}
                                        </span>
                                        <span style={{ color: 'var(--grey, #8B95A5)', fontWeight: '500', margin: '0 0.2rem' }}>{isAr ? "ضد" : "vs"}</span>
                                        <span className="animated-flag" style={{ fontSize: '1.5rem' }}>{getFlagEmoji(match.away_team)}</span>
                                        <span style={{ fontWeight: '700', fontSize: '1.1rem', letterSpacing: '0.01em' }}>
                                            {tTeam(match.away_team)}
                                            {match.away_rank != null && (
                                                <span style={{ fontSize: '0.85rem', color: 'var(--gold, #C9A84C)', marginLeft: isAr ? 0 : '0.25rem', marginRight: isAr ? '0.25rem' : 0, fontWeight: 'normal' }}>
                                                    ({match.away_rank})
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                </div>

                                <div className={`w-full sm:w-auto ${isAr ? 'text-right sm:text-left' : 'text-left sm:text-right'}`} style={{ minWidth: '140px' }}>
                                    <small style={{ color: 'var(--grey, #8B95A5)', fontSize: '0.8rem', fontWeight: '500', display: 'block' }}>
                                        {match.kickoff_time ? formatTime(match.kickoff_time) : (isAr ? 'لم يحدد الوقت' : 'Time TBD')}
                                    </small>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '1.5rem',
                        padding: '4rem 2rem',
                        backgroundColor: 'var(--surface, #111D30)',
                        border: '1px dashed var(--border-color)',
                        borderRadius: 'var(--radius, 12px)',
                        textAlign: 'center'
                    }}>
                        <span style={{ fontSize: '3.5rem' }}>🗓️</span>
                        <div>
                            <h3 style={{ fontFamily: isAr ? 'Cairo, system-ui' : 'Bebas Neue', letterSpacing: isAr ? 'normal' : '0.05em', fontSize: '1.5rem', color: 'var(--white)', marginBottom: '0.5rem' }}>
                                {isAr ? "بانتظار جدول مخصص للمباريات" : "Awaiting Custom Schedule"}
                            </h3>
                            <p style={{ color: 'var(--grey, #8B95A5)', fontSize: '0.92rem', maxWidth: '440px', margin: '0 auto', lineHeight: '1.5' }}>
                                {isAr ? "تم إزالة جهات الاتصال والمباريات الافتراضية بالكامل من قاعدة البيانات. نحن جاهزون لاستقبال المقترحات الحقيقية! راسلنا بالجدول لإضافته فوراً." : "All initial database fixtures have been completely removed. We are ready for your real, official schedule! Paste it in the chat and I will insert it instantly."}
                            </p>
                        </div>
                        <button
                            onClick={handleSeedFixtures}
                            disabled={seeding}
                            style={{
                                backgroundColor: 'rgba(139, 149, 165, 0.1)',
                                color: 'var(--white)',
                                fontFamily: isAr ? 'Cairo, system-ui' : 'Bebas Neue',
                                letterSpacing: isAr ? 'normal' : '0.08em',
                                fontSize: '0.9rem',
                                padding: '0.5rem 1.2rem',
                                border: '1px solid var(--border-color)',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                            }}
                        >
                            {seeding ? (isAr ? 'جاري التحقق...' : 'Syncing...') : (isAr ? '🔄 تفريغ وتأكيد قاعدة البيانات' : '🔄 Clear / Verify Cleared')}
                        </button>
                    </div>
                )}
            </div>
            <style>{`
                .fixture-card {
                    border: 1px solid var(--border-color);
                    transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), border-color 0.3s, box-shadow 0.3s, background-color 0.3s;
                }
                .fixture-card--giant {
                    border: 1px solid rgba(139, 92, 246, 0.45) !important;
                    background-color: rgba(139, 92, 246, 0.04) !important;
                    animation: ambientGiantPulse 3s ease-in-out infinite alternate;
                    will-change: transform, box-shadow;
                    backface-visibility: hidden;
                    transform: translate3d(0,0,0);
                }
                .giant-corner-ribbon {
                    box-shadow: 0 2px 6px rgba(139, 92, 246, 0.3);
                    animation: ribbonPulse 2s ease-in-out infinite alternate;
                    will-change: transform;
                    backface-visibility: hidden;
                    transform: translate3d(0,0,0);
                }
                .giant-lightning {
                    display: inline-block;
                    animation: lightningFlicker 1.5s ease-in-out infinite;
                }
                @keyframes ambientGiantPulse {
                    0% {
                        box-shadow: 0 0 8px rgba(139, 92, 246, 0.2);
                        border-color: rgba(139, 92, 246, 0.45) !important;
                        background-color: rgba(139, 92, 246, 0.04) !important;
                        transform: scale(1) translate3d(0,0,0);
                    }
                    100% {
                        box-shadow: 0 0 24px rgba(139, 92, 246, 0.5);
                        border-color: rgba(139, 92, 246, 0.95) !important;
                        background-color: rgba(139, 92, 246, 0.1) !important;
                        transform: scale(1.025) translate3d(0,0,0);
                    }
                }
                @keyframes ribbonPulse {
                    from { 
                        filter: brightness(1); 
                        box-shadow: 0 1px 4px rgba(139, 92, 246, 0.2); 
                    }
                    to { 
                        filter: brightness(1.15); 
                        box-shadow: 0 3px 10px rgba(139, 92, 246, 0.6); 
                    }
                }
                @keyframes lightningFlicker {
                    0%, 100% { transform: scale(1) rotate(0deg); }
                    50% { transform: scale(1.25) rotate(15deg); }
                }
            `}</style>
        </div>
    );
}

