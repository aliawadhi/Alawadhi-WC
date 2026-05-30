"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabase';
import { useLanguage } from '@/utils/LanguageContext';

interface AuthScreenProps {
    onAuthSuccess?: (user: any) => void;
}

export default function AuthScreen({ onAuthSuccess }: AuthScreenProps) {
    const router = useRouter();
    const { language, setLanguage, t, isAr } = useLanguage();
    const [isSignUp, setIsSignUp] = useState<boolean>(false);
    const [username, setUsername] = useState<string>('');
    const [password, setPassword] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(false);
    const [errorMsg, setErrorMsg] = useState<string>('');
    const [successMsg, setSuccessMsg] = useState<string>('');

    const [darkMode, setDarkMode] = useState<boolean>(() => {
        if (typeof window !== 'undefined') {
            return window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
        return true;
    });

    const DOMAIN_SUFFIX = '@family.app';

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = (e: MediaQueryListEvent) => setDarkMode(e.matches);
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    useEffect(() => {
        async function checkSession() {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user) {
                    if (onAuthSuccess) onAuthSuccess(session.user);
                    window.location.hash = '/dashboard';
                }
            } catch (e) {
                console.error("Session check failed", e);
            }
        }
        checkSession();
    }, [onAuthSuccess]);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        if (loading) return;

        setLoading(true);
        setErrorMsg('');
        setSuccessMsg('');

        const cleanUsername = username.trim().toLowerCase();

        if (!cleanUsername || !password) {
            setErrorMsg(t('fillAllFields'));
            setLoading(false);
            return;
        }

        const maskedEmail = `${cleanUsername}${DOMAIN_SUFFIX}`;

        try {
            if (isSignUp) {
                const { data, error } = await supabase.auth.signUp({
                    email: maskedEmail,
                    password: password,
                    options: { data: { display_name: cleanUsername } }
                });
                if (error) throw error;

                // Manually upsert profile to guarantee database profile username matches exactly
                if (data?.user) {
                    try {
                        await supabase.from('profiles').upsert({
                            id: data.user.id,
                            username: cleanUsername
                        });
                    } catch (pErr) {
                        console.error("Manual profile creation failed, falling back to auto-heal on login:", pErr);
                    }
                }

                setSuccessMsg(t('redirecting'));
                setTimeout(() => {
                    if (data?.user) {
                        if (onAuthSuccess) onAuthSuccess(data.user);
                        router.push('/dashboard');
                    }
                }, 1500);
            } else {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email: maskedEmail,
                    password: password,
                });
                if (error) throw error;
                if (data?.user) {
                    if (onAuthSuccess) onAuthSuccess(data.user);
                    router.push('/dashboard');
                }
            }
        } catch (err: any) {
            if (err.message.includes('already registered')) {
                setErrorMsg(t('takenUsername'));
            } else if (err.message.includes('Invalid login credentials')) {
                setErrorMsg(t('incorrectCreds'));
            } else {
                setErrorMsg(err.message);
            }
        } finally {
            setLoading(false);
        }
    };

    const theme = {
        bg: darkMode ? '#09090b' : '#f4f4f5',
        cardBg: darkMode ? '#18181b' : '#ffffff',
        text: darkMode ? '#ffffff' : '#09090b',
        textMuted: darkMode ? '#a1a1aa' : '#71717a',
        inputBg: darkMode ? '#27272a' : '#f4f4f5',
        inputBorder: darkMode ? '#3f3f46' : '#e4e4e7',
        purple: '#7c3aed',
        successBg: '#dcfce7',
        successText: '#166534',
    };

    return (
        <div style={{ ...styles.container, backgroundColor: theme.bg }} className={isAr ? 'rtl-active' : ''}>
        <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', left: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', direction: 'ltr' }}>
            <button
            onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
            style={{ padding: '0.5rem 1rem', borderRadius: '20px', border: '1px solid', fontSize: '0.813rem', fontWeight: '600', cursor: 'pointer', color: theme.text, backgroundColor: theme.cardBg, borderColor: theme.inputBorder }}
            >
            {language === 'en' ? '🇸🇦 العربية (Arabic)' : '🇬🇧 English'}
            </button>
            
            <button
            onClick={() => setDarkMode(!darkMode)}
            style={{ padding: '0.5rem 1rem', borderRadius: '20px', border: '1px solid', fontSize: '0.813rem', fontWeight: '600', cursor: 'pointer', color: theme.text, backgroundColor: theme.cardBg, borderColor: theme.inputBorder }}
            >
            {darkMode ? t('lightMode') : t('darkMode')}
            </button>
        </div>

        <div className="login-card" style={{ ...styles.card, backgroundColor: theme.cardBg }}>
        <div style={styles.header}>
        <img 
            src="https://i.imgur.com/2b1mFMB.png" 
            alt="FIFA 2026 World Cup Trophy" 
            style={{ width: '120px', height: '120px', objectFit: 'contain', marginBottom: '1rem' }}
            referrerPolicy="no-referrer"
        />
        <h1 style={{ ...styles.title, color: theme.text, fontFamily: isAr ? 'Cairo, system-ui' : undefined }}>{t('familyPool')}</h1>
        <p style={{ ...styles.subtitle, color: theme.textMuted }}>
        {isSignUp ? t('createIdentity') : t('lockGuesses')}
        </p>
        </div>

        {errorMsg && <div style={styles.errorBox}>{errorMsg}</div>}

        {successMsg && (
            <div style={{ backgroundColor: theme.successBg, color: theme.successText, padding: '0.875rem', borderRadius: '8px', fontSize: '0.875rem', marginBottom: '1.5rem', textAlign: 'center', fontWeight: '600' }}>
            {successMsg}
            </div>
        )}

        <form onSubmit={handleAuth} style={styles.form}>
        <div style={styles.inputGroup}>
        <label style={{ ...styles.label, color: theme.text, textAlign: isAr ? 'right' : 'left' }}>{t('username')}</label>
        <input
        type="text"
        placeholder={t('usernamePlaceholder')}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        disabled={loading}
        style={{ ...styles.input, backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text, textAlign: isAr ? 'right' : 'left' }}
        required
        />
        </div>

        <div style={styles.inputGroup}>
        <label style={{ ...styles.label, color: theme.text, textAlign: isAr ? 'right' : 'left' }}>{t('password')}</label>
        <input
        type="password"
        placeholder="••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={loading}
        style={{ ...styles.input, backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text, textAlign: isAr ? 'right' : 'left' }}
        required
        />
        </div>

        <button
        type="submit"
        disabled={loading}
        style={{ ...styles.submitBtn, backgroundColor: theme.purple }}
        >
        {loading ? t('processing') : isSignUp ? t('createProfile') : t('enterStadium')}
        </button>
        </form>

        <div style={styles.toggleFooter}>
        <button
        type="button"
        onClick={() => { setIsSignUp(!isSignUp); setErrorMsg(''); }}
        style={{ ...styles.toggleBtn, color: theme.purple }}
        >
        {isSignUp ? t('existingPlayer') : t('newPlayer')}
        </button>
        </div>
        </div>
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    container: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '1rem', transition: 'background-color 0.3s ease', position: 'relative' },
    themeToggle: { position: 'absolute', top: '1.5rem', right: '1.5rem', padding: '0.5rem 1rem', borderRadius: '20px', border: '1px solid', fontSize: '0.813rem', fontWeight: '600', cursor: 'pointer' },
    card: { borderRadius: '16px', width: '100%', maxWidth: '420px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' },
    header: { textAlign: 'center', marginBottom: '2.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center' },
    badge: { color: '#ffffff', fontWeight: '900', fontSize: '1.25rem', padding: '0.25rem 0.75rem', borderRadius: '6px', marginBottom: '0.75rem' },
    title: { fontSize: '2rem', fontWeight: '900', margin: '0', letterSpacing: '-0.05em' },
    subtitle: { fontSize: '0.875rem', marginTop: '0.5rem' },
    errorBox: { backgroundColor: '#fee2e2', color: '#991b1b', padding: '0.875rem', borderRadius: '8px', fontSize: '0.875rem', marginBottom: '1.5rem', textAlign: 'center', fontWeight: '600' },
    form: { display: 'flex', flexDirection: 'column', gap: '1.5rem' },
        inputGroup: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
        label: { fontSize: '0.875rem', fontWeight: '700' },
        input: { padding: '0.875rem', borderRadius: '8px', border: '1px solid', fontSize: '1rem' },
        submitBtn: { color: '#ffffff', padding: '1rem', borderRadius: '8px', fontSize: '1rem', fontWeight: '800', border: 'none', cursor: 'pointer' },
        toggleFooter: { marginTop: '2rem', textAlign: 'center' },
        toggleBtn: { background: 'none', border: 'none', fontSize: '0.875rem', cursor: 'pointer', fontWeight: '700' }
};
