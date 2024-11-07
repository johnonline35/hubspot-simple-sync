import { HubspotClient } from "../HubspotClient";
import {
  SimplePublicObject,
  CollectionResponseWithTotalSimplePublicObjectForwardPaging,
  PublicObjectSearchRequest,
} from "@hubspot/api-client/lib/codegen/crm/companies";

class HubSpotError extends Error {
  response?: {
    status: number;
    data?: any;
  };

  constructor(message: string, status?: number) {
    super(message);
    if (status) {
      this.response = { status };
    }
  }
}

const createMockCompany = (data: {
  domain: string;
  name: string;
  [key: string]: string;
}): SimplePublicObject => ({
  id: "123",
  properties: data,
  createdAt: new Date(),
  updatedAt: new Date(),
  archived: false,
});

// Mock the HubSpot client with proper types
const mockSearchApi = {
  doSearch: jest.fn() as jest.MockedFunction<
    (
      request: PublicObjectSearchRequest
    ) => Promise<CollectionResponseWithTotalSimplePublicObjectForwardPaging>
  >,
};

const mockBasicApi = {
  create: jest.fn(),
  update: jest.fn(),
};

jest.mock("@hubspot/api-client", () => ({
  Client: jest.fn().mockImplementation(() => ({
    crm: {
      companies: {
        searchApi: mockSearchApi,
        basicApi: mockBasicApi,
      },
      contacts: {
        searchApi: { doSearch: jest.fn() },
        basicApi: { create: jest.fn(), update: jest.fn() },
      },
      associations: {
        v4: {
          basicApi: { create: jest.fn() },
        },
      },
    },
  })),
}));

describe("HubspotClient", () => {
  let client: HubspotClient;
  const mockApiKey = "test-api-key";

  beforeEach(() => {
    jest.clearAllMocks();
    client = new HubspotClient(mockApiKey);
  });

  describe("retry logic", () => {
    it("should retry on rate limit errors", async () => {
      const rateLimitError = new HubSpotError("Rate limit exceeded", 429);

      const mockOperation = jest
        .fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({ id: "123" });

      // @ts-ignore - accessing private method for testing
      const result = await client.withRetry(mockOperation);

      expect(mockOperation).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ id: "123" });
    });

    it("should not retry on non-rate limit errors", async () => {
      const nonRateLimitError = new HubSpotError("Bad request", 400);

      const mockOperation = jest.fn().mockRejectedValueOnce(nonRateLimitError);

      // @ts-ignore - accessing private method for testing
      await expect(client.withRetry(mockOperation)).rejects.toThrow(
        "Bad request"
      );

      expect(mockOperation).toHaveBeenCalledTimes(1);
    });
  });

  describe("companies", () => {
    it("should upsert company correctly", async () => {
      const mockCompany = {
        domain: "test.com",
        name: "Test Co",
      };

      const mockSearchResult = createMockCompany(mockCompany);
      const mockUpdateResult = createMockCompany({
        ...mockCompany,
        updated: "true", // HubSpot properties are always strings
      });

      const mockSearchResponse: CollectionResponseWithTotalSimplePublicObjectForwardPaging =
        {
          results: [mockSearchResult],
          total: 1,
          paging: {},
        };

      // Setup mocks with proper return types
      mockSearchApi.doSearch.mockImplementation(() =>
        Promise.resolve(mockSearchResponse)
      );
      mockBasicApi.update.mockImplementation(() =>
        Promise.resolve(mockUpdateResult)
      );

      const result = await client.companies.upsert(mockCompany);

      expect(result).toEqual(mockUpdateResult);
      expect(mockSearchApi.doSearch).toHaveBeenCalled();
    });
  });

  describe("batch processing", () => {
    it("should handle mixed success and failures", async () => {
      const testData = [
        { domain: "success.com", name: "Success Co" },
        { domain: "fail.com", name: "Fail Co" },
        { domain: "success2.com", name: "Success 2 Co" },
      ];

      const successOperation = jest.fn().mockImplementation(async (data) => {
        if (data.domain === "fail.com") {
          throw new HubSpotError("Test failure", 400);
        }
        return createMockCompany({
          domain: data.domain,
          name: data.name,
        });
      });

      const { results, errors, totalProcessed } = await client.batch.process(
        testData,
        successOperation
      );

      expect(results).toHaveLength(2);
      expect(errors).toHaveLength(1);
      expect(errors[0].item.domain).toBe("fail.com");
      expect(totalProcessed).toBe(3);
    });

    it("should respect concurrency limits", async () => {
      const testData = Array.from({ length: 6 }, (_, i) => ({
        domain: `test${i}.com`,
        name: `Test ${i} Co`,
      }));

      // Track currently running operations
      let currentlyRunning = 0;
      let maxConcurrent = 0;
      const CONCURRENCY_LIMIT = 2;

      const operation = jest.fn().mockImplementation(async () => {
        currentlyRunning++;
        maxConcurrent = Math.max(maxConcurrent, currentlyRunning);

        // Simulate some async work
        await new Promise((resolve) => setTimeout(resolve, 50));

        currentlyRunning--;
        return createMockCompany({ domain: "test.com", name: "Test Co" });
      });

      await client.batch.process(testData, operation, {
        concurrency: CONCURRENCY_LIMIT,
      });

      expect(maxConcurrent).toBeLessThanOrEqual(CONCURRENCY_LIMIT);
      expect(operation).toHaveBeenCalledTimes(testData.length);
    });

    it("should process batches sequentially", async () => {
      const testData = Array.from({ length: 4 }, (_, i) => ({
        domain: `test${i}.com`,
        name: `Test ${i} Co`,
      }));

      const processOrder: number[] = [];
      const operation = jest.fn().mockImplementation(async (data) => {
        const index = parseInt(
          data.domain.replace("test", "").replace(".com", "")
        );
        processOrder.push(index);
        return createMockCompany(data);
      });

      await client.batch.process(testData, operation, {
        concurrency: 2,
      });

      // Check that items were processed in order within their concurrency groups
      const firstBatch = processOrder.slice(0, 2);
      const secondBatch = processOrder.slice(2, 4);

      // Each batch should contain sequential pairs
      expect(Math.abs(firstBatch[0] - firstBatch[1])).toBe(1);
      expect(Math.abs(secondBatch[0] - secondBatch[1])).toBe(1);
    });
  });
});
