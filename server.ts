import express from "express";
import path from "path";
import fs from "fs";
import cors from "cors";
import webpush from "web-push";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import { calculatePoints } from "./src/utils/points";

const app = express();
const PORT = 3000;

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
}));
app.use(express.json());

// Hardcoded verified Supabase credentials congruent with src/utils/supabase.ts
const supabaseUrl = 'https://cumbseixzwzuqhpsezqh.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1bWJzZWl4end6dXFocHNlenFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4MzQ2ODQsImV4cCI6MjA5NDQxMDY4NH0.GwuAcgyt2wuWQdxonyRULnz-kuLO0yOopKqGH2g2OrU';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Setup VAPID Keys securely (lazy build or read)
const publicKey = "BAWx4A_Z4EZmEI9qOSG4kn4mjYrOmUqbt32IMFa5kr4eYKcLvZrSP5J-s3jg8Vsb86EaRAUbkMr2HbrscUHSoaQ";
const privateKey = "mvyzYMwUZZ7XW4Ttf3hx5L3j1iU2N340BuUDXdjkDL4";

webpush.setVapidDetails(
  "mailto:aliawadhi93@gmail.com",
  publicKey,
  privateKey
);

function cleanPushSubscription(sub: any) {
  if (!sub) return null;
  const clean: any = {};
  if (sub.endpoint) clean.endpoint = sub.endpoint;
  if (sub.keys) clean.keys = sub.keys;
  return clean;
}

// Manage Web Push subscription files
const subsPath = path.join(process.cwd(), "push_subscriptions.json");
interface StoredSubscription {
  userId: string | null;
  subscription: any;
  joinedAt: string;
}

const sentAlertsTrackerByEndpoint = new Map<string, Set<string>>();

async function getSubscriptions(): Promise<StoredSubscription[]> {
  const dbSubs: StoredSubscription[] = [];
  try {
    const { data, error } = await supabase.from("push_subscriptions").select("*");
    if (!error && data) {
      for (const d of data) {
        dbSubs.push({
          userId: d.user_id || null,
          subscription: typeof d.subscription === "string" ? JSON.parse(d.subscription) : d.subscription,
          joinedAt: d.created_at || new Date().toISOString()
        });
      }
    }
  } catch (err: any) {
    console.warn("[DB Info] Supabase 'push_subscriptions' table is not queried (likely table creation pending):", err.message);
  }

  let fileSubs: StoredSubscription[] = [];
  if (fs.existsSync(subsPath)) {
    try {
      fileSubs = JSON.parse(fs.readFileSync(subsPath, "utf8"));
    } catch (e) {
      fileSubs = [];
    }
  }

  // Combine and deeply merge tracking history / sent_alerts to cleanly prevent duplicate native push alerts
  const combined: StoredSubscription[] = [];
  const endpointMap = new Map<string, StoredSubscription>();

  for (const s of [...dbSubs, ...fileSubs]) {
    const endpoint = s.subscription?.endpoint;
    if (!endpoint) continue;

    if (!endpointMap.has(endpoint)) {
      const clone = {
        userId: s.userId,
        subscription: JSON.parse(JSON.stringify(s.subscription)),
        joinedAt: s.joinedAt
      };
      if (!clone.subscription.sent_alerts) {
        clone.subscription.sent_alerts = {};
      }
      endpointMap.set(endpoint, clone);
    } else {
      const existing = endpointMap.get(endpoint)!;
      if (!existing.subscription.sent_alerts) {
        existing.subscription.sent_alerts = {};
      }
      const incomingAlerts = s.subscription?.sent_alerts || {};
      for (const key of Object.keys(incomingAlerts)) {
        existing.subscription.sent_alerts[key] = true;
      }
    }
  }

  // Inject in-memory alerts (this guarantees zero duplicate notifications across cycles in a robust way)
  for (const [endpoint, existing] of endpointMap.entries()) {
    if (!existing.subscription.sent_alerts) {
      existing.subscription.sent_alerts = {};
    }
    const memAlerts = sentAlertsTrackerByEndpoint.get(endpoint);
    if (memAlerts) {
      for (const alertKey of memAlerts) {
        existing.subscription.sent_alerts[alertKey] = true;
      }
    }
    combined.push(existing);
  }

  return combined;
}

