import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cumbseixzwzuqhpsezqh.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1bWJzZWl4end6dXFocHNlenFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4MzQ2ODQsImV4cCI6MjA5NDQxMDY4NH0.GwuAcgyt2wuWQdxonyRULnz-kuLO0yOopKqGH2g2OrU';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkNetherlandSwedenMatch() {
    try {
        const userId = 'a79b66d9-02c8-4a3f-8857-6dbd18b24006'; // aliawadhi
        const { data: matches } = await supabase.from('matches').select('*');
        const m = matches?.find(match => match.home_team === 'Netherlands' && match.away_team === 'Sweden');
        if (!m) {
            console.log("Netherlands vs Sweden not found!");
            return;
        }

        console.log(`Match info - ID: ${m.match_id}, Kickoff: ${m.kickoff_time}, HomeScoreFinal: ${m.home_score_final}, AwayScoreFinal: ${m.away_score_final}, group_stage: ${m.group_stage}`);

        const { data: preds } = await supabase.from('predictions').select('*').eq('match_id', m.match_id);
        console.log(`Total predictions for this match in DB: ${preds?.length}`);
        
        preds?.forEach((p, idx) => {
            console.log(`Pred ${idx+1}: User ID: ${p.user_id} | HomeScore: ${p.predicted_home_score} | AwayScore: ${p.predicted_away_score}`);
        });

        const userPred = preds?.find(p => p.user_id === userId);
        if (userPred) {
            console.log(`Found prediction by user alias ${userId}! Home: ${userPred.predicted_home_score}, Away: ${userPred.predicted_away_score}`);
        } else {
            console.log(`NO PREDICTION for ${userId} in DB for this match!`);
        }

    } catch (e) {
        console.error(e);
    }
}

checkNetherlandSwedenMatch();
