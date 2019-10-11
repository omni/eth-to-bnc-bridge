FROM node:10.16.0-alpine

WORKDIR /test

COPY package.json /test/

RUN npm install

COPY resetToBlock.js /test/

ENTRYPOINT ["node", "resetToBlock.js"]
