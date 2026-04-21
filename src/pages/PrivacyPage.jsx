export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: 720, margin: '48px auto', padding: '0 24px', fontFamily: 'sans-serif', color: '#222', lineHeight: 1.7 }}>
      <h1 style={{ fontSize: '1.75rem', marginBottom: 4 }}>Privacy Policy</h1>
      <p style={{ color: '#666', marginBottom: 32 }}>Last updated: April 21, 2026</p>

      <h2 style={{ fontSize: '1.1rem', marginTop: 32 }}>What this app is</h2>
      <p>
        Q Boarding is a private, internal operator tool used by a dog boarding business to manage
        boarding schedules and send automated WhatsApp notifications to a small number of designated
        staff recipients. It is not a consumer-facing application and is not available to the general public.
      </p>

      <h2 style={{ fontSize: '1.1rem', marginTop: 32 }}>Data we collect</h2>
      <p>
        This app stores boarding schedule data (dog names, dates, service types) synced from the
        business's existing scheduling system. It also stores a small number of staff phone numbers
        for the purpose of sending WhatsApp notifications.
      </p>
      <p>
        No personal data from customers or members of the public is collected, processed, or stored.
      </p>

      <h2 style={{ fontSize: '1.1rem', marginTop: 32 }}>How data is used</h2>
      <p>
        Boarding schedule data is used solely to generate daily roster images and WhatsApp
        notifications for designated business operators. Phone numbers stored in the system are used
        only to deliver those notifications and are never shared with third parties.
      </p>

      <h2 style={{ fontSize: '1.1rem', marginTop: 32 }}>Third-party services</h2>
      <p>
        This app uses the following third-party services to operate:
      </p>
      <ul>
        <li><strong>Meta WhatsApp Business API</strong> — to deliver WhatsApp notifications to designated recipients</li>
        <li><strong>Supabase</strong> — for database storage</li>
        <li><strong>Vercel</strong> — for hosting and scheduled jobs</li>
        <li><strong>GitHub Actions</strong> — for automated task execution</li>
      </ul>
      <p>Each service operates under its own privacy policy and data processing terms.</p>

      <h2 style={{ fontSize: '1.1rem', marginTop: 32 }}>Data retention</h2>
      <p>
        Boarding records are retained for operational reference. No data is sold, rented, or shared
        with any third party beyond what is necessary to deliver the services listed above.
      </p>

      <h2 style={{ fontSize: '1.1rem', marginTop: 32 }}>Contact</h2>
      <p>
        Questions about this privacy policy can be directed to{' '}
        <a href="mailto:kcoffie@gmail.com" style={{ color: '#2563eb' }}>kcoffie@gmail.com</a>.
      </p>
    </div>
  );
}
