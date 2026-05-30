/**
 * Calculates points for a prediction against the actual final match score.
 * Rules:
 * - Exact score gets 5 points
 * - Correct outcome (winner or draw) but not exact score gets 2 points
 * - Otherwise 0 points
 * 
 * Giant Slayer rules:
 * - If isGiantSlayer is true, and the giant was actually slain (underdog wins or draws):
 *   - Any correct prediction points are doubled (5 becomes 10, 2 becomes 4).
 */
export function isSurpriseLoot(homeTeam: string, awayTeam: string): boolean {
    const home = (homeTeam || '').trim().toLowerCase();
    const away = (awayTeam || '').trim().toLowerCase();
    const isMatch = (t1: string, t2: string) => 
        (home === t1.toLowerCase() && away === t2.toLowerCase()) || 
        (home === t2.toLowerCase() && away === t1.toLowerCase());
    
    return isMatch('Brazil', 'Morocco') || 
           isMatch('USA', 'Australia') || 
           isMatch('Algeria', 'Austria') ||
           isMatch('Congo DR', 'Uzbekistan');
}

export function calculatePoints(
    predictedHome: number,
    predictedAway: number,
    actualHome: number,
    actualAway: number,
    isGiantSlayer: boolean,
    homeRank: number,
    awayRank: number,
    isJoker: boolean = false, // true = Double Down token, false = Flat +5 Points
    homeTeam: string = '',
    awayTeam: string = ''
): number {
    // 1. Determine if outcome is correct
    const predictedOutcome = Math.sign(predictedHome - predictedAway); // 1 = home win, -1 = away win, 0 = draw
    const actualOutcome = Math.sign(actualHome - actualAway);

    const isCorrectOutcome = predictedOutcome === actualOutcome;

    let points = 0;
    if (isCorrectOutcome) {
        // 2. Check if direct exact score
        const isExact = (predictedHome === actualHome) && (predictedAway === actualAway);
        points = isExact ? 5 : 2;

        // 3. Apply Giant Slayer double multiplier if underdog was predicted to win/draw and got a result
        const effectiveIsGiantSlayer = isGiantSlayer === true || 
            (homeRank != null && awayRank != null && Math.abs(homeRank - awayRank) >= 35 && (homeRank <= 20 || awayRank <= 20));

        if (effectiveIsGiantSlayer) {
            const isHomeWeaker = homeRank > awayRank;
            let predictedUnderdogNotToLose = false;

            if (isHomeWeaker) {
                // Home is underdog. User predicted underdog not to lose if they predicted Home win or draw.
                predictedUnderdogNotToLose = predictedOutcome >= 0;
            } else if (awayRank > homeRank) {
                // Away is underdog. User predicted underdog not to lose if they predicted Away win or draw.
                predictedUnderdogNotToLose = predictedOutcome <= 0;
            } else {
                // Fallback if ranks are identical: default to true
                predictedUnderdogNotToLose = true;
            }

            if (predictedUnderdogNotToLose) {
                points *= 2;
            }
        }
    }

    // 4. If Double Down token (isJoker) was applied, DOUBLE whatever points they earned on this match!
    if (isJoker) {
        points = points * 2;
    } else {
        // 5. Apply Surprise Loot bonus points flat +5 if match is a Surprise Loot match and if the prediction is an exact score
        if (homeTeam && awayTeam && isSurpriseLoot(homeTeam, awayTeam)) {
            const isExact = (predictedHome === actualHome) && (predictedAway === actualAway);
            if (isExact) {
                // Flat +5 points: Guaranteed 5 points on top of whatever they earned (e.g., 5+5=10)
                points = points + 5;
            }
        }
    }

    return points;
}
