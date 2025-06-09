import { z } from "zod";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";


// Zod schemas for validation
const InterestRateRequestSchema = z.object({
  product: z.enum(['BUDGET', 'WONING']),
  type: z.enum(['ANNUITAIR', 'LINEAIR', 'AFLOSSINGSVRIJ']),
  discounts: z.array(z.discriminatedUnion('type', [
    z.object({
      type: z.literal('BANK_ACCOUNT')
    }),
    z.object({
      type: z.literal('SUSTAINABILITY'),
      label: z.enum(['B', 'A_OR_HIGHER'])
    })
  ])).optional().default([]),
  inactive: z.boolean().optional().default(false)
});

const MaximumMortgageRequestSchema = z.object({
  mainIncome: z.number().min(0),
  partnerIncome: z.number().min(0).optional()
});

const HouseTaxQuotaRequestSchema = z.object({
  housePrice: z.number().min(0),
});

const MaxTransferTaxPremiumCap = 525000;
const TransferTaxRate = 0.02;
const MaxInterestRepaymentDeductionRate = 37.48;

export async function calculateInterestRate(args: z.infer<typeof InterestRateRequestSchema>): Promise<CallToolResult> {
  try {
    const { product, type, discounts = [], inactive = false } = InterestRateRequestSchema.parse(args);

    const requestBody = {
      product,
      type,
      discounts
    };

    const url = new URL('https://hypotheken.abnamro.nl/mortgage-customer-interest-rate-calculation/v1/interest-rates/calculate');
    if (inactive) {
      url.searchParams.append('inactive', 'true');
    }

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ABN AMRO API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            data: {
              // Bridging credit information
              bridgingCredit: {
                rate: data.overbruggingskrediet,
                rateSheetDate: data.renteblad,
                options: data.overbruggingskredieten
              },
              // Mortgage periods with detailed rates
              periods: data.periods?.map((period: any) => ({
                duration: period.duration,
                durationInYears: Math.round(period.duration / 12 * 10) / 10,
                inactive: period.inactive,
                type: period.type,
                reflectionPeriod: period.reflectionPeriod,
                rates: {
                  dutchNationalMortgageGuarantee: period.rates?.find((r: any) => r.type === 'NHG')?.value,
                  lifeTimeValue: period.rates?.filter((r: any) => r.type === 'LTV').map((r: any) => ({
                    range: r.ltv,
                    rate: r.value
                  }))
                }
              })) || [],
              // Legacy fields for backwards compatibility
              interestRate: data.interestRate,
              effectiveRate: data.effectiveRate,
              baseRate: data.baseRate,
              appliedDiscounts: data.appliedDiscounts,
              calculationDate: data.calculationDate,
              requestParameters: {
                product,
                type,
                discounts,
                inactive
              }
            }
          }, null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            success: false,
            error: `Failed to calculate interest rate: ${error instanceof Error ? error.message : 'Unknown error'}`
          }, null, 2)
        }
      ]
    };
  }
}

export async function calculateMaximumMortgage(args: z.infer<typeof MaximumMortgageRequestSchema>): Promise<CallToolResult> {
  try {
    const { mainIncome, partnerIncome } = MaximumMortgageRequestSchema.parse(args);

    const url = new URL('https://hypotheken.abnamro.nl/hypotheekorientatie/api/v1.0/snelle-hypotheek-berekening');
    url.searchParams.append('mainIncome', mainIncome.toString());
    if (partnerIncome !== undefined) {
      url.searchParams.append('partnerIncome', partnerIncome.toString());
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ABN AMRO API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            data: {
              maximumMortgage: data.value?.maximumMortgage || null,
              monthlyPayment: data.value?.monthlyPayment || null,
              interest: data.value?.interest || null,
              messages: data.messages,
              requestParameters: {
                mainIncome,
                partnerIncome,
              }
            }
          }, null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            success: false,
            error: `Failed to calculate maximum mortgage: ${error instanceof Error ? error.message : 'Unknown error'}`
          }, null, 2)
        }
      ]
    };
  }
}

export function getMortageInterestRateDeduction(): CallToolResult {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            data: {
              deductionPercentage:  MaxInterestRepaymentDeductionRate,
              description: "Maximum tax deduction rate for mortgage interest payments in the Netherlands for 2025 (37.48% of interest paid can be deducted from taxable income)"
            }
          }, null, 2)
        }
      ]
    };
  }

  export function getMaximumMortageNationalHomeGuarantee(): CallToolResult {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            data: {
              deductionPercentage: 450000,
              description: "Dutch National Mortgage Guarantee (NHG) limit for 2025: mortgages up to €450,000 qualify for lower NHG interest rates"
            
            }
          }, null, 2)
        }
      ]
    };
  }

  export function getPropertyTransferTax(args: z.infer<typeof HouseTaxQuotaRequestSchema>): CallToolResult {
    const { housePrice } = HouseTaxQuotaRequestSchema.parse(args);
    var taxQuota = 0;
    if (housePrice > MaxTransferTaxPremiumCap) {
        taxQuota = housePrice * TransferTaxRate;
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            data: {
                taxQuota: taxQuota,
                description: "Dutch property transfer tax for 2025: 2% of the purchase price for properties above €525,000"
            }
          }, null, 2)
        }
      ]
    };
  }