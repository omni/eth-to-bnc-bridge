#echo 12345678 | docker exec -i 5f6f653730442d81b6e34a82ac3dc8a82f071c1eec130bc09a0dca803ad00bd2 ./tbnbcli send --to tbnb1efjg7xt98t67ql2cmwjc5860lgayet9l8m55ym --amount 100:BNB --from node0 --chain-id Binance-Dev --json
FROM alpine:3.9.4

ARG BNC_VERSION=0.6.2

WORKDIR /bnc

COPY --from=testnet-binaries /binaries/fullnode/testnet/${BNC_VERSION}/linux/bnbchaind ./
COPY --from=testnet-binaries /binaries/cli/testnet/${BNC_VERSION}/linux/tbnbcli ./
COPY --from=testnet-binaries /binaries/mytestnet/node0/gaiacli /root/.bnbcli
COPY --from=testnet-binaries /binaries/mytestnet/node0/gaiad /root/.bnbchaind

EXPOSE 26657

ENTRYPOINT ["./bnbchaind", "start"]
