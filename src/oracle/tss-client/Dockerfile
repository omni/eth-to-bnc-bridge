FROM ubuntu:19.10

WORKDIR /tss

RUN apt-get update && \
    apt-get install -y libssl1.1 libssl-dev curl

COPY params /tss/

COPY --from=tss /tss/target/release/gg18_sign_client /tss/

ENTRYPOINT ["./gg18_sign_client"]
