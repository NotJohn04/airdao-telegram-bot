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
  query ExpiringDomains($first: Int!, $minLength: Int, $maxLength: Int) {
    domains(
      first: $first,
      orderBy: expiryDate,
      orderDirection: asc,
      where: { 
        name_not: null, 
        labelName_not: null,
        labelName_gt: $minLength
        labelName_lt: $maxLength
      }
    ) {
      id
      name
      labelName
      expiryDate
    }
  }
`;