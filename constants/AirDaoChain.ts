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
      http: ['https://testnet-rpc.airdao.io/'],
    },
  },
  blockExplorers: {
    default: { name: 'Explorer', url: 'https://testnet.airdao.io/explorer' },
  },

})


export const airDaoMainnet = defineChain({
    id: 16718,
    name: 'AirDao Mainnet',
    nativeCurrency: {
      decimals: 18,
      name: 'Ambrosus',
      symbol: 'AMB',
    },
    rpcUrls: {
      default: {
        http: ['https://network.ambrosus.io'],
      },
    },
    blockExplorers: {
      default: { name: 'Explorer', url: 'https://airdao.io/explorer' },
    },
  
  })