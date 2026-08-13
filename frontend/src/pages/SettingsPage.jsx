import { useAuth } from "../context/AuthContext";
import TwoFactorCard from "../components/TwoFactorCard";
import ChangePasswordCard from "../components/ChangePasswordCard";
import ProfileIdentityCard from "../components/ProfileIdentityCard";

/** Account security & preferences -- distinct from /profile, which is
 * public-facing identity (name, photo, skills, availability). Settings
 * is "things about how you sign in and how the account behaves." */
export default function SettingsPage() {
  const { user, refreshUser } = useAuth();

  return (
    <div className="container" style={{ paddingTop: "var(--space-10)", paddingBottom: "var(--space-20)" }}>
      <p className="eyebrow">Account</p>
      <h1>Settings</h1>

      <div style={{ display: "grid", gap: "var(--space-6)", gridTemplateColumns: "minmax(0,1fr)", maxWidth: 720 }}>
        <ProfileIdentityCard user={user} onChanged={refreshUser} />
        <ChangePasswordCard />
        <TwoFactorCard user={user} onChanged={refreshUser} />
      </div>
    </div>
  );
}
