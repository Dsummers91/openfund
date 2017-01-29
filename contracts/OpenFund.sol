pragma solidity ^0.4.8;

import 'usingOraclize.sol';
import 'strings.sol';

contract OpenFund {
  address public _owner;
  mapping (string => mapping(string => address)) _repositories;

  function OpenFund() {

  }

  function addRepo(string user, string repo) {
    _repositories[user][repo] = new RepositoryContract(user, repo);
  }

  function getRepo(string user, string repo) returns (address) {
    return _repositories[user][repo];
  }
}

contract RepositoryContract is usingOraclize {
  using strings for *;

  address public _owner;
  string public _repo;
  string public _user;
  address public _address;
  uint public _balance;
  string  public _title;
  uint256 public _withdrawAmount;
  event Deposit(uint date, uint value, address from, address to);
  event Withdraw(uint date, uint value, address from, address to);

  function RepositoryContract(string user, string repo) {
    _owner = tx.origin;
    _repo = repo;
    _user = user;
    OAR = OraclizeAddrResolverI(0xfd06e03ef48bbac3cb73fe6b95bee212520ecbc9);
  }
  function __callback(bytes32 myid, address result) {
      if (msg.sender != oraclize_cbAddress()) throw;
      _address = result;
      if (!_address.send(_withdrawAmount)) throw;
      Withdraw(now, _withdrawAmount, this, _owner);
  }

  function withdraw(uint value) {
   strings.slice memory url = "json(https://raw.githubusercontent.com/Dsummers91/openfund/master/".toSlice();
    url = url.concat(_repo.toSlice()).toSlice();
    url = url.concat(".json).address".toSlice()).toSlice();
    _withdrawAmount = value;
    oraclize_query("URL", url.toString());
  }
  
  function() payable {
    _balance += msg.value;
    Deposit(now, msg.value, msg.sender, this);
  }

  
}