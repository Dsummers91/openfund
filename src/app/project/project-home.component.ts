import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import * as Web3 from 'web3';

@Component({
  selector: 'app-project-home',
  templateUrl: './project-home.component.html',
  styleUrls: ['./project-home.component.css']
})
export class ProjectHomeComponent implements OnInit {
  contributions: any[] = [];
  accounts: any[] = [];
  account: string;
  openFund: any;
  web3: any;
  contractAddress: string = null; // enter contract address here;
  currentBalance: number;
  repo: any;
  moneyReceivedToDate: number = 0;
  moneyWithdrawnToDate: number = 0;
  address: string;
  title: string;
  projectExists: boolean = true;

  constructor(
    private route: ActivatedRoute
  ) { }

  ngOnInit() {
    this.web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));

    this.web3.eth.getAccounts((err, accs) => {
      if (err != null) {
        alert("There was an error fetching your accounts.");
        return;
      }

      if (accs.length == 0) {
        alert("Couldn't get any accounts! Make sure your Ethereum client is configured correctly.");
        return;
      }

      this.accounts = accs;
      this.account = this.accounts[0];
      this.route.params.subscribe((route) => {
        this.setContract();
        this.getRepo(route['repo']);
        console.log(this.route.snapshot.url)
      })
    });
  }

  contractCrated( event :any) {

  }
  
  setContract() {
    if(!this.contractAddress) alert('ERROR: Enter OpenFund Address in project-home Component.')
    this.openFund = this.web3.eth.contract(abi).at(this.contractAddress);
    this.address = this.openFund.address;
    this.title = this.openFund._title();
    window['openFund'] = this.openFund;
  }

  getAllTransactions() {
    var depositEventAll = this.repo['Transaction']({}, { fromBlock: 0, toBlock: 'latest' });
    depositEventAll.get((err, result) => {
      if (err) {
        console.log(err)
        return;
      }
      this.moneyReceivedToDate = 0;
      this.moneyWithdrawnToDate = 0;
      this.contributions = result.map((contribution) => {
        if (contribution.args.to === this.repo.address) {
          this.moneyReceivedToDate += +this.web3.fromWei(contribution.args.value, 'ether')
        } else {
          this.moneyWithdrawnToDate += +this.web3.fromWei(contribution.args.value, 'ether')
        }
        contribution.value = this.web3.fromWei(contribution.args.value, 'ether');
        contribution.date = new Date(+contribution.args.date);
        contribution.from = contribution.args.from;
        contribution.to = contribution.args.to;
        return contribution;
      })
    })
    this.currentBalance = this.web3.fromWei(this.repo._balance(), 'ether');
  }

  sendTransaction(ether: number) {
    this.web3.eth.sendTransaction(
      {
        from: this.account, to: this.repo['address'],
        value: this.web3.toWei(ether, "ether")
      }, (err, res) => {
        if (err) console.log('error');
        console.log(res);
        this.getAllTransactions();
      })
  }

  addRepo(repo) {
    this.openFund.addRepo(repo, { from: this.account, gas: 1000000 }, (err, res) => {
      if (err) console.log(err);
      console.log('creating repo');
    })
  }

  getRepo(repo) {
    console.log(this.route.snapshot.params)
    this.openFund.getRepo.call(this.route.snapshot.params['repo'], (err, res) => {
      if (err) console.log(err);
      if(res === '0x0000000000000000000000000000000000000000') return this.projectExists = false;
      console.log('ff');
      this.repo = this.web3.eth.contract(repoAbi).at(res);
      this.getAllTransactions();
    });
  }
}

const abi = [{ "constant": false, "inputs": [{ "name": "repo", "type": "string" }], "name": "getRepo", "outputs": [{ "name": "", "type": "address" }], "payable": false, "type": "function" }, { "constant": true, "inputs": [], "name": "_owner", "outputs": [{ "name": "", "type": "address" }], "payable": false, "type": "function" }, { "constant": true, "inputs": [], "name": "_title", "outputs": [{ "name": "", "type": "string" }], "payable": false, "type": "function" }, { "constant": false, "inputs": [{ "name": "repo", "type": "string" }], "name": "addRepo", "outputs": [], "payable": false, "type": "function" }, { "inputs": [], "payable": false, "type": "constructor" }]

const repoAbi = [{ "constant": true, "inputs": [], "name": "_balance", "outputs": [{ "name": "", "type": "uint256" }], "payable": false, "type": "function" }, { "constant": true, "inputs": [], "name": "_repo", "outputs": [{ "name": "", "type": "string" }], "payable": false, "type": "function" }, { "constant": true, "inputs": [], "name": "_owner", "outputs": [{ "name": "", "type": "address" }], "payable": false, "type": "function" }, { "inputs": [{ "name": "repo", "type": "string" }], "payable": false, "type": "constructor" }, { "payable": true, "type": "fallback" }, { "anonymous": false, "inputs": [{ "indexed": false, "name": "date", "type": "uint256" }, { "indexed": false, "name": "value", "type": "uint256" }, { "indexed": false, "name": "from", "type": "address" }, { "indexed": false, "name": "to", "type": "address" }], "name": "Transaction", "type": "event" }];