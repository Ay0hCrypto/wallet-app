import React, { useCallback, useMemo, useState } from 'react'
import { RouteProp, useRoute } from '@react-navigation/native'
import { Linking } from 'react-native'
import bs58 from 'bs58'
import nacl from 'tweetnacl'
import { useTranslation } from 'react-i18next'
import Box from '@components/Box'
import Text from '@components/Text'
import SubmitButton from '@components/SubmitButton'
import TouchableOpacityBox from '@components/TouchableOpacityBox'
import { useAccountStorage } from '@storage/AccountStorageProvider'
import { RootStackParamList } from '../../navigation/rootTypes'
import { getSolanaKeypair } from '../../storage/secureStorage'

type Route = RouteProp<RootStackParamList, 'MwaConnectScreen'>

const MwaConnectScreen = () => {
  const { t } = useTranslation()
  const { params } = useRoute<Route>()
  const { currentAccount } = useAccountStorage()
  const [loading, setLoading] = useState(false)

  const requestDetails = useMemo(() => {
    if (!params) return
    const {
      dapp_encryption_public_key: dappKey,
      redirect_link: redirectLink,
      app_url: appUrl,
      cluster,
    } = params
    return { dappKey, redirectLink, appUrl, cluster }
  }, [params])

  const handleReject = useCallback(async () => {
    if (!requestDetails?.redirectLink) return
    const url = `${requestDetails.redirectLink}?error=access_denied`
    await Linking.openURL(url)
  }, [requestDetails])

  const handleApprove = useCallback(async () => {
    if (!requestDetails?.redirectLink || !requestDetails?.dappKey) return
    if (!currentAccount?.solanaAddress) return

    setLoading(true)
    try {
      const dappKey = bs58.decode(requestDetails.dappKey)
      const walletKeypair = await getSolanaKeypair(currentAccount.address)
      if (!walletKeypair?.secretKey) throw new Error('Missing wallet keypair')

      const sessionKeypair = nacl.box.keyPair()
      const nonce = nacl.randomBytes(24)
      const sharedSecret = nacl.box.before(dappKey, sessionKeypair.secretKey)

      const signature = nacl.sign.detached(dappKey, walletKeypair.secretKey)
      const payload = JSON.stringify({
        public_key: currentAccount.solanaAddress,
        session: bs58.encode(nacl.randomBytes(32)),
        signature: bs58.encode(signature),
      })

      const encrypted = nacl.box.after(
        Buffer.from(payload),
        nonce,
        sharedSecret,
      )

      const url = `${requestDetails.redirectLink}?wallet_encryption_public_key=${bs58.encode(
        sessionKeypair.publicKey,
      )}&nonce=${bs58.encode(nonce)}&data=${bs58.encode(encrypted)}`

      await Linking.openURL(url)
    } finally {
      setLoading(false)
    }
  }, [currentAccount, requestDetails])

  if (!requestDetails) {
    return (
      <Box flex={1} alignItems="center" justifyContent="center" padding="l">
        <Text variant="body1" color="primaryText">
          {t('mwa.invalidRequest')}
        </Text>
      </Box>
    )
  }

  return (
    <Box flex={1} padding="l" backgroundColor="primaryBackground">
      <Text variant="h3" color="primaryText" marginBottom="m">
        {t('mwa.title')}
      </Text>
      <Text variant="body2" color="secondaryText" marginBottom="m">
        {t('mwa.subtitle', {
          appUrl: requestDetails.appUrl || t('mwa.unknownApp'),
          cluster: requestDetails.cluster || 'mainnet-beta',
        })}
      </Text>
      <SubmitButton
        title={t('mwa.approve')}
        onSubmit={handleApprove}
        disabled={loading}
      />
      <TouchableOpacityBox
        onPress={handleReject}
        marginTop="m"
        padding="m"
        borderRadius="l"
        borderWidth={1}
        borderColor="border"
        alignItems="center"
      >
        <Text variant="body2" color="secondaryText">
          {t('mwa.reject')}
        </Text>
      </TouchableOpacityBox>
    </Box>
  )
}

export default MwaConnectScreen
