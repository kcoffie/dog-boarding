/**
 * Smoke tests for MessageLogPage.
 * @requirements REQ-v5.0-F2
 *
 * Tests the page's rendering states (loading, error, empty, populated)
 * by mocking the useMessageLog hook at the module level.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import MessageLogPage from '../pages/MessageLogPage';

vi.mock('../hooks/useMessageLog', () => ({
  useMessageLog: vi.fn(),
}));

import { useMessageLog } from '../hooks/useMessageLog';

const SAMPLE_ROWS = [
  {
    id: 1,
    sent_at: '2026-04-22T11:00:00.000Z',
    job_name: 'notify-4am',
    message_type: 'image',
    recipient: '***-***-7375',
    content: null,
    image_path: 'roster-images/notify-4am/2026-04-22.png',
    signedUrl: 'https://example.com/signed/image.png',
    wamid: 'wamid.abc123',
    status: 'sent',
  },
  {
    id: 2,
    sent_at: '2026-04-22T11:00:00.000Z',
    job_name: 'cron-health-check',
    message_type: 'text',
    recipient: '***-***-7375',
    content: '⚠️ cron-auth: 2 consecutive failure(s)',
    image_path: null,
    signedUrl: null,
    wamid: 'wamid.def456',
    status: 'sent',
  },
  {
    id: 3,
    sent_at: '2026-04-22T04:00:00.000Z',
    job_name: 'notify-4am',
    message_type: 'image',
    recipient: '***-***-5462',
    content: null,
    image_path: null,
    signedUrl: null,
    wamid: null,
    status: 'failed',
  },
];

describe('MessageLogPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading indicator while loading', () => {
    useMessageLog.mockReturnValue({ rows: [], loading: true, error: null, refresh: vi.fn() });
    render(<MessageLogPage />);
    // Spinner SVG is present (animate-spin class)
    expect(document.querySelector('.animate-spin')).toBeTruthy();
  });

  it('shows an error alert when loading fails', () => {
    useMessageLog.mockReturnValue({
      rows: [],
      loading: false,
      error: 'connection refused',
      refresh: vi.fn(),
    });
    render(<MessageLogPage />);
    expect(screen.getByText('Error loading messages')).toBeInTheDocument();
    expect(screen.getByText('connection refused')).toBeInTheDocument();
  });

  it('shows empty state when there are no rows', () => {
    useMessageLog.mockReturnValue({ rows: [], loading: false, error: null, refresh: vi.fn() });
    render(<MessageLogPage />);
    expect(screen.getByText('No messages in the last 5 days')).toBeInTheDocument();
  });

  it('renders the page heading', () => {
    useMessageLog.mockReturnValue({ rows: SAMPLE_ROWS, loading: false, error: null, refresh: vi.fn() });
    render(<MessageLogPage />);
    expect(screen.getByText('Messages')).toBeInTheDocument();
    expect(screen.getByText('Outbound WhatsApp sends — last 5 days')).toBeInTheDocument();
  });

  it('renders a table row for each message', () => {
    useMessageLog.mockReturnValue({ rows: SAMPLE_ROWS, loading: false, error: null, refresh: vi.fn() });
    render(<MessageLogPage />);
    // Each row has a job name cell
    expect(screen.getAllByText('notify-4am')).toHaveLength(2);
    expect(screen.getByText('cron-health-check')).toBeInTheDocument();
  });

  it('renders an img tag for image rows that have a signed URL', () => {
    useMessageLog.mockReturnValue({ rows: SAMPLE_ROWS, loading: false, error: null, refresh: vi.fn() });
    render(<MessageLogPage />);
    const img = screen.getByRole('img', { name: /Roster for notify-4am/ });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/signed/image.png');
  });

  it('renders text content for text rows', () => {
    useMessageLog.mockReturnValue({ rows: SAMPLE_ROWS, loading: false, error: null, refresh: vi.fn() });
    render(<MessageLogPage />);
    expect(screen.getByText(/cron-auth: 2 consecutive failure/)).toBeInTheDocument();
  });

  it('shows "failed" badge for failed send rows', () => {
    useMessageLog.mockReturnValue({ rows: SAMPLE_ROWS, loading: false, error: null, refresh: vi.fn() });
    render(<MessageLogPage />);
    const failedBadges = screen.getAllByText('failed');
    expect(failedBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('shows summary stats: total, sent, failed counts', () => {
    useMessageLog.mockReturnValue({ rows: SAMPLE_ROWS, loading: false, error: null, refresh: vi.fn() });
    render(<MessageLogPage />);
    // Total = 3, Sent = 2, Failed = 1
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
