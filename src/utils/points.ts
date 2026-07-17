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

export interface DecodedPrediction {
    homeScore: number;
    awayScore: number;
    isInsurance: boolean;
    isComebackDouble: boolean;
    isComebackTriple: boolean;
    // Special final features:
    predictedChampion: 'home' | 'away' | null;
    firstGoalscorer: 'home' | 'away' | 'none' | null;
    cleanSheet: 'home' | 'away' | 'both' | 'none' | null;
}

export function decodePrediction(homeVal: number | null, awayVal: number | null): DecodedPrediction {
    let homeScore = 0;
    let awayScore = 0;
    let isInsurance = false;
    let isComebackDouble = false;
    let isComebackTriple = false;
    let predictedChampion: 'home' | 'away' | null = null;
    let firstGoalscorer: 'home' | 'away' | 'none' | null = null;
    let cleanSheet: 'home' | 'away' | 'both' | 'none' | null = null;

    if (homeVal !== null && homeVal !== undefined) {
        let h = homeVal;
        if (h >= 300 && h < 400) {
            isComebackTriple = true;
            h -= 300;
        } else if (h >= 200 && h < 300) {
            isComebackDouble = true;
            h -= 200;
        } else if (h >= 100 && h < 200) {
            isInsurance = true;
            h -= 100;
        }
        homeScore = h;
    }

    if (awayVal !== null && awayVal !== undefined) {
        let a = awayVal;
        
        // Decode Clean Sheet Predictor (index * 100,000)
        const csMap: Record<number, 'home' | 'away' | 'both' | 'none'> = {
            1: "home",
            2: "away",
            3: "both",
            4: "none"
        };
        const csIdx = Math.floor(a / 100000);
        if (csIdx > 0 && csIdx <= 4) {
            cleanSheet = csMap[csIdx];
            a %= 100000;
        }

        // Decode First Goalscorer (index * 10,000)
        const firstGoalIdx = Math.floor(a / 10000);
        if (firstGoalIdx === 1) {
            firstGoalscorer = 'home';
            a %= 10000;
        } else if (firstGoalIdx === 2) {
            firstGoalscorer = 'away';
            a %= 10000;
        } else if (firstGoalIdx === 3) {
            firstGoalscorer = 'none';
            a %= 10000;
        }

        // Decode Predicted Champion (index * 1,000)
        const champIdx = Math.floor(a / 1000);
        if (champIdx === 1) {
            predictedChampion = 'home';
            a %= 1000;
        } else if (champIdx === 2) {
            predictedChampion = 'away';
            a %= 1000;
        }

        awayScore = a;
    }

    return {
        homeScore,
        awayScore,
        isInsurance,
        isComebackDouble,
        isComebackTriple,
        predictedChampion,
        firstGoalscorer,
        cleanSheet
    };
}

export function encodePrediction(
    homeScore: number,
    awayScore: number,
    isInsurance: boolean,
    isComebackDouble: boolean,
    isComebackTriple: boolean,
    predictedChampion: 'home' | 'away' | null,
    firstGoalscorer: 'home' | 'away' | 'none' | null,
    cleanSheet: 'home' | 'away' | 'both' | 'none' | null
): { homeVal: number; awayVal: number } {
    let homeVal = homeScore;
    if (isComebackTriple) {
        homeVal += 300;
    } else if (isComebackDouble) {
        homeVal += 200;
    } else if (isInsurance) {
        homeVal += 100;
    }

    let awayVal = awayScore;
    if (predictedChampion === 'home') {
        awayVal += 1000;
    } else if (predictedChampion === 'away') {
        awayVal += 2000;
    }

    if (firstGoalscorer === 'home') {
        awayVal += 10000;
    } else if (firstGoalscorer === 'away') {
        awayVal += 20000;
    } else if (firstGoalscorer === 'none') {
        awayVal += 30000;
    }

    const csMapInverse: Record<string, number> = {
        "home": 1,
        "away": 2,
        "both": 3,
        "none": 4
    };
    if (cleanSheet && csMapInverse[cleanSheet]) {
        awayVal += csMapInverse[cleanSheet] * 100000;
    }

    return { homeVal, awayVal };
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
    const isFinal = groupStage && (groupStage.toLowerCase() === 'final' || groupStage.toLowerCase() === 'finals');
    const isThirdPlace = groupStage && (groupStage.toLowerCase().includes('third') || groupStage.toLowerCase().includes('3rd') || groupStage.toLowerCase().includes('play-off'));

    // Decode predictions and actuals
    const decodedPred = decodePrediction(predictedHome, predictedAway);
    const decodedActual = decodePrediction(actualHome, actualAway);

    const predHome = decodedPred.homeScore;
    const predAway = decodedPred.awayScore;
    const actHome = decodedActual.homeScore;
    const actAway = decodedActual.awayScore;

    // 1. Determine if outcome is correct
    const predictedOutcome = Math.sign(predHome - predAway); // 1 = home win, -1 = away win, 0 = draw
    const actualOutcome = Math.sign(actHome - actAway);

    const isCorrectOutcome = predictedOutcome === actualOutcome;

    let points = 0;

    if (isFinal) {
        const isExact = (predHome === actHome) && (predAway === actAway);
        points = isExact ? 30 : (isCorrectOutcome ? 12 : 0);

        // Add extras (only for Final match):
        // 1. Cup Champion (10 points)
        if (decodedPred.predictedChampion && decodedActual.predictedChampion && decodedPred.predictedChampion === decodedActual.predictedChampion) {
            points += 10;
        }
        // 2. First Goalscorer (10 points)
        if (decodedPred.firstGoalscorer && decodedActual.firstGoalscorer && decodedPred.firstGoalscorer === decodedActual.firstGoalscorer) {
            points += 10;
        }
        // 3. Clean Sheet Predictor (10 points)
        if (decodedPred.cleanSheet && decodedActual.cleanSheet && decodedPred.cleanSheet === decodedActual.cleanSheet) {
            points += 10;
        }
    } else if (isThirdPlace) {
        const isExact = (predHome === actHome) && (predAway === actAway);
        points = isExact ? 20 : (isCorrectOutcome ? 8 : 0);
    } else {
        if (isCorrectOutcome) {
            // 2. Check if direct exact score
            const isExact = (predHome === actHome) && (predAway === actAway);
            
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
                const isExact = (predHome === actHome) && (predAway === actAway);
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
    }

    return points;
}
