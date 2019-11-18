FROM alpine:3.9.4

ARG BNC_VERSION=0.6.2

WORKDIR /bnc

COPY --from=testnet-binaries /binaries/fullnode/testnet/${BNC_VERSION}/linux/bnbchaind ./
COPY --from=testnet-binaries /binaries/cli/testnet/${BNC_VERSION}/linux/tbnbcli ./
COPY --from=testnet-binaries /binaries/mytestnet/node0/gaiacli /root/.bnbcli
COPY --from=testnet-binaries /binaries/mytestnet/node0/gaiad /root/.bnbchaind

EXPOSE 26657

ENTRYPOINT ["./bnbchaind", "start"]
