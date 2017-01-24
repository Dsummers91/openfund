pragma solidity ^0.4.8;
import 'usingOraclize.sol';

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

contract RepositoryContract is usingOraclize {
  address public _owner;
  string public _repo;
  uint public _balance;
  string  public _title;

  event Transaction(uint date, uint value, address from, address to);

  function RepositoryContract(string repo) {
    _owner = tx.origin;
    _repo = repo;
    OAR = OraclizeAddrResolverI(0xfd06e03ef48bbac3cb73fe6b95bee212520ecbc9);
  }
  function __callback(bytes32 myid, string result) {
      if (msg.sender != oraclize_cbAddress()) throw;
      _title = result;
  }

  function withdraw() {
    oraclize_query("URL", "json(https://deonsummers.com/json.json).name");
  }
  
  function() payable {
    _balance += msg.value;
    Transaction(now, msg.value, msg.sender, this);
  }
}