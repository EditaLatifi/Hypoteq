import { describe, it, expect } from '@jest/globals';

// Helper functions to test logic
function getMinOwnFunds(propertyPrice: number, residenceType: 'haupt' | 'zweit', loanType: 'purchase' | 'refinancing') {
  if (loanType === 'purchase') {
    return propertyPrice * (residenceType === 'zweit' ? 0.3 : 0.2);
  }
  return 0;
}

function getMaxBelehnung(residenceType: 'haupt' | 'zweit', loanType: 'purchase' | 'refinancing') {
  if (loanType === 'purchase') {
    return residenceType === 'haupt' ? 0.8 : 0.65;
  }
  return residenceType === 'haupt' ? 0.65 : 0.55;
}

describe('Calculator Logic', () => {
  it('calculates min own funds for Hauptwohnsitz purchase', () => {
    expect(getMinOwnFunds(1000000, 'haupt', 'purchase')).toBe(200000);
  });

  it('calculates min own funds for Zweitwohnsitz purchase', () => {
    expect(getMinOwnFunds(1000000, 'zweit', 'purchase')).toBe(300000);
  });

  it('min own funds for refinancing is always 0', () => {
    expect(getMinOwnFunds(1000000, 'haupt', 'refinancing')).toBe(0);
    expect(getMinOwnFunds(1000000, 'zweit', 'refinancing')).toBe(0);
  });

  it('max Belehnung for Hauptwohnsitz purchase is 80%', () => {
    expect(getMaxBelehnung('haupt', 'purchase')).toBe(0.8);
  });

  it('max Belehnung for Zweitwohnsitz purchase is 65%', () => {
    expect(getMaxBelehnung('zweit', 'purchase')).toBe(0.65);
  });

  it('max Belehnung for Hauptwohnsitz refinancing is 65%', () => {
    expect(getMaxBelehnung('haupt', 'refinancing')).toBe(0.65);
  });

  it('max Belehnung for Zweitwohnsitz refinancing is 55%', () => {
    expect(getMaxBelehnung('zweit', 'refinancing')).toBe(0.55);
  });
});
