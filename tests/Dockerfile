FROM node:10.16.0-alpine

WORKDIR /tests

RUN npm install -g mocha

COPY ./package.json .

RUN npm install

COPY config.json ./
COPY test ./test

ENTRYPOINT ["mocha"]
