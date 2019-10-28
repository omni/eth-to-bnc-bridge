FROM node:10.16.0-alpine

WORKDIR /tests

RUN npm install -g mocha mocha-junit-reporter mocha-multi-reporters

RUN apk update && apk add libssl1.1 eudev-dev libressl-dev curl build-base python linux-headers libusb-dev

COPY ./package.json .

RUN npm install

COPY config.json .mocharc.yml reportersConfig.json ./
COPY test ./test

ENTRYPOINT ["mocha"]
