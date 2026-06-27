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
export function getDeterministicUserMatchFactor(userId: string | null, matchId: string, groupStage?: string | null): number {
    if (!userId || !matchId) return 0.5;
    let salt = '';
    if (groupStage) {
        const match = groupStage.match(/\[SALT:([^\]]+)\]/);
        if (match) {
            salt = match[1];
        }
    }
    const key = `${userId}_${matchId}_${salt}`;
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        hash = (hash << 5) - hash + key.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
    }
    // Return a floating value between 0 and 1
    return Math.abs(hash % 1000) / 1000;
}

export function isSurpriseLoot(homeTeam: string, awayTeam: string, matchId?: string, userId?: string | null, groupStage?: string | null): boolean {
    if (groupStage) {
        return groupStage.includes('[LOOT]') || groupStage.includes('[SURPRISE_LOOT]');
    }

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

export function isKnockoutStage(groupStage?: string | null): boolean {
    if (!groupStage) return false;
    const stage = groupStage.toLowerCase();
    // Knockout stage games do not contain "group" and we exclude internal dummy "system" matches
    return !stage.includes('group') && !stage.includes('system');
}

export function calculatePoints(
    predictedHome: number,
    predictedAway: number,
    actualHome: number,
    actualAway: number,
    isGiantSlayer: boolean,
    homeRank: number,
    awayRank: number,
    isJoker: boolean = false, // true = Double Down token, false = Flat +3 Points
    homeTeam: string = '',
    awayTeam: string = '',
    matchId?: string,
    userId?: string | null,
    isUnderdogSpecialist: boolean = false,
    groupStage?: string | null,
    isComebackDouble: boolean = false,
    isComebackTriple: boolean = false
): number {
    // 1. Determine if outcome is correct
    const predictedOutcome = Math.sign(predictedHome - predictedAway); // 1 = home win, -1 = away win, 0 = draw
    const actualOutcome = Math.sign(actualHome - actualAway);

    const isCorrectOutcome = predictedOutcome === actualOutcome;

    let points = 0;
    if (isCorrectOutcome) {
        // 2. Check if direct exact score
        const isExact = (predictedHome === actualHome) && (predictedAway === actualAway);
        
        // Base points are doubled for knockout stage games
        const isKnockout = isKnockoutStage(groupStage);
        const baseMultiplier = isKnockout ? 2 : 1;
        
        points = (isExact ? 5 : 2) * baseMultiplier;

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

    // 4. If Underdog Specialist token is active, predict underdog to win was correct outcome, and not a loot game, get flat +3 points
    const isHomeUnderdog = homeRank != null && awayRank != null && homeRank > awayRank;
    const isAwayUnderdog = homeRank != null && awayRank != null && awayRank > homeRank;
    const predictedUnderdogToWin = (isHomeUnderdog && predictedOutcome === 1) || (isAwayUnderdog && predictedOutcome === -1);
    const isLoot = homeTeam && awayTeam && isSurpriseLoot(homeTeam, awayTeam, matchId, userId, groupStage);

    if (isUnderdogSpecialist && !isLoot && predictedUnderdogToWin && isCorrectOutcome) {
        points += 3;
    }

    // 5. If Double Down token (isJoker) was applied, DOUBLE whatever points they earned on this match!
    if (isJoker) {
        points = points * 2;
    } else if (!isUnderdogSpecialist) {
        // 6. Apply Surprise Loot bonus points flat +3 if match is a Surprise Loot match and if the prediction is an exact score, AND NOT LIVE
        const isLive = groupStage && groupStage.includes('[LIVE]');
        if (isLoot && !isLive) {
            const isExact = (predictedHome === actualHome) && (predictedAway === actualAway);
            if (isExact) {
                // Flat +3 points: Guaranteed 3 points on top of whatever they earned (e.g., 5+3=8)
                points = points + 3;
            }
        }
    }

    // 7. Apply Comeback Multipliers if active
    if (isComebackDouble) {
        points = points * 2;
    } else if (isComebackTriple) {
        points = points * 3;
    }

    return points;
}
