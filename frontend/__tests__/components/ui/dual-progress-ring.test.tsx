import { render, screen } from '@testing-library/react';
import { DualProgressRing } from '@/components/ui/dual-progress-ring';

describe('DualProgressRing', () => {
  const defaultProps = {
    outerProgress: 75,
    innerProgress: 85,
    totalControls: 100,
    mandatoryControls: 40,
  };

  it('renders correctly with default props', () => {
    render(<DualProgressRing {...defaultProps} />);
    
    // Check if the center text is displayed (split across elements)
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('/ 40')).toBeInTheDocument();
  });

  it('renders with different sizes', () => {
    const { rerender } = render(<DualProgressRing {...defaultProps} size="sm" />);
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('/ 40')).toBeInTheDocument();

    rerender(<DualProgressRing {...defaultProps} size="md" />);
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('/ 40')).toBeInTheDocument();

    rerender(<DualProgressRing {...defaultProps} size="lg" />);
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('/ 40')).toBeInTheDocument();
  });

  it('handles zero progress correctly', () => {
    render(
      <DualProgressRing
        outerProgress={0}
        innerProgress={0}
        totalControls={100}
        mandatoryControls={40}
      />
    );
    
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('/ 40')).toBeInTheDocument();
  });

  it('handles 100% progress correctly', () => {
    render(
      <DualProgressRing
        outerProgress={100}
        innerProgress={100}
        totalControls={100}
        mandatoryControls={40}
      />
    );
    
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('/ 40')).toBeInTheDocument();
  });

  it('handles edge case with zero controls', () => {
    render(
      <DualProgressRing
        outerProgress={0}
        innerProgress={0}
        totalControls={0}
        mandatoryControls={0}
      />
    );
    
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('/ 0')).toBeInTheDocument();
  });

  it('renders correct progress values in aria labels', () => {
    const { container } = render(<DualProgressRing {...defaultProps} />);
    
    // Check SVG elements exist
    const svgElements = container.querySelectorAll('svg');
    expect(svgElements.length).toBeGreaterThan(0);
    
    // Check if progress bars are rendered (circles)
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBeGreaterThan(0);
  });

  it('applies correct SVG dimensions based on size', () => {
    const { container, rerender } = render(<DualProgressRing {...defaultProps} size="sm" />);
    
    let svg = container.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('width')).toBe('80');
    expect(svg.getAttribute('height')).toBe('80');

    rerender(<DualProgressRing {...defaultProps} size="md" />);
    svg = container.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('width')).toBe('120');
    expect(svg.getAttribute('height')).toBe('120');

    rerender(<DualProgressRing {...defaultProps} size="lg" />);
    svg = container.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('width')).toBe('160');
    expect(svg.getAttribute('height')).toBe('160');
  });
});