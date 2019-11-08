FROM node:10.16.0-alpine

WORKDIR /api-server

COPY ./package.json ./

RUN npm install

COPY ./index.js ./

ENTRYPOINT ["node", "./index.js"]
