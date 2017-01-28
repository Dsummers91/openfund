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
            "name": "user",
            "type": "string"
          },
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
        "constant": false,
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
    "unlinked_binary": "0x606060405234610000575b5b5b6116988061001b6000396000f300606060405263ffffffff60e060020a6000350416630742cc69811461003a578063b2bdfa7b146100e6578063d2caab6d1461010f575b610000565b34610000576100ca600480803590602001908201803590602001908080601f0160208091040260200160405190810160405280939291908181526020018383808284375050604080516020601f89358b018035918201839004830284018301909452808352979998810197919650918201945092508291508401838280828437509496506101a195505050505050565b60408051600160a060020a039092168252519081900360200190f35b34610000576100ca610271565b60408051600160a060020a039092168252519081900360200190f35b346100005761019f600480803590602001908201803590602001908080601f0160208091040260200160405190810160405280939291908181526020018383808284375050604080516020601f89358b0180359182018390048302840183019094528083529799988101979196509182019450925082915084018382808284375094965061028095505050505050565b005b60006001836040518082805190602001908083835b602083106101d55780518252601f1990920191602091820191016101b6565b51815160209384036101000a6000190180199092169116179052920194855250604051938490038101842086519094879450925082918401908083835b602083106102315780518252601f199092019160209182019101610212565b51815160209384036101000a6000190180199092169116179052920194855250604051938490030190922054600160a060020a0316925050505b92915050565b600054600160a060020a031681565b81816040516111f7806104768339018080602001806020018381038352858181518152602001915080519060200190808383600083146102db575b8051825260208311156102db57601f1990920191602091820191016102bb565b505050905090810190601f1680156103075780820380516001836020036101000a031916815260200191505b5083810382528451815284516020918201918601908083838215610346575b80518252602083111561034657601f199092019160209182019101610326565b505050905090810190601f1680156103725780820380516001836020036101000a031916815260200191505b50945050505050604051809103906000f08015610000576001836040518082805190602001908083835b602083106103bb5780518252601f19909201916020918201910161039c565b51815160209384036101000a6000190180199092169116179052920194855250604051938490038101842086519094879450925082918401908083835b602083106104175780518252601f1990920191602091820191016103f8565b51815160209384036101000a60001901801990921691161790529201948552506040519384900301909220805473ffffffffffffffffffffffffffffffffffffffff1916600160a060020a03949094169390931790925550505b505056006060604052346200000057604051620011f7380380620011f7833981016040528051602082015190820191015b60028054600160a060020a03191632600160a060020a0316178155815160038054600082905290927fc2575a0e9e593c00f959f8c92f12db2869c3395a3b0502d05e2516446f71f85b60206101006001851615026000190190931691909104601f90810183900482019392860190839010620000b457805160ff1916838001178555620000e4565b82800160010185558215620000e4579182015b82811115620000e4578251825591602001919060010190620000c7565b5b50620001089291505b80821115620001045760008155600101620000ee565b5090565b50508160049080519060200190828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f106200015857805160ff191683800117855562000188565b8280016001018555821562000188579182015b82811115620001885782518255916020019190600101906200016b565b5b50620001ac9291505b80821115620001045760008155600101620000ee565b5090565b505060008054600160a060020a03191673fd06e03ef48bbac3cb73fe6b95bee212520ecbc91790555b50505b61100f80620001e86000396000f300606060405236156100935763ffffffff60e060020a60003504166318bad21781146100f757806327dc297e146101205780632e1a7d4d146101765780633480810b1461018857806338bbfa50146101a757806356c4e05a1461023a57806363cda8c514610259578063833938bf146102e6578063891e1ee014610304578063b2bdfa7b14610391578063d1b26f9f146103ba575b6100f55b6006805434908101909155604080514281526020810192909252600160a060020a033381168383015230166060830152517fac57839e4a5af49d6dc5cf4ecd7400d50dc812f3ebb9d75bc488af088272a8089181900360800190a15b565b005b3461000057610104610447565b60408051600160a060020a039092168252519081900360200190f35b346100005760408051602060046024803582810135601f81018590048502860185019096528585526100f5958335959394604494939290920191819084018382808284375094965061045695505050505050565b005b34610000576100f5600435610486565b005b34610000576101956106ba565b60408051918252519081900360200190f35b346100005760408051602060046024803582810135601f81018590048502860185019096528585526100f5958335959394604494939290920191819084018382808284375050604080516020601f89358b018035918201839004830284018301909452808352979998810197919650918201945092508291508401838280828437509496506106c095505050505050565b005b34610000576101956106c6565b60408051918252519081900360200190f35b34610000576102666106cc565b6040805160208082528351818301528351919283929083019185019080838382156102ac575b8051825260208311156102ac57601f19909201916020918201910161028c565b505050905090810190601f1680156102d85780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b34610000576100f5600435600160a060020a036024351661075a565b005b346100005761026661082a565b6040805160208082528351818301528351919283929083019185019080838382156102ac575b8051825260208311156102ac57601f19909201916020918201910161028c565b505050905090810190601f1680156102d85780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b34610000576101046108b8565b60408051600160a060020a039092168252519081900360200190f35b34610000576102666108c7565b6040805160208082528351818301528351919283929083019185019080838382156102ac575b8051825260208311156102ac57601f19909201916020918201910161028c565b505050905090810190601f1680156102d85780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b600554600160a060020a031681565b6104818282600060405180591061046a5750595b908082528060200260200182016040525b506106c0565b5b5050565b604060405190810160405280600081526020016000815250610529608060405190810160405280604281526020017f6a736f6e2868747470733a2f2f7261772e67697468756275736572636f6e746581526020017f6e742e636f6d2f4473756d6d65727339312f6f70656e66756e642f6d6173746581526020017f722f000000000000000000000000000000000000000000000000000000000000815250610955565b6003805460408051602060026001851615610100026000190190941693909304601f81018490048402820184019092528181529394506105dc936105d7936105ca93919290918301828280156105c05780601f10610595576101008083540402835291602001916105c0565b820191906000526020600020905b8154815290600101906020018083116105a357829003601f168201915b5050505050610955565b839063ffffffff61098516565b610955565b90506106356105d76105ca604060405190810160405280600e81526020017f2e6a736f6e292e61646472657373000000000000000000000000000000000000815250610955565b839063ffffffff61098516565b610955565b600883905560408051808201909152600381527f55524c000000000000000000000000000000000000000000000000000000000060208201529091506106839061067e83610a06565b610a74565b50600854604051600160a060020a0333169180156108fc02916000818181858888f19350505050151561048157610000565b5b5050565b60085481565b5b505050565b60065481565b6003805460408051602060026001851615610100026000190190941693909304601f810184900484028201840190925281815292918301828280156107525780601f1061072757610100808354040283529160200191610752565b820191906000526020600020905b81548152906001019060200180831161073557829003601f168201915b505050505081565b610762610d7b565b600160a060020a031633600160a060020a031614151561078157610000565b60058054600160a060020a031916600160a060020a03838116919091179182905560085460405192909116916108fc82150291906000818181858888f1935050505015156107ce57610000565b600854600254604080514281526020810193909352600160a060020a03308116848301529091166060830152517f5b219aedd391ab56db187fff851ea30113d40f040b1583d1a19196f175f8d5f29181900360800190a15b5050565b6004805460408051602060026001851615610100026000190190941693909304601f810184900484028201840190925281815292918301828280156107525780601f1061072757610100808354040283529160200191610752565b820191906000526020600020905b81548152906001019060200180831161073557829003601f168201915b505050505081565b600254600160a060020a031681565b6007805460408051602060026001851615610100026000190190941693909304601f810184900484028201840190925281815292918301828280156107525780601f1061072757610100808354040283529160200191610752565b820191906000526020600020905b81548152906001019060200180831161073557829003601f168201915b505050505081565b60408051808201825260008082526020918201528151808301909252825182528281019082018190525b50919050565b604080516020818101835260008083528351918201845280825284518651945193949293919201908059106109b75750595b908082528060200260200182016040525b5091506020820190506109e48186602001518760000151610e8e565b8451602085015185516109fa9284019190610e8e565b8192505b505092915050565b6020604051908101604052806000815250602060405190810160405280600081525060008360000151604051805910610a3c5750595b908082528060200260200182016040525b509150602082019050610a698185602001518660000151610e8e565b8192505b5050919050565b600080548190600160a060020a03161515610a9557610a936000610ed7565b505b600060009054906101000a9004600160a060020a0316600160a060020a03166338cc48316000604051602001526040518163ffffffff1660e060020a028152600401809050602060405180830381600087803b156100005760325a03f11561000057505060408051805160018054600160a060020a031916600160a060020a039283161790819055600060209384015292517f524f38890000000000000000000000000000000000000000000000000000000081526004810183815289516024830152895194909216945063524f3889938993839260440191908501908083838215610b9c575b805182526020831115610b9c57601f199092019160209182019101610b7c565b505050905090810190601f168015610bc85780820380516001836020036101000a031916815260200191505b5092505050602060405180830381600087803b156100005760325a03f11561000057505060405151915050670de0b6b3a764000062030d403a0201811115610c135760009150610d73565b600160009054906101000a9004600160a060020a0316600160a060020a031663adf59f9982600087876000604051602001526040518563ffffffff1660e060020a028152600401808481526020018060200180602001838103835285818151815260200191508051906020019080838360008314610cac575b805182526020831115610cac57601f199092019160209182019101610c8c565b505050905090810190601f168015610cd85780820380516001836020036101000a031916815260200191505b5083810382528451815284516020918201918601908083838215610d17575b805182526020831115610d1757601f199092019160209182019101610cf7565b505050905090810190601f168015610d435780820380516001836020036101000a031916815260200191505b50955050505050506020604051808303818588803b156100005761235a5a03f11561000057505060405151935050505b5b5092915050565b60008054600160a060020a03161515610d9a57610d986000610ed7565b505b600060009054906101000a9004600160a060020a0316600160a060020a03166338cc48316000604051602001526040518163ffffffff1660e060020a028152600401809050602060405180830381600087803b156100005760325a03f11561000057505060408051805160018054600160a060020a031916600160a060020a0392831617908190556000602093840181905284517fc281d19e000000000000000000000000000000000000000000000000000000008152945191909216945063c281d19e9360048082019493918390030190829087803b156100005760325a03f115610000575050604051519150505b5b90565b60005b60208210610eb35782518452602093840193909201915b602082039150610e91565b6001826020036101000a039050801983511681855116818117865250505b50505050565b60006000610ef8731d3b2638a7cc9f2cb3d298a3da7a90b67e5506ed610fdb565b1115610f2c575060008054600160a060020a031916731d3b2638a7cc9f2cb3d298a3da7a90b67e5506ed1790556001610fd6565b6000610f4b73c03a2615d5efaf5f49f60b7bb6583eaec212fdf1610fdb565b1115610f7f575060008054600160a060020a03191673c03a2615d5efaf5f49f60b7bb6583eaec212fdf11790556001610fd6565b6000610f9e7351efaf4c8b3c9afbd5ab9f4bbc82784ab6ef8faa610fdb565b1115610fd2575060008054600160a060020a0319167351efaf4c8b3c9afbd5ab9f4bbc82784ab6ef8faa1790556001610fd6565b5060005b919050565b803b5b9190505600a165627a7a723058206f2cbc6c42950b3f04b93989c4a18a448f3db5095c960a1ea37c4fffdea076bf0029a165627a7a72305820601a254b7e8097b2cafd34e70bf2a8b0fafd10f0bcc784f3f6d4b5a62dffc83e0029",
    "events": {},
    "updated_at": 1485618403900,
    "links": {},
    "address": "0x3a74acfeda5bcb81202ea6115b26a91ec2330be5"
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
