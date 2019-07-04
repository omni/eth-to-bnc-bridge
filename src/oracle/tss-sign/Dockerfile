FROM node:10.16.0-slim

WORKDIR /tss

RUN apt-get update && \
    apt-get install -y libssl1.1 libssl-dev curl python make g++ libudev-dev libusb-dev usbutils
#apk packages: libssl1.1 eudev-dev libressl-dev curl build-base python linux-headers libusb-dev

COPY package.json /tss/

RUN npm install --no-optional

COPY sign-entrypoint.sh signer.js tx.js /tss/

COPY --from=tss /tss/target/release/gg18_sign_client /tss/

ENTRYPOINT ["node", "signer.js"]
