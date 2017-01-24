# Openfund

This project was generated with [angular-cli](https://github.com/angular/angular-cli) version 1.0.0-beta.21.

## Development server
Run `testrpc --mnemonic "openfund" --accounts 50` for a local ethereum network (port 8545)
Run `node bridge -a 49`
Run `npm start` for a dev server. Navigate to `http://localhost:4200/`. The app will automatically reload if you change any of the source files.
Run `truffle migrate` to deploy comtracts to the environment

Currently the addresses do not automatically set. So Copyt the address for OpenFund contract that you received in truffle migrate, then add that in the '/src/app/project/project-home.component.ts' file;