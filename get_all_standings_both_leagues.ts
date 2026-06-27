import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = 'https://cumbseixzwzuqhpsezqh.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1bWJzZWl4end6dXFocHNlenFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4MzQ2ODQsImV4cCI6MjA5NDQxMDY4NH0.GwuAcgyt2wuWQdxonyRULnz-kuLO0yOopKqGH2g2OrU';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

import { calculatePoints, isSurpriseLoot } from './src/utils/points';

async function run() {
  const { data: leagues } = await supabase.from('leagues').select('*');
  const { data: profiles } = await supabase.from('profiles').select('*');
  const { data: matches } = await supabase.from('matches').select('*');
  const { data: predictions } = await supabase.from('predictions').select('*');
  
  if (!leagues || !profiles || !matches || !predictions) {
    console.log('Error fetching DB data');
    return;
  }

  for (const league of leagues) {
    const { data: members } = await supabase.from('league_members').select('user_id').eq('league_id', league.league_id);
    if (!members || members.length === 0) continue;
    
    console.log(`\n======================================================`);
    console.log(`LEAGUE: ${league.league_name} (${league.league_id})`);
    console.log(`======================================================`);

    const results = members.map(m => {
        const profile = profiles.find(p => p.id === m.user_id);
        const userPreds = predictions.filter(p => p.user_id === m.user_id);

        let totalPoints = 0;
        let slayerPoints = 0;
        let exactCount = 0;
        let outcomeCount = 0;

        const predMap = new Map(userPreds.map(p => [p.match_id, p]));

        matches.forEach(match => {
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

            const homeRank = match.home_rank ?? 60;
            const awayRank = match.away_rank ?? 60;
            const isGiantSlayer = match.is_giant_slayer === true || 
                                   (Math.abs(homeRank - awayRank) >= 35 && (homeRank <= 20 || awayRank <= 20));

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
                    homeRank,
                    awayRank,
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
            if (!addedToSlayer && isInsurance && pts > 0) {
                slayerPoints += 3;
            }

            if (hasExplicitPrediction) {
                const isPhysExact = (pHome === match.home_score_final) && (pAway === match.away_score_final);
                const actualOutcome = Math.sign(match.home_score_final - match.away_score_final);
                const predOutcome = Math.sign(pHome - pAway);
                const isPhysOutcome = !isPhysExact && (actualOutcome === predOutcome);
                if (isPhysExact) {
                    exactCount++;
                } else if (isPhysOutcome) {
                    outcomeCount++;
                }
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
        if (b.points !== a.points) return b.points - a.points;
        if (b.slayerPoints !== a.slayerPoints) return b.slayerPoints - a.slayerPoints;
        if (b.exactCount !== a.exactCount) return b.exactCount - a.exactCount;
        return b.outcomeCount - a.outcomeCount;
    });

    results.forEach((r, idx) => {
      console.log(`${idx + 1}. Username: ${r.username} | Points: ${r.points} | SlayerPoints: ${r.slayerPoints} | Exacts: ${r.exactCount} | Outcomes: ${r.outcomeCount}`);
    });
  }
}

run();
