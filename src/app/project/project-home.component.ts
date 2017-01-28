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
  contractAddress: string = '0x1081d84630feb4f89dc33f422c546199ac36fc80'; // enter contract address here;
  currentBalance: number;
  repo: any;
  moneyReceivedToDate: number = 0;
  moneyWithdrawnToDate: number = 0;
  address: string;
  title: string;
  projectExists: boolean = true;
  _user: string;
  _repo: string;

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
      console.log(accs[0]);
      this.account = this.accounts[0];
      this.route.params.subscribe((route) => {
        this.setContract();
        this._user = route['user'];
        this._repo = route['repo'];
        this.getRepo();
      })
    });
  }

  contractCrated( event :any) {

  }
  
  setContract() {
    if(!this.contractAddress) alert('ERROR: Enter OpenFund Address in project-home Component.')
    this.openFund = this.web3.eth.contract(abi).at(this.contractAddress);
    this.address = this.openFund.address;
    window['openFund'] = this.openFund;
  }

  getAllTransactions() {
    window['repo'] = this.repo;
    var depositEventAll = this.repo['Deposit']({}, { fromBlock: 0, toBlock: 'latest' });
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
    var withdrawEventAll = this.repo['Withdraw']({}, { fromBlock: 0, toBlock: 'latest' });
    withdrawEventAll.get((err, result) => {
      if (err) {
        console.log(err)
        return;
      }
      console.log(result);
      this.moneyReceivedToDate = 0;
      this.moneyWithdrawnToDate = 0;
      let withdrawals = result.map((contribution) => {
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
      });
      this.contributions.push(...withdrawals);
    })

    this.currentBalance = this.web3.fromWei(this.web3.eth.getBalance(this.repo.address), 'ether');
    console.log(this.web3.eth.getBalance(this.repo.address));
  }

  sendTransaction(ether: number) {
    this.web3.eth.sendTransaction(
      {
        from: this.account, to: this.repo.address,
        value: this.web3.toWei(ether, "ether")
      }, (err, res) => {
        if (err) console.error(err);
        this.getAllTransactions();
      })
  }

  withdraw(value) {
    this.repo.withdraw(value, { from: this.account, gas: 2500000 }, (err, res) => {
      if (err) console.log(err);
      console.log(res);
    })
  }
  addRepo() {
    this.openFund.addRepo(this._user, this._repo, { from: this.account, gas: 106000000 }, (err, res) => {
      if (err) console.log(err);
      console.log('creating repo');
    })
  }

  getRepo() {
    console.log(this._user, this._repo);
    this.openFund.getRepo.call(this._user, this._repo, (err, res) => {
      if (err) console.log(err);
      if(res === '0x0000000000000000000000000000000000000000') return this.projectExists = false;
      this.repo = this.web3.eth.contract(repoAbi).at(res);
      this.getAllTransactions();
    });
  }
}

const abi = [{"constant":false,"inputs":[{"name":"user","type":"string"},{"name":"repo","type":"string"}],"name":"getRepo","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"_owner","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"user","type":"string"},{"name":"repo","type":"string"}],"name":"addRepo","outputs":[],"payable":false,"type":"function"},{"inputs":[],"payable":false,"type":"constructor"}]


const repoAbi = [{"constant":true,"inputs":[],"name":"_address","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"myid","type":"bytes32"},{"name":"result","type":"string"}],"name":"__callback","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"value","type":"uint256"}],"name":"withdraw","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"_withdrawAmount","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"myid","type":"bytes32"},{"name":"result","type":"string"},{"name":"proof","type":"bytes"}],"name":"__callback","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"_balance","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"_repo","outputs":[{"name":"","type":"string"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"_user","outputs":[{"name":"","type":"string"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"_owner","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"_title","outputs":[{"name":"","type":"string"}],"payable":false,"type":"function"},{"inputs":[{"name":"user","type":"string"},{"name":"repo","type":"string"}],"payable":false,"type":"constructor"},{"payable":true,"type":"fallback"},{"anonymous":false,"inputs":[{"indexed":false,"name":"date","type":"uint256"},{"indexed":false,"name":"value","type":"uint256"},{"indexed":false,"name":"from","type":"address"},{"indexed":false,"name":"to","type":"address"}],"name":"Deposit","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"date","type":"uint256"},{"indexed":false,"name":"value","type":"uint256"},{"indexed":false,"name":"from","type":"address"},{"indexed":false,"name":"to","type":"address"}],"name":"Withdraw","type":"event"}]