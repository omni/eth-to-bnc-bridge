FROM node:10.16.0-slim

WORKDIR /tss

RUN apt-get update && \
    apt-get install -y --no-install-recommends libssl-dev python make g++ libudev-dev usbutils procps && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY ./tss-sign/package.json ./

RUN npm install --no-optional

COPY --from=tss /tss/target/release/examples/gg18_sign_client ./

COPY ./tss-sign/sign-entrypoint.sh ./
COPY ./tss-sign/index.js ./tss-sign/tx.js ./src/
COPY ./shared/logger.js ./shared/amqp.js ./shared/crypto.js ./shared/wait.js ./shared/binanceClient.js ./shared/

ENTRYPOINT ["node", "src/index.js"]
