import React from 'react';
import { usePathname } from '@/utils/next-navigation-mock';
import AuthScreen from './page';
import Dashboard from './dashboard/page';
import AdminPanel from './admin/page';

export default function App() {
  const pathname = usePathname();

  const renderActiveScreen = () => {
    switch (pathname) {
      case '/dashboard':
        return <Dashboard />;
      case '/admin':
        return <AdminPanel />;
      case '/':
      case '/login':
      default:
        return <AuthScreen onAuthSuccess={() => {}} />;
    }
  };

 return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
        {renderActiveScreen()}
    </div>
)}