import { request } from "graphql-request";
import { ensQuery, expiringEnsQuery } from "./graph/index";

const endpoint = `https://gateway.thegraph.com/api/e533c2d63f9f4e9c28616ac882db2685/subgraphs/id/5XqPmWe6gjyrJtFn9cLy237i4cWw2j9HcUJEXsP5qGtH`;

export async function fetchEnsData() {
  try {
    const data = await request(endpoint, ensQuery);
    console.log(data);
  } catch (error) {
    console.error("Error fetching data:", error);
  }
}

export async function fetchExpiringEnsNames(nameLength?: number) {
  try {
    const variables: any = {
      first: 10,
      currentDate: Number(Math.floor(Date.now() / 1000)),
    };

    const data = await request(endpoint, expiringEnsQuery, variables);
    return data.domains.map((domain: any) => {
      const millisecondsUntilExpiry = domain.expiryDate * 1000 - Date.now();
      const daysUntilExpiry = Math.floor(millisecondsUntilExpiry / (1000 * 60 * 60 * 24));
      const hoursUntilExpiry = Math.floor((millisecondsUntilExpiry % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutesUntilExpiry = Math.floor((millisecondsUntilExpiry % (1000 * 60 * 60)) / (1000 * 60));

      return {
        name: domain.name,
        timeUntilExpiry: {
          days: daysUntilExpiry,
          hours: hoursUntilExpiry,
          minutes: minutesUntilExpiry,
        },
      };
    });
  } catch (error) {
    console.error("Error fetching expiring ENS names:", error);
    throw error;
  }
}
