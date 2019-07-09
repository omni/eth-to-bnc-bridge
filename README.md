### Ethereum to Binance Chain bridge demo

https://forum.poa.network/t/ethereum-to-binance-chain-bridge/2696

#### Running demo:
1) Build tss from local source.  
```docker build -t tss -f ./src/tss/Dockerfile-local ./src/tss```
2) Run test environment (home and side blockchains, contracts deployment)
```./demo/start-environment.sh```
3) Run three validators in separate terminal sessions   
```N=1 ./demo/validator-demo.sh```  
```N=2 ./demo/validator-demo.sh```  
```N=3 ./demo/validator-demo.sh```
