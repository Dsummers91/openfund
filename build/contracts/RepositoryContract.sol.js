var Web3 = require("web3");
var SolidityEvent = require("web3/lib/web3/event.js");

(function() {
  // Planned for future features, logging, etc.
  function Provider(provider) {
    this.provider = provider;
  }

  Provider.prototype.send = function() {
    this.provider.send.apply(this.provider, arguments);
  };

  Provider.prototype.sendAsync = function() {
    this.provider.sendAsync.apply(this.provider, arguments);
  };

  var BigNumber = (new Web3()).toBigNumber(0).constructor;

  var Utils = {
    is_object: function(val) {
      return typeof val == "object" && !Array.isArray(val);
    },
    is_big_number: function(val) {
      if (typeof val != "object") return false;

      // Instanceof won't work because we have multiple versions of Web3.
      try {
        new BigNumber(val);
        return true;
      } catch (e) {
        return false;
      }
    },
    merge: function() {
      var merged = {};
      var args = Array.prototype.slice.call(arguments);

      for (var i = 0; i < args.length; i++) {
        var object = args[i];
        var keys = Object.keys(object);
        for (var j = 0; j < keys.length; j++) {
          var key = keys[j];
          var value = object[key];
          merged[key] = value;
        }
      }

      return merged;
    },
    promisifyFunction: function(fn, C) {
      var self = this;
      return function() {
        var instance = this;

        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {
          var callback = function(error, result) {
            if (error != null) {
              reject(error);
            } else {
              accept(result);
            }
          };
          args.push(tx_params, callback);
          fn.apply(instance.contract, args);
        });
      };
    },
    synchronizeFunction: function(fn, instance, C) {
      var self = this;
      return function() {
        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {

          var decodeLogs = function(logs) {
            return logs.map(function(log) {
              var logABI = C.events[log.topics[0]];

              if (logABI == null) {
                return null;
              }

              var decoder = new SolidityEvent(null, logABI, instance.address);
              return decoder.decode(log);
            }).filter(function(log) {
              return log != null;
            });
          };

          var callback = function(error, tx) {
            if (error != null) {
              reject(error);
              return;
            }

            var timeout = C.synchronization_timeout || 240000;
            var start = new Date().getTime();

            var make_attempt = function() {
              C.web3.eth.getTransactionReceipt(tx, function(err, receipt) {
                if (err) return reject(err);

                if (receipt != null) {
                  // If they've opted into next gen, return more information.
                  if (C.next_gen == true) {
                    return accept({
                      tx: tx,
                      receipt: receipt,
                      logs: decodeLogs(receipt.logs)
                    });
                  } else {
                    return accept(tx);
                  }
                }

                if (timeout > 0 && new Date().getTime() - start > timeout) {
                  return reject(new Error("Transaction " + tx + " wasn't processed in " + (timeout / 1000) + " seconds!"));
                }

                setTimeout(make_attempt, 1000);
              });
            };

            make_attempt();
          };

          args.push(tx_params, callback);
          fn.apply(self, args);
        });
      };
    }
  };

  function instantiate(instance, contract) {
    instance.contract = contract;
    var constructor = instance.constructor;

    // Provision our functions.
    for (var i = 0; i < instance.abi.length; i++) {
      var item = instance.abi[i];
      if (item.type == "function") {
        if (item.constant == true) {
          instance[item.name] = Utils.promisifyFunction(contract[item.name], constructor);
        } else {
          instance[item.name] = Utils.synchronizeFunction(contract[item.name], instance, constructor);
        }

        instance[item.name].call = Utils.promisifyFunction(contract[item.name].call, constructor);
        instance[item.name].sendTransaction = Utils.promisifyFunction(contract[item.name].sendTransaction, constructor);
        instance[item.name].request = contract[item.name].request;
        instance[item.name].estimateGas = Utils.promisifyFunction(contract[item.name].estimateGas, constructor);
      }

      if (item.type == "event") {
        instance[item.name] = contract[item.name];
      }
    }

    instance.allEvents = contract.allEvents;
    instance.address = contract.address;
    instance.transactionHash = contract.transactionHash;
  };

  // Use inheritance to create a clone of this contract,
  // and copy over contract's static functions.
  function mutate(fn) {
    var temp = function Clone() { return fn.apply(this, arguments); };

    Object.keys(fn).forEach(function(key) {
      temp[key] = fn[key];
    });

    temp.prototype = Object.create(fn.prototype);
    bootstrap(temp);
    return temp;
  };

  function bootstrap(fn) {
    fn.web3 = new Web3();
    fn.class_defaults  = fn.prototype.defaults || {};

    // Set the network iniitally to make default data available and re-use code.
    // Then remove the saved network id so the network will be auto-detected on first use.
    fn.setNetwork("default");
    fn.network_id = null;
    return fn;
  };

  // Accepts a contract object created with web3.eth.contract.
  // Optionally, if called without `new`, accepts a network_id and will
  // create a new version of the contract abstraction with that network_id set.
  function Contract() {
    if (this instanceof Contract) {
      instantiate(this, arguments[0]);
    } else {
      var C = mutate(Contract);
      var network_id = arguments.length > 0 ? arguments[0] : "default";
      C.setNetwork(network_id);
      return C;
    }
  };

  Contract.currentProvider = null;

  Contract.setProvider = function(provider) {
    var wrapped = new Provider(provider);
    this.web3.setProvider(wrapped);
    this.currentProvider = provider;
  };

  Contract.new = function() {
    if (this.currentProvider == null) {
      throw new Error("RepositoryContract error: Please call setProvider() first before calling new().");
    }

    var args = Array.prototype.slice.call(arguments);

    if (!this.unlinked_binary) {
      throw new Error("RepositoryContract error: contract binary not set. Can't deploy new instance.");
    }

    var regex = /__[^_]+_+/g;
    var unlinked_libraries = this.binary.match(regex);

    if (unlinked_libraries != null) {
      unlinked_libraries = unlinked_libraries.map(function(name) {
        // Remove underscores
        return name.replace(/_/g, "");
      }).sort().filter(function(name, index, arr) {
        // Remove duplicates
        if (index + 1 >= arr.length) {
          return true;
        }

        return name != arr[index + 1];
      }).join(", ");

      throw new Error("RepositoryContract contains unresolved libraries. You must deploy and link the following libraries before you can deploy a new version of RepositoryContract: " + unlinked_libraries);
    }

    var self = this;

    return new Promise(function(accept, reject) {
      var contract_class = self.web3.eth.contract(self.abi);
      var tx_params = {};
      var last_arg = args[args.length - 1];

      // It's only tx_params if it's an object and not a BigNumber.
      if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
        tx_params = args.pop();
      }

      tx_params = Utils.merge(self.class_defaults, tx_params);

      if (tx_params.data == null) {
        tx_params.data = self.binary;
      }

      // web3 0.9.0 and above calls new twice this callback twice.
      // Why, I have no idea...
      var intermediary = function(err, web3_instance) {
        if (err != null) {
          reject(err);
          return;
        }

        if (err == null && web3_instance != null && web3_instance.address != null) {
          accept(new self(web3_instance));
        }
      };

      args.push(tx_params, intermediary);
      contract_class.new.apply(contract_class, args);
    });
  };

  Contract.at = function(address) {
    if (address == null || typeof address != "string" || address.length != 42) {
      throw new Error("Invalid address passed to RepositoryContract.at(): " + address);
    }

    var contract_class = this.web3.eth.contract(this.abi);
    var contract = contract_class.at(address);

    return new this(contract);
  };

  Contract.deployed = function() {
    if (!this.address) {
      throw new Error("Cannot find deployed address: RepositoryContract not deployed or address not set.");
    }

    return this.at(this.address);
  };

  Contract.defaults = function(class_defaults) {
    if (this.class_defaults == null) {
      this.class_defaults = {};
    }

    if (class_defaults == null) {
      class_defaults = {};
    }

    var self = this;
    Object.keys(class_defaults).forEach(function(key) {
      var value = class_defaults[key];
      self.class_defaults[key] = value;
    });

    return this.class_defaults;
  };

  Contract.extend = function() {
    var args = Array.prototype.slice.call(arguments);

    for (var i = 0; i < arguments.length; i++) {
      var object = arguments[i];
      var keys = Object.keys(object);
      for (var j = 0; j < keys.length; j++) {
        var key = keys[j];
        var value = object[key];
        this.prototype[key] = value;
      }
    }
  };

  Contract.all_networks = {
  "default": {
    "abi": [
      {
        "constant": true,
        "inputs": [],
        "name": "_address",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "myid",
            "type": "bytes32"
          },
          {
            "name": "result",
            "type": "string"
          }
        ],
        "name": "__callback",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "value",
            "type": "uint256"
          }
        ],
        "name": "withdraw",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "_withdrawAmount",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "myid",
            "type": "bytes32"
          },
          {
            "name": "result",
            "type": "string"
          },
          {
            "name": "proof",
            "type": "bytes"
          }
        ],
        "name": "__callback",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "_balance",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "_repo",
        "outputs": [
          {
            "name": "",
            "type": "string"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "_user",
        "outputs": [
          {
            "name": "",
            "type": "string"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "_owner",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "_title",
        "outputs": [
          {
            "name": "",
            "type": "string"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "inputs": [
          {
            "name": "user",
            "type": "string"
          },
          {
            "name": "repo",
            "type": "string"
          }
        ],
        "payable": false,
        "type": "constructor"
      },
      {
        "payable": true,
        "type": "fallback"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "date",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "value",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "from",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "to",
            "type": "address"
          }
        ],
        "name": "Deposit",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "date",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "value",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "from",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "to",
            "type": "address"
          }
        ],
        "name": "Withdraw",
        "type": "event"
      }
    ],
    "unlinked_binary": "0x60606040523462000000576040516200116d3803806200116d833981016040528051602082015190820191015b60028054600160a060020a03191632600160a060020a0316178155815160038054600082905290927fc2575a0e9e593c00f959f8c92f12db2869c3395a3b0502d05e2516446f71f85b60206101006001851615026000190190931691909104601f90810183900482019392860190839010620000b457805160ff1916838001178555620000e4565b82800160010185558215620000e4579182015b82811115620000e4578251825591602001919060010190620000c7565b5b50620001089291505b80821115620001045760008155600101620000ee565b5090565b50508160049080519060200190828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f106200015857805160ff191683800117855562000188565b8280016001018555821562000188579182015b82811115620001885782518255916020019190600101906200016b565b5b50620001ac9291505b80821115620001045760008155600101620000ee565b5090565b505060008054600160a060020a03191673fd06e03ef48bbac3cb73fe6b95bee212520ecbc91790555b50505b610f8580620001e86000396000f300606060405236156100885763ffffffff60e060020a60003504166318bad21781146100ec57806327dc297e146101155780632e1a7d4d1461016b5780633480810b1461017d57806338bbfa501461019c57806356c4e05a1461022f57806363cda8c51461024e578063891e1ee0146102db578063b2bdfa7b14610368578063d1b26f9f14610391575b6100ea5b6006805434908101909155604080514281526020810192909252600160a060020a033381168383015230166060830152517fac57839e4a5af49d6dc5cf4ecd7400d50dc812f3ebb9d75bc488af088272a8089181900360800190a15b565b005b34610000576100f961041e565b60408051600160a060020a039092168252519081900360200190f35b346100005760408051602060046024803582810135601f81018590048502860185019096528585526100ea958335959394604494939290920191819084018382808284375094965061042d95505050505050565b005b34610000576100ea600435610484565b005b346100005761018a6106b8565b60408051918252519081900360200190f35b346100005760408051602060046024803582810135601f81018590048502860185019096528585526100ea958335959394604494939290920191819084018382808284375050604080516020601f89358b018035918201839004830284018301909452808352979998810197919650918201945092508291508401838280828437509496506106be95505050505050565b005b346100005761018a6106c4565b60408051918252519081900360200190f35b346100005761025b6106ca565b6040805160208082528351818301528351919283929083019185019080838382156102a1575b8051825260208311156102a157601f199092019160209182019101610281565b505050905090810190601f1680156102cd5780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b346100005761025b610758565b6040805160208082528351818301528351919283929083019185019080838382156102a1575b8051825260208311156102a157601f199092019160209182019101610281565b505050905090810190601f1680156102cd5780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b34610000576100f96107e6565b60408051600160a060020a039092168252519081900360200190f35b346100005761025b6107f5565b6040805160208082528351818301528351919283929083019185019080838382156102a1575b8051825260208311156102a157601f199092019160209182019101610281565b505050905090810190601f1680156102cd5780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b600554600160a060020a031681565b61043681610883565b60058054600160a060020a031916600160a060020a03928316179081905560085460405191909216916108fc811502916000818181858888f19350505050151561047f57610000565b5b5050565b604060405190810160405280600081526020016000815250610527608060405190810160405280604281526020017f6a736f6e2868747470733a2f2f7261772e67697468756275736572636f6e746581526020017f6e742e636f6d2f4473756d6d65727339312f6f70656e66756e642f6d6173746581526020017f722f0000000000000000000000000000000000000000000000000000000000008152506109de565b6003805460408051602060026001851615610100026000190190941693909304601f81018490048402820184019092528181529394506105da936105d5936105c893919290918301828280156105be5780601f10610593576101008083540402835291602001916105be565b820191906000526020600020905b8154815290600101906020018083116105a157829003601f168201915b50505050506109de565b839063ffffffff610a0e16565b6109de565b90506106336105d56105c8604060405190810160405280600e81526020017f2e6a736f6e292e616464726573730000000000000000000000000000000000008152506109de565b839063ffffffff610a0e16565b6109de565b600883905560408051808201909152600381527f55524c000000000000000000000000000000000000000000000000000000000060208201529091506106819061067c83610a8f565b610afd565b50600854604051600160a060020a0333169180156108fc02916000818181858888f19350505050151561047f57610000565b5b5050565b60085481565b5b505050565b60065481565b6003805460408051602060026001851615610100026000190190941693909304601f810184900484028201840190925281815292918301828280156107505780601f1061072557610100808354040283529160200191610750565b820191906000526020600020905b81548152906001019060200180831161073357829003601f168201915b505050505081565b6004805460408051602060026001851615610100026000190190941693909304601f810184900484028201840190925281815292918301828280156107505780601f1061072557610100808354040283529160200191610750565b820191906000526020600020905b81548152906001019060200180831161073357829003601f168201915b505050505081565b600254600160a060020a031681565b6007805460408051602060026001851615610100026000190190941693909304601f810184900484028201840190925281815292918301828280156107505780601f1061072557610100808354040283529160200191610750565b820191906000526020600020905b81548152906001019060200180831161073357829003601f168201915b505050505081565b60408051602081019091526000908190528181808060025b602a8110156109d05761010084029350848181518110156100005790602001015160f860020a900460f860020a0260f860020a900492508481600101815181101561000057016020015160f860020a9081900481020491506061600160a060020a038416108015906109175750606683600160a060020a031611155b1561092757605783039250610957565b603083600160a060020a03161015801561094b5750603983600160a060020a031611155b15610957576030830392505b5b606182600160a060020a03161015801561097c5750606682600160a060020a031611155b1561098c576057820391506109bc565b603082600160a060020a0316101580156109b05750603982600160a060020a031611155b156109bc576030820391505b5b818360100201840193505b60020161089b565b8395505b5050505050919050565b60408051808201825260008082526020918201528151808301909252825182528281019082018190525b50919050565b60408051602081810183526000808352835191820184528082528451865194519394929391920190805910610a405750595b908082528060200260200182016040525b509150602082019050610a6d8186602001518760000151610e04565b845160208501518551610a839284019190610e04565b8192505b505092915050565b6020604051908101604052806000815250602060405190810160405280600081525060008360000151604051805910610ac55750595b908082528060200260200182016040525b509150602082019050610af28185602001518660000151610e04565b8192505b5050919050565b600080548190600160a060020a03161515610b1e57610b1c6000610e4d565b505b600060009054906101000a9004600160a060020a0316600160a060020a03166338cc48316000604051602001526040518163ffffffff1660e060020a028152600401809050602060405180830381600087803b156100005760325a03f11561000057505060408051805160018054600160a060020a031916600160a060020a039283161790819055600060209384015292517f524f38890000000000000000000000000000000000000000000000000000000081526004810183815289516024830152895194909216945063524f3889938993839260440191908501908083838215610c25575b805182526020831115610c2557601f199092019160209182019101610c05565b505050905090810190601f168015610c515780820380516001836020036101000a031916815260200191505b5092505050602060405180830381600087803b156100005760325a03f11561000057505060405151915050670de0b6b3a764000062030d403a0201811115610c9c5760009150610dfc565b600160009054906101000a9004600160a060020a0316600160a060020a031663adf59f9982600087876000604051602001526040518563ffffffff1660e060020a028152600401808481526020018060200180602001838103835285818151815260200191508051906020019080838360008314610d35575b805182526020831115610d3557601f199092019160209182019101610d15565b505050905090810190601f168015610d615780820380516001836020036101000a031916815260200191505b5083810382528451815284516020918201918601908083838215610da0575b805182526020831115610da057601f199092019160209182019101610d80565b505050905090810190601f168015610dcc5780820380516001836020036101000a031916815260200191505b50955050505050506020604051808303818588803b156100005761235a5a03f11561000057505060405151935050505b5b5092915050565b60005b60208210610e295782518452602093840193909201915b602082039150610e07565b6001826020036101000a039050801983511681855116818117865250505b50505050565b60006000610e6e731d3b2638a7cc9f2cb3d298a3da7a90b67e5506ed610f51565b1115610ea2575060008054600160a060020a031916731d3b2638a7cc9f2cb3d298a3da7a90b67e5506ed1790556001610f4c565b6000610ec173c03a2615d5efaf5f49f60b7bb6583eaec212fdf1610f51565b1115610ef5575060008054600160a060020a03191673c03a2615d5efaf5f49f60b7bb6583eaec212fdf11790556001610f4c565b6000610f147351efaf4c8b3c9afbd5ab9f4bbc82784ab6ef8faa610f51565b1115610f48575060008054600160a060020a0319167351efaf4c8b3c9afbd5ab9f4bbc82784ab6ef8faa1790556001610f4c565b5060005b919050565b803b5b9190505600a165627a7a72305820fb91060b949a9e27905d9255abba35759e0b478baa4dd8274653c024976346ca0029",
    "events": {
      "0x366a5b4512b2d028d93e0b800aa1e171f9d5cd3ed13898feb721ed201a202bda": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "date",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "value",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "from",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "to",
            "type": "address"
          }
        ],
        "name": "Transaction",
        "type": "event"
      },
      "0xac57839e4a5af49d6dc5cf4ecd7400d50dc812f3ebb9d75bc488af088272a808": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "date",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "value",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "from",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "to",
            "type": "address"
          }
        ],
        "name": "Deposit",
        "type": "event"
      },
      "0x5b219aedd391ab56db187fff851ea30113d40f040b1583d1a19196f175f8d5f2": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "date",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "value",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "from",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "to",
            "type": "address"
          }
        ],
        "name": "Withdraw",
        "type": "event"
      }
    },
    "updated_at": 1485618082934,
    "links": {}
  }
};

  Contract.checkNetwork = function(callback) {
    var self = this;

    if (this.network_id != null) {
      return callback();
    }

    this.web3.version.network(function(err, result) {
      if (err) return callback(err);

      var network_id = result.toString();

      // If we have the main network,
      if (network_id == "1") {
        var possible_ids = ["1", "live", "default"];

        for (var i = 0; i < possible_ids.length; i++) {
          var id = possible_ids[i];
          if (Contract.all_networks[id] != null) {
            network_id = id;
            break;
          }
        }
      }

      if (self.all_networks[network_id] == null) {
        return callback(new Error(self.name + " error: Can't find artifacts for network id '" + network_id + "'"));
      }

      self.setNetwork(network_id);
      callback();
    })
  };

  Contract.setNetwork = function(network_id) {
    var network = this.all_networks[network_id] || {};

    this.abi             = this.prototype.abi             = network.abi;
    this.unlinked_binary = this.prototype.unlinked_binary = network.unlinked_binary;
    this.address         = this.prototype.address         = network.address;
    this.updated_at      = this.prototype.updated_at      = network.updated_at;
    this.links           = this.prototype.links           = network.links || {};
    this.events          = this.prototype.events          = network.events || {};

    this.network_id = network_id;
  };

  Contract.networks = function() {
    return Object.keys(this.all_networks);
  };

  Contract.link = function(name, address) {
    if (typeof name == "function") {
      var contract = name;

      if (contract.address == null) {
        throw new Error("Cannot link contract without an address.");
      }

      Contract.link(contract.contract_name, contract.address);

      // Merge events so this contract knows about library's events
      Object.keys(contract.events).forEach(function(topic) {
        Contract.events[topic] = contract.events[topic];
      });

      return;
    }

    if (typeof name == "object") {
      var obj = name;
      Object.keys(obj).forEach(function(name) {
        var a = obj[name];
        Contract.link(name, a);
      });
      return;
    }

    Contract.links[name] = address;
  };

  Contract.contract_name   = Contract.prototype.contract_name   = "RepositoryContract";
  Contract.generated_with  = Contract.prototype.generated_with  = "3.2.0";

  // Allow people to opt-in to breaking changes now.
  Contract.next_gen = false;

  var properties = {
    binary: function() {
      var binary = Contract.unlinked_binary;

      Object.keys(Contract.links).forEach(function(library_name) {
        var library_address = Contract.links[library_name];
        var regex = new RegExp("__" + library_name + "_*", "g");

        binary = binary.replace(regex, library_address.replace("0x", ""));
      });

      return binary;
    }
  };

  Object.keys(properties).forEach(function(key) {
    var getter = properties[key];

    var definition = {};
    definition.enumerable = true;
    definition.configurable = false;
    definition.get = getter;

    Object.defineProperty(Contract, key, definition);
    Object.defineProperty(Contract.prototype, key, definition);
  });

  bootstrap(Contract);

  if (typeof module != "undefined" && typeof module.exports != "undefined") {
    module.exports = Contract;
  } else {
    // There will only be one version of this contract in the browser,
    // and we can use that.
    window.RepositoryContract = Contract;
  }
})();
