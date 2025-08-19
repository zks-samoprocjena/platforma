import { render, screen } from '@testing-library/react';
import { DeadlineBadge } from '@/components/ui/deadline-badge';
import { addDays, subDays } from 'date-fns';

// Mock next-intl
jest.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: any) => {
    if (key === 'deadline.today') return 'Due today';
    if (key === 'deadline.overdue' && values?.days === 1) return '1 day overdue';
    if (key === 'deadline.overdue' && values?.days > 1) return `${values.days} days overdue`;
    if (key === 'deadline.remaining' && values?.days === 1) return '1 day left';
    if (key === 'deadline.remaining' && values?.days > 1) return `${values.days} days left`;
    return key;
  },
}));

describe('DeadlineBadge', () => {
  it('renders nothing when dueDate is null', () => {
    const { container } = render(<DeadlineBadge dueDate={null} status="in_progress" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for completed status', () => {
    const { container } = render(
      <DeadlineBadge dueDate={new Date().toISOString()} status="completed" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for archived status', () => {
    const { container } = render(
      <DeadlineBadge dueDate={new Date().toISOString()} status="archived" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows "Due today" when deadline is today', () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    
    render(<DeadlineBadge dueDate={today.toISOString()} status="in_progress" />);
    expect(screen.getByText('Due today')).toBeInTheDocument();
  });

  it('shows overdue message with correct styling', () => {
    const overdueDays = 3;
    const pastDate = subDays(new Date(), overdueDays);
    
    render(<DeadlineBadge dueDate={pastDate.toISOString()} status="in_progress" />);
    
    const badge = screen.getByText(`${overdueDays} days overdue`);
    expect(badge).toBeInTheDocument();
    // Check parent div has the badge-error class
    const badgeDiv = badge.parentElement;
    expect(badgeDiv?.className).toContain('badge-error');
  });

  it('shows remaining days with urgent styling (≤3 days)', () => {
    const daysLeft = 2;
    const futureDate = addDays(new Date(), daysLeft);
    
    render(<DeadlineBadge dueDate={futureDate.toISOString()} status="in_progress" />);
    
    const badge = screen.getByText(`${daysLeft} days left`);
    expect(badge).toBeInTheDocument();
    // Check parent div has the badge-warning class
    const badgeDiv = badge.parentElement;
    expect(badgeDiv?.className).toContain('badge-warning');
  });

  it('shows remaining days with upcoming styling (4-7 days)', () => {
    const daysLeft = 5;
    const futureDate = addDays(new Date(), daysLeft);
    
    render(<DeadlineBadge dueDate={futureDate.toISOString()} status="in_progress" />);
    
    const badge = screen.getByText(`${daysLeft} days left`);
    expect(badge).toBeInTheDocument();
    // Check parent div has the badge-info class
    const badgeDiv = badge.parentElement;
    expect(badgeDiv?.className).toContain('badge-info');
  });

  it('shows remaining days with comfortable styling (>7 days)', () => {
    const daysLeft = 10;
    const futureDate = addDays(new Date(), daysLeft);
    
    render(<DeadlineBadge dueDate={futureDate.toISOString()} status="in_progress" />);
    
    const badge = screen.getByText(`${daysLeft} days left`);
    expect(badge).toBeInTheDocument();
    // Check parent div has the badge-success class
    const badgeDiv = badge.parentElement;
    expect(badgeDiv?.className).toContain('badge-success');
  });

  it('handles different sizes correctly', () => {
    const futureDate = addDays(new Date(), 5);
    
    const { rerender } = render(
      <DeadlineBadge dueDate={futureDate.toISOString()} status="in_progress" size="sm" />
    );
    
    let badgeDiv = screen.getByText('5 days left').parentElement;
    expect(badgeDiv?.className).toContain('badge-sm');
    expect(badgeDiv?.className).toContain('text-xs');
    
    rerender(
      <DeadlineBadge dueDate={futureDate.toISOString()} status="in_progress" size="md" />
    );
    
    badgeDiv = screen.getByText('5 days left').parentElement;
    expect(badgeDiv?.className).toContain('badge-md');
    expect(badgeDiv?.className).toContain('text-sm');
  });

  it('handles edge case: 1 day overdue', () => {
    const yesterday = subDays(new Date(), 1);
    
    render(<DeadlineBadge dueDate={yesterday.toISOString()} status="in_progress" />);
    expect(screen.getByText('1 day overdue')).toBeInTheDocument();
  });

  it('handles edge case: 1 day remaining', () => {
    const tomorrow = addDays(new Date(), 1);
    
    render(<DeadlineBadge dueDate={tomorrow.toISOString()} status="in_progress" />);
    expect(screen.getByText('1 day left')).toBeInTheDocument();
  });
});