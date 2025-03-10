import { gql } from "graphql-request";

export const ensQuery = gql`{
    domains(first: 5) {
      id
      name
      labelName
      labelhash
      expiryDate
    }
    transfers(first: 5) {
      id
      domain {
        id
      }
      blockNumber
      transactionID
    }
  }`;

export const expiringEnsQuery = gql`
  query ExpiringDomains($first: Int!, $currentDate: Int!) {
    domains(
      first: $first,
      orderBy: expiryDate,
      orderDirection: asc,
      where: { 
        expiryDate_gt: $currentDate,
      }
    ) {
      id
      name
      labelName
      expiryDate
    }
  }
`;