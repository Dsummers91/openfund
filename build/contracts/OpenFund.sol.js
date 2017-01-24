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
      throw new Error("OpenFund error: Please call setProvider() first before calling new().");
    }

    var args = Array.prototype.slice.call(arguments);

    if (!this.unlinked_binary) {
      throw new Error("OpenFund error: contract binary not set. Can't deploy new instance.");
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

      throw new Error("OpenFund contains unresolved libraries. You must deploy and link the following libraries before you can deploy a new version of OpenFund: " + unlinked_libraries);
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
      throw new Error("Invalid address passed to OpenFund.at(): " + address);
    }

    var contract_class = this.web3.eth.contract(this.abi);
    var contract = contract_class.at(address);

    return new this(contract);
  };

  Contract.deployed = function() {
    if (!this.address) {
      throw new Error("Cannot find deployed address: OpenFund not deployed or address not set.");
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
        "constant": false,
        "inputs": [
          {
            "name": "repo",
            "type": "string"
          }
        ],
        "name": "getRepo",
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
        "constant": false,
        "inputs": [
          {
            "name": "repo",
            "type": "string"
          }
        ],
        "name": "addRepo",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "inputs": [],
        "payable": false,
        "type": "constructor"
      }
    ],
    "unlinked_binary": "0x606060405234610000575b6040805180820190915260048082527f626c61680000000000000000000000000000000000000000000000000000000060209283019081526002805460008290528251600860ff1990911617825590937f405787fa12a823e0f2b7631cc41b3ba8828b3321ca811111fa75cd3aa3bb5ace60018316156101000260001901909216859004601f0104810192916100c8565b828001600101855582156100c8579182015b828111156100c85782518255916020019190600101906100ad565b5b506100e99291505b808211156100e557600081556001016100d1565b5090565b50505b5b61105e806100fc6000396000f300606060405263ffffffff60e060020a60003504166382149bcb8114610045578063b2bdfa7b146100b4578063d1b26f9f146100dd578063dda35ea61461016a575b610000565b3461000057610098600480803590602001908201803590602001908080601f016020809104026020016040519081016040528093929190818152602001838380828437509496506101bf95505050505050565b60408051600160a060020a039092168252519081900360200190f35b3461000057610098610232565b60408051600160a060020a039092168252519081900360200190f35b34610000576100ea610241565b604080516020808252835181830152835191928392908301918501908083838215610130575b80518252602083111561013057601f199092019160209182019101610110565b505050905090810190601f16801561015c5780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b34610000576101bd600480803590602001908201803590602001908080601f016020809104026020016040519081016040528093929190818152602001838380828437509496506102cc95505050505050565b005b60006001826040518082805190602001908083835b602083106101f35780518252601f1990920191602091820191016101d4565b51815160209384036101000a6000190180199092169116179052920194855250604051938490030190922054600160a060020a0316925050505b919050565b600054600160a060020a031681565b6002805460408051602060018416156101000260001901909316849004601f810184900484028201840190925281815292918301828280156102c45780601f10610299576101008083540402835291602001916102c4565b820191906000526020600020905b8154815290600101906020018083116102a757829003601f168201915b505050505081565b80604051610c44806103ef8339602091018181528251828201528251909182916040830191850190808383821561031e575b80518252602083111561031e57601f1990920191602091820191016102fe565b505050905090810190601f16801561034a5780820380516001836020036101000a031916815260200191505b5092505050604051809103906000f08015610000576001826040518082805190602001908083835b602083106103915780518252601f199092019160209182019101610372565b51815160209384036101000a60001901801990921691161790529201948552506040519384900301909220805473ffffffffffffffffffffffffffffffffffffffff1916600160a060020a03949094169390931790925550505b50560060606040523461000057604051610c44380380610c44833981016040528051015b60028054600160a060020a03191632600160a060020a0316178155815160038054600082905290927fc2575a0e9e593c00f959f8c92f12db2869c3395a3b0502d05e2516446f71f85b60206101006001851615026000190190931691909104601f908101839004820193928601908390106100a657805160ff19168380011785556100d3565b828001600101855582156100d3579182015b828111156100d35782518255916020019190600101906100b8565b5b506100f49291505b808211156100f057600081556001016100dc565b5090565b505060008054600160a060020a03191673fd06e03ef48bbac3cb73fe6b95bee212520ecbc91790555b505b610b168061012e6000396000f300606060405236156100675763ffffffff60e060020a60003504166327dc297e81146100cb57806338bbfa50146101215780633ccfd60b146101b457806356c4e05a146101c357806363cda8c5146101e2578063b2bdfa7b1461026f578063d1b26f9f14610298575b6100c95b6004805434908101909155604080514281526020810192909252600160a060020a033381168383015230166060830152517f366a5b4512b2d028d93e0b800aa1e171f9d5cd3ed13898feb721ed201a202bda9181900360800190a15b565b005b346100005760408051602060046024803582810135601f81018590048502860185019096528585526100c9958335959394604494939290920191819084018382808284375094965061032595505050505050565b005b346100005760408051602060046024803582810135601f81018590048502860185019096528585526100c9958335959394604494939290920191819084018382808284375050604080516020601f89358b018035918201839004830284018301909452808352979998810197919650918201945092508291508401838280828437509496506103ed95505050505050565b005b34610000576100c96103f3565b005b34610000576101d0610493565b60408051918252519081900360200190f35b34610000576101ef610499565b604080516020808252835181830152835191928392908301918501908083838215610235575b80518252602083111561023557601f199092019160209182019101610215565b505050905090810190601f1680156102615780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b346100005761027c610527565b60408051600160a060020a039092168252519081900360200190f35b34610000576101ef610536565b604080516020808252835181830152835191928392908301918501908083838215610235575b80518252602083111561023557601f199092019160209182019101610215565b505050905090810190601f1680156102615780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b61032d6105c4565b600160a060020a031633600160a060020a031614151561034c57610000565b8060059080519060200190828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f1061039857805160ff19168380011785556103c5565b828001600101855582156103c5579182015b828111156103c55782518255916020019190600101906103aa565b5b506103e69291505b808211156103e257600081556001016103ce565b5090565b50505b5050565b5b505050565b61048f604060405190810160405280600381526020017f55524c0000000000000000000000000000000000000000000000000000000000815250606060405190810160405280602c81526020017f6a736f6e2868747470733a2f2f64656f6e73756d6d6572732e636f6d2f6a736f81526020017f6e2e6a736f6e292e6e616d6500000000000000000000000000000000000000008152506106d7565b505b565b60045481565b6003805460408051602060026001851615610100026000190190941693909304601f8101849004840282018401909252818152929183018282801561051f5780601f106104f45761010080835404028352916020019161051f565b820191906000526020600020905b81548152906001019060200180831161050257829003601f168201915b505050505081565b600254600160a060020a031681565b6005805460408051602060026001851615610100026000190190941693909304601f8101849004840282018401909252818152929183018282801561051f5780601f106104f45761010080835404028352916020019161051f565b820191906000526020600020905b81548152906001019060200180831161050257829003601f168201915b505050505081565b60008054600160a060020a031615156105e3576105e160006109de565b505b600060009054906101000a9004600160a060020a0316600160a060020a03166338cc48316000604051602001526040518163ffffffff1660e060020a028152600401809050602060405180830381600087803b156100005760325a03f11561000057505060408051805160018054600160a060020a031916600160a060020a0392831617908190556000602093840181905284517fc281d19e000000000000000000000000000000000000000000000000000000008152945191909216945063c281d19e9360048082019493918390030190829087803b156100005760325a03f115610000575050604051519150505b5b90565b600080548190600160a060020a031615156106f8576106f660006109de565b505b600060009054906101000a9004600160a060020a0316600160a060020a03166338cc48316000604051602001526040518163ffffffff1660e060020a028152600401809050602060405180830381600087803b156100005760325a03f11561000057505060408051805160018054600160a060020a031916600160a060020a039283161790819055600060209384015292517f524f38890000000000000000000000000000000000000000000000000000000081526004810183815289516024830152895194909216945063524f38899389938392604401919085019080838382156107ff575b8051825260208311156107ff57601f1990920191602091820191016107df565b505050905090810190601f16801561082b5780820380516001836020036101000a031916815260200191505b5092505050602060405180830381600087803b156100005760325a03f11561000057505060405151915050670de0b6b3a764000062030d403a020181111561087657600091506109d6565b600160009054906101000a9004600160a060020a0316600160a060020a031663adf59f9982600087876000604051602001526040518563ffffffff1660e060020a02815260040180848152602001806020018060200183810383528581815181526020019150805190602001908083836000831461090f575b80518252602083111561090f57601f1990920191602091820191016108ef565b505050905090810190601f16801561093b5780820380516001836020036101000a031916815260200191505b508381038252845181528451602091820191860190808383821561097a575b80518252602083111561097a57601f19909201916020918201910161095a565b505050905090810190601f1680156109a65780820380516001836020036101000a031916815260200191505b50955050505050506020604051808303818588803b156100005761235a5a03f11561000057505060405151935050505b5b5092915050565b600060006109ff731d3b2638a7cc9f2cb3d298a3da7a90b67e5506ed610ae2565b1115610a33575060008054600160a060020a031916731d3b2638a7cc9f2cb3d298a3da7a90b67e5506ed1790556001610add565b6000610a5273c03a2615d5efaf5f49f60b7bb6583eaec212fdf1610ae2565b1115610a86575060008054600160a060020a03191673c03a2615d5efaf5f49f60b7bb6583eaec212fdf11790556001610add565b6000610aa57351efaf4c8b3c9afbd5ab9f4bbc82784ab6ef8faa610ae2565b1115610ad9575060008054600160a060020a0319167351efaf4c8b3c9afbd5ab9f4bbc82784ab6ef8faa1790556001610add565b5060005b919050565b803b5b9190505600a165627a7a72305820537db3cdc8e849373336606ac0944c48b77a6803a308a90123ba5b19ebcba34f0029a165627a7a72305820461856d7f13f8b8d780ccc67623c2f93bb39ddee61f9640f61826e4685f02da20029",
    "events": {},
    "updated_at": 1485233287448,
    "links": {},
    "address": "0x09a02feb97aa320f7a3e2b317aad9f7e45f981c2"
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

  Contract.contract_name   = Contract.prototype.contract_name   = "OpenFund";
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
    window.OpenFund = Contract;
  }
})();
