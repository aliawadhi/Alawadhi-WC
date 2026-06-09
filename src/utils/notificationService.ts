"use client";

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

/**
 * Subscribes the client's Service Worker to the Web Push API of our Express server.
 * This triggers fully secure, free native notifications in the background even if closed.
 */
export async function subscribeToBackgroundPush(userId: string | null): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('Web Push is not fully supported on this platform/browser.');
        return false;
    }

    try {
        const registration = await navigator.serviceWorker.ready;
        
        // 1. Fetch public VAPID key from backend
        const keyRes = await fetch('/api/push/public-key');
        if (!keyRes.ok) {
            throw new Error(`Failed to load VAPID key: ${keyRes.status}`);
        }
        const { publicKey } = await keyRes.json();
        if (!publicKey) {
             throw new Error('VAPID public key was empty');
        }

        // Convert base64 public key to Uint8Array
        const padding = '='.repeat((4 - (publicKey.length % 4)) % 4);
        const base64 = (publicKey + padding).replace(/\-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }

        // 2. Subscribe to push manager
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: outputArray
        });

        console.log('Successfully subscribed browser to Web Push:', subscription);

        // 3. Register on our Express backend.
        const response = await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                subscription,
                userId
            })
        });

        if (response.ok) {
            console.log('Registered Web Push subscription on backend successfully!');
            return true;
        } else {
            console.warn('Backend subscription registration failed:', await response.text());
            return false;
        }
    } catch (err) {
        console.error('Error during background push subscription:', err);
        return false;
    }
}
