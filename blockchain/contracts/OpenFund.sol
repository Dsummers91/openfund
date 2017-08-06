pragma solidity ^0.4.13;

import 'oraclize/usingOraclize.sol';
import './strings.sol';

contract OpenFund is usingOraclize {
  using strings for *;

  address public owner;
  string public repo;
  bytes32 public user;
  address public addr;
  uint public balance;
  bytes32  public title;
  uint256 public withdrawAmount;
  event Transaction(uint date, uint value, address from, address to);

  function OpenFund(bytes32 _user, string _repo) {
    owner = tx.origin;
    repo = _repo;
    user = _user;
  }
  function callback(bytes32 myid, string result) {
      if (msg.sender != oraclize_cbAddress()) throw;
      addr = parseAddr(result);
      if (!addr.send(withdrawAmount)) throw;
  }

  function executeWithdrawal() {
  }

  function updateAddress() {
    
  }
  function withdraw(uint value) {
   strings.slice memory url = "json(https://raw.githubusercontent.com/Dsummers91/openfund/master/".toSlice();
    url = url.concat(string(repo).toSlice()).toSlice();
    url = url.concat(".json).address".toSlice()).toSlice();
    withdrawAmount = value;
    Transaction(now, withdrawAmount, this, owner);
    oraclize_query("URL", url.toString(), 900000);
  }
  
  function() payable {
    Transaction(now, msg.value, msg.sender, this);
    balance += msg.value;
  }

  
}