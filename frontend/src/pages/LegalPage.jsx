/** Shared shell for the two legal pages linked from the footer. Real
 * content (not a "#" placeholder that goes nowhere) but plainly framed as
 * a working-draft policy for this project rather than something
 * lawyer-reviewed -- that's an honest state for a dev-stage app to be in,
 * rather than faking a polished policy that implies more than is true. */
function LegalPage({ title, updated, children }) {
  return (
    <div className="container" style={{ maxWidth: 720, paddingTop: "var(--space-16)", paddingBottom: "var(--space-20)" }}>
      <p className="eyebrow">Legal</p>
      <h1 style={{ fontSize: "var(--text-heading)" }}>{title}</h1>
      <p className="field-hint" style={{ marginBottom: "var(--space-8)" }}>Last updated {updated}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>{children}</div>
    </div>
  );
}

export function PrivacyPolicyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="August 2026">
      <p>
        SkillSwap is a peer-to-peer skill-mentorship platform. This is a working-draft policy for the project in
        its current form, not a final, lawyer-reviewed document -- treat it as a plain statement of what we
        actually do with your data today.
      </p>
      <section>
        <h3>What we collect</h3>
        <p>
          Account details you provide (name, email, age, timezone, profile photo), the skills you tag as teaching
          or wanting to learn, your availability, messages and session history within the platform, and basic
          technical data (login timestamps, IP address, device/browser) for security and abuse prevention.
        </p>
      </section>
      <section>
        <h3>How we use it</h3>
        <p>
          To match you with other members, run booking and messaging, secure your account (including 2FA and
          login auditing), and send account-related email (verification codes, session reminders). We don't sell
          your data or use it for third-party advertising.
        </p>
      </section>
      <section>
        <h3>Video sessions</h3>
        <p>
          Video and audio calls connect directly between you and the other person whenever possible -- we don't
          record or store your calls ourselves.
        </p>
      </section>
      <section>
        <h3>Your controls</h3>
        <p>
          You can edit or remove your profile details and skills at any time from your account settings, and
          disable your account by contacting us at{" "}
          <a href="mailto:hello@skillswap.local">hello@skillswap.local</a>.
        </p>
      </section>
    </LegalPage>
  );
}

export function TermsPage() {
  return (
    <LegalPage title="Terms and Conditions" updated="August 2026">
      <p>
        By creating a SkillSwap account, you agree to use the platform to exchange skills and mentorship in good
        faith. This is a working-draft policy for the project in its current form, not a final, lawyer-reviewed
        document.
      </p>
      <section>
        <h3>Eligibility</h3>
        <p>SkillSwap is for adults -- you must be 18 or older to create an account.</p>
      </section>
      <section>
        <h3>Credits</h3>
        <p>
          Sessions are exchanged using SkillSwap credits, not real currency. Credits have no cash value and
          can't be withdrawn or transferred for money. Refunds are only handled through SkillSwap's own
          cancellation and dispute process.
        </p>
      </section>
      <section>
        <h3>Conduct</h3>
        <p>
          Be respectful in sessions and messages. Harassment, hate speech, and using the platform for anything
          illegal or unsafe are grounds for account suspension.
        </p>
      </section>
      <section>
        <h3>Availability</h3>
        <p>
          SkillSwap is under active development. Features may change, and we'll do our best to give notice before
          anything that affects your data or credits.
        </p>
      </section>
      <section>
        <h3>Contact</h3>
        <p>Questions about these terms: <a href="mailto:hello@skillswap.local">hello@skillswap.local</a>.</p>
      </section>
    </LegalPage>
  );
}
