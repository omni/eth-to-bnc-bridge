FROM ubuntu:19.10

WORKDIR /tss

COPY Rocket.toml params /tss/

COPY --from=tss /tss/target/release/sm_manager /tss/

ENTRYPOINT ["./sm_manager"]

EXPOSE 8001