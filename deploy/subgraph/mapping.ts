import {
  TokenCreated,
} from "../generated/BondingCurveFactory/BondingCurveFactory"
import {
  TokenBought,
  TokenSold,
  DexListed,
} from "../generated/templates/BondingCurve/BondingCurve"
import {
  Token,
  Trade,
} from "../generated/schema"
import {
  BondingCurve as BondingCurveTemplate,
} from "../generated/templates"
import { BigDecimal, BigInt, Bytes } from "@graphprotocol/graph-ts"

export function handleTokenCreated(event: TokenCreated): void {
  let token = new Token(event.params.tokenAddress.toHexString())

  token.address = event.params.tokenAddress
  token.name = event.params.name
  token.symbol = event.params.symbol
  token.creator = event.params.creator
  token.curveAddress = event.params.curveAddress
  token.totalSupply = BigInt.fromI32(0)
  token.marketCapBnb = BigDecimal.zero()
  token.reserveBnb = BigDecimal.zero()
  token.priceBnb = BigDecimal.zero()
  token.isListedOnDex = false
  token.createdAt = event.block.timestamp.toI32()
  token.txCount = 0
  token.holderCount = 0
  token.volumeBnb = BigDecimal.zero()

  token.save()

  BondingCurveTemplate.create(event.params.curveAddress)
}

export function handleTokenBought(event: TokenBought): void {
  let tokenId = event.params.tokenAddress.toHexString()
  let token = Token.load(tokenId)
  if (token == null) return

  token.txCount = token.txCount + 1
  token.reserveBnb = token.reserveBnb.plus(
    event.params.bnbAmount.toBigDecimal()
  )
  token.save()

  let tradeId = event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  let trade = new Trade(tradeId)

  trade.token = tokenId
  trade.trader = event.params.buyer
  trade.type = "BUY"
  trade.tokenAmount = event.params.tokenAmount
  trade.bnbAmount = event.params.bnbAmount.toBigDecimal()
  trade.price = event.params.bnbAmount.toBigDecimal().div(
    event.params.tokenAmount.toBigDecimal()
  )
  trade.timestamp = event.block.timestamp.toI32()
  trade.blockNumber = event.block.number.toI32()
  trade.transactionHash = event.transaction.hash

  trade.save()
}

export function handleTokenSold(event: TokenSold): void {
  let tokenId = event.params.tokenAddress.toHexString()
  let token = Token.load(tokenId)
  if (token == null) return

  token.txCount = token.txCount + 1
  token.reserveBnb = token.reserveBnb.minus(
    event.params.bnbAmount.toBigDecimal()
  )
  token.save()

  let tradeId = event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  let trade = new Trade(tradeId)

  trade.token = tokenId
  trade.trader = event.params.seller
  trade.type = "SELL"
  trade.tokenAmount = event.params.tokenAmount
  trade.bnbAmount = event.params.bnbAmount.toBigDecimal()
  trade.price = event.params.bnbAmount.toBigDecimal().div(
    event.params.tokenAmount.toBigDecimal()
  )
  trade.timestamp = event.block.timestamp.toI32()
  trade.blockNumber = event.block.number.toI32()
  trade.transactionHash = event.transaction.hash

  trade.save()
}

export function handleDexListed(event: DexListed): void {
  let tokenId = event.params.tokenAddress.toHexString()
  let token = Token.load(tokenId)
  if (token == null) return

  token.isListedOnDex = true
  token.save()
}
