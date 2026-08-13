import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { SidebarProvider, useSidebar } from "./context/SidebarContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Navbar from "./components/Navbar";
import SidebarDrawer from "./components/SidebarDrawer";

// The login page is a deliberate exception to the global nav -- it wants
// a minimal, focused frame (just a way back home), not the full pill nav
// with links to pages you can't use yet since you're not signed in.
const ROUTES_WITHOUT_NAVBAR = ["/login"];

function ConditionalNavbar() {
  const { pathname } = useLocation();
  if (ROUTES_WITHOUT_NAVBAR.includes(pathname)) return null;
  return <Navbar />;
}

// Everything but the drawer itself lives in here, so opening the drawer
// can shift this whole wrapper over (margin-left, see .app-shell.shifted
// in global.css) instead of the drawer floating on top of it.
function AppShell({ children }) {
  const { open } = useSidebar();
  return <div className={`app-shell${open ? " shifted" : ""}`}>{children}</div>;
}

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
import ConversationsPage from "./pages/ConversationsPage";
import ChatPage from "./pages/ChatPage";
import SessionRoomPage from "./pages/SessionRoomPage";
import PublicProfilePage from "./pages/PublicProfilePage";
import { PrivacyPolicyPage, TermsPage } from "./pages/LegalPage";

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <SidebarProvider>
            <SidebarDrawer />
            <AppShell>
              <ConditionalNavbar />
              <Routes>
                <Route path="/" element={<HomePage />} />
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
                      <ConversationsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/messages/:conversationId"
                  element={
                    <ProtectedRoute>
                      <ChatPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/session/:sessionId"
                  element={
                    <ProtectedRoute>
                      <SessionRoomPage />
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </AppShell>
          </SidebarProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
