FROM redis:5.0.5-alpine

COPY ./redis/redis.conf /usr/local/etc/redis/

CMD ["redis-server", "/usr/local/etc/redis/redis.conf"]
