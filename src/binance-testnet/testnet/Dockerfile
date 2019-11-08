FROM ubuntu:19.10 as build

ARG BNC_VERSION=0.6.2

RUN apt-get update && \
    apt-get install -y git git-lfs

WORKDIR /binaries

RUN GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 https://github.com/binance-chain/node-binary.git .

RUN git lfs pull -I fullnode/testnet/${BNC_VERSION}/linux
RUN git lfs pull -I cli/testnet/${BNC_VERSION}/linux

RUN ./fullnode/testnet/${BNC_VERSION}/linux/bnbchaind testnet --acc-prefix tbnb --chain-id Binance-Dev --v 1

RUN sed -i "s/publishTransfer = false/publishTransfer = true/" ./mytestnet/node0/gaiad/config/app.toml && \
    sed -i "s/publishLocal = false/publishLocal = true/" ./mytestnet/node0/gaiad/config/app.toml

#echo 12345678 | docker exec -i 5f6f653730442d81b6e34a82ac3dc8a82f071c1eec130bc09a0dca803ad00bd2 ./tbnbcli send --to tbnb1efjg7xt98t67ql2cmwjc5860lgayet9l8m55ym --amount 100:BNB --from node0 --chain-id Binance-Dev --json

FROM alpine:3.9.4

ARG BNC_VERSION=0.6.2

WORKDIR /bnc

COPY --from=build /binaries/fullnode/testnet/${BNC_VERSION}/linux/bnbchaind ./
COPY --from=build /binaries/cli/testnet/${BNC_VERSION}/linux/tbnbcli ./
COPY --from=build /binaries/mytestnet/node0/gaiacli /root/.bnbcli
COPY --from=build /binaries/mytestnet/node0/gaiad /root/.bnbchaind

EXPOSE 26657

ENTRYPOINT ["./bnbchaind", "start"]
