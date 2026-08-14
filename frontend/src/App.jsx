import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { SidebarProvider, useSidebar } from "./context/SidebarContext";
import { NotificationsProvider } from "./context/NotificationsContext";
import { CallProvider } from "./context/CallContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Navbar from "./components/Navbar";
import SidebarDrawer from "./components/SidebarDrawer";
import AppSidebar from "./components/AppSidebar";
import MessageToast from "./components/MessageToast";
import PersistentCallOverlay from "./components/PersistentCallOverlay";

// The login page is a deliberate exception to the guest nav -- it wants
// a minimal, focused frame (just a way back home), not the full pill nav
// with links to pages you can't use yet since you're not signed in.
const ROUTES_WITHOUT_NAVBAR = ["/login"];

function ConditionalNavbar() {
  const { pathname } = useLocation();
  if (ROUTES_WITHOUT_NAVBAR.includes(pathname)) return null;
  return <Navbar />;
}

// "/" is the public marketing pitch -- an already-authenticated user must
// never land back on it (same as Instagram never re-shows a logged-in
// user its own sign-up page). Bounces straight to /home instead of
// rendering LandingPage whenever a real user session exists.
function RootRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/home" replace />;
  return <LandingPage />;
}

// Two completely different shells depending on auth state -- an
// authenticated user gets the persistent AppSidebar (always visible, no
// toggle) and never sees the guest pill-nav/hamburger-drawer combo, and
// vice versa. Loading is treated as "guest" briefly (ProtectedRoute
// already gates the actual page content during that window, so there's
// nothing unsafe about it) rather than flashing a third loading shell.
function AppRoot({ children }) {
  const { user, loading } = useAuth();
  const { open } = useSidebar();
  const { pathname } = useLocation();
  // Kept in sync with AppSidebar.jsx's own `collapsed` check -- the
  // sidebar shrinks to icons-only on Messages (two columns of its own
  // already), so the content area's reserved margin needs to shrink
  // with it instead of leaving a gap where the full-width rail used to be.
  const sidebarCollapsed = pathname.startsWith("/messages");

  if (user && !loading) {
    return (
      <>
        <AppSidebar />
        <div className={`app-shell authed${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>{children}</div>
        <MessageToast />
        <PersistentCallOverlay />
      </>
    );
  }

  return (
    <>
      <SidebarDrawer />
      <div className={`app-shell${open ? " shifted" : ""}`}>
        <ConditionalNavbar />
        {children}
      </div>
    </>
  );
}

import LandingPage from "./pages/LandingPage";
import HomePage from "./pages/HomePage";
import SignupPage from "./pages/SignupPage";
import VerifyOtpPage from "./pages/VerifyOtpPage";
import LoginPage from "./pages/LoginPage";
import TwoFactorPage from "./pages/TwoFactorPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import OAuthCallbackPage from "./pages/OAuthCallbackPage";
import ProfilePage from "./pages/ProfilePage";
import SettingsPage from "./pages/SettingsPage";
import OnboardingPage from "./pages/OnboardingPage";
import BrowsePage from "./pages/BrowsePage";
import BookingPage from "./pages/BookingPage";
import RequestsPage from "./pages/RequestsPage";
import SessionsPage from "./pages/SessionsPage";
import MessagesLayout from "./pages/MessagesLayout";
import ChatPage from "./pages/ChatPage";
import SessionRoomPage from "./pages/SessionRoomPage";
import PublicProfilePage from "./pages/PublicProfilePage";
import AdminPage from "./pages/AdminPage";
import { PrivacyPolicyPage, TermsPage } from "./pages/LegalPage";

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter 
        future={{ 
          v7_relativeSplatPath: true, 
          v7_startTransition: true 
        }}
      >
        <AuthProvider>
          <NotificationsProvider>
          <CallProvider>
          <SidebarProvider>
            <AppRoot>
              <Routes>
                <Route path="/" element={<RootRoute />} />
                <Route
                  path="/home"
                  element={
                    <ProtectedRoute>
                      <HomePage />
                    </ProtectedRoute>
                  }
                />
                <Route path="/signup" element={<SignupPage />} />
                <Route path="/verify-otp" element={<VerifyOtpPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/2fa" element={<TwoFactorPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
                <Route path="/u/:identifier" element={<PublicProfilePage />} />
                <Route path="/privacy" element={<PrivacyPolicyPage />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route
                  path="/profile"
                  element={
                    <ProtectedRoute>
                      <ProfilePage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute>
                      <SettingsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/onboarding"
                  element={
                    <ProtectedRoute>
                      <OnboardingPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/browse"
                  element={
                    <ProtectedRoute>
                      <BrowsePage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/book/:userId"
                  element={
                    <ProtectedRoute>
                      <BookingPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/requests"
                  element={
                    <ProtectedRoute>
                      <RequestsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/sessions"
                  element={
                    <ProtectedRoute>
                      <SessionsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/messages"
                  element={
                    <ProtectedRoute>
                      <MessagesLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route path=":conversationId" element={<ChatPage />} />
                </Route>
                <Route
                  path="/session/:sessionId"
                  element={
                    <ProtectedRoute>
                      <SessionRoomPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute adminOnly>
                      <AdminPage />
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </AppRoot>
          </SidebarProvider>
          </CallProvider>
          </NotificationsProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
