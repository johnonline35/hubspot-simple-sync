import { config } from "dotenv";
import { HubspotClient, ScrapedCompany } from "../HubspotClient";

config();

interface ProcessedResult {
  company: any;
  contacts: any[];
}

const main = async () => {
  if (!process.env.HUBSPOT_API_KEY) {
    throw new Error("HUBSPOT_API_KEY is required in .env file");
  }
  const hubspot = new HubspotClient(process.env.HUBSPOT_API_KEY);

  // Example data structure - replace with your actual scraper output
  const scrapedData: ScrapedCompany[] = [
    {
      companyDomain: "example.com",
      companyName: "Example Corp",
      contacts: [
        {
          email: "person@example.com",
          firstName: "Test",
          lastName: "Person",
          phone: "555-0123",
        },
      ],
    },
  ];

  try {
    console.log("Starting data processing...");

    const { results, errors, totalProcessed } = await hubspot.batch.process<
      ScrapedCompany,
      ProcessedResult
    >(scrapedData, async (data) => {
      console.log(`Processing company: ${data.companyDomain}`);

      const company = await hubspot.companies.upsert({
        domain: data.companyDomain,
        name: data.companyName,
      });

      console.log(`Company processed: ${company.id}`);

      const contacts = [];
      for (const contact of data.contacts) {
        try {
          console.log(`Processing contact: ${contact.email}`);
          const createdContact = await hubspot.contacts.upsert(contact);

          await hubspot.associations.createCompanyContact(
            company.id,
            createdContact.id
          );

          contacts.push(createdContact);
        } catch (error) {
          console.error(`Error processing contact ${contact.email}:`, error);
          // Continue processing other contacts even if one fails
        }
      }

      return {
        company,
        contacts,
      };
    });

    console.log("Data processing completed successfully");
    console.log(`Processed ${totalProcessed} companies:`);
    console.log(`- Successful: ${results.length}`);
    console.log(`- Failed: ${errors.length}`);

    if (errors.length > 0) {
      console.log("\nErrors encountered:");
      errors.forEach(({ item, error }) => {
        console.error(`- Company ${item.companyDomain}:`, error.message);
      });
    }
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
};

// Run the example
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
