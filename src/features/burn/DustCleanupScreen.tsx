import Box from '@components/Box'
import SubmitButton from '@components/SubmitButton'
import Text from '@components/Text'
import TouchableOpacityBox from '@components/TouchableOpacityBox'
import CheckmarkFill from '@assets/images/checkmarkFill.svg'
import { useAccountStorage } from '@storage/AccountStorageProvider'
import { useTranslation } from 'react-i18next'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { FlatList } from 'react-native'
import { useSelector } from 'react-redux'
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js'
import { createCloseAccountInstruction } from '@solana/spl-token'
import { useSolana } from '../../solana/SolanaProvider'
import TokenIcon from '@components/TokenIcon'
import { useMetaplexMetadata } from '@hooks/useMetaplexMetadata'
import useAlert from '@hooks/useAlert'
import { useBalance } from '@utils/Balance'
import {
  CLEANUP_FEE_LAMPORTS,
  CLEANUP_FEE_WALLET,
  DUST_MAX_USD,
  Mints,
} from '@utils/constants'
import { RootState } from '../../store/rootReducer'
import { useAppStorage } from '../../storage/AppStorageProvider'
import { syncTokenAccounts } from '../../store/slices/balancesSlice'
import { useAppDispatch } from '../../store/store'

type DustAccount = {
  tokenAccount: string
  mint: string
  balance: number
  decimals: number
  usdValue?: number
  isEmpty: boolean
  isDust: boolean
}

const MAX_CLOSE_ACCOUNTS = 12

const DustAccountRow = ({
  item,
  selected,
  onToggle,
}: {
  item: DustAccount
  selected: boolean
  onToggle: (tokenAccount: string) => void
}) => {
  const { t } = useTranslation()
  const { json, symbol, loading } = useMetaplexMetadata(new PublicKey(item.mint))

  return (
    <TouchableOpacityBox
      onPress={() => onToggle(item.tokenAccount)}
      flexDirection="row"
      alignItems="center"
      padding="m"
      borderRadius="l"
      borderWidth={1}
      borderColor="border"
      marginBottom="s"
      backgroundColor="surface"
    >
      {loading ? (
        <Box
          width={36}
          height={36}
          borderRadius="round"
          backgroundColor="surfaceSecondary"
        />
      ) : (
        <TokenIcon img={json?.image} size={36} />
      )}
      <Box marginLeft="m" flex={1}>
        <Text variant="body1" color="primaryText">
          {symbol || item.mint.slice(0, 6)}
        </Text>
        <Text variant="body3" color="secondaryText">
          {item.isEmpty
            ? t('dustCleanup.emptyAccount')
            : item.usdValue
            ? t('dustCleanup.valueLabel', {
                amount: item.usdValue.toFixed(2),
              })
            : t('dustCleanup.valueUnavailable')}
        </Text>
      </Box>
      <Box
        width={24}
        height={24}
        borderRadius="round"
        alignItems="center"
        justifyContent="center"
        borderWidth={1}
        borderColor="border"
        backgroundColor={selected ? 'highlight' : 'transparent'}
      >
        {selected && <CheckmarkFill width={16} height={16} />}
      </Box>
    </TouchableOpacityBox>
  )
}

