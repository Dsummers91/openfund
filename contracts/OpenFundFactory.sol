pragma solidity ^0.4.13;

import './usingOraclize.sol';
import './strings.sol';
import './OpenFund.sol';

contract OpenFundFactory is usingOraclize {
  using strings for *;
  address public _owner;
  mapping (string => mapping(string => address)) _repositories;
  string public _repo;
  string public _user;
  address public _address;
  uint public _balance;
  string  public _title;
  uint256 public _withdrawAmount;

  function OpenFundFactory() {

  }

  function addRepo(string user, string repo) {
    address openfund = new OpenFund(user, repo);
    _repositories[user][repo] = openfund;
  }

  function getRepo(string user, string repo) returns (address) {
    return _repositories[user][repo];
  }

  function __callback(bytes32 myid, string result) {
      if (msg.sender != oraclize_cbAddress()) throw;
      _address = parseAddr(result);
      if (!_address.send(_withdrawAmount)) throw;
  }

  function withdraw(uint value) {
   strings.slice memory url = "json(https://raw.githubusercontent.com/Dsummers91/openfund/master/".toSlice();
    url = url.concat(_repo.toSlice()).toSlice();
    url = url.concat(".json).address".toSlice()).toSlice();
    _withdrawAmount = value;
    oraclize_query("URL", url.toString());
  }
}