function saveSubscription(userId: string | null, subscription: any) {
  let subs: StoredSubscription[] = [];
  if (fs.existsSync(subsPath)) {
    try {
      subs = JSON.parse(fs.readFileSync(subsPath, "utf8"));
    } catch (e) {
      subs = [];
    }
  }
  const endpoint = subscription.endpoint;
  const filtered = subs.filter(s => s.subscription?.endpoint !== endpoint);
  filtered.push({
    userId,
    subscription,
    joinedAt: new Date().toISOString()
  });
  fs.writeFileSync(subsPath, JSON.stringify(filtered, null, 2), "utf8");
}

// Manage lock-in warning state records
const lockinsPath = path.join(process.cwd(), "sent_lockins.json");
function getSentLockins(): Record<string, boolean> {
  if (!fs.existsSync(lockinsPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(lockinsPath, "utf8"));
  } catch (e) {
    return {};
  }
}

function recordSentLockin(matchId: string, userId: string) {
  const data = getSentLockins();
  data[`${matchId}_${userId}`] = true;
  fs.writeFileSync(lockinsPath, JSON.stringify(data, null, 2), "utf8");
}

// API Endpoints
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  next();
});

app.get("/api/ping", (req, res) => {
  res.json({ status: "alive", timestamp: new Date().toISOString() });
});

app.get("/api/push/public-key", (req, res) => {
  res.json({ publicKey });
});

app.post("/api/push/subscribe", async (req, res) => {
  const { subscription, userId } = req.body;
  if (!subscription) {
    return res.status(400).json({ error: "Missing subscription object" });
  }
  saveSubscription(userId || null, subscription);

  try {
    const endpoint = subscription?.endpoint;
    if (endpoint) {
      let rows = null;
      if (userId) {
        const { data } = await supabase.from("push_subscriptions")
          .select("*")
          .eq("user_id", userId);
        rows = data;
      }
      if (!rows || rows.length === 0) {
        const { data } = await supabase.from("push_subscriptions")
          .select("*");
        rows = data;
      }

      let foundRow = null;
      if (rows) {
        foundRow = rows.find(r => {
          const sub = typeof r.subscription === "string" ? JSON.parse(r.subscription) : r.subscription;
          return sub?.endpoint === endpoint;
        });
      }

      if (foundRow) {
        const mergedSub = typeof foundRow.subscription === "string" ? JSON.parse(foundRow.subscription) : foundRow.subscription;
        
        if (subscription.lang) mergedSub.lang = subscription.lang;
        if (subscription.keys) mergedSub.keys = subscription.keys;
        if (subscription.muted !== undefined) mergedSub.muted = subscription.muted;
        if (subscription.enabled !== undefined) mergedSub.enabled = subscription.enabled;

        const { error: dbErr } = await supabase.from("push_subscriptions")
          .update({
            user_id: userId || null,
            subscription: mergedSub
          })
          .eq("id", foundRow.id);

        if (dbErr) {
          console.warn("Express backend merge update returned error:", dbErr);
        }
      } else {
        const { error: dbErr } = await supabase.from("push_subscriptions").insert({
          user_id: userId || null,
          subscription: subscription
        });
        if (dbErr) {
          console.warn("Express backend subscription insert returned error:", dbErr);
        }
      }
    }
  } catch (err: any) {
    console.warn("Express backend subscription subscribe failed:", err?.message);
  }

  console.log(`[SW Server] Subscribed user: ${userId || "Anonymous"} successfully`);
  res.status(200).json({ success: true });
});

