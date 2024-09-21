import { defineChain } from 'viem'
 
export const airDaoTestnet = defineChain({
  id: 22040,
  name: 'AirDao Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Ambrosus',
    symbol: 'AMB',
  },
  rpcUrls: {
    default: {
      http: ['https://network.ambrosus-test.io'],
    },
  },
  blockExplorers: {
    default: { name: 'Explorer', url: 'https://testnet.airdao.io/explorer' },
  },
})