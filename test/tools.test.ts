import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { calculateInterestRate, calculateMaximumMortgage } from '../src/tools.js';

// Mock fetch globally
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe('ABN AMRO Tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('calculateInterestRate', () => {
    const validRequest = {
      product: 'BUDGET' as const,
      type: 'ANNUITAIR' as const,
      discounts: [{ type: 'BANK_ACCOUNT' as const }],
      inactive: false
    };

    const mockApiResponse = {
      overbruggingskrediet: 3.5,
      renteblad: '2024-01-15',
      overbruggingskredieten: [],
      periods: [
        {
          duration: 120,
          inactive: false,
          type: 'VAST',
          reflectionPeriod: 14,
          rates: [
            { type: 'NHG', value: 3.2 },
            { type: 'LTV', ltv: '80-90%', value: 3.5 },
            { type: 'LTV', ltv: '90-100%', value: 3.8 }
          ]
        }
      ],
      interestRate: 3.2,
      effectiveRate: 3.25,
      baseRate: 3.0,
      appliedDiscounts: ['BANK_ACCOUNT'],
      calculationDate: '2024-01-15T10:00:00Z'
    };

    it('should successfully calculate interest rate with valid request', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: jest.fn<() => Promise<any>>().mockResolvedValue(mockApiResponse)
      } as unknown as Response;

      mockFetch.mockResolvedValue(mockResponse);

      const result = await calculateInterestRate(validRequest);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://hypotheken.abnamro.nl/mortgage-customer-interest-rate-calculation/v1/interest-rates/calculate',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            product: 'BUDGET',
            type: 'ANNUITAIR',
            discounts: [{ type: 'BANK_ACCOUNT' }]
          })
        }
      );

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const responseData = JSON.parse(result.content[0].text as string);
      expect(responseData.success).toBe(true);
      expect(responseData.data.bridgingCredit.rate).toBe(3.5);
      expect(responseData.data.periods).toHaveLength(1);
      expect(responseData.data.periods[0].durationInYears).toBe(10);

      expect(responseData.data.requestParameters).toEqual(validRequest);
    });

  });
  describe('calculateMaximumMortgage', () => {
    const validRequest = {
      mainIncome: 50000,
      partnerIncome: 30000
    };

    const mockApiResponse = {
      value: {
        maximumMortgage: 280000,
        monthlyPayment: 1250,
        interest: 3.5
      },
      messages: ['Calculation completed successfully']
    };
    it('should successfully calculate maximum mortgage with valid request', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: jest.fn<() => Promise<any>>().mockResolvedValue(mockApiResponse)
      } as unknown as Response;

      mockFetch.mockResolvedValue(mockResponse);

      const result = await calculateMaximumMortgage(validRequest);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://hypotheken.abnamro.nl/hypotheekorientatie/api/v1.0/snelle-hypotheek-berekening?mainIncome=50000&partnerIncome=30000',
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          }
        }
      );

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const responseData = JSON.parse(result.content[0].text as string);
      expect(responseData.success).toBe(true);
      expect(responseData.data.maximumMortgage).toBe(280000);
      expect(responseData.data.monthlyPayment).toBe(1250);
      expect(responseData.data.interest).toBe(3.5);
      expect(responseData.data.messages).toEqual(['Calculation completed successfully']);
      
      expect(responseData.data.requestParameters).toEqual(validRequest);
    });
  });
}); 