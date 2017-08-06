import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'project-create',
  templateUrl: './project-create.component.html',
  styleUrls: ['./project-create.component.css']
})
export class ProjectCreateComponent implements OnInit {
  @Input() openFund: any;
  @Input() account: string;
  @Input() active :boolean;
  @Input() web3 :any;
  @Output() contractCreated :EventEmitter<string> = new EventEmitter(); 
  state: number = 0;

  constructor(
    private route :ActivatedRoute
  ) { }

  ngOnInit() {
    console.log(this.route);
  }


  addRepo() {
    let user = this.route.snapshot.url[0].path;
    let repo = this.route.snapshot.url[1].path;
    this.openFund.addRepo(user, repo, { from: this.account, gas: 1200000 }, (err, res) => {
      console.log(this.web3.eth.getTransactionReceipt(res));
      if (err) console.log(err);
      this.state = 1;
      this.waitBlock(res);
    })
  }
// await sleep trick
// http://stackoverflow.com/questions/951021/what-is-the-javascript-version-of-sleep
sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// We need to wait until any miner has included the transaction
// in a block to get the address of the contract
waitBlock(hash :string) {
  console.log(hash);
  let trigger = setInterval(() => { 
    let receipt = this.web3.eth.getTransactionReceipt(hash);
    console.log(receipt);
    if (receipt && receipt.blockNumber) {
      console.log("Your contract has been deployed at http://testnet.etherscan.io/address/" + receipt.contractAddress);
      console.log("Note that it might take 30 - 90 sceonds for the block to propagate befor it's visible in etherscan.io");
      clearInterval(trigger);
      this.active = true;
      console.log(receipt);
      this.contractCreated.emit(null);
  }
    console.log("Waiting a mined block to include your contract... currently in block " + this.web3.eth.blockNumber);
  }, 4000)
}

}
