var OpenFundFactory = artifacts.require("OpenFundFactory.sol");
var OpenFund = artifacts.require("OpenFund.sol");
module.exports = function(deployer) {
  deployer.deploy(OpenFundFactory);
  deployer.deploy(OpenFund);
};
