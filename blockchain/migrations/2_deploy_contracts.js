var OpenFundFactory = artifacts.require("OpenFundFactory.sol");

module.exports = function(deployer) {
  deployer.deploy(OpenFundFactory);
};
