"use client";
import React, { useState } from 'react';
import { useLanguage } from '@/utils/LanguageContext';

interface TeamRanking {
    rank: number;
    team: string;
    flag: string;
    points: number;
    confederation: 'CONMEBOL' | 'UEFA' | 'CONCACAF' | 'CAF' | 'AFC' | 'OFC';
    previous_rank: number;
}

const FIFA_RANKINGS: TeamRanking[] = [
    { rank: 1,  team: 'France',                 flag: '🇫🇷', points: 1877, confederation: 'UEFA',     previous_rank: 3  },  // ▲2
    { rank: 2,  team: 'Spain',                  flag: '🇪🇸', points: 1876, confederation: 'UEFA',     previous_rank: 1  },  // ▼1
    { rank: 3,  team: 'Argentina',              flag: '🇦🇷', points: 1875, confederation: 'CONMEBOL', previous_rank: 2  },  // ▼1
    { rank: 4,  team: 'England',                flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', points: 1826, confederation: 'UEFA',     previous_rank: 4  },  // =
    { rank: 5,  team: 'Portugal',               flag: '🇵🇹', points: 1764, confederation: 'UEFA',     previous_rank: 6  },  // ▲1
    { rank: 6,  team: 'Brazil',                 flag: '🇧🇷', points: 1761, confederation: 'CONMEBOL', previous_rank: 5  },  // ▼1
    { rank: 7,  team: 'Netherlands',            flag: '🇳🇱', points: 1758, confederation: 'UEFA',     previous_rank: 7  },  // =
    { rank: 8,  team: 'Morocco',                flag: '🇲🇦', points: 1756, confederation: 'CAF',      previous_rank: 8  },  // =
    { rank: 9,  team: 'Belgium',                flag: '🇧🇪', points: 1735, confederation: 'UEFA',     previous_rank: 9  },  // =
    { rank: 10, team: 'Germany',                flag: '🇩🇪', points: 1730, confederation: 'UEFA',     previous_rank: 10 },  // =
    { rank: 11, team: 'Croatia',                flag: '🇭🇷', points: 1717, confederation: 'UEFA',     previous_rank: 11 },  // =
    { rank: 13, team: 'Colombia',               flag: '🇨🇴', points: 1693, confederation: 'CONMEBOL', previous_rank: 14 },  // ▲1
    { rank: 14, team: 'Senegal',                flag: '🇸🇳', points: 1689, confederation: 'CAF',      previous_rank: 12 },  // ▼2
    { rank: 15, team: 'Mexico',                 flag: '🇲🇽', points: 1681, confederation: 'CONCACAF', previous_rank: 16 },  // ▲1
    { rank: 16, team: 'USA',                    flag: '🇺🇸', points: 1673, confederation: 'CONCACAF', previous_rank: 15 },  // ▼1
    { rank: 17, team: 'Uruguay',                flag: '🇺🇾', points: 1673, confederation: 'CONMEBOL', previous_rank: 17 },  // =
    { rank: 18, team: 'Japan',                  flag: '🇯🇵', points: 1660, confederation: 'AFC',      previous_rank: 19 },  // ▲1
    { rank: 19, team: 'Switzerland',            flag: '🇨🇭', points: 1649, confederation: 'UEFA',     previous_rank: 20 },  // ▲1
    { rank: 20, team: 'Denmark',                flag: '🇩🇰', points: 1621, confederation: 'UEFA',     previous_rank: 21 },  // ▲1
    { rank: 21, team: 'IR Iran',                flag: '🇮🇷', points: 1615, confederation: 'AFC',      previous_rank: 20 },  // ▼1
    { rank: 22, team: 'Türkiye',                flag: '🇹🇷', points: 1599, confederation: 'UEFA',     previous_rank: 25 },  // ▲3
    { rank: 23, team: 'Ecuador',                flag: '🇪🇨', points: 1594, confederation: 'CONMEBOL', previous_rank: 23 },  // =
    { rank: 24, team: 'Austria',                flag: '🇦🇹', points: 1593, confederation: 'UEFA',     previous_rank: 24 },  // =
    { rank: 25, team: 'Korea Republic',         flag: '🇰🇷', points: 1588, confederation: 'AFC',      previous_rank: 22 },  // ▼3
    { rank: 26, team: 'Nigeria',                flag: '🇳🇬', points: 1585, confederation: 'CAF',      previous_rank: 26 },  // =
    { rank: 27, team: 'Australia',              flag: '🇦🇺', points: 1580, confederation: 'AFC',      previous_rank: 27 },  // =
    { rank: 28, team: 'Algeria',                flag: '🇩🇿', points: 1564, confederation: 'CAF',      previous_rank: 28 },  // =
    { rank: 29, team: 'Egypt',                  flag: '🇪🇬', points: 1563, confederation: 'CAF',      previous_rank: 31 },  // ▲2
    { rank: 30, team: 'Canada',                 flag: '🇨🇦', points: 1556, confederation: 'CONCACAF', previous_rank: 29 },  // ▼1
    { rank: 31, team: 'Norway',                 flag: '🇳🇴', points: 1550, confederation: 'UEFA',     previous_rank: 32 },  // ▲1
    { rank: 32, team: 'Ukraine',                flag: '🇺🇦', points: 1546, confederation: 'UEFA',     previous_rank: 30 },  // ▼2
    { rank: 33, team: 'Panama',                 flag: '🇵🇦', points: 1540, confederation: 'CONCACAF', previous_rank: 33 },  // =
    { rank: 34, team: "Côte d'Ivoire",          flag: '🇨🇮', points: 1532, confederation: 'CAF',      previous_rank: 34 },  // =
    { rank: 35, team: 'Poland',                 flag: '🇵🇱', points: 1528, confederation: 'UEFA',     previous_rank: 35 },  // =
    { rank: 38, team: 'Sweden',                 flag: '🇸🇪', points: 1514, confederation: 'UEFA',     previous_rank: 37 },  // ▼1
    { rank: 40, team: 'Paraguay',               flag: '🇵🇾', points: 1503, confederation: 'CONMEBOL', previous_rank: 39 },
    { rank: 41, team: 'Czechia',                flag: '🇨🇿', points: 1501, confederation: 'UEFA',     previous_rank: 43 },  // ▼1
    { rank: 43, team: 'Scotland',               flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', points: 1498, confederation: 'UEFA',     previous_rank: 40 },  // ▼3
    { rank: 44, team: 'Tunisia',                flag: '🇹🇳', points: 1483, confederation: 'CAF',      previous_rank: 44 },  // =
    { rank: 45, team: 'Cameroon',               flag: '🇨🇲', points: 1481, confederation: 'CAF',      previous_rank: 45 },  // =
    { rank: 46, team: 'Congo DR',               flag: '🇨🇩', points: 1478, confederation: 'CAF',      previous_rank: 46 },  // =
    { rank: 50, team: 'Uzbekistan',             flag: '🇺🇿', points: 1465, confederation: 'AFC',      previous_rank: 50 },  // =
    { rank: 51, team: 'Costa Rica',             flag: '🇨🇷', points: 1459, confederation: 'CONCACAF', previous_rank: 51 },  // =
    { rank: 52, team: 'Mali',                   flag: '🇲🇱', points: 1459, confederation: 'CAF',      previous_rank: 52 },  // =
    { rank: 54, team: 'Chile',                  flag: '🇨🇱', points: 1455, confederation: 'CONMEBOL', previous_rank: 54 },  // =
    { rank: 55, team: 'Qatar',                  flag: '🇶🇦', points: 1454, confederation: 'AFC',      previous_rank: 55 },  // =
    { rank: 57, team: 'Iraq',                   flag: '🇮🇶', points: 1447, confederation: 'AFC',      previous_rank: 57 },  // =
    { rank: 60, team: 'South Africa',           flag: '🇿🇦', points: 1429, confederation: 'CAF',      previous_rank: 60 },  // =
    { rank: 61, team: 'Saudi Arabia',           flag: '🇸🇦', points: 1421, confederation: 'AFC',      previous_rank: 61 },  // =
    { rank: 63, team: 'Jordan',                 flag: '🇯🇴', points: 1391, confederation: 'AFC',      previous_rank: 63 },  // =
    { rank: 65, team: 'Bosnia and Herzegovina', flag: '🇧🇦', points: 1388, confederation: 'UEFA',     previous_rank: 65 },  // =
    { rank: 66, team: 'Honduras',               flag: '🇭🇳', points: 1380, confederation: 'CONCACAF', previous_rank: 66 },  // =
    { rank: 69, team: 'Cabo Verde',             flag: '🇨🇻', points: 1366, confederation: 'CAF',      previous_rank: 69 },  // =
    { rank: 71, team: 'Jamaica',                flag: '🇯🇲', points: 1357, confederation: 'CONCACAF', previous_rank: 71 },  // =
    { rank: 74, team: 'Ghana',                  flag: '🇬🇭', points: 1346, confederation: 'CAF',      previous_rank: 74 },  // =
    { rank: 82, team: 'Curaçao',                flag: '🇨🇼', points: 1294, confederation: 'CONCACAF', previous_rank: 81 },  // ▼1
    { rank: 83, team: 'Haiti',                  flag: '🇭🇹', points: 1291, confederation: 'CONCACAF', previous_rank: 83 },  // =
    { rank: 85, team: 'New Zealand',            flag: '🇳🇿', points: 1281, confederation: 'OFC',      previous_rank: 85 },  // =
];

export default function RankingsTab() {
    const { language, t, isAr, tTeam } = useLanguage();
    const [searchTerm, setSearchTerm] = useState('');
    const [activeConfederation, setActiveConfederation] = useState<string>('ALL');

    const confederations = ['ALL', 'UEFA', 'CONMEBOL', 'CONCACAF', 'CAF', 'AFC', 'OFC'];

    const filteredRankings = FIFA_RANKINGS.filter(team => {
        const arabicName = tTeam(team.team);
        const matchesSearch = team.team.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             arabicName.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesConfed = activeConfederation === 'ALL' || team.confederation === activeConfederation;
        return matchesSearch && matchesConfed;
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', color: 'var(--white)', direction: isAr ? 'rtl' : 'ltr' }}>
            {/* Header & Description */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', textAlign: isAr ? 'right' : 'left' }}>
                <h2 style={{ fontFamily: isAr ? 'Cairo, system-ui' : 'Bebas Neue', fontSize: '1.6rem', letterSpacing: isAr ? 'normal' : '0.08em', color: 'var(--white)' }}>
                    {isAr ? "تصنيف فيفا العالمي للمنتخبات الوطنية" : "FIFA National Team Rankings"}
                </h2>
                <p style={{ color: 'var(--grey, #8B95A5)', fontSize: '0.85rem', lineHeight: '1.4' }}>
                    {isAr ? "تلعب التصنيفات الرسمية من الفيفا دورًا أساسيًا ومحوريًا في تنظيم قرعة مباريات المجموعات وحساب عتبات مباريات قاهري العمالقة لتحديد طاقة النقاط المضاعفة!" : "Official rankings play a pivotal role in deciding tournament match dynamics, tournament seedings, and defining Giant Slayer thresholds!"}
                </p>
            </div>

            {/* Filters Bar */}
            <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '1rem',
                background: 'var(--surface, #111D30)',
                padding: '1.25rem',
                borderRadius: 'var(--radius, 12px)',
                border: '1px solid var(--border-color)'
            }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', justifyContent: 'space-between', flexDirection: isAr ? 'row-reverse' : 'row' }}>
                    
                    {/* Search Input */}
                    <div style={{ position: 'relative', width: '100%', maxWidth: '280px' }}>
                        <span style={{ position: 'absolute', left: isAr ? 'unset' : '0.75rem', right: isAr ? '0.75rem' : 'unset', top: '50%', transform: 'translateY(-50%)', color: 'var(--grey, #8B95A5)', fontSize: '0.9rem' }}>🔍</span>
                        <input
                            type="text"
                            placeholder={isAr ? "البحث عن منتخب وطني..." : "Search national team..."}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                width: '100%',
                                backgroundColor: 'var(--input-bg)',
                                color: 'var(--white)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '6px',
                                padding: isAr ? '0.55rem 2.2rem 0.55rem 0.75rem' : '0.55rem 0.75rem 0.55rem 2.2rem',
                                fontSize: '0.85rem',
                                fontFamily: isAr ? 'Cairo, sans-serif' : 'Barlow, sans-serif',
                                outline: 'none',
                                textAlign: isAr ? 'right' : 'left'
                             }}
                        />
                    </div>

                    {/* Confederation Tabs */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', flexDirection: isAr ? 'row-reverse' : 'row' }}>
                        {confederations.map(confed => (
                            <button
                                key={confed}
                                onClick={() => setActiveConfederation(confed)}
                                style={{
                                    backgroundColor: activeConfederation === confed ? 'var(--red, #C8102E)' : 'var(--input-bg)',
                                    color: activeConfederation === confed ? '#fff' : 'var(--white)',
                                    border: activeConfederation === confed ? '1px solid var(--red, #C8102E)' : '1px solid var(--border-color)',
                                    borderRadius: '6px',
                                    padding: '0.45rem 0.8rem',
                                    fontFamily: isAr ? 'Cairo, sans-serif' : 'Bebas Neue, sans-serif',
                                    fontSize: '0.8rem',
                                    letterSpacing: isAr ? 'normal' : '0.04em',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s'
                                }}
                            >
                                {confed === 'ALL' && isAr ? 'الكل' : confed}
                            </button>
                        ))}
                    </div>

                </div>
            </div>

            {/* Rankings Table */}
            <div style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }}>
                <div style={{ 
                    backgroundColor: 'var(--surface, #111D30)',
                    borderRadius: 'var(--radius, 12px)',
                    border: '1px solid var(--border-color)',
                    overflow: 'hidden',
                    minWidth: '580px'
                }}>
                    {/* Header Row */}
                    <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: '65px 1fr 110px 100px 80px', 
                        padding: '1rem 1.5rem',
                        backgroundColor: 'rgba(0,0,0,0.05)',
                        borderBottom: '1px solid var(--border-color)',
                        fontSize: '0.8rem',
                        fontWeight: '700',
                        fontFamily: isAr ? 'Cairo, sans-serif' : 'Bebas Neue, sans-serif',
                        letterSpacing: isAr ? 'normal' : '0.06em',
                        color: 'var(--gold, #C9A84C)'
                    }}>
                        <span style={{ display: 'block', textAlign: 'start' }}>{isAr ? "التصنيف" : "FIFA RANK"}</span>
                        <span style={{ display: 'block', textAlign: 'start' }}>{isAr ? "المنتخب" : "NATIONAL TEAM"}</span>
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
                            <span>{isAr ? "الاتحاد" : "CONFEDERATION"}</span>
                        </div>
                        <span style={{ display: 'block', textAlign: 'end' }}>{isAr ? "النقاط" : "FIFA POINTS"}</span>
                        <span style={{ display: 'block', textAlign: 'end' }}>{isAr ? "فرَق التغيير" : "SHIFT"}</span>
                    </div>

                    {/* Body Rows */}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {filteredRankings.length > 0 ? (
                             filteredRankings.map((team) => {
                                const shift = team.previous_rank - team.rank;
                                const shiftColor = shift > 0 ? '#34d399' : shift < 0 ? '#f87171' : 'var(--grey, #8B95A5)';
                                const shiftSymbol = shift > 0 ? '▲' : shift < 0 ? '▼' : '—';
                                
                                return (
                                    <div
                                        key={team.team}
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: '65px 1fr 110px 100px 80px',
                                            padding: '1rem 1.5rem',
                                            borderBottom: '1px solid var(--border-color)',
                                            alignItems: 'center',
                                            fontSize: '0.9rem'
                                        }}
                                    >
                                    {/* Rank */}
                                    <span style={{ 
                                        display: 'block',
                                        fontFamily: isAr ? 'Cairo, sans-serif' : 'Bebas Neue', 
                                        fontSize: '1.2rem', 
                                        letterSpacing: isAr ? 'normal' : '0.02em',
                                        color: team.rank <= 3 ? 'var(--gold, #C9A84C)' : 'var(--white)',
                                        textAlign: 'start'
                                    }}>
                                        #{team.rank}
                                    </span>

                                    {/* Team Name with Flag */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'start', width: '100%' }}>
                                        <span className="animated-flag" style={{ fontSize: '1.3rem' }}>{team.flag}</span>
                                        <span style={{ fontWeight: '700', color: 'var(--white)' }}>
                                            {tTeam(team.team)}
                                        </span>
                                    </div>

                                    {/* Confederation Badge */}
                                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
                                        <span style={{ 
                                            textTransform: 'uppercase', 
                                            fontSize: '0.7rem', 
                                            fontWeight: '700', 
                                            backgroundColor: 'rgba(139,149,165,0.1)',
                                            padding: '0.25rem 0.5rem',
                                            borderRadius: '4px',
                                            color: 'var(--white)',
                                            letterSpacing: '0.03em'
                                        }}>
                                            {team.confederation}
                                        </span>
                                    </div>

                                    {/* Total Points */}
                                    <span style={{ 
                                        display: 'block',
                                        textAlign: 'end', 
                                        fontWeight: '600', 
                                        fontFamily: 'monospace',
                                        color: 'var(--white)'
                                    }}>
                                        {team.points}
                                    </span>

                                    {/* Trend indicator */}
                                    <span style={{ 
                                        display: 'block',
                                        textAlign: 'end', 
                                        fontWeight: '700', 
                                        color: shiftColor,
                                        fontSize: '0.8rem'
                                    }}>
                                        {shiftSymbol} {Math.abs(shift) || ''}
                                    </span>
                                </div>
                            );
                        })
                    ) : (
                        <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--grey, #8B95A5)', fontSize: '0.9rem' }}>
                            {isAr ? "لم يتم العثور على أي كشافة أو منتخب وطني يطابق مرشحات البحث." : "No teams found matching current search or filters."}
                        </div>
                    )}
                </div>
            </div>
            </div>
        </div>
    );
}
