import axios from 'axios'
import Config from 'react-native-config'
import { Connection, Transaction, VersionedTransaction } from '@solana/web3.js'

type HeliusSendResponse = {
  result: string
}

const getHeliusApiUrl = () =>
  Config.HELIUS_API_URL || 'https://api.helius.xyz'

export const sendHeliusBackrunTransaction = async ({
  connection,
  transaction,
}: {
  connection: Connection
  transaction: Transaction | VersionedTransaction
}) => {
  const apiKey = Config.HELIUS_API_KEY
  if (!apiKey) {
    throw new Error('Missing Helius API key')
  }

  const serialized = transaction.serialize()
  const encoded = Buffer.from(serialized).toString('base64')

  const { data } = await axios.post<HeliusSendResponse>(
    `${getHeliusApiUrl()}/v0/transactions?api-key=${apiKey}`,
    {
      transactions: [encoded],
      skipPreflight: true,
      maxRetries: 0,
    },
  )

  const signature = data?.result
  if (!signature) {
    throw new Error('No signature returned from Helius')
  }

  await connection.confirmTransaction(signature, 'confirmed')
  return signature
}
