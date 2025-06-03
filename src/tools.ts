import { z } from "zod";

// Zod schemas for validation
const InterestRateRequestSchema = z.object({
  product: z.enum(['BUDGET']),
  type: z.enum(['ANNUITAIR']),
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
  partnerIncome: z.number().min(0).optional(),
});

export async function calculateInterestRate(args: z.infer<typeof InterestRateRequestSchema>) {
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

export async function calculateMaximumMortgage(args: z.infer<typeof MaximumMortgageRequestSchema>) {
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