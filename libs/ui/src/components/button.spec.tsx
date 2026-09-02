import { render, screen } from '@testing-library/react';
import { Button } from './button';

describe('Button', () => {
  it('renders its label as a button', () => {
    render(<Button>Schedule payment</Button>);
    expect(
      screen.getByRole('button', { name: 'Schedule payment' }),
    ).toBeTruthy();
  });

  it('can render as a child element via asChild', () => {
    render(
      <Button asChild>
        <a href="/plan">Open plan</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Open plan' });
    expect(link.getAttribute('href')).toBe('/plan');
  });
});
