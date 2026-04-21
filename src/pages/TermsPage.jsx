export default function TermsPage() {
  return (
    <div style={{ maxWidth: 720, margin: '48px auto', padding: '0 24px', fontFamily: 'sans-serif', color: '#222', lineHeight: 1.7 }}>
      <h1 style={{ fontSize: '1.75rem', marginBottom: 4 }}>Terms of Service</h1>
      <p style={{ color: '#666', marginBottom: 32 }}>Last updated: April 21, 2026</p>

      <h2 style={{ fontSize: '1.1rem', marginTop: 32 }}>Overview</h2>
      <p>
        Q Boarding is a private, internal operator tool used by a dog boarding business to manage
        boarding schedules and send automated WhatsApp notifications to designated staff. It is not
        available to the general public.
      </p>

      <h2 style={{ fontSize: '1.1rem', marginTop: 32 }}>Access</h2>
      <p>
        Access to this application is by invitation only. Unauthorized access is prohibited.
        Users are responsible for maintaining the confidentiality of their login credentials.
      </p>

      <h2 style={{ fontSize: '1.1rem', marginTop: 32 }}>Acceptable use</h2>
      <p>
        This application may only be used for its intended purpose: managing dog boarding schedules
        and delivering operational WhatsApp notifications. Any other use is prohibited.
      </p>

      <h2 style={{ fontSize: '1.1rem', marginTop: 32 }}>Disclaimer</h2>
      <p>
        This application is provided as-is for internal operational use. The operator makes no
        warranties regarding uptime or availability beyond reasonable best efforts.
      </p>

      <h2 style={{ fontSize: '1.1rem', marginTop: 32 }}>Contact</h2>
      <p>
        Questions can be directed to{' '}
        <a href="mailto:kcoffie@gmail.com" style={{ color: '#2563eb' }}>kcoffie@gmail.com</a>.
      </p>
    </div>
  );
}
