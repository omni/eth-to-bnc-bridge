FROM node:10.16.0-slim

WORKDIR /tss

RUN apt-get update && \
    apt-get install -y libssl-dev python make g++ libudev-dev usbutils procps

COPY ./tss-sign/package.json /tss/

RUN npm install --no-optional

COPY ./tss-sign/sign-entrypoint.sh ./tss-sign/signer.js ./tss-sign/tx.js ./shared/logger.js ./shared/amqp.js ./shared/crypto.js ./shared/wait.js ./shared/binanceClient.js /tss/

COPY --from=tss /tss/target/release/gg18_sign_client /tss/

ENTRYPOINT ["node", "signer.js"]
