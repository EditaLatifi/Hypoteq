import { describe, it, expect } from '@jest/globals';

function getMinOwnFunds(propertyPrice: number, residenceType: 'haupt' | 'zweit', loanType: 'purchase' | 'refinancing') {
  if (loanType === 'purchase') {
    return propertyPrice * (residenceType === 'zweit' ? 0.3 : 0.2);
  }
  return 0;
}

describe('Calculator Logic - Immobilienkauf', () => {
  it('should require 300,000 Eigenmittel for Zweitwohnsitz and 1,000,000 property price', () => {
    expect(getMinOwnFunds(1000000, 'zweit', 'purchase')).toBe(300000);
  });

  it('should require 200,000 Eigenmittel for Hauptwohnsitz and 1,000,000 property price', () => {
    expect(getMinOwnFunds(1000000, 'haupt', 'purchase')).toBe(200000);
  });
});