app.all("/api/push/trigger-alerts", async (req, res) => {
  console.log("[Instant Alerts Trigger] Manual trigger received, executing poller...");
  try {
    await pollMatchChanges();
    res.json({ success: true, message: "Standings and score alerts parsed & sent!" });
  } catch (err: any) {
    console.error("[Instant Alerts Trigger Error]:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/push/send-test", async (req, res) => {
  const { userId } = req.body;
  const subs = await getSubscriptions();
  const targetSubs = userId 
    ? subs.filter(s => s.userId === userId)
    : subs;

  if (targetSubs.length === 0) {
    return res.status(404).json({ error: "No active subscriptions found" });
  }

  let sent = 0;
  let failed = 0;

  for (const s of targetSubs) {
    if (s.subscription?.muted === true || s.subscription?.enabled === false) {
      continue;
    }
    try {
      // Is subscription configured for Arabic?
      const isSubAr = s.subscription && s.subscription.lang === "ar";
      const title = isSubAr ? "🏆 تنبيه تجريبي مباشر من النظام" : "🏆 Test Direct System Alert";
      const body = isSubAr 
        ? "عمل رائع! إشعارات نظام الخلفية تعمل بسلاسة تامة حتى عند إغلاق التطبيق! 🚀"
        : "Great job! Background OS push notifications are working smoothly even when closed! 🚀";

      await webpush.sendNotification(
        cleanPushSubscription(s.subscription),
        JSON.stringify({
          title: title,
          body: body,
          icon: "https://i.imgur.com/2b1mFMB.png",
          badge: "https://i.imgur.com/2b1mFMB.png",
          tag: "test_push"
        })
      );
      sent++;
    } catch (err: any) {
      console.warn("Skipped expired test push subscriber endpoint:", err.message);
      failed++;
    }
  }

  res.json({ success: true, sent, failed });
});

// Setup Background Monitor Engine
interface Match {
  match_id: string;
  home_team: string;
  away_team: string;
  kickoff_time: string;
  home_score_final: number | null;
  away_score_final: number | null;
  home_rank: number;
  away_rank: number;
  is_giant_slayer: boolean;
  group_stage: string | null;
}

async function recordSentAlert(endpoint: string, alertKey: string) {
  try {
    // 1. Track in-memory immediately to prevent duplicate triggers asynchronously
    if (!sentAlertsTrackerByEndpoint.has(endpoint)) {
      sentAlertsTrackerByEndpoint.set(endpoint, new Set());
    }
    sentAlertsTrackerByEndpoint.get(endpoint)!.add(alertKey);

    // 2. Persist to local JSON file for development fallback if exists
    if (fs.existsSync(subsPath)) {
      try {
        const subs: StoredSubscription[] = JSON.parse(fs.readFileSync(subsPath, "utf8"));
        const target = subs.find(s => s.subscription?.endpoint === endpoint);
        if (target) {
          if (!target.subscription.sent_alerts) {
            target.subscription.sent_alerts = {};
          }
          target.subscription.sent_alerts[alertKey] = true;
          fs.writeFileSync(subsPath, JSON.stringify(subs, null, 2), "utf8");
        }
      } catch (e) {
        // Ignored fallback
      }
    }

    // 3. Fetch subscription from Supabase and merge
    const { data, error: selectErr } = await supabase
      .from("push_subscriptions")
      .select("*");

    if (selectErr) {
      console.warn("[Record Sent Alert] Database select failed:", selectErr.message);
    }

    let foundRow = null;
    if (data) {
      foundRow = data.find((r: any) => {
        const sub = typeof r.subscription === "string" ? JSON.parse(r.subscription) : r.subscription;
        return sub?.endpoint === endpoint;
      });
    }

    if (foundRow) {
      const sub = typeof foundRow.subscription === "string" ? JSON.parse(foundRow.subscription) : foundRow.subscription;
      if (!sub.sent_alerts) {
        sub.sent_alerts = {};
      }
      sub.sent_alerts[alertKey] = true;

      const { error: updateErr } = await supabase
        .from("push_subscriptions")
        .update({ subscription: sub })
        .eq("id", foundRow.id);

      if (updateErr) {
        console.warn("[Record Sent Alert] Database update failed:", updateErr.message);
      }
    }
  } catch (err: any) {
    console.error(`[Record Sent Alert Error]:`, err.message);
  }
}

// Tracking finalized matches and live scores on boot to avoid duplicate notifications on server restart
const matchesAlreadyFinalizedOnBoot = new Set<string>();
const lastLiveScoresOnBoot = new Map<string, string>();

// Load matches dynamically and trigger alerts based on persistent subscription logs
async function pollMatchChanges() {
  try {
    const { data: matches, error } = await supabase
      .from("matches")
      .select("*")
      .order("kickoff_time", { ascending: true });

    if (error || !matches) {
       return;
    }

    const subs = await getSubscriptions();
    if (subs.length === 0) {
      return;
    }

    const { data: profiles } = await supabase.from("profiles").select("*");
    const profilesMap = new Map((profiles || []).map(p => [p.id, p]));

    // Query only the predictions for upcoming matches starting in the next 2 hours for lock-in warning validation
    const upcomingMatchIds = matches
      .filter(m => {
        const kickoffMs = new Date(m.kickoff_time).getTime();
        const timeToStartMs = kickoffMs - Date.now();
        return timeToStartMs > 0 && timeToStartMs < 7200000;
      })
      .map(m => m.match_id);

    let allPredictions: any[] = [];
    if (upcomingMatchIds.length > 0) {
      const { data, error: predErr } = await supabase
        .from("predictions")
        .select("match_id, user_id")
        .in("match_id", upcomingMatchIds);
      if (!predErr && data) {
        allPredictions = data;
      } else if (predErr) {
        console.warn("[SW Poller] Failed to query upcoming predictions:", predErr.message);
      }
    }

    // Map predictions by match_id for instant lookup
    const predictionsByMatchId: Record<string, string[]> = {};
    if (allPredictions) {
      for (const p of allPredictions) {
        if (!predictionsByMatchId[p.match_id]) {
          predictionsByMatchId[p.match_id] = [];
        }
        predictionsByMatchId[p.match_id].push(p.user_id);
      }
    }

    // Iterate matches and detect state conversions
    for (const m of matches) {
      const matchId = m.match_id;
      const isLiveNow = !!(m.group_stage && /\[LIVE\]/i.test(m.group_stage));
      const isFinalizedNow = m.home_score_final !== null && m.away_score_final !== null && !isLiveNow;

      // ----------------------------------------------------
      // Condition A: Final Whistle (Completed match score release)
      // ----------------------------------------------------
      if (isFinalizedNow) {
        if (matchesAlreadyFinalizedOnBoot.has(matchId)) {
          continue;
        }
        // Save to set immediately to prevent concurrent polling duplicate notifies
        matchesAlreadyFinalizedOnBoot.add(matchId);

        // Fetch predictions for this specific finalized match-score to calculate point awards
        const { data: predictions } = await supabase
          .from("predictions")
          .select("*")
          .eq("match_id", matchId);

        for (const s of subs) {
          if (!s.userId) continue;

          // Skip if user muted push alerts inside app configurations
          if (s.subscription?.muted === true || s.subscription?.enabled === false) {
            continue;
          }

          // Check if this user was already notified of this finalized match results
          const alertKey = `whistle_${matchId}`;
          const alreadyNotified = s.subscription?.sent_alerts?.[alertKey] === true;
          if (alreadyNotified) continue;

          const userProfile = profilesMap.get(s.userId);
          let isAr = false;
          if (s.subscription && s.subscription.lang) {
            isAr = s.subscription.lang === "ar";
          } else if (userProfile?.username) {
            isAr = /[\u0600-\u06FF]/.test(userProfile.username);
          }

          // Find user prediction for this match
          const userPred = (predictions || []).find(p => p.user_id === s.userId);

          let alertTitle = isAr ? "🏁 صفارة النهاية! نقاطك جاهزة" : "🏁 Final Whistle & Points Calculated!";
          let alertBody = "";

          if (userPred) {
            const homeP = userPred.predicted_home_score !== null && userPred.predicted_home_score !== undefined ? Number(userPred.predicted_home_score) : 0;
            const awayP = userPred.predicted_away_score !== null && userPred.predicted_away_score !== undefined ? Number(userPred.predicted_away_score) : 0;
            const actualH = m.home_score_final!;
            const actualA = m.away_score_final!;

            // Calculate exact points matching
            const pointsEarned = calculatePoints(
              homeP,
              awayP,
              actualH,
              actualA,
              m.is_giant_slayer,
              m.home_rank,
              m.away_rank,
              userPred.is_joker,
              m.home_team,
              m.away_team,
              m.match_id,
              userPred.user_id,
              m.is_giant_slayer,
              m.group_stage
            );

            const outcomeTextEn = pointsEarned === 5 ? "Exact Score Match!" : (pointsEarned > 0 ? "Correct Outcome!" : "No Points.");
            const outcomeTextAr = pointsEarned === 5 ? "توقع صحيح تماماً للنتيجة!" : (pointsEarned > 0 ? "توقع صحيح للفائز!" : "لم تحصل على نقاط.");

            alertBody = isAr
              ? `المباراة: ${m.home_team} {${m.home_score_final}} - {${m.away_score_final}} ${m.away_team}.\nتوقعك: ${homeP}-${awayP} (${outcomeTextAr}). لقد أحرزت ${pointsEarned} نقاط مضاف!`
              : `Match: ${m.home_team} ${m.home_score_final} - ${m.away_score_final} ${m.away_team}.\nYour prediction: ${homeP}-${awayP} (${outcomeTextEn}). You earned +${pointsEarned} points!`;
          } else {
            alertBody = isAr
              ? `المباراة: ${m.home_team} {${m.home_score_final}} - {${m.away_score_final}} ${m.away_team} انتهت الآن. لم تقم بالتنبؤ في الوقت المحدد.`
              : `Match: ${m.home_team} ${m.home_score_final} - ${m.away_score_final} ${m.away_team} has finalized. You did not place a prediction.`;
          }

          try {
            await webpush.sendNotification(
              cleanPushSubscription(s.subscription),
              JSON.stringify({
                title: alertTitle,
                body: alertBody,
                icon: "https://i.imgur.com/2b1mFMB.png",
                badge: "https://i.imgur.com/2b1mFMB.png",
                tag: alertKey
              })
            );
            await recordSentAlert(s.subscription.endpoint, alertKey);
            console.log(`[SW Persistent Detector] Dispatched finalized whistle alert: ${alertKey} to user: ${s.userId}`);
          } catch (err: any) {
            console.warn(`Could not dispatch whistle alert to endpoint: ${err.message}`);
          }
        }
      }

      // ----------------------------------------------------
      // Condition B: Standing Shift / Live scores updates
      // ----------------------------------------------------
      if (isLiveNow && m.home_score_final !== null && m.away_score_final !== null) {
        const scoreTag = `${m.home_score_final}_${m.away_score_final}`;
        const alertKey = `live_${matchId}_${scoreTag}`;

        // Skip if this live score was already processed on boot or sent previously in this run
        if (lastLiveScoresOnBoot.get(matchId) === scoreTag) {
          continue;
        }
        lastLiveScoresOnBoot.set(matchId, scoreTag);

        for (const s of subs) {
          // Skip if user muted push alerts inside app configurations
          if (s.subscription?.muted === true || s.subscription?.enabled === false) {
            continue;
          }

          const alreadyNotified = s.subscription?.sent_alerts?.[alertKey] === true;
          if (alreadyNotified) continue;

          const userProfile = s.userId ? profilesMap.get(s.userId) : null;
          let isAr = false;
          if (s.subscription && s.subscription.lang) {
            isAr = s.subscription.lang === "ar";
          } else if (userProfile?.username) {
            isAr = /[\u0600-\u06FF]/.test(userProfile.username);
          }

          let alertTitle = isAr ? "📊 تحديث حي: تغير في التترتيب!" : "📊 Live Update: Standings Shift!";
          let alertBody = isAr
            ? `المباراة جارية حية: ${m.home_team} {${m.home_score_final}} - {${m.away_score_final}} ${m.away_team} جارية الآن. جدول الترتيب والنقاط المتوقعة تبدلت حياً!`
            : `Live score update: ${m.home_team} ${m.home_score_final} - ${m.away_score_final} ${m.away_team}. Standings and potential points have shifted live!`;

          try {
            await webpush.sendNotification(
              cleanPushSubscription(s.subscription),
              JSON.stringify({
                title: alertTitle,
                body: alertBody,
                icon: "https://i.imgur.com/2b1mFMB.png",
                badge: "https://i.imgur.com/2b1mFMB.png",
                tag: alertKey
              })
            );
            await recordSentAlert(s.subscription.endpoint, alertKey);
            console.log(`[SW Persistent Detector] Dispatched live score alert: ${alertKey} to user: ${s.userId || "anonymous"}`);
          } catch (err: any) {
            console.warn(`Could not dispatch standings shift alert to endpoint: ${err.message}`);
          }
        }
      }

      // ----------------------------------------------------
      // Condition C: Lock-In Warn Reminders
      // ----------------------------------------------------
      const kickoffMs = new Date(m.kickoff_time).getTime();
      const nowMs = Date.now();
      const timeToStartMs = kickoffMs - nowMs;

      // If match starts in <= 2 hours (7200000ms), is starting in the future
      if (timeToStartMs > 0 && timeToStartMs < 7200000) {
        const predictedUserIds = new Set(predictionsByMatchId[matchId] || []);

        for (const s of subs) {
          if (!s.userId) continue;

          // Skip if user muted push alerts inside app configurations
          if (s.subscription?.muted === true || s.subscription?.enabled === false) {
            continue;
          }

          // If the user hasn't predicted, is subbed, and we haven't warned them yet
          const missingPrediction = !predictedUserIds.has(s.userId);
          const alertKey = `lockin_${matchId}`;
          const alreadyReminded = s.subscription?.sent_alerts?.[alertKey] === true;

          if (missingPrediction && !alreadyReminded) {
            const minutesLeft = Math.ceil(timeToStartMs / (60 * 1000));
            const userProfile = profilesMap.get(s.userId);
            let isAr = false;
            if (s.subscription && s.subscription.lang) {
              isAr = s.subscription.lang === "ar";
            } else if (userProfile?.username) {
              isAr = /[\u0600-\u06FF]/.test(userProfile.username);
            }

            let title = "🚨 World Cup Pool: LOCK-IN SCORES!";
            let body = `Match alert: ${m.home_team} vs ${m.away_team} kicks off in ${minutesLeft} minutes, and you haven't locked in your scores yet! Predict now!`;

            if (isAr) {
              title = "🚨 دوري كأس العالم: سجّل توقعك!";
              body = `تنبيه: مباراة ${m.home_team} ضد ${m.away_team} تبدأ بعد ${minutesLeft} دقيقة، ولم تقم بحفظ توقعك للنتيجة إلى الآن! سجل توقعاتك الآن ⚽`;
            }

            try {
              await webpush.sendNotification(
                cleanPushSubscription(s.subscription),
                JSON.stringify({
                  title,
                  body,
                  icon: "https://i.imgur.com/2b1mFMB.png",
                  badge: "https://i.imgur.com/2b1mFMB.png",
                  tag: alertKey
                })
              );
              await recordSentAlert(s.subscription.endpoint, alertKey);
              console.log(`[SW Persistent Detector] Dispatched lock-in push alert: ${alertKey} to user: ${s.userId}`);
            } catch (err: any) {
              console.warn(`Could not dispatch lock-in push warning to endpoint: ${err.message}`);
            }
          }
        }
      }
    }
  } catch (err: any) {
    console.error("[SW Poller Exception]", err);
  }
}

// Kickstart background schedules
let intervalTimer: NodeJS.Timeout | null = null;
async function initBackendPolling() {
  console.log("[SW Background Detector] Running stateless subscription-backed monitoring daemon...");
  
  try {
    const { data: matches } = await supabase
      .from("matches")
      .select("match_id, home_score_final, away_score_final, group_stage");
      
    if (matches) {
      for (const m of matches) {
        const isLiveNow = !!(m.group_stage && /\[LIVE\]/i.test(m.group_stage));
        const isFinalized = m.home_score_final !== null && m.away_score_final !== null && !isLiveNow;
        if (isFinalized) {
          matchesAlreadyFinalizedOnBoot.add(m.match_id);
        } else if (isLiveNow && m.home_score_final !== null && m.away_score_final !== null) {
          lastLiveScoresOnBoot.set(m.match_id, `${m.home_score_final}_${m.away_score_final}`);
        }
      }
      console.log(`[SW Boot] Pre-populated in-memory filters: ${matchesAlreadyFinalizedOnBoot.size} finalized and ${lastLiveScoresOnBoot.size} live matches. Skipping retroactive push alerts on reboot.`);
    }
  } catch (err: any) {
    console.warn("[SW Boot] Failed to pre-populate boot filters:", err.message);
  }
  
  // Poll database every 10 seconds (highly responsive for administrator score updates)
  intervalTimer = setInterval(() => {
    pollMatchChanges();
  }, 10000);
}

initBackendPolling();

// Vite integration & routing
async function initServer() {
  // Production vs. Dev handling
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Full-Stack Server] Server running successfully on http://localhost:${PORT}`);
  });
}

initServer().catch(err => {
  console.error("Critical server bootstrap failure:", err);
});
