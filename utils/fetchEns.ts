import { request, gql } from "graphql-request";
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
    const variables = {
      first: 10,
      currentDate: BigInt(Math.floor(Date.now() / 1000)),
      nameLength: nameLength ? nameLength.toString() : undefined,
    };
    const data = await request(endpoint, expiringEnsQuery, variables);
    return data.domains.map((domain: any) => ({
      name: domain.name,
      daysUntilExpiry: Math.floor((domain.expiryDate * 1000 - Date.now()) / (1000 * 60 * 60 * 24)), // Convert to milliseconds and calculate days until expiry
    }));
  } catch (error) {
    console.error("Error fetching expiring ENS names:", error);
    throw error;
  }
}
