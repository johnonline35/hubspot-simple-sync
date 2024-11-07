# HubSpot Simple Sync

A zero-bullshit SDK that makes HubSpot feel like a modern API. 

## Installation

```bash
npm install hubspot-simple-sync
```

## Features

- **Dead simple CRUD**: One-liners for common operations
- **Smart batching**: Auto-handles rate limits, retries, concurrency
- **Built-in deduplication**: Intelligent matching on emails, domains, etc.
- **Type safety**: Full TypeScript support
- **Zero config needed**: Sensible defaults that actually work

## Usage

```typescript
import { HubspotClient } from 'hubspot-simple-sync';

// Initialize client
const hubspot = new HubspotClient(process.env.HUBSPOT_API_KEY);

// Upsert a company
const company = await hubspot.companies.upsert({
  domain: 'example.com',
  name: 'Example Corp'
});

// Upsert a contact
const contact = await hubspot.contacts.upsert({
  email: 'person@example.com',
  firstName: 'Test',
  lastName: 'Person'
});

// Associate contact with company
await hubspot.associations.createCompanyContact(company.id, contact.id);

// Batch process data
const { results, errors } = await hubspot.batch.process(
  companies,
  async (data) => {
    const company = await hubspot.companies.upsert(data);
    // ... process contacts
    return company;
  }
);
```

## API Reference

### Companies

```typescript
// Get company by domain
const company = await hubspot.companies.get('example.com');

// Create company
const company = await hubspot.companies.create({
  domain: 'example.com',
  name: 'Example Corp'
});

// Update company
const company = await hubspot.companies.update(id, {
  name: 'New Name'
});

// Upsert company
const company = await hubspot.companies.upsert({
  domain: 'example.com',
  name: 'Example Corp'
});
```

### Contacts

```typescript
// Get contact by email
const contact = await hubspot.contacts.get('email@example.com');

// Create contact
const contact = await hubspot.contacts.create({
  email: 'person@example.com',
  firstName: 'Test',
  lastName: 'Person'
});

// Update contact
const contact = await hubspot.contacts.update(id, {
  firstName: 'New Name'
});

// Upsert contact
const contact = await hubspot.contacts.upsert({
  email: 'person@example.com',
  firstName: 'Test',
  lastName: 'Person'
});
```

### Batch Processing

```typescript
const { results, errors, totalProcessed } = await hubspot.batch.process(
  items,
  async (item) => {
    // Process item
    return result;
  },
  {
    concurrency: 3, // Optional: number of concurrent operations
    delayMs: 333    // Optional: delay between batches
  }
);
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Run with watch mode
npm run dev
```

## License

MIT
