FROM node:10.16.0-alpine

ARG BNC_VERSION=0.6.2

WORKDIR /api-server

COPY --from=testnet-binaries /binaries/cli/testnet/${BNC_VERSION}/linux/tbnbcli ./

RUN echo 12345678 | ./tbnbcli keys add key

EXPOSE 8080

ENTRYPOINT ["./tbnbcli", "api-server", "--chain-id", "Binance-Dev", "--node", "http://node:26657", "--laddr", "tcp://0.0.0.0:8080"]
