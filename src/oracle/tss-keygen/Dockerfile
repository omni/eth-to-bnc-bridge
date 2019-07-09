FROM node:10.16.0-slim

WORKDIR /tss

RUN apt-get update && \
    apt-get install -y libssl1.1 libssl-dev curl procps

COPY package.json /tss/

RUN npm install

COPY keygen-entrypoint.sh keygen.js /tss/

COPY --from=tss /tss/target/release/gg18_keygen_client /tss/

RUN mkdir /keys

ENTRYPOINT ["node", "keygen.js"]
