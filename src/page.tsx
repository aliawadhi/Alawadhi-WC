"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabase';
import { useLanguage } from '@/utils/LanguageContext';

interface AuthScreenProps {
    onAuthSuccess?: (user: any) => void;
}

const SQL_SCRIPT = `CREATE OR REPLACE FUNCTION public.change_password(username_text text, new_password_text text)
RETURNS json SECURITY DEFINER AS $$
DECLARE
  target_user_id uuid;
  hashed_pwd text;
BEGIN
  -- Find the user ID by matching username in public.profiles
  SELECT id INTO target_user_id 
  FROM public.profiles 
  WHERE username = LOWER(username_text) 
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Username not found');
  END IF;

  -- Hash the new password using blowfish
  hashed_pwd := crypt(new_password_text, gen_salt('bf', 10));

  -- Update auth.users with the new encrypted password
  UPDATE auth.users 
  SET encrypted_password = hashed_pwd 
  WHERE id = target_user_id;

  RETURN json_build_object('success', true, 'message', 'Password modified successfully');
END;
$$ LANGUAGE plpgsql;`;

export default function AuthScreen({ onAuthSuccess }: AuthScreenProps) {
    const router = useRouter();
    const { language, setLanguage, t, isAr } = useLanguage();
    const [isSignUp, setIsSignUp] = useState<boolean>(false);
    const [isForgotPassword, setIsForgotPassword] = useState<boolean>(false);
    const [showSqlDoc, setShowSqlDoc] = useState<boolean>(false);
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
        setShowSqlDoc(false);

        const cleanUsername = username.trim().toLowerCase();

        if (!cleanUsername || !password) {
            setErrorMsg(t('fillAllFields'));
            setLoading(false);
            return;
        }

        const maskedEmail = `${cleanUsername}${DOMAIN_SUFFIX}`;

        try {
            if (isForgotPassword) {
                // Call RPC to update the password inside Supabase auth.users autonomously
                const { data: rpcData, error: rpcError } = await supabase.rpc('change_password', {
                    username_text: cleanUsername,
                    new_password_text: password
                });

                if (rpcError) {
                    if (rpcError.code === '3f000' || rpcError.code === '42883' || rpcError.message?.toLowerCase().includes('does not exist')) {
                        throw new Error('database_function_missing');
                    }
                    throw rpcError;
                }

                if (rpcData && rpcData.success === false) {
                    throw new Error(rpcData.message || 'Recovery failed');
                }

                // If password reset succeeded, immediately log them in!
                const { data, error: loginErr } = await supabase.auth.signInWithPassword({
                    email: maskedEmail,
                    password: password,
                });
                if (loginErr) throw loginErr;

                setSuccessMsg(t('resetSuccess') || 'Password reset successful! Logging in...');
                setTimeout(() => {
                    if (data?.user) {
                        if (onAuthSuccess) onAuthSuccess(data.user);
                        router.push('/dashboard');
                    }
                }, 1500);

            } else if (isSignUp) {
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
            if (err.message === 'database_function_missing') {
                setShowSqlDoc(true);
                setErrorMsg(
                    isAr 
                    ? 'فشل الاتصال: دالة استعادة كلمة المرور غير مفعّلة في قاعدة البيانات بعد. يرجى مراجعة إرشادات المسؤول أدناه.'
                    : 'Setup Required: The password recovery database function is not yet installed on Supabase. See SQL setup instructions below.'
                );
            } else if (err.message.includes('already registered')) {
                setErrorMsg(t('takenUsername'));
            } else if (err.message.includes('Invalid login credentials')) {
                setErrorMsg(t('incorrectCreds'));
            } else if (err.message.includes('Username not found') || err.message === 'Username not found') {
                setErrorMsg(t('usernameNotFound'));
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

        <div 
            className="login-card" 
            style={{ 
                ...styles.card, 
                backgroundColor: theme.cardBg,
                borderTop: isForgotPassword ? '8px solid #eab308' : isSignUp ? '8px solid #10b981' : '8px solid #7c3aed',
                boxShadow: isForgotPassword ? '0 15px 35px -5px rgba(234, 179, 8, 0.15)' : isSignUp ? '0 15px 35px -5px rgba(16, 185, 129, 0.15)' : '0 15px 35px -5px rgba(124, 58, 237, 0.15)',
                transition: 'all 0.3s ease-in-out',
            }}
        >
        <div style={styles.header}>
        <img 
            src="https://i.imgur.com/2b1mFMB.png" 
            alt="FIFA 2026 World Cup Trophy" 
            style={{ width: '100px', height: '100px', objectFit: 'contain', marginBottom: '0.75rem' }}
            referrerPolicy="no-referrer"
        />

        {/* Distinct Badge Pill indicating state */}
        <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.375rem',
            padding: '0.375rem 0.875rem',
            borderRadius: '9999px',
            fontSize: '0.75rem',
            fontWeight: '800',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            marginBottom: '1rem',
            backgroundColor: isForgotPassword ? 'rgba(234, 179, 8, 0.15)' : isSignUp ? 'rgba(16, 185, 129, 0.15)' : 'rgba(124, 58, 237, 0.15)',
            color: isForgotPassword ? '#eab308' : isSignUp ? '#10b981' : '#a78bfa',
            border: isForgotPassword ? '1px solid rgba(234, 179, 8, 0.3)' : isSignUp ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(124, 58, 237, 0.3)',
            animation: 'pulse 2s infinite',
        }}>
            {isForgotPassword ? (isAr ? '🔑 استرداد' : '🔑 RECOVER') : isSignUp ? t('registerBadge') : t('loginBadge')}
        </div>

        <h1 style={{ ...styles.title, color: theme.text, fontSize: '1.75rem', fontFamily: isAr ? 'Cairo, system-ui' : undefined }}>
            {isForgotPassword ? t('forgotPasswordTitle') : isSignUp ? t('registerTitle') : t('loginTitle')}
        </h1>
        
        <p style={{ ...styles.subtitle, color: theme.textMuted }}>
            🏆 {t('familyPool')} — {isForgotPassword ? (isAr ? 'أدخل اسم المستخدم وكلمة المرور الجديدة' : 'Enter username & new password') : isSignUp ? t('createIdentity') : t('lockGuesses')}
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
        <label style={{ ...styles.label, color: theme.text, textAlign: isAr ? 'right' : 'left' }}>
            {isForgotPassword ? (isAr ? 'كلمة المرور الجديدة' : 'New Password') : t('password')}
        </label>
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
        style={{ 
            ...styles.submitBtn, 
            backgroundColor: isForgotPassword ? '#eab308' : isSignUp ? '#10b981' : theme.purple,
            boxShadow: isForgotPassword ? '0 4px 14px rgba(234, 179, 8, 0.3)' : isSignUp ? '0 4px 14px rgba(16, 185, 129, 0.3)' : '0 4px 14px rgba(124, 58, 237, 0.3)',
            transition: 'all 0.2s ease-in-out',
        }}
        onMouseEnter={(e) => {
            e.currentTarget.style.filter = 'brightness(1.1)';
        }}
        onMouseLeave={(e) => {
            e.currentTarget.style.filter = 'none';
        }}
        >
        {loading 
            ? t('processing') 
            : isForgotPassword 
                ? t('resetPasswordBtn') 
                : isSignUp 
                    ? `✍️ ${t('createProfile')}` 
                    : `⚽ ${t('enterStadium')}`}
        </button>
        </form>

        {!isSignUp && !isForgotPassword && (
            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                <button
                    type="button"
                    onClick={() => {
                        setIsForgotPassword(true);
                        setErrorMsg('');
                        setSuccessMsg('');
                        setShowSqlDoc(false);
                    }}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: theme.textMuted,
                        fontSize: '0.813rem',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        fontWeight: '600'
                    }}
                >
                    {t('forgotPasswordBtn')}
                </button>
            </div>
        )}

        <div style={styles.toggleFooter}>
        {isForgotPassword ? (
            <button
            type="button"
            onClick={() => { 
                setIsForgotPassword(false); 
                setErrorMsg(''); 
                setSuccessMsg('');
                setShowSqlDoc(false);
            }}
            style={{ 
                ...styles.toggleBtn, 
                color: theme.purple,
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                border: '1px dashed rgba(255, 255, 255, 0.08)',
                transition: 'all 0.2s ease-in-out',
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)';
            }}
            >
            {t('backToLogin')}
            </button>
        ) : (
            <button
            type="button"
            onClick={() => { 
                setIsSignUp(!isSignUp); 
                setErrorMsg(''); 
                setSuccessMsg('');
                setShowSqlDoc(false);
            }}
            style={{ 
                ...styles.toggleBtn, 
                color: isSignUp ? theme.purple : '#10b981',
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                border: '1px dashed rgba(255, 255, 255, 0.08)',
                transition: 'all 0.2s ease-in-out',
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)';
            }}
            >
            {isSignUp ? t('existingPlayer') : t('newPlayer')}
            </button>
        )}
        </div>

        {showSqlDoc && (
            <div style={{
                marginTop: '1.5rem',
                padding: '1rem',
                backgroundColor: darkMode ? '#27272a' : '#f4f4f5',
                border: '1px solid ' + theme.inputBorder,
                borderRadius: '8px',
                textAlign: isAr ? 'right' : 'left',
                direction: isAr ? 'rtl' : 'ltr'
            }}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 'bold', color: theme.text, marginBottom: '0.5rem' }}>
                    {isAr ? '🛠️ تعليمات تفعيل الخاصية للمسؤول:' : '🛠️ Admins SQL Setup Guide:'}
                </h3>
                <p style={{ fontSize: '0.75rem', color: theme.textMuted, marginBottom: '0.75rem', lineHeight: '1.4' }}>
                    {isAr 
                        ? 'يرجى نسخ الكود أدناه وتشغيله مرة واحدة في محرّر SQL في لوحة مبيّنات سوبابيس (Supabase SQL Editor) لتفعيل هذه الخاصية باسم "change_password":'
                        : 'To activate password recovery, please execute the following SQL statement in your Supabase SQL Editor once:'}
                </p>
                <div style={{ position: 'relative' }}>
                    <textarea
                        readOnly
                        value={SQL_SCRIPT}
                        style={{
                            width: '100%',
                            height: '140px',
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                            padding: '0.5rem',
                            backgroundColor: darkMode ? '#09090b' : '#ffffff',
                            color: darkMode ? '#10b981' : '#059669',
                            border: '1px solid ' + theme.inputBorder,
                            borderRadius: '4px',
                            resize: 'none',
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => {
                            navigator.clipboard.writeText(SQL_SCRIPT);
                            alert(isAr ? 'تم نسخ رمز SQL بنجاح!' : 'SQL code copied to clipboard!');
                        }}
                        style={{
                            position: 'absolute',
                            right: isAr ? 'auto' : '0.5rem',
                            left: isAr ? '0.5rem' : 'auto',
                            bottom: '0.5rem',
                            padding: '0.25rem 0.5rem',
                            fontSize: '0.688rem',
                            fontWeight: 'bold',
                            color: '#ffffff',
                            backgroundColor: '#7c3aed',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                        }}
                    >
                        {isAr ? 'نسخ رمز SQL' : 'Copy SQL'}
                    </button>
                </div>
            </div>
        )}
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
