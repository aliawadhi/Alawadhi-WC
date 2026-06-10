"use client";

import { supabase } from './supabase';

export interface AppNotification {
    id: string;
    title: string;
    body: string;
    type: 'lockin' | 'whistle' | 'standings';
    timestamp: string;
    isRead: boolean;
    icon?: string;
}

/**
 * Resolves API path dynamically to correctly contact the live Cloud Run backend
 * when running on Netlify or your custom domain.
 */
export function resolveApiUrl(path: string): string {
    if (typeof window === 'undefined') return path;
    const hostname = window.location.hostname;
    if (hostname.includes('netlify.app') || hostname === 'alawadhi-wc.com' || hostname === 'www.alawadhi-wc.com') {
        const backendOrigin = 'https://ais-pre-vrifgzngdfastu6r7gpteu-612847772721.europe-west2.run.app';
        return `${backendOrigin}${path}`;
    }
    return path;
}

/**
 * Automatically requests permissions and enables notifications in local state
 */
export function initNotifications(): boolean {
    if (typeof window === 'undefined') return false;

    // Default to auto-enabled
    if (localStorage.getItem('wc2026_push_notifications_enabled') === null) {
        localStorage.setItem('wc2026_push_notifications_enabled', 'true');
    }

    // Register active Service Worker so mobile push works flawlessly on Android/Chrome
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then((registration) => {
                console.log('Mobile Push Service Worker registered successfully with scope:', registration.scope);
            })
            .catch((err) => {
                console.warn('Mobile Push Service Worker registration failed:', err);
            });
    }

    if ('Notification' in window) {
        if (Notification.permission === 'default') {
            // Gracefully try to ask for permission. We do not throw or halt if iframe-blocked
            try {
                Notification.requestPermission().then((perm) => {
                    console.log(`World Cup 2026 push notifications permission: ${perm}`);
                }).catch(e => {
                    console.log("Notification request blocked (likely within sandbox iframe). Falling back to premium in-app toasts.");
                });
            } catch (err) {
                console.log("Dynamic request permission failed:", err);
            }
        }
        return Notification.permission === 'granted';
    }
    return false;
}

export function areNotificationsEnabled(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('wc2026_push_notifications_enabled') !== 'false';
}

export function setNotificationsEnabled(enabled: boolean) {
    if (typeof window === 'undefined') return;
    localStorage.setItem('wc2026_push_notifications_enabled', enabled ? 'true' : 'false');
    if (enabled) {
        initNotifications();
    }
}

/**
 * Masterfully synthesized sound effects utilizing Web Audio API.
 * High fidelity stadium sound design, no external static assets or network IO needed.
 */
export function playChime(type: 'lockin' | 'whistle' | 'standings') {
    if (typeof window === 'undefined') return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    try {
        const ctx = new AudioContextClass();
        const dest = ctx.destination;

        if (type === 'lockin') {
            // Gentle high-pitched double warning tone (Reminder)
            const playNote = (time: number, freq: number) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, time);
                gain.gain.setValueAtTime(0.08, time);
                gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
                osc.connect(gain);
                gain.connect(dest);
                osc.start(time);
                osc.stop(time + 0.25);
            };
            playNote(ctx.currentTime, 554.37); // C#5
            playNote(ctx.currentTime + 0.12, 830.61); // G#5
        } else if (type === 'whistle') {
            // Triple whistle - Referee style with genuine frequency modulation flutter
            const playWhistlePulse = (time: number) => {
                const osc = ctx.createOscillator();
                const fm = ctx.createOscillator();
                const fmGain = ctx.createGain();
                const gain = ctx.createGain();
                
                osc.type = 'sine';
                osc.frequency.value = 2750; // true referee piercing whistle
                
                fm.type = 'sine';
                fm.frequency.value = 55; // 55Hz vibrato flutter
                fmGain.gain.setValueAtTime(140, time);
                
                gain.gain.setValueAtTime(0.05, time);
                gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

                fm.connect(fmGain);
                fmGain.connect(osc.frequency);
                osc.connect(gain);
                gain.connect(dest);

                fm.start(time);
                osc.start(time);
                fm.stop(time + 0.18);
                osc.stop(time + 0.18);
            };
            playWhistlePulse(ctx.currentTime);
            playWhistlePulse(ctx.currentTime + 0.22);
            playWhistlePulse(ctx.currentTime + 0.44);
        } else if (type === 'standings') {
            // celebratory chord arpeggio for positive ranking change
            const notes = [293.66, 369.99, 440.00, 587.33]; // D4, F#4, A4, D5 (D Major celebratory chord)
            notes.forEach((freq, i) => {
                const time = ctx.currentTime + i * 0.10;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, time);
                gain.gain.setValueAtTime(0.06, time);
                gain.gain.exponentialRampToValueAtTime(0.001, time + 0.5);
                osc.connect(gain);
                gain.connect(dest);
                osc.start(time);
                osc.stop(time + 0.5);
            });
        }
    } catch (e) {
        console.warn('AudioContext chimes disabled or prevented:', e);
    }
}