const DustCleanupScreen = () => {
  const { t } = useTranslation()
  const { currentAccount } = useAccountStorage()
  const { tokenAccounts } = useBalance()
  const { cluster, anchorProvider, connection } = useSolana()
  const { currency: currencyRaw } = useAppStorage()
  const currency = useMemo(() => currencyRaw.toLowerCase(), [currencyRaw])
  const dispatch = useAppDispatch()
  const { showOKAlert } = useAlert()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [estimatedReturnLamports, setEstimatedReturnLamports] = useState<
    number | undefined
  >(undefined)
  const [submitting, setSubmitting] = useState(false)
  const tokenPrices = useSelector(
    (state: RootState) => state.balances.tokenPrices,
  )

  const priceMap = useMemo(() => {
    return {
      [Mints.SOL]: tokenPrices?.solana?.[currency],
      [Mints.HNT]: tokenPrices?.helium?.[currency],
      [Mints.IOT]: tokenPrices?.['helium-iot']?.[currency],
      [Mints.MOBILE]: tokenPrices?.['helium-mobile']?.[currency],
    } as Record<string, number | undefined>
  }, [currency, tokenPrices])

  const dustAccounts = useMemo(() => {
    if (!tokenAccounts) return []

    return tokenAccounts
      .map((account) => {
        const price = priceMap[account.mint]
        const amount = account.balance / 10 ** account.decimals
        const usdValue =
          typeof price === 'number' ? price * amount : undefined
        const isEmpty = account.balance === 0
        const isDust =
          typeof usdValue === 'number' &&
          usdValue > 0 &&
          usdValue < DUST_MAX_USD

        return {
          tokenAccount: account.tokenAccount,
          mint: account.mint,
          balance: account.balance,
          decimals: account.decimals,
          usdValue,
          isEmpty,
          isDust,
        }
      })
      .filter((account) => account.isEmpty || account.isDust)
  }, [priceMap, tokenAccounts])

  const selectedAccounts = useMemo(() => [...selected], [selected])

  const toggleAccount = useCallback((tokenAccount: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(tokenAccount)) {
        next.delete(tokenAccount)
      } else {
        next.add(tokenAccount)
      }
      return next
    })
  }, [])

  useEffect(() => {
    let active = true
    if (!connection || selectedAccounts.length === 0) {
      setEstimatedReturnLamports(undefined)
      return
    }

    const fetchRent = async () => {
      const infos = await connection.getMultipleAccountsInfo(
        selectedAccounts.map((account) => new PublicKey(account)),
      )
      if (!active) return

      const rentLamports = infos.reduce(
        (sum, info) => sum + (info?.lamports || 0),
        0,
      )
      const netLamports = Math.max(rentLamports - CLEANUP_FEE_LAMPORTS, 0)
      setEstimatedReturnLamports(netLamports)
    }

    fetchRent()

    return () => {
      active = false
    }
  }, [connection, selectedAccounts])

  const estimatedReturn = useMemo(() => {
    if (estimatedReturnLamports === undefined) return undefined
    return (estimatedReturnLamports / LAMPORTS_PER_SOL).toFixed(6)
  }, [estimatedReturnLamports])

  const handleCloseAccounts = useCallback(async () => {
    if (
      !anchorProvider ||
      !currentAccount?.solanaAddress ||
      !connection ||
      selectedAccounts.length === 0
    )
      return

    if (selectedAccounts.length > MAX_CLOSE_ACCOUNTS) {
      await showOKAlert({
        title: t('dustCleanup.tooMany.title'),
        message: t('dustCleanup.tooMany.message', {
          max: MAX_CLOSE_ACCOUNTS,
        }),
      })
      return
    }

    try {
      setSubmitting(true)
      const owner = new PublicKey(currentAccount.solanaAddress)
      const feeWallet = new PublicKey(CLEANUP_FEE_WALLET)
      const transaction = new Transaction()

      transaction.add(
        SystemProgram.transfer({
          fromPubkey: owner,
          toPubkey: feeWallet,
          lamports: CLEANUP_FEE_LAMPORTS,
        }),
      )

      selectedAccounts.forEach((tokenAccount) => {
        transaction.add(
          createCloseAccountInstruction(
            new PublicKey(tokenAccount),
            owner,
            owner,
          ),
        )
      })

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash()
      transaction.recentBlockhash = blockhash
      transaction.feePayer = owner

      const signed = await anchorProvider.wallet.signTransaction(transaction)
      const signature = await connection.sendRawTransaction(
        signed.serialize(),
      )
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed',
      )

      await dispatch(
        syncTokenAccounts({ cluster, acct: currentAccount, anchorProvider }),
      )

      setSelected(new Set())
      await showOKAlert({
        title: t('dustCleanup.success.title'),
        message: t('dustCleanup.success.message'),
      })
    } catch (error) {
      await showOKAlert({
        title: t('dustCleanup.error.title'),
        message: (error as Error)?.message ?? t('generic.error'),
      })
    } finally {
      setSubmitting(false)
    }
  }, [
    anchorProvider,
    cluster,
    connection,
    currentAccount,
    dispatch,
    selectedAccounts,
    showOKAlert,
    t,
  ])

  return (
    <Box flex={1} padding="l" backgroundColor="primaryBackground">
      <Text variant="h3" color="primaryText" marginBottom="s">
        {t('dustCleanup.title')}
      </Text>
      <Text variant="body2" color="secondaryText" marginBottom="m">
        {t('dustCleanup.subtitle', { limit: DUST_MAX_USD })}
      </Text>

      <FlatList
        data={dustAccounts}
        keyExtractor={(item) => item.tokenAccount}
        renderItem={({ item }) => (
          <DustAccountRow
            item={item}
            selected={selected.has(item.tokenAccount)}
            onToggle={toggleAccount}
          />
        )}
        ListEmptyComponent={
          <Box padding="l" borderRadius="l" backgroundColor="surfaceSecondary">
            <Text variant="body2" color="secondaryText">
              {t('dustCleanup.empty')}
            </Text>
          </Box>
        }
      />

      <Box paddingTop="m">
        {estimatedReturn && (
          <Text variant="body2" color="secondaryText" marginBottom="s">
            {t('dustCleanup.estimatedReturn', { amount: estimatedReturn })}
          </Text>
        )}
        <SubmitButton
          title={t('dustCleanup.close')}
          disabled={selectedAccounts.length === 0}
          loading={submitting}
          onPress={handleCloseAccounts}
        />
      </Box>
    </Box>
  )
}

export default DustCleanupScreen
