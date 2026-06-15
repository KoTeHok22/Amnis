import React, { useState, lazy, Suspense, useEffect } from 'react';
import { LandingView } from './components/LandingView';
import { AuthModal } from './components/AuthModal';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProfileModal } from './components/ProfileModal';
import { PaymentProvider } from './context/PaymentContext';

const ChatWindow = lazy(() => import('./components/ChatWindow').then(module => ({ default: module.ChatWindow })));

type View = 'landing' | 'chat' | 'profile';

function AppContent() {
  const { isAuthenticated, fetchUserProfile } = useAuth();
  const [currentView, setCurrentView] = useState<View>('landing');
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    // Handle NicePay payment return
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment');

    if (paymentStatus === 'success' && isAuthenticated) {
      // Refresh user profile to get updated analyses count
      fetchUserProfile();
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (paymentStatus === 'fail') {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    // Update the view based on authentication status
    if (isAuthenticated) {
      setCurrentView('chat');
    } else {
      setCurrentView('landing');
    }
  }, [isAuthenticated]);

  const handleAuth = () => {
    // This function will be called after successful authentication
    setCurrentView('chat');
    setShowAuth(false);
  };

  // Handle purchase from profile modal
  const handlePurchase = (planId: string) => {
    console.log(`Successfully purchased plan: ${planId}`);
    // Here you would typically handle post-purchase logic
    // This could include showing success messages, analytics, etc.

    // Alert user of successful purchase
    alert(`Спасибо за покупку тарифа ${planId}!`);
  };

  // Switch to profile view
  const goToProfile = () => {
    setCurrentView('profile');
  };

  // Switch back to chat view
  const goToChat = () => {
    setCurrentView('chat');
  };

  return (
    <>
      {currentView === 'landing' && (
        <LandingView onStartClick={() => setShowAuth(true)} />
      )}
      {currentView === 'chat' && (
        <Suspense fallback={<div className="h-screen bg-[#0D0B24] flex items-center justify-center">Загрузка...</div>}>
          <ChatWindow onProfileOpen={goToProfile} onPurchase={handlePurchase} />
        </Suspense>
      )}
      {currentView === 'profile' && (
        <ProfileModal
          isOpen={true}
          onClose={goToChat}
          onPurchase={handlePurchase}
        />
      )}
      <AuthModal
        isOpen={showAuth}
        onClose={() => setShowAuth(false)}
        onAuth={handleAuth}
      />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <PaymentProvider>
        <AppContent />
      </PaymentProvider>
    </AuthProvider>
  );
}