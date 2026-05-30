import { useState, useEffect } from 'react';

// Simple hash-based router matching next/navigation behavior
export function useRouter() {
  return {
    push: (url: string) => {
      // Direct hash routing
      window.location.hash = url;
    },
    replace: (url: string) => {
      window.location.hash = url;
    },
    back: () => {
      window.history.back();
    },
    forward: () => {
      window.history.forward();
    }
  };
}

export function usePathname() {
  const [pathname, setPathname] = useState(() => {
    const raw = window.location.hash.replace('#', '') || '/';
    return raw.split('?')[0] || '/';
  });

  useEffect(() => {
    const handleHashChange = () => {
      const raw = window.location.hash.replace('#', '') || '/';
      setPathname(raw.split('?')[0] || '/');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return pathname;
}
