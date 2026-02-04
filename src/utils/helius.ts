import axios from 'axios'
import Config from 'react-native-config'
import { Connection, Transaction, VersionedTransaction } from '@solana/web3.js'
import bs58 from 'bs58'

type HeliusSendResponse = {
  result: string
}

const DEFAULT_HELIUS_RPC = 'https://mainnet.helius-rpc.com/'

const buildHeliusRpcUrl = (rpcUrl: string) => {
  const url = new URL(rpcUrl)
  const rebateAddress = Config.HELIUS_REBATE_WALLET

  if (Config.HELIUS_API_KEY && !url.searchParams.get('api-key')) {
    url.searchParams.set('api-key', Config.HELIUS_API_KEY)
  }

  if (rebateAddress) {
    url.searchParams.set('rebate-address', rebateAddress)
  }

  return url.toString()
}

export const sendHeliusBackrunTransaction = async ({
  connection,
  transaction,
}: {
  connection: Connection
  transaction: Transaction | VersionedTransaction
}) => {
  const rpcUrl =
    Config.MAINNET_RPC_URL || connection.rpcEndpoint || DEFAULT_HELIUS_RPC
  if (!rpcUrl) {
    throw new Error('Missing Helius RPC URL')
  }

  const encoded = bs58.encode(transaction.serialize())
  const { data } = await axios.post<HeliusSendResponse>(
    buildHeliusRpcUrl(rpcUrl),
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [
        encoded,
        {
          encoding: 'base58',
          skipPreflight: true,
          preflightCommitment: 'processed',
        },
      ],
    },
  )

  const signature = data?.result
  if (!signature) {
    throw new Error('No signature returned from Helius')
  }

  await connection.confirmTransaction(signature, 'confirmed')
  return signature
}
