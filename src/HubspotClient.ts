import { Client } from "@hubspot/api-client";
import {
  FilterOperatorEnum,
  PublicObjectSearchRequest,
} from "@hubspot/api-client/lib/codegen/crm/companies";
import { AssociationSpecAssociationCategoryEnum } from "@hubspot/api-client/lib/codegen/crm/associations/v4/models/AssociationSpec";

export interface Company {
  companyDomain: string;
  companyName: string;
  contacts: Contact[];
}

export interface Contact {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

interface BatchError<T> {
  item: T;
  error: Error;
}

interface BatchResult<T, R> {
  results: R[];
  errors: BatchError<T>[];
  totalProcessed: number;
}

export class HubspotClient {
  private client: Client;
  private rateLimitDelay = 333; // 3 requests per second
  private maxRetries = 3;

  constructor(apiKey: string) {
    this.client = new Client({ accessToken: apiKey });
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        if (error?.response?.status !== 429 && attempt < this.maxRetries) {
          throw error;
        }
        const delay = 1000 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw new Error(`Operation failed after ${this.maxRetries} retries`);
  }

  readonly companies = {
    get: async (domain: string) => {
      return this.withRetry(async () => {
        const filter: PublicObjectSearchRequest = {
          filterGroups: [
            {
              filters: [
                {
                  propertyName: "domain",
                  operator: FilterOperatorEnum.Eq,
                  value: domain,
                },
              ],
            },
          ],
        };

        const result = await this.client.crm.companies.searchApi.doSearch(
          filter
        );
        return result.results[0];
      });
    },

    create: async (data: any) => {
      return this.withRetry(async () => {
        const properties = {
          domain: data.domain,
          name: data.name,
          ...data,
        };
        return await this.client.crm.companies.basicApi.create({ properties });
      });
    },

    update: async (id: string, data: any) => {
      return this.withRetry(async () => {
        return await this.client.crm.companies.basicApi.update(id, {
          properties: data,
        });
      });
    },

    upsert: async (data: any) => {
      return this.withRetry(async () => {
        try {
          const existing = await this.companies.get(data.domain);
          if (existing) {
            return await this.companies.update(existing.id, data);
          }
        } catch (e) {
          // Company not found, create new
        }
        return await this.companies.create(data);
      });
    },
  };

  readonly contacts = {
    get: async (email: string) => {
      return this.withRetry(async () => {
        const filter: PublicObjectSearchRequest = {
          filterGroups: [
            {
              filters: [
                {
                  propertyName: "email",
                  operator: FilterOperatorEnum.Eq,
                  value: email,
                },
              ],
            },
          ],
        };

        const result = await this.client.crm.contacts.searchApi.doSearch(
          filter
        );
        return result.results[0];
      });
    },

    create: async (data: any) => {
      return this.withRetry(async () => {
        const properties = {
          email: data.email,
          firstname: data.firstName,
          lastname: data.lastName,
          ...data,
        };
        return await this.client.crm.contacts.basicApi.create({ properties });
      });
    },

    update: async (id: string, data: any) => {
      return this.withRetry(async () => {
        return await this.client.crm.contacts.basicApi.update(id, {
          properties: data,
        });
      });
    },

    upsert: async (data: any) => {
      return this.withRetry(async () => {
        try {
          const existing = await this.contacts.get(data.email);
          if (existing) {
            return await this.contacts.update(existing.id, data);
          }
        } catch (e) {
          // Contact not found, create new
        }
        return await this.contacts.create(data);
      });
    },
  };

  readonly associations = {
    createCompanyContact: async (companyId: string, contactId: string) => {
      return this.withRetry(async () => {
        return await this.client.crm.associations.v4.basicApi.create(
          "companies",
          companyId,
          "contacts",
          contactId,
          [
            {
              associationCategory:
                AssociationSpecAssociationCategoryEnum.HubspotDefined,
              associationTypeId: 280,
            },
          ]
        );
      });
    },
  };

  readonly batch = {
    process: async <T, R>(
      items: T[],
      operation: (item: T) => Promise<R>,
      { concurrency = 3, delayMs = this.rateLimitDelay } = {}
    ): Promise<BatchResult<T, R>> => {
      const results: R[] = [];
      const errors: BatchError<T>[] = [];
      const processItem = async (item: T): Promise<void> => {
        try {
          const result = await operation(item);
          results.push(result);
        } catch (error) {
          errors.push({
            item,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      };

      for (let i = 0; i < items.length; i += concurrency) {
        const batch = items.slice(i, i + concurrency);
        await Promise.all(batch.map(processItem));

        if (i + concurrency < items.length) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }

      return {
        results,
        errors,
        totalProcessed: results.length + errors.length,
      };
    },
  };
}
