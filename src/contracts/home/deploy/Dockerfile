FROM node:10.16.0-alpine

WORKDIR /build

RUN apk --no-cache add build-base python git

RUN npm install -g truffle@5.1.5

RUN truffle obtain --solc 0.5.9

COPY ./package.json ./
RUN npm install --only=prod

COPY ./truffle-config.js ./
COPY contracts ./contracts

RUN truffle compile

COPY ./deploy/truffle-config.js ./
COPY migrations ./migrations

ENTRYPOINT ["truffle", "deploy"]
