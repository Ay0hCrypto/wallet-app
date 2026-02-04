import React, { memo, useMemo } from 'react'
import { BoxProps } from '@shopify/restyle'
import { useTranslation } from 'react-i18next'
import { useTextVariants, useColors } from '@theme/themeHooks'
import { Theme } from '@theme/theme'
import { useSelector } from 'react-redux'
import { ScrollView } from 'react-native'
import usePrevious from '@hooks/usePrevious'
import Box from './Box'
import { useAppStorage } from '../storage/AppStorageProvider'
import { RootState } from '../store/rootReducer'
import Text from './Text'

type Props = BoxProps<Theme>
const TokenPricesTicker = ({ ...boxProps }: Props) => {
  const { t } = useTranslation()
  const { body2 } = useTextVariants()
  const colors = useColors()
  const { currency: currencyRaw } = useAppStorage()
  const currency = useMemo(() => currencyRaw.toLowerCase(), [currencyRaw])
  const tokenPrices = useSelector(
    (state: RootState) => state.balances.tokenPrices,
  )
  const previousPrices = usePrevious(tokenPrices)

  const textStyle = useMemo(
    () => ({ ...body2, fontSize: 16, color: colors.secondaryText }),
    [body2, colors],
  )

  const priceEntries = useMemo(() => {
    if (!tokenPrices) {
      return [
        {
          symbol: t('generic.noData'),
          price: undefined,
          direction: 'neutral' as const,
        },
      ]
    }

    const current = {
      HNT: tokenPrices?.helium[currency],
      SOL: tokenPrices?.solana[currency],
      MOBILE: tokenPrices['helium-mobile'][currency],
      IOT: tokenPrices['helium-iot'][currency],
    }

    const previous = {
      HNT: previousPrices?.helium?.[currency],
      SOL: previousPrices?.solana?.[currency],
      MOBILE: previousPrices?.['helium-mobile']?.[currency],
      IOT: previousPrices?.['helium-iot']?.[currency],
    }

    return Object.entries(current)
      .filter(([, price]) => price)
      .map(([symbol, price]) => {
        const prev = previous[symbol as keyof typeof previous]
        let direction: 'up' | 'down' | 'neutral' = 'neutral'
        if (typeof prev === 'number' && typeof price === 'number') {
          if (price > prev) direction = 'up'
          if (price < prev) direction = 'down'
        }
        return { symbol, price, direction }
      })
  }, [currency, previousPrices, t, tokenPrices])

  const getPriceColor = useMemo(() => {
    return (direction: 'up' | 'down' | 'neutral') => {
      if (direction === 'up') return colors.priceUp
      if (direction === 'down') return colors.priceDown
      return colors.secondaryText
    }
  }, [colors.priceDown, colors.priceUp, colors.secondaryText])

  return (
    <Box {...boxProps}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Box flexDirection="row" alignItems="center">
          {priceEntries.map(({ symbol, price, direction }, index) => (
            <Box key={`${symbol}-${price}`} flexDirection="row">
              <Text
                style={textStyle}
                color={getPriceColor(direction)}
                marginRight="s"
              >
                {price ? `${symbol} = $${price}` : symbol}
              </Text>
              {index < priceEntries.length - 1 && (
                <Text style={textStyle} marginRight="s">
                  •
                </Text>
              )}
            </Box>
          ))}
        </Box>
      </ScrollView>
    </Box>
  )
}

export default memo(TokenPricesTicker)