/**
 * Triggers a dual-channel notification: Native OS push (if permissions granted) + elegant In-App floating toasts
 */
export function triggerNotification(title: string, body: string, type: 'lockin' | 'whistle' | 'standings') {
    if (typeof window === 'undefined') return;

    if (!areNotificationsEnabled()) return;

    const notification: AppNotification = {
        id: crypto.randomUUID(),
        title,
        body,
        type,
        timestamp: new Date().toISOString(),
        isRead: false,
    };

    // 1. Add to historic records
    const history = getNotificationHistory();
    history.unshift(notification);
    // limit history to 50 items
    localStorage.setItem('wc2026_notifications_history', JSON.stringify(history.slice(0, 50)));

    // 2. Play designated synth sound
    playChime(type);

    // 3. Dispatch native browser notification if enabled & allowed
    if ('Notification' in window && Notification.permission === 'granted') {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then((registration) => {
                try {
                    registration.showNotification(title, {
                        body: body,
                        icon: 'https://i.imgur.com/2b1mFMB.png', // high def trophy launcher
                        badge: 'https://i.imgur.com/2b1mFMB.png',
                        vibrate: [150, 80, 150],
                        tag: `wc2026_${type}_${Date.now()}`
                    } as any);
                } catch (err) {
                    console.warn("ServiceWorker push notification failed, falling back:", err);
                    fallbackTraditionalNotification(title, body);
                }
            }).catch(() => {
                fallbackTraditionalNotification(title, body);
            });
        } else {
            fallbackTraditionalNotification(title, body);
        }
    }

    // 4. Dispatch custom React state sync event
    window.dispatchEvent(new CustomEvent('wc2026_notification_event', { detail: notification }));
}

function fallbackTraditionalNotification(title: string, body: string) {
    try {
        new Notification(title, {
            body,
            icon: 'https://i.imgur.com/2b1mFMB.png', // high def trophy launcher
        });
    } catch (e) {
        console.log("Traditional Notification fallback also failed:", e);
    }
}

export function getNotificationHistory(): AppNotification[] {
    if (typeof window === 'undefined') return [];
    try {
        const stored = localStorage.getItem('wc2026_notifications_history');
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        return [];
    }
}

export function markAsRead(id: string) {
    if (typeof window === 'undefined') return;
    const history = getNotificationHistory();
    const updated = history.map(n => n.id === id ? { ...n, isRead: true } : n);
    localStorage.setItem('wc2026_notifications_history', JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('wc2026_notification_history_changed'));
}

export function markAllAsRead() {
    if (typeof window === 'undefined') return;
    const history = getNotificationHistory();
    const updated = history.map(n => ({ ...n, isRead: true }));
    localStorage.setItem('wc2026_notifications_history', JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('wc2026_notification_history_changed'));
}

export function clearNotificationsHistory() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('wc2026_notifications_history');
    window.dispatchEvent(new CustomEvent('wc2026_notification_history_changed'));
}

export interface PushSubscriptionResult {
    success: boolean;
    error?: string;
    permission?: string;
}

/**
 * Resets local service workers, clears old push tokens, and helps self-heal corrupted browser registries.
 */
export async function resetPushNotificationSync(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    try {
        console.log('[Self-Heal] Starting total reset of push notification subscriptions...');
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const r of registrations) {
                try {
                    const sub = await r.pushManager.getSubscription();
                    if (sub) {
                        await sub.unsubscribe();
                        console.log('[Self-Heal] Unsubscribed push client endpoint successfully.');
                    }
                } catch (subErr) {
                    console.warn('[Self-Heal] Sub unsubscribe bypass:', subErr);
                }
                await r.unregister();
                console.log('[Self-Heal] Unregistered Service Worker scope:', r.scope);
            }
        }
        localStorage.removeItem('wc2026_push_notifications_enabled');
        localStorage.removeItem('wc2026_notifications_history');
        return true;
    } catch (e) {
        console.error('[Self-Heal] Failed resetting notifications:', e);
        return false;
    }
}

/**
 * Subscribes the client's Service Worker to the Web Push API of our Express server.
 * This triggers fully secure, free native notifications in the background even if closed.
 */
