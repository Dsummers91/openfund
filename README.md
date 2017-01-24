# Openfund

This project was generated with [angular-cli](https://github.com/angular/angular-cli) version 1.0.0-beta.21.

## Development server  
You will need to have **4** terminal windows active
1. Run `testrpc --mnemonic "openfund" --accounts 50` for a local network (port 8545)  
2. Go to ethereum bridge directory `cd ethereum-bridge1` then run `node bridge -a 49`  
3. Run `npm start` for a dev server.    
4. Run `truffle migrate` to deploy contracts to the environment  

Currently the addresses do not automatically set. So copy the address for OpenFund contract that you received in truffle migrate, then add that in the '/src/app/project/project-home.component.ts' file;  
Finally, navigate to `http://localhost:4200/`. The app will automatically reload if you change any of the source files.  
