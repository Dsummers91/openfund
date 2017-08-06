var OpenFundFactory = artifacts.require("OpenFundFactory.sol");
var OpenFund = artifacts.require("OpenFund.sol");

module.exports = function(deployer) {
  var factory,
      openfund;
  OpenFundFactory.deployed()
    .then((instance) => {
      factory = instance;
      return instance.addRepo('dsummers91', 'openfund')
    })
    .then(() => {
      return factory.getRepo('dsummers91', 'openfund')
    })
    .then((ofc) => {
      openfund = OpenFund.at(ofc);
      return openfund.sendTransaction({value: web3.toWei(.03, 'ether')});
    })
    .then(() => {
      console.log(openfund.address);
      console.log('fdsfd');
      return openfund.withdraw(web3.toWei(.02, 'ether'), {gas: 2000000});
    });
};