export async function subscribeToBackgroundPush(userId: string | null, langOverride?: string): Promise<PushSubscriptionResult> {
    if (typeof window === 'undefined') {
        return { success: false, error: 'Window is undefined (SSR)' };
    }
    if (!('serviceWorker' in navigator)) {
        return { success: false, error: 'Service workers are not supported in this browser.' };
    }
    if (!('PushManager' in window)) {
        return { success: false, error: 'Push notifications (PushManager) are not supported by this browser.' };
    }

    try {
        // Request/verify notification permission first (User Gesture Context)
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.warn('Notification permission not granted:', permission);
            return { success: false, permission, error: `Permission was not granted (User selected: ${permission}). Please click the lock/site settings in your browser address bar and allow notifications manually.` };
        }

        // Register service worker explicitly
        console.log('Registering Service Worker to ensure fresh setup...');
        const registration = await navigator.serviceWorker.register('/sw.js');

        // Gracefully wait until active copy is fully ready utilizing browser-level optimized signals
        console.log('Waiting for Service Worker to build ready signal...');
        const r = await navigator.serviceWorker.ready;

        // Use hardcoded stable VAPID public key to prevent key rotation and bypass CORS key-fetch bugs!
        const publicKey = "BAWx4A_Z4EZmEI9qOSG4kn4mjYrOmUqbt32IMFa5kr4eYKcLvZrSP5J-s3jg8Vsb86EaRAUbkMr2HbrscUHSoaQ";

        // Convert base64 public key to Uint8Array safely
        const padding = '='.repeat((4 - (publicKey.length % 4)) % 4);
        const base64 = (publicKey + padding).replace(/\-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }

        // Check if there is an active subscription we can reuse
        let subscription = null;
        try {
            subscription = await r.pushManager.getSubscription();
        } catch (getErr) {
            console.warn('Could not check existing subscription:', getErr);
        }

        if (!subscription) {
            console.log('No existing subscription found, creating new Web Push subscription...');
            // Subscribe to push manager newly
            subscription = await r.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: outputArray
            });
            console.log('Successfully subscribed browser to Web Push:', subscription);
        } else {
            console.log('Reusing existing active Web Push subscription:', subscription);
        }

        // 3. Register subscription details.
        // We attempt to save directly to Supabase's global 'push_subscriptions' table to bypass any Netlify to Cloud Run API/CORS bottlenecks.
        const currentLang = langOverride || (typeof window !== 'undefined' ? (localStorage.getItem('wc_push_lang') || localStorage.getItem('wc_lang') || 'en') : 'en');
        const subscriptionJSON = JSON.parse(JSON.stringify(subscription));
        subscriptionJSON.lang = currentLang;

        let savedToSupabase = false;
        try {
            const endpoint = subscriptionJSON.endpoint;
            if (endpoint) {
                // Fetch the existing record to merge instead of deleting and losing 'sent_alerts'
                const { data: existingRows } = await supabase.from('push_subscriptions')
                    .select('*')
                    .eq('subscription->>endpoint', endpoint);

                if (existingRows && existingRows.length > 0) {
                    const row = existingRows[0];
                    const mergedSub = typeof row.subscription === 'string' ? JSON.parse(row.subscription) : row.subscription;
                    
                    mergedSub.lang = currentLang;
                    if (subscriptionJSON.keys) {
                        mergedSub.keys = subscriptionJSON.keys;
                    }

                    const { error: dbErr } = await supabase.from('push_subscriptions')
                        .update({
                            user_id: userId || null,
                            subscription: mergedSub
                        })
                        .eq('subscription->>endpoint', endpoint);

                    if (!dbErr) {
                        savedToSupabase = true;
                        console.log('Successfully merged and updated subscription in Supabase without losing tracking history!');
                    } else {
                        console.warn('Failed to update merged subscription in Supabase:', dbErr);
                    }
                } else {
                    // Subscription does not exist yet, safe to insert a fresh one
                    const { error: dbErr } = await supabase.from('push_subscriptions').insert({
                        user_id: userId || null,
                        subscription: subscriptionJSON
                    });
                    if (!dbErr) {
                        console.log('Saved new subscription to Supabase successfully!');
                        savedToSupabase = true;
                    } else {
                        console.warn('Supabase DB subscription insert returned error:', dbErr);
                    }
                }
            }
        } catch (dbEx) {
            console.warn('Direct Supabase database action failed (likely table creation pending):', dbEx);
        }

        // Fallback to Express backend if not saved to Supabase (e.g. if table not yet created)
        if (!savedToSupabase) {
            console.log('Falling back to Express endpoint registration...');
            const response = await fetch(resolveApiUrl(`/api/push/subscribe?t=${Date.now()}`), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    subscription: subscriptionJSON,
                    userId
                })
            });

            if (response.ok) {
                console.log('Registered Web Push subscription on backend successfully!');
                return { success: true, permission };
            } else {
                const errorText = await response.text();
                console.warn('Backend subscription registration failed:', errorText);
                return { success: false, permission, error: `Backend failed to save subscription: ${errorText}` };
            }
        }

        return { success: true, permission };
    } catch (err: any) {
        console.error('Error during background push subscription:', err);
        return { success: false, error: err?.message || String(err) };
    }
}
