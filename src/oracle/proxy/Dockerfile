FROM node:10.16.0-alpine

WORKDIR /proxy

COPY package.json /proxy/

RUN npm install

COPY index.js encode.js decode.js /proxy/

ENTRYPOINT ["node", "index.js"]
