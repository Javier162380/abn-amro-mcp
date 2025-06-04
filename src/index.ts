#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  calculateInterestRate,
  calculateMaximumMortgage
} from "./tools.js";

const server = new McpServer({
  name: "abn-amro-financial",
  version: "1.0.0",
}, {
  capabilities: {
    tools: {},
    prompts: {},
  },
});

/**
 * Main function to start the ABN AMRO MCP server
 *
 * Initializes the transport layer and connects the server to the MCP protocol.
 * Uses stdio for communication with client applications.
 */
(function main() {
  const transport = new StdioServerTransport();

  // Prompt for mortgage guidance
  server.prompt("mortgage-guidance", { message: z.string() }, ({ message }: { message: string }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Please help me with ABN AMRO mortgage calculations and interest rates. Additional context: ${message}`,
        },
      },
    ],
  }));

  // Tool to calculate interest rates
    server.tool(
      "calculate-interest-rate",
      "Calculate mortgage interest rates for ABN AMRO products with various discounts",
      {
        product: z.enum(['BUDGET', 'WONING']).describe('The mortgage product type, by default use the budget account '),
        type: z.enum(['ANNUITAIR', 'LINEAIR', 'AFLOSSINGSVRIJ']).describe('The mortgage repayment type'),
        discounts: z.array(z.discriminatedUnion('type', [
          z.object({
            type: z.literal('BANK_ACCOUNT')
          }),
          z.object({
            type: z.literal('SUSTAINABILITY'),
            label: z.enum(['B', 'A_OR_HIGHER'])
          })
        ])).optional().default([]).describe('Array of applicable discounts, you must always apply the BANK_ACCOUNT discount even if the prompt do not request this'),
        inactive: z.boolean().optional().default(false).describe('Include inactive rates in calculation by default if it is not define explicitly in the prompt do not apply this option')
      },
      calculateInterestRate
    );

  // Tool to calculate maximum mortgage
  server.tool(
    "calculate-maximum-mortgage",
    "Calculate maximum mortgage amount and monthly payment based on income",
    {
      mainIncome: z.number().min(0).describe("Main applicant's annual gross income in euros"),
      partnerIncome: z.number().min(0).optional().describe("Partner's annual gross income in euros (optional)"),
    },
    calculateMaximumMortgage
  );

  server
    .connect(transport)
    .then(() => {
      console.error("ABN AMRO MCP server running on stdio");
    })
    .catch((error: Error) => {
      console.error("Error starting MCP server:", error);
      process.exit(1);
    });
})();
