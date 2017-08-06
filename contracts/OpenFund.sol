pragma solidity ^0.4.13;

import './usingOraclize.sol';
import './strings.sol';

contract OpenFund is usingOraclize {
  using strings for *;

  address public _owner;
  string public _repo;
  string public _user;
  address public _address;
  uint public _balance;
  string  public _title;
  uint256 public _withdrawAmount;
  event Transaction(uint date, uint value, address from, address to);

  function OpenFund(string user, string repo) {
    _owner = tx.origin;
    _repo = repo;
    _user = user;
    OAR = OraclizeAddrResolverI(0xfd06e03ef48bbac3cb73fe6b95bee212520ecbc9);
  }
  function __callback(bytes32 myid, string result) {
      //if (msg.sender != oraclize_cbAddress()) throw;
      //_title = result;
      _address = parseAddr(result);
      if (!_address.send(_withdrawAmount)) throw;
  }

  function executeWithdrawal() {
  }

  function updateAddress() {
    
  }
  function withdraw(uint value) {
   strings.slice memory url = "json(https://raw.githubusercontent.com/Dsummers91/openfund/master/".toSlice();
    url = url.concat(_repo.toSlice()).toSlice();
    url = url.concat(".json).address".toSlice()).toSlice();
    _withdrawAmount = value;
    Transaction(now, _withdrawAmount, this, _owner);
    oraclize_query("URL", url.toString(), 900000);
  }
  
  function() payable {
    Transaction(now, msg.value, msg.sender, this);
    _balance += msg.value;
  }

  
}