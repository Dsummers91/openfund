pragma solidity ^0.4.8;

contract OpenFund {
  address public _owner;
  mapping (string => address) _repositories;
  string  public _title;

  function OpenFund() {
    _title = "blah";
  }

  function addRepo(string repo) {
    _repositories[repo] = new RepositoryContract(repo);
  }

  function getRepo(string repo) returns (address) {
    return _repositories[repo];
  }
}

contract RepositoryContract {
  address public _owner;
  string public _repo;
  uint public _balance;

  event Transaction(uint date, uint value, address from, address to);

  function RepositoryContract(string repo) {
    _owner = tx.origin;
    _repo = repo;
  }

  function () payable {
    _balance += msg.value;
    Transaction(now, msg.value, msg.sender, this);
  }
}