import { createClient } from '@supabase/supabase-js';

// Hardcoding the verified keys directly to bypass environment caching bugs
const supabaseUrl = 'https://cumbseixzwzuqhpsezqh.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1bWJzZWl4end6dXFocHNlenFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4MzQ2ODQsImV4cCI6MjA5NDQxMDY4NH0.GwuAcgyt2wuWQdxonyRULnz-kuLO0yOopKqGH2g2OrU';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
    }
});

// Intercept getSession to automatically catch and self-heal from expired/invalid refresh token errors
const originalGetSession = supabase.auth.getSession.bind(supabase.auth);

supabase.auth.getSession = async () => {
    try {
        const res = await originalGetSession();
        if (res.error) {
            const errStr = String(res.error.message || '').toLowerCase();
            if (
                errStr.includes('refresh token') || 
                errStr.includes('refresh_token') || 
                errStr.includes('not found') || 
                errStr.includes('invalid')
            ) {
                console.warn("Detected invalid refresh token in getSession, clearing local session storage...");
                if (typeof window !== 'undefined') {
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key && (key.startsWith('sb-') || key.includes('supabase'))) {
                            localStorage.removeItem(key);
                        }
                    }
                }
                try {
                    await supabase.auth.signOut();
                } catch (_) {}
                return { data: { session: null }, error: null };
            }
        }
        if (!res.data) {
            return { data: { session: null }, error: res.error || null };
        }
        return res;
    } catch (err: any) {
        console.error("Intercepted getSession exception:", err);
        const errStr = String(err?.message || '').toLowerCase();
        if (
            errStr.includes('refresh token') || 
            errStr.includes('refresh_token') || 
            errStr.includes('not found') || 
            errStr.includes('invalid')
        ) {
            if (typeof window !== 'undefined') {
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && (key.startsWith('sb-') || key.includes('supabase'))) {
                        localStorage.removeItem(key);
                    }
                }
            }
            try {
                await supabase.auth.signOut();
            } catch (_) {}
        }
        return { data: { session: null }, error: err };
    }
};

