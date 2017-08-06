var OpenFundFactory = artifacts.require("OpenFundFactory.sol");
var OpenFund = artifacts.require("OpenFund.sol");


contract('OpenFund', function (accounts) {
  it("", function () {
    var factory,
      openfund;

    OpenFundFactory.deployed()
      .then((instance) => {
        factory = instance;
        return factory.getRepo('dsummers91', 'openfund')
      })
      .then((ofc) => {
        openfund = OpenFund.at(ofc);
        return openfund.title();
      })
      .then((title) => {
        console.log(title);
        return openfund.withdraw(web3.toWei(.03, 'ether'));
      })
  })
});
