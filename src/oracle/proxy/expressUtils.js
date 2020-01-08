const BN = require('bignumber.js')
const ethers = require('ethers')

const logger = require('../shared/logger')

function parseNumber(fromQuery, field, defaultValue = null) {
  return (req, res, next) => {
    const source = fromQuery ? req.query : req.params
    if (/^[0-9]+$/.test(source[field])) {
      req[field] = parseInt(source[field], 10)
      logger.trace(`Set req.${field} to ${req[field]}`)
      next()
    } else if (!source[field] && defaultValue !== null) {
      req[field] = defaultValue
      logger.trace(`Set req.${field} to ${defaultValue}`)
      next()
    } else {
      res.status(400).end()
    }
  }
}

function parseTokens(field) {
  return (req, res, next) => {
    if (/^[0-9]+(\.[0-9]{1,8})?$/.test(req.params[field])) {
      req[field] = new BN(req.params[field]).multipliedBy('1e18').toString(16)
      logger.trace(`Set req.${field} to ${req[field]}`)
      next()
    } else {
      res.status(400).end()
    }
  }
}

function parseAddress(field) {
  return (req, res, next) => {
    logger.debug(`${field} %o`, req.params)
    if (ethers.utils.isHexString(req.params[field], 20)) {
      req[field] = req.params[field]
      logger.trace(`Set req.${field} to ${req[field]}`)
      next()
    } else {
      res.status(400).end()
    }
  }
}

function parseBool(field) {
  return (req, res, next) => {
    if (req.params[field] === 'true' || req.params[field] === 'false') {
      req[field] = req.params[field] === 'true'
      logger.trace(`Set req.${field} to ${req[field]}`)
      next()
    } else {
      res.status(400).end()
    }
  }
}

function logRequest(req, res, next) {
  logger.debug(`${req.method} request to ${req.originalUrl}`)
  if (req.query && Object.keys(req.query).length > 0) {
    logger.trace('Request query: %o', req.query)
  }
  if (req.body && Object.keys(req.body).length > 0) {
    logger.trace('Request body: %o', req.body)
  }
  next()
}

module.exports = {
  parseNumber,
  parseAddress,
  parseTokens,
  parseBool,
  logRequest
}